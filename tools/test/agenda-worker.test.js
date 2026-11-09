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
// Tell GI Hub's inbox: a Durable Object namespace holding one Tell (tell.mjs)
// over storage as Cloudflare gives it (what's read is a copy).
function tellNs() {
  const m = new Map(), storage = {m,
    async get(k) { return m.has(k) ? structuredClone(m.get(k)) : undefined; },
    async put(k, v) { m.set(k, structuredClone(v)); },
    async delete(k) { return m.delete(k); }};
  let obj = null;
  return {storage, idFromName: n => n, get: () => ({async fetch(req) {
    if (!obj) obj = new (await mod("tell.mjs")).Tell({storage}, {});
    return obj.fetch(req);
  }})};
}
// The Claude task's start address and token: placeholders, never a real one.
const TASK = "https://api.anthropic.com/v1/claude_code/routines/trig_PLACEHOLDER/fire", TASK_TOKEN = "placeholder-task-token";
const env = broken => ({AGENDA: kv(broken), TELL: tellNs(), TASK_URL: TASK, TASK_TOKEN});
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
  // The minute before `at` never ran here: its reminder goes once it's three minutes late.
  assert.equal(await w.sendDue(e, at + 2 * MIN, push), 1);
  assert.equal(JSON.parse(open(p, push.got[3].body).text).kind, "week");
});

test("a minute Cloudflare skips still goes, three minutes late and once; none older than 15 minutes", async () => {
  const w = await mod("worker.mjs"), e = env();
  const {p} = await connected(w, e);
  const at = NOW + 30 * MIN, kinds = f => f.got.map(x => JSON.parse(open(p, x.body).text).kind);
  await call(w, e, "PUT", "/alerts", {body: {list: [
    {t: at - 20 * MIN, kind: "pearls"}, {t: at, kind: "week"}, {t: at + MIN, kind: "study"}, {t: at + 2 * MIN, kind: "ask"}]}});
  let writes = 0;
  const put = e.AGENDA.put.bind(e.AGENDA);
  e.AGENDA.put = async (k, v) => { writes++; return put(k, v); };
  const push = pushService();
  assert.equal(await w.sendDue(e, at, push), 1);
  // The runs at +1 and +2 minutes never happen.
  assert.equal(await w.sendDue(e, at + 3 * MIN, push), 0, "not three minutes late yet");
  assert.equal(await w.sendDue(e, at + 4 * MIN, push), 1);
  assert.equal(await w.sendDue(e, at + 5 * MIN, push), 1);
  for (let k = 6; k < 20; k++) assert.equal(await w.sendDue(e, at + k * MIN, push), 0);
  assert.deepEqual(kinds(push), ["week", "study", "ask"]);
  assert.equal(writes, 3, "one write for each run that sent, none for the quiet ones");
});

test("a push the push service turns away for now is tried again three minutes on", async () => {
  const w = await mod("worker.mjs"), e = env();
  await connected(w, e);
  const at = NOW + 30 * MIN;
  await call(w, e, "PUT", "/alerts", {body: {list: [{t: at, kind: "call", s: at + 60 * MIN}]}});
  const flaky = pushService(n => (n <= 2 ? 503 : 201));
  assert.equal(await w.sendDue(e, at, flaky), 0);
  assert.equal(flaky.got.length, 2, "tried twice at once");
  assert.equal(await w.sendDue(e, at + 3 * MIN, flaky), 1);
  assert.equal(await w.sendDue(e, at + 4 * MIN, flaky), 0);
  assert.equal(flaky.got.length, 3);
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

// ---- Tell GI Hub ------------------------------------------------------------------------------
// The shortcut's key and Claude's key, as Settings makes them; the sender knows
// only their fingerprints. Placeholder names only.
const SK = "S".repeat(43), CK = "C".repeat(43), SAID = "2026-11-09T09:00:00-05:00";
const sha = k => crypto.createHash("sha256").update(k).digest("hex");
async function tellOn(w, e) {
  const c = await connected(w, e);
  assert.equal((await call(w, e, "PUT", "/tell", {body: {shortcut: sha(SK), claude: sha(CK)}})).status, 200);
  return c;
}
// A phone with Tell GI Hub on, one thing said, and Claude's results for it filed.
async function told(results, text = "Flight on the 11th at 9:35") {
  const w = await mod("worker.mjs"), e = env(), {p} = await tellOn(w, e);
  assert.equal((await call(w, e, "POST", "/inbox", {tok: SK, body: {text, at: SAID}})).status, 200);
  const {items} = await (await call(w, e, "GET", "/inbox", {tok: CK})).json();
  const res = await call(w, e, "POST", "/results", {tok: CK, fetchImpl: pushService(), body: {results: results.map(r => ({item: items[0].id, ...r}))}});
  assert.equal(res.status, 200);
  return {w, e, p, got: (await (await call(w, e, "GET", "/results")).json()).results};
}

test("the shortcut's words reach Claude and come back to the phone with a push that says what was added", async () => {
  const w = await mod("worker.mjs"), e = env(), {p} = await tellOn(w, e);
  assert.equal((await call(w, e, "POST", "/inbox", {tok: SK, body: {text: "Flight on the 11th at 9:35", at: SAID}})).status, 200);
  const {items} = await (await call(w, e, "GET", "/inbox", {tok: CK})).json();
  assert.deepEqual(items.map(x => [x.text, x.said]), [["Flight on the 11th at 9:35", SAID]]);
  const push = pushService();
  const res = await call(w, e, "POST", "/results", {tok: CK, fetchImpl: push,
    body: {results: [{item: items[0].id, kind: "event", t: "Flight", d: "2026-11-11", s: "09:35"}]}});
  assert.deepEqual([res.status, await res.json()], [200, {ok: true, kept: 1, skipped: 0, left: []}]);
  assert.equal(push.got.length, 1);
  const msg = JSON.parse(open(p, push.got[0].body).text);
  assert.deepEqual([msg.kind, msg.lines, msg.more, msg.fin], ["added", ["Flight, Wed 11 Nov, 09:35"], 0, false]);
  assert.equal(push.got[0].headers.TTL, "21600");
  const got = await (await call(w, e, "GET", "/results")).json();
  assert.deepEqual(got.results.map(r => [r.kind, r.t, r.d, r.s]), [["event", "Flight", "2026-11-11", "09:35"]]);
  assert.equal(got.wait, null);
});

test("Claude's key can't read results and the shortcut key can't read the inbox", async () => {
  const w = await mod("worker.mjs"), e = env();
  await tellOn(w, e);
  const said = {text: "Dentist Friday at 9", at: SAID};
  assert.equal((await call(w, e, "GET", "/results", {tok: CK})).status, 401);
  assert.equal((await call(w, e, "GET", "/inbox", {tok: SK})).status, 401);
  assert.equal((await call(w, e, "POST", "/results", {tok: SK, body: {results: []}})).status, 401);
  assert.equal((await call(w, e, "PUT", "/tell", {tok: CK, body: {shortcut: sha(CK), claude: sha(SK)}})).status, 401);
  assert.equal((await call(w, e, "DELETE", "/tell", {tok: SK})).status, 401);
  for (const tok of [OTHER, null]) assert.equal((await call(w, e, "POST", "/inbox", {tok, body: said})).status, 401);
  // The phone's own token types into the inbox (the + box) but doesn't read it.
  assert.equal((await call(w, e, "POST", "/inbox", {body: said})).status, 200);
  assert.equal((await call(w, e, "GET", "/inbox")).status, 401);
  // Turned off, the shortcut's key opens nothing.
  assert.equal((await call(w, e, "DELETE", "/tell")).status, 200);
  assert.equal((await call(w, e, "POST", "/inbox", {tok: SK, body: {...said, text: "Again"}})).status, 401);
});

test("the cron starts Claude once, with the task's token, a minute after the last thing said", async () => {
  const w = await mod("worker.mjs"), e = env();
  await tellOn(w, e);
  await call(w, e, "POST", "/inbox", {tok: SK, body: {text: "Dentist Friday at 9", at: SAID}});
  const starts = [], start = async (url, init) => { starts.push({url, ...init}); return {status: 200, headers: new Headers()}; };
  assert.deepEqual(await w.tellTick(e, NOW + 30000, start), []);
  assert.equal(starts.length, 0);
  await w.tellTick(e, NOW + MIN, start);
  assert.equal(starts.length, 1);
  const [s] = starts;
  assert.deepEqual([s.url, s.method, s.body], [TASK, "POST", undefined]);
  assert.equal(s.headers.Authorization, "Bearer " + TASK_TOKEN);
  assert.equal(s.headers["anthropic-version"], "2023-06-01");
  assert.equal(s.headers["anthropic-beta"], "experimental-cc-routine-2026-04-01");
  await w.tellTick(e, NOW + 2 * MIN, start);
  assert.equal(starts.length, 1, "a run under way isn't started again");
  // An address that isn't a Claude task's: nothing starts, and the phone hears why.
  await w.tellTick({...e, TASK_URL: "https://example.com/fire"}, NOW + 20 * MIN, start);
  assert.equal(starts.length, 1);
  assert.equal((await (await call(w, e, "GET", "/results", {now: NOW + 20 * MIN})).json()).wait.err, "setup");
});

test("a busy answer waits as long as its Retry-After says", async () => {
  const w = await mod("worker.mjs"), e = env();
  await tellOn(w, e);
  await call(w, e, "POST", "/inbox", {tok: SK, body: {text: "Dentist Friday at 9", at: SAID}});
  let n = 0;
  const busy = async () => { n++; return {status: n === 1 ? 429 : 200, headers: new Headers({"Retry-After": "120"})}; };
  await w.tellTick(e, NOW + MIN, busy);
  await w.tellTick(e, NOW + 2 * MIN, busy);
  assert.equal(n, 1);
  await w.tellTick(e, NOW + 3 * MIN, busy);
  assert.equal(n, 2);
});

test("an event Claude added alerts 30 minutes before even if GI Hub never opens", async () => {
  const {w, e, p, got: [r]} = await told([{kind: "event", t: "Flight", d: "2026-11-11", s: "09:35"}]);
  const at = Date.UTC(2026, 10, 11, 14, 5), push = pushService();
  assert.equal(await w.sendDue(e, at, push, await w.tellTick(e, at, push)), 1);
  assert.deepEqual(JSON.parse(open(p, push.got[0].body).text),
    {t: at, kind: "ev", s: Date.UTC(2026, 10, 11, 14, 35), id: r.id + "@2026-11-11", w: "Flight"});
});

test("a confirmed result alerts once whether the cron sees the old plan or the new one", async () => {
  // A call at 09:40 today: its alert is due at 09:10, inside the ten minutes a confirmed result is kept.
  const run = async stale => {
    const {w, e, p, got: [r]} = await told([{kind: "event", t: "Call with Casey", d: "2026-11-09", s: "09:40"}], "Call with Casey at 9:40");
    const ev = {t: NOW + 10 * MIN, kind: "ev", s: NOW + 40 * MIN, id: r.id + "@2026-11-09"};
    assert.equal((await call(w, e, "PUT", "/alerts", {now: NOW + 2 * MIN, body: {list: [ev], ack: [r.id]}})).status, 200);
    if (stale) e.AGENDA.m.set("alerts", JSON.stringify({at: NOW + MIN, list: stale === "with" ? [ev] : []}));
    const push = pushService(), at = NOW + 10 * MIN;
    const sent = await w.sendDue(e, at, push, await w.tellTick(e, at, push));
    return [sent, push.got.map(x => JSON.parse(open(p, x.body).text).w || "")];
  };
  assert.deepEqual(await run(null), [1, [""]], "the new plan: the phone's own alert");
  assert.deepEqual(await run("without"), [1, ["Call with Casey"]], "an older copy without it: Claude's");
  assert.deepEqual(await run("with"), [1, ["Call with Casey"]], "an older copy with it too: still one push");
});

test("an evening with an event from the phone and one from Claude is one push naming both", async () => {
  const {w, e, p, got: [f, dn]} = await told([
    {kind: "event", t: "Flight", d: "2026-11-11", s: "09:35"}, {kind: "event", t: "Dinner", d: "2026-11-11", s: "18:00"}]);
  const at = Date.UTC(2026, 10, 11, 0);    // 19:00 on the 10th
  // The phone's plan from before it picked these up: the evening of its own event that day.
  e.AGENDA.m.set("alerts", JSON.stringify({at: NOW, list: [{t: at, kind: "eve", d: "2026-11-11"}]}));
  const push = pushService();
  assert.equal(await w.sendDue(e, at, push, await w.tellTick(e, at, push)), 1);
  assert.deepEqual(JSON.parse(open(p, push.got[0].body).text), {t: at, kind: "eve", d: "2026-11-11",
    w: [{id: f.id, t: "Flight", s: "09:35"}, {id: dn.id, t: "Dinner", s: "18:00"}]});
});

test("an idea waits in KV for the desktop, and Undo removes it", async () => {
  const {w, e, got: [r]} = await told([{kind: "idea", for: "gihub", t: "Show the week's calls on Week"}], "GI Hub idea: the week's calls on Week");
  assert.deepEqual(JSON.parse(e.AGENDA.m.get("idea:" + r.id)), {for: "gihub", t: "Show the week's calls on Week", said: SAID});
  assert.equal((await call(w, e, "DELETE", "/idea/" + r.id, {tok: null})).status, 401);
  assert.equal((await call(w, e, "DELETE", "/idea/" + r.id, {tok: CK})).status, 401);
  assert.equal((await call(w, e, "DELETE", "/idea/" + r.id)).status, 204);
  assert.equal(e.AGENDA.m.has("idea:" + r.id), false);
  assert.equal((await call(w, e, "DELETE", "/idea/nope")).status, 400);
});

test("a to-do's ask is a reminder the sender keeps", async () => {
  const w = await mod("worker.mjs"), e = env();
  await connected(w, e);
  const res = await call(w, e, "PUT", "/alerts", {body: {list: [{t: NOW + MIN, kind: "todo", id: "a1b2c3d4e5f@2026-11-09"}]}});
  assert.deepEqual(await res.json(), {kept: 1, next: NOW + MIN});
});

test("the phone's own reminders still go when the inbox doesn't answer", async () => {
  const w = await mod("worker.mjs"), e = env();
  await connected(w, e);
  await call(w, e, "PUT", "/alerts", {body: {list: [{t: NOW + MIN, kind: "week"}]}});
  e.TELL = {idFromName: n => n, get: () => ({async fetch() { throw new Error("down"); }})};
  const push = pushService();
  assert.equal(await w.sendDue(e, NOW + MIN, push, await w.tellTick(e, NOW + MIN, push)), 1);
});
