// Web Push from WebCrypto alone, the way a Cloudflare Worker can run it, no
// packages: message encryption per RFC 8291 (aes128gcm, RFC 8188) and the
// sender's identity per RFC 8292 (VAPID). tools/test/agenda-worker.test.js
// opens its pushes the way a phone does.
const te = new TextEncoder();

export const b64u = bytes => {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const unb64u = str => {
  const s = String(str).replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
};
const cat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};
async function hkdf(ikm, salt, info, bytes) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({name: "HKDF", hash: "SHA-256", salt, info}, key, bytes * 8));
}

// A new sender key pair: the private half as a JWK, which only the Worker
// keeps, and the public half as its 65-byte point in base64url.
export async function newVapid() {
  const k = await crypto.subtle.generateKey({name: "ECDSA", namedCurve: "P-256"}, true, ["sign", "verify"]);
  return {jwk: await crypto.subtle.exportKey("jwk", k.privateKey), pub: b64u(await crypto.subtle.exportKey("raw", k.publicKey))};
}

// One push message sealed for a phone's keys (p256dh and auth, base64url).
export async function encrypt(plain, p256dh, auth) {
  const ua = unb64u(p256dh), secret = unb64u(auth);
  const as = await crypto.subtle.generateKey({name: "ECDH", namedCurve: "P-256"}, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", ua, {name: "ECDH", namedCurve: "P-256"}, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({name: "ECDH", public: uaKey}, as.privateKey, 256));
  const ikm = await hkdf(shared, secret, cat(te.encode("WebPush: info\0"), ua, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(ikm, salt, te.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // One record, so the padding delimiter is 0x02 (the last record).
  const sealed = new Uint8Array(await crypto.subtle.encrypt({name: "AES-GCM", iv: nonce}, key, cat(plain, new Uint8Array([2]))));
  const head = new Uint8Array(21);
  head.set(salt);
  new DataView(head.buffer).setUint32(16, 4096);
  head[20] = asPub.length;
  return cat(head, asPub, sealed);
}

// The Authorization header: an ES256 JWT for the push service's origin, good
// for 12 hours, and the sender's public key.
export async function vapidAuth(endpoint, vapid, subject, nowSec = Math.floor(Date.now() / 1000)) {
  const part = o => b64u(te.encode(JSON.stringify(o)));
  const unsigned = part({typ: "JWT", alg: "ES256"}) + "." + part({aud: new URL(endpoint).origin, exp: nowSec + 12 * 3600, sub: subject});
  const key = await crypto.subtle.importKey("jwk", vapid.jwk, {name: "ECDSA", namedCurve: "P-256"}, false, ["sign"]);
  const sig = await crypto.subtle.sign({name: "ECDSA", hash: "SHA-256"}, key, te.encode(unsigned));
  return `vapid t=${unsigned}.${b64u(sig)}, k=${vapid.pub}`;
}

// Sends one message. Resolves {status}: 201 means the push service has it.
export async function sendPush(sub, payload, vapid, {subject, ttl = 21600, urgency = "high", fetchImpl = fetch} = {}) {
  const body = await encrypt(te.encode(JSON.stringify(payload)), sub.keys.p256dh, sub.keys.auth);
  const res = await fetchImpl(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuth(sub.endpoint, vapid, subject),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttl),
      Urgency: urgency,
    },
    body,
  });
  return {status: res.status};
}
