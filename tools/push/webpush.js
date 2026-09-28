"use strict";
// Web Push from Node's own crypto, no packages: message encryption per
// RFC 8291 (aes128gcm, RFC 8188) and VAPID sender identity per RFC 8292.
const crypto = require("node:crypto");

const b64u = buf => Buffer.from(buf).toString("base64url");
const unb64u = s => Buffer.from(String(s).replace(/\s+/g, ""), "base64url");

// A P-256 key pair from the 32-byte private key: {priv, pub (65-byte uncompressed point)}.
function keyPair(privRaw) {
  const ecdh = crypto.createECDH("prime256v1");
  if (privRaw) ecdh.setPrivateKey(privRaw); else ecdh.generateKeys();
  return {ecdh, priv: ecdh.getPrivateKey(), pub: ecdh.getPublicKey(null, "uncompressed")};
}

// Encrypts one push message for a subscription's keys (p256dh, auth).
// opts.asPrivate and opts.salt fix the sender's key and salt, for tests only.
function encrypt(plaintext, uaPublic, authSecret, opts = {}) {
  const as = keyPair(opts.asPrivate);
  const salt = opts.salt || crypto.randomBytes(16);
  const shared = as.ecdh.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, as.pub]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  // One record, so the padding delimiter is 0x02 (last record).
  const gcm = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const sealed = Buffer.concat([gcm.update(Buffer.concat([Buffer.from(plaintext), Buffer.from([2])])), gcm.final(), gcm.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([as.pub.length]), as.pub, sealed]);
}

// The VAPID Authorization header: a short-lived ES256 JWT for the push
// service's origin, plus our public key.
function vapidAuth(endpoint, vapidPrivateB64u, subject, nowSec) {
  const k = keyPair(unb64u(vapidPrivateB64u));
  const jwk = {kty: "EC", crv: "P-256", d: b64u(k.priv), x: b64u(k.pub.subarray(1, 33)), y: b64u(k.pub.subarray(33, 65))};
  const now = nowSec || Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({typ: "JWT", alg: "ES256"}));
  const body = b64u(JSON.stringify({aud: new URL(endpoint).origin, exp: now + 12 * 3600, sub: subject}));
  const sig = crypto.sign("sha256", Buffer.from(head + "." + body),
    {key: crypto.createPrivateKey({key: jwk, format: "jwk"}), dsaEncoding: "ieee-p1363"});
  return {authorization: `vapid t=${head}.${body}.${b64u(sig)}, k=${b64u(k.pub)}`, publicKey: b64u(k.pub)};
}

// Sends one message. Resolves {status}; 201 is delivered to the push service.
async function sendPush(subscription, payload, {vapidPrivate, subject, ttl = 6 * 3600, urgency = "high", fetchImpl} = {}) {
  const body = encrypt(Buffer.from(JSON.stringify(payload)), unb64u(subscription.keys.p256dh), unb64u(subscription.keys.auth));
  const res = await (fetchImpl || fetch)(subscription.endpoint, {
    method: "POST",
    headers: {
      "Authorization": vapidAuth(subscription.endpoint, vapidPrivate, subject).authorization,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "TTL": String(ttl),
      "Urgency": urgency,
    },
    body,
  });
  return {status: res.status, text: res.status >= 300 ? await res.text().catch(() => "") : ""};
}

module.exports = {encrypt, vapidAuth, sendPush, keyPair, b64u, unb64u};
