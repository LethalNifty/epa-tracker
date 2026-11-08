"use strict";
// The Agenda Worker (tools/agenda): GI Hub's one reminder sender. Run here the
// way Cloudflare runs it: a Request in, the KV namespace as env, the cron as a call.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {ROOT} = require("./harness");

const mod = f => import(pathToFileURL(path.join(ROOT, "tools", "agenda", f)).href);
const APP = "https://lethalnifty.github.io/epa-tracker/";

// ---- Web Push ------------------------------------------------------------------------

// The phone's side of a push: its key pair and auth secret, and the opening it
// does when a push arrives (RFC 8291), written here from the RFC.
function phone(endpoint = "https://web.push.apple.com/QTest") {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return {ecdh, auth, sub: {endpoint, keys: {p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url")}}};
}
function open(p, body) {
  const b = Buffer.from(body);
  const salt = b.subarray(0, 16), rs = b.readUInt32BE(16), idlen = b[20], as = b.subarray(21, 21 + idlen), sealed = b.subarray(21 + idlen);
  const ua = p.ecdh.getPublicKey(), shared = p.ecdh.computeSecret(as);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", shared, p.auth, Buffer.concat([Buffer.from("WebPush: info\0"), ua, as]), 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(sealed.subarray(sealed.length - 16));
  const plain = Buffer.concat([d.update(sealed.subarray(0, sealed.length - 16)), d.final()]);
  return {rs, idlen, delim: plain[plain.length - 1], text: plain.subarray(0, plain.length - 1).toString()};
}

test("a push decrypts on the phone to what was sent (RFC 8291)", async () => {
  const {encrypt} = await mod("webpush.mjs");
  const p = phone();
  const body = await encrypt(new TextEncoder().encode('{"kind":"ev","t":1}'), p.sub.keys.p256dh, p.sub.keys.auth);
  const got = open(p, body);
  assert.equal(got.text, '{"kind":"ev","t":1}');
  assert.equal(got.delim, 2);
  assert.equal(got.rs, 4096);
  assert.equal(got.idlen, 65);
  // The same opener reads the old sender's pushes, so it checks the RFC, not just itself.
  const old = require(path.join(ROOT, "tools", "push", "webpush.js"));
  assert.equal(open(p, old.encrypt(Buffer.from("hello"), p.ecdh.getPublicKey(), p.auth)).text, "hello");
});

test("the VAPID header verifies with the sender's public key", async () => {
  const {newVapid, vapidAuth} = await mod("webpush.mjs");
  const v = await newVapid(), raw = Buffer.from(v.pub, "base64url");
  assert.equal(raw.length, 65);
  assert.equal(raw[0], 4);
  const now = 1800000000;
  const h = await vapidAuth("https://web.push.apple.com/QTest", v, APP, now);
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(h);
  assert.ok(m, h);
  assert.equal(m[4], v.pub);
  const key = crypto.createPublicKey({key: {kty: "EC", crv: "P-256", x: raw.subarray(1, 33).toString("base64url"),
    y: raw.subarray(33).toString("base64url")}, format: "jwk"});
  assert.ok(crypto.verify("sha256", Buffer.from(m[1] + "." + m[2]), {key, dsaEncoding: "ieee-p1363"}, Buffer.from(m[3], "base64url")));
  assert.deepEqual(JSON.parse(Buffer.from(m[1], "base64url")), {typ: "JWT", alg: "ES256"});
  assert.deepEqual(JSON.parse(Buffer.from(m[2], "base64url")), {aud: "https://web.push.apple.com", exp: now + 12 * 3600, sub: APP});
});

module.exports = {phone, open, mod, APP};
