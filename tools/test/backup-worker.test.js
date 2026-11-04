"use strict";
// The backup Worker (tools/backup): keeps the last 14 daily backups, each
// already locked on the phone, behind a token made from the same passphrase.
// Run here the way Cloudflare runs it: a Request in, the KV namespace as env.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {ROOT} = require("./harness");

const load = () => import(pathToFileURL(path.join(ROOT, "tools", "backup", "worker.mjs")).href);
const ORIGIN = "https://lethalnifty.github.io";
const TOK = "A".repeat(43), OTHER = "B".repeat(43);
const NOW = Date.UTC(2026, 10, 3, 18);
// Workers KV, as far as the Worker uses it.
function kv() {
  const m = new Map();
  return {m,
    async get(k) { return m.has(k) ? m.get(k).v : null; },
    async put(k, v, o = {}) { m.set(k, {v: String(v), meta: o.metadata || null}); },
    async delete(k) { m.delete(k); },
    async list({prefix = ""} = {}) {
      return {keys: [...m.keys()].filter(k => k.startsWith(prefix)).sort().map(name => ({name, metadata: m.get(name).meta})), list_complete: true};
    }};
}
const env = () => ({BACKUPS: kv()});
const sealed = (n = 1) => JSON.stringify({v: 1, iv: "x".repeat(16), ct: "y".repeat(n)});
function call(w, e, method, p, {tok = TOK, body, now = NOW} = {}) {
  const headers = {Origin: ORIGIN};
  if (tok) headers.Authorization = "Bearer " + tok;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return w.handle(new Request("https://gi-hub-backup.example.workers.dev" + p, {method, headers, body}), e, now);
}
const sha = async t => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))]
  .map(b => b.toString(16).padStart(2, "0")).join("");

test("the app may call it from its own address, and only that one", async () => {
  const w = await load(), e = env();
  const res = await call(w, e, "OPTIONS", "/backups/2026-11-03", {tok: null});
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.match(res.headers.get("Access-Control-Allow-Methods"), /PUT/);
  assert.match(res.headers.get("Access-Control-Allow-Headers"), /Authorization/);
  const put = await call(w, e, "PUT", "/backups/2026-11-03", {body: sealed()});
  assert.equal(put.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.equal(put.headers.get("Cache-Control"), "no-store");
});

test("the first backup sets the token; after that a different one is turned away", async () => {
  const w = await load(), e = env();
  assert.equal((await call(w, e, "GET", "/backups")).status, 401, "nothing to read before the first backup");
  const res = await call(w, e, "PUT", "/backups/2026-11-03", {body: sealed()});
  assert.equal(res.status, 200);
  assert.equal(await e.BACKUPS.get("auth"), await sha(TOK), "only the token's fingerprint is kept");
  assert.equal(await e.BACKUPS.get("b:2026-11-03"), sealed());
  assert.equal((await call(w, e, "PUT", "/backups/2026-11-03", {tok: OTHER, body: sealed(2)})).status, 401);
  assert.equal((await call(w, e, "GET", "/backups", {tok: OTHER})).status, 401);
  assert.equal(await e.BACKUPS.get("b:2026-11-03"), sealed());
  for (const bad of [null, "short", "A".repeat(42) + "!"])
    assert.equal((await call(w, e, "GET", "/backups", {tok: bad})).status, 401);
});

test("the days kept, newest first, and one day's backup", async () => {
  const w = await load(), e = env();
  await call(w, e, "PUT", "/backups/2026-11-02", {body: sealed(5), now: NOW - 864e5});
  await call(w, e, "PUT", "/backups/2026-11-03", {body: sealed(9)});
  const list = await (await call(w, e, "GET", "/backups")).json();
  assert.deepEqual(list.days.map(d => [d.day, d.size]), [["2026-11-03", sealed(9).length], ["2026-11-02", sealed(5).length]]);
  const one = await call(w, e, "GET", "/backups/2026-11-02");
  assert.equal(one.status, 200);
  assert.equal(await one.text(), sealed(5));
  assert.equal((await call(w, e, "GET", "/backups/2026-10-01")).status, 404);
});

test("the same day again replaces it, and only the newest 14 days are kept", async () => {
  const w = await load(), e = env();
  for (let k = 0; k < 16; k++) {
    const t = NOW - (15 - k) * 864e5, day = new Date(t).toISOString().slice(0, 10);
    await call(w, e, "PUT", "/backups/" + day, {body: sealed(k + 1), now: t});
  }
  await call(w, e, "PUT", "/backups/2026-11-03", {body: sealed(99)});
  const days = (await (await call(w, e, "GET", "/backups")).json()).days.map(d => d.day);
  assert.equal(days.length, 14);
  assert.equal(days[0], "2026-11-03");
  assert.equal(days[13], "2026-10-21");
  assert.equal(await e.BACKUPS.get("b:2026-11-03"), sealed(99));
});

test("it turns away what isn't a locked backup for about today", async () => {
  const w = await load(), e = env();
  const st = async (p, body, method = "PUT") => (await call(w, e, method, p, {body})).status;
  assert.equal(await st("/backups/2026-11-3", sealed()), 400);
  assert.equal(await st("/backups/2026-02-30", sealed()), 400);
  assert.equal(await st("/backups/2026-10-20", sealed()), 400, "two weeks off the Worker's clock");
  assert.equal(await st("/backups/2026-11-03", "{\"obs\": {}}"), 400, "plain data, not a locked backup");
  assert.equal(await st("/backups/2026-11-03", "not json"), 400);
  assert.equal(await st("/backups/2026-11-03", sealed(6 * 1024 * 1024)), 413);
  assert.equal(await st("/elsewhere", sealed()), 404);
  assert.equal(await st("/backups", sealed(), "POST"), 405);
  assert.equal(e.BACKUPS.m.size, 0, "none of it set the token or kept anything");
});

test("delete clears every backup and the token, for a fresh start", async () => {
  const w = await load(), e = env();
  await call(w, e, "PUT", "/backups/2026-11-03", {body: sealed()});
  assert.equal((await call(w, e, "DELETE", "/backups", {tok: OTHER})).status, 401);
  assert.equal((await call(w, e, "DELETE", "/backups")).status, 204);
  assert.equal(e.BACKUPS.m.size, 0);
  assert.equal((await call(w, e, "PUT", "/backups/2026-11-03", {tok: OTHER, body: sealed()})).status, 200, "a new passphrase can start over");
});

test("when its storage fails it still answers, so the phone can tell", async () => {
  const w = await load(), e = {BACKUPS: {...kv(), async put() { throw new Error("KV is down"); }}};
  const res = await call(w, e, "PUT", "/backups/2026-11-03", {body: sealed()});
  assert.equal(res.status, 500);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
});
