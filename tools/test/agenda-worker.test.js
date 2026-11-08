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

// ---- The Worker ------------------------------------------------------------------------

const ORIGIN = "https://lethalnifty.github.io";
const TOK = "A".repeat(43), OTHER = "B".repeat(43);
const NOW = Date.UTC(2026, 10, 9, 14);        // Mon 9 Nov 2026, 09:00 in Winnipeg
const MIN = 60000;
// Workers KV, as far as the Worker uses it; broken throws on every call.
function kv(broken) {
  const m = new Map(), no = async () => { if (broken) throw new Error("KV down"); };
  return {m,
    async get(k) { await no(); return m.has(k) ? m.get(k) : null; },
    async put(k, v) { await no(); m.set(k, String(v)); },
    async delete(k) { await no(); m.delete(k); }};
}
const env = broken => ({AGENDA: kv(broken)});
// A push service that keeps every message it was handed.
function pushService(status = 201) {
  const got = [];
  const f = async (url, init) => { got.push({url, ...init}); return {status: typeof status === "function" ? status(got.length) : status}; };
  f.got = got;
  return f;
}
function call(w, e, method, p, {tok = TOK, body, now = NOW, fetchImpl} = {}) {
  const headers = {Origin: ORIGIN};
  if (tok) headers.Authorization = "Bearer " + tok;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return w.handle(new Request("https://gi-hub-agenda.example.workers.dev" + p,
    {method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body)}), e, now, fetchImpl);
}
async function connected(w, e, p = phone(), tok = TOK) {
  const key = (await (await call(w, e, "GET", "/vapid", {tok: null})).json()).key;
  const res = await call(w, e, "PUT", "/sub", {tok, body: {sub: p.sub, key}});
  assert.equal(res.status, 200);
  return {p, key};
}

test("the app may call it from its own address, and only that one", async () => {
  const w = await mod("worker.mjs"), e = env();
  const res = await call(w, e, "OPTIONS", "/alerts", {tok: null});
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.match(res.headers.get("Access-Control-Allow-Headers"), /Authorization/);
  assert.equal((await call(w, e, "GET", "/vapid", {tok: null})).headers.get("Access-Control-Allow-Origin"), ORIGIN);
});

test("it makes its own sender key the first time it's asked, and keeps it", async () => {
  const w = await mod("worker.mjs"), e = env();
  const a = await (await call(w, e, "GET", "/vapid", {tok: null})).json();
  const b = await (await call(w, e, "GET", "/vapid", {tok: null})).json();
  assert.equal(a.key, b.key);
  assert.equal(Buffer.from(a.key, "base64url").length, 65);
  assert.ok(JSON.parse(e.AGENDA.m.get("vapid")).jwk.d, "the private half stays in the Worker's store");
});

test("the first phone to connect claims it; another token can't, and nothing that isn't a push service is taken", async () => {
  const w = await mod("worker.mjs"), e = env();
  const {key} = await connected(w, e);
  assert.ok(e.AGENDA.m.get("auth"));
  const p = phone();
  assert.equal((await call(w, e, "PUT", "/sub", {tok: OTHER, body: {sub: p.sub, key}})).status, 401);
  assert.equal((await call(w, e, "PUT", "/sub", {body: {sub: {...p.sub, endpoint: "http://web.push.apple.com/x"}, key}})).status, 400);
  assert.equal((await call(w, e, "PUT", "/sub", {body: {sub: {...p.sub, endpoint: "https://example.com/x"}, key}})).status, 400);
  assert.equal((await call(w, e, "PUT", "/sub", {body: "{not json"})).status, 400);
  // Subscribed with a key that isn't this sender's: the phone has to subscribe again.
  assert.equal((await call(w, e, "PUT", "/sub", {body: {sub: p.sub, key: "BOld"}})).status, 409);
  assert.equal(JSON.parse(e.AGENDA.m.get("sub")).endpoint, "https://web.push.apple.com/QTest");
});

test("the reminder list keeps only real reminders, soonest first, and says what's next", async () => {
  const w = await mod("worker.mjs"), e = env();
  await connected(w, e);
  const list = [
    {t: NOW + 3 * MIN, kind: "ev", s: NOW + 33 * MIN, id: "a1x2@2026-11-09", words: "never kept"},
    {t: NOW + MIN, kind: "call", s: NOW + 61 * MIN},
    {t: NOW + 2 * MIN, kind: "eve", d: "2026-11-10"},
    {t: NOW + 4 * MIN, kind: "dinner"},
    {t: String(NOW + 5 * MIN), kind: "week"},
    {t: NOW + 41 * 864e5, kind: "week"},
    {t: NOW - 2 * 864e5, kind: "ask"},
    {t: NOW + 6 * MIN, kind: "ev", id: "Dentist at noon"},
  ];
  const res = await call(w, e, "PUT", "/alerts", {body: {list}});
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {kept: 4, next: NOW + MIN});
  assert.deepEqual(JSON.parse(e.AGENDA.m.get("alerts")).list, [
    {t: NOW + MIN, kind: "call", s: NOW + 61 * MIN},
    {t: NOW + 2 * MIN, kind: "eve", d: "2026-11-10"},
    {t: NOW + 3 * MIN, kind: "ev", s: NOW + 33 * MIN, id: "a1x2@2026-11-09"},
    {t: NOW + 6 * MIN, kind: "ev"}]);
  const many = Array.from({length: 900}, (_, k) => ({t: NOW + (900 - k) * MIN, kind: "study"}));
  assert.equal((await (await call(w, e, "PUT", "/alerts", {body: {list: many}})).json()).kept, 800);
  assert.equal(JSON.parse(e.AGENDA.m.get("alerts")).list[0].t, NOW + MIN, "the soonest are the ones kept");
  assert.equal((await call(w, e, "PUT", "/alerts", {body: {nope: 1}})).status, 400);
});

test("each minute sends what fell due in that minute, once, sealed for the phone", async () => {
  const w = await mod("worker.mjs"), e = env();
  const {p} = await connected(w, e);
  const at = NOW + 30 * MIN;
  await call(w, e, "PUT", "/alerts", {body: {list: [
    {t: at - 90000, kind: "week"}, {t: at - 30000, kind: "call", s: at + 59 * MIN},
    {t: at, kind: "ev", s: at + 30 * MIN, id: "a1x2@2026-11-09"}, {t: at + 30000, kind: "study"}]}});
  const push = pushService();
  assert.equal(await w.sendDue(e, at, push), 2);
  assert.deepEqual(push.got.map(x => JSON.parse(open(p, x.body).text)), [
    {t: at - 30000, kind: "call", s: at + 59 * MIN}, {t: at, kind: "ev", s: at + 30 * MIN, id: "a1x2@2026-11-09"}]);
  assert.equal(push.got[0].url, "https://web.push.apple.com/QTest");
  assert.equal(push.got[0].headers["Content-Encoding"], "aes128gcm");
  assert.match(push.got[0].headers.Authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
  assert.deepEqual(push.got.map(x => x.headers.TTL), ["3600", "1800"]);
  // The next minute: only what came due since.
  assert.equal(await w.sendDue(e, at + MIN, push), 1);
  assert.equal(JSON.parse(open(p, push.got[2].body).text).kind, "study");
  assert.equal(await w.sendDue(e, at + 2 * MIN, push), 0);
});

test("a phone the push service no longer knows is forgotten, and status says so", async () => {
  const w = await mod("worker.mjs"), e = env();
  const {key} = await connected(w, e);
  await call(w, e, "PUT", "/alerts", {body: {list: [{t: NOW + MIN, kind: "week"}, {t: NOW + MIN, kind: "pearls"}]}});
  const gone = pushService(410);
  assert.equal(await w.sendDue(e, NOW + MIN, gone), 0);
  assert.equal(gone.got.length, 1, "it stops at the first refusal");
  assert.equal(e.AGENDA.m.has("sub"), false);
  assert.deepEqual(await (await call(w, e, "GET", "/status")).json(), {sub: false, key, kept: 2, next: NOW + MIN});
});

test("Send a test pushes one now", async () => {
  const w = await mod("worker.mjs"), e = env();
  const {p} = await connected(w, e);
  const push = pushService();
  const res = await call(w, e, "POST", "/test", {fetchImpl: push});
  assert.deepEqual(await res.json(), {status: 201});
  assert.deepEqual(JSON.parse(open(p, push.got[0].body).text), {kind: "test", t: NOW});
});

test("without its token nothing else answers, and turning off frees it for a new phone", async () => {
  const w = await mod("worker.mjs"), e = env();
  await connected(w, e);
  for (const [m, p] of [["GET", "/status"], ["PUT", "/alerts"], ["POST", "/test"], ["DELETE", "/sub"]])
    assert.equal((await call(w, e, m, p, {tok: OTHER, body: m === "PUT" ? {list: []} : undefined})).status, 401, m + " " + p);
  assert.equal((await call(w, e, "GET", "/nowhere")).status, 404);
  assert.equal((await call(w, e, "DELETE", "/sub")).status, 204);
  for (const k of ["sub", "alerts", "auth"]) assert.equal(e.AGENDA.m.has(k), false, k);
  assert.ok(e.AGENDA.m.has("vapid"), "the sender keeps its key");
  await connected(w, e, phone(), OTHER);
});

test("a storage failure still answers, with the app's origin", async () => {
  const w = await mod("worker.mjs");
  const res = await call(w, env(true), "GET", "/status");
  assert.equal(res.status, 500);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
});
