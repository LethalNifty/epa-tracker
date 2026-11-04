"use strict";
// Daily backup to Cloudflare, locked on the phone with a passphrase only the
// user knows: setting it up, one backup each day the app opens, putting one
// back on another phone, turning it off. Full app only. The phone talks to the
// real Worker code (tools/backup) over a stand-in for the network.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {load, state, obs, ROOT} = require("./harness");

const PASS = "correct horse battery staple";
const NOW = Date.UTC(2026, 10, 3, 18);
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
// Cloudflare as the phone sees it: the Worker, its storage, every request made.
async function cloudflare() {
  const w = await import(pathToFileURL(path.join(ROOT, "tools", "backup", "worker.mjs")).href);
  const c = {env: {BACKUPS: kv()}, calls: [], now: NOW, down: false};
  c.fetch = async (url, init = {}) => {
    // Only the backup Worker answers here; the app's own files (sw.js, guides.json) don't.
    const u = new URL(url, "https://gi-hub.invalid/");
    if (!u.hostname.startsWith("gi-hub-backup.")) throw new TypeError("Load failed");
    c.calls.push((init.method || "GET") + " " + u.pathname);
    if (c.down) throw new TypeError("Load failed");
    return w.handle(new Request(url, init), c.env, c.now);
  };
  c.puts = () => c.calls.filter(x => x.startsWith("PUT"));
  return c;
}
// Placeholder names only.
const DATA = () => state({f3a: [obs("2026-11-01", {a: "Bravo", n: "Varices bleed at night"})]});
function phone(cf, today = "2026-11-03", extra = {}) {
  const h = load({today, fetch: cf.fetch, ...extra});
  h.run("BACKUP_KDF.rounds = 1000");
  h.setNow(today + "T18:00");
  return h;
}
const type = (h, k, v) => h.fire("input", {dataset: {bk: k}, value: v});
// Waits for the backup work in flight, if any.
const settle = h => h.run("bkWork");
const settings = h => { h.click("setopen"); return h.html(); };
async function setUp(h, pass = PASS) {
  settings(h); h.click("bkset");
  type(h, "p1", pass); type(h, "p2", pass);
  h.click("bkon"); await settle(h);
}

test("setting up: today's backup is locked with the passphrase before it leaves the phone", async () => {
  const cf = await cloudflare(), h = phone(cf, "2026-11-03", {state: DATA()});
  assert.match(settings(h), /data-action="bkset"/);
  h.click("bkset");
  assert.match(h.html(), /<input type="password" data-bk="p1" autocomplete="new-password"/);
  type(h, "p1", PASS); type(h, "p2", PASS);
  h.click("bkon"); await settle(h);
  const blob = await cf.env.BACKUPS.get("b:2026-11-03");
  assert.ok(blob, "today's backup is there");
  const sealed = JSON.parse(blob);
  assert.deepEqual(Object.keys(sealed).sort(), ["ct", "iv", "v"]);
  assert.doesNotMatch(blob, /Varices|Bravo/, "Cloudflare only ever holds scrambled data");
  assert.doesNotMatch(Buffer.from(sealed.ct, "base64url").toString("latin1"), /Varices|Bravo|"obs"/, "scrambled, not just encoded");
  assert.match(await cf.env.BACKUPS.get("auth"), /^[0-9a-f]{64}$/);
  assert.ok(![...h.store.values()].join("\n").includes(PASS), "the passphrase itself is never kept");
  assert.ok(h.val("Store.state.lastBackup"), "it counts as a backup");
  const html = h.html();
  assert.match(html, /Today 18:00 · automatic/);
  assert.match(html, /data-action="bkrestore"/);
  assert.doesNotMatch(html, /data-bk="p1"/);
});

test("the passphrase needs 10 characters, typed the same twice", async () => {
  const cf = await cloudflare(), h = phone(cf, "2026-11-03", {state: DATA()});
  settings(h); h.click("bkset");
  type(h, "p1", "short"); type(h, "p2", "short"); h.click("bkon"); await settle(h);
  assert.match(h.html(), /Use at least 10 characters/);
  type(h, "p1", PASS); type(h, "p2", PASS + "!"); h.click("bkon"); await settle(h);
  assert.match(h.html(), /The two don&#39;t match|The two don't match/);
  assert.deepEqual(cf.calls, []);
  assert.equal(h.store.has("gi-backup-v1"), false);
});

test("each day the app opens, one backup; the same day again, none", async () => {
  const cf = await cloudflare(), h = phone(cf, "2026-11-03", {state: DATA()});
  await setUp(h);
  await settle(phone(cf, "2026-11-03", {store: h.store}));
  assert.deepEqual(cf.puts(), ["PUT /backups/2026-11-03"], "already backed up today");
  cf.now = NOW + 864e5;
  await settle(phone(cf, "2026-11-04", {store: h.store}));
  assert.deepEqual(cf.puts(), ["PUT /backups/2026-11-03", "PUT /backups/2026-11-04"]);
});

test("Back up now sends today's copy again, in place of the first one", async () => {
  const cf = await cloudflare(), h = phone(cf, "2026-11-03", {state: DATA()});
  await setUp(h);
  h.setNow("2026-11-03T18:30");
  h.click("bknow"); await settle(h);
  assert.deepEqual(cf.puts(), ["PUT /backups/2026-11-03", "PUT /backups/2026-11-03"]);
  assert.equal([...cf.env.BACKUPS.m.keys()].filter(k => k.startsWith("b:")).length, 1);
  assert.match(h.html(), /Today 18:30 · automatic/);
});

test("an empty phone never backs up over the good copies", async () => {
  const cf = await cloudflare(), h = phone(cf, "2026-11-03", {state: DATA()});
  await setUp(h);
  cf.now = NOW + 864e5;
  await settle(phone(cf, "2026-11-04", {store: new Map([["gi-backup-v1", h.store.get("gi-backup-v1")]])}));
  assert.deepEqual(cf.puts(), ["PUT /backups/2026-11-03"]);
});

test("on another phone, the passphrase lists the backups and puts one back", async () => {
  const cf = await cloudflare(), h = phone(cf, "2026-11-03", {state: DATA()});
  await setUp(h);
  const p = phone(cf, "2026-11-03");
  settings(p); p.click("bkrestore");
  assert.match(p.html(), /<input type="password" data-bk="p1" autocomplete="current-password"/);
  type(p, "p1", PASS); p.click("bkunlock"); await settle(p);
  assert.match(p.html(), /<button class="btn" data-action="bkpick" data-day="2026-11-03">Tue 3 Nov · \d+ KB<\/button>/);
  p.click("bkpick", {day: "2026-11-03"}); await settle(p);
  assert.deepEqual(p.val("Store.state.obs.f3a.map(o => o.n)"), ["Varices bleed at night"]);
  assert.match(p.html(), /Restored the backup from Tue 3 Nov/);
  assert.ok(p.store.has("gi-backup-v1"), "and it backs up from here on");
});

test("a wrong passphrase opens nothing", async () => {
  const cf = await cloudflare(), h = phone(cf, "2026-11-03", {state: DATA()});
  await setUp(h);
  const p = phone(cf, "2026-11-03");
  settings(p); p.click("bkrestore");
  type(p, "p1", "not the passphrase"); p.click("bkunlock"); await settle(p);
  assert.match(p.html(), /That passphrase doesn&#39;t open these backups|That passphrase doesn't open these backups/);
  assert.equal(p.store.has("gi-backup-v1"), false);
});

test("setting up with a passphrase other than the one the backups have", async () => {
  const cf = await cloudflare(), h = phone(cf, "2026-11-03", {state: DATA()});
  await setUp(h);
  const p = phone(cf, "2026-11-03", {state: DATA()});
  await setUp(p, "a different passphrase");
  assert.match(p.html(), /locked with a different passphrase/);
  assert.equal(p.store.has("gi-backup-v1"), false);
});

test("with no connection it says so, and tries again the next time", async () => {
  const cf = await cloudflare(), h = phone(cf, "2026-11-03", {state: DATA()});
  await setUp(h);
  cf.down = true; cf.now = NOW + 864e5;
  const p = phone(cf, "2026-11-04", {store: h.store}); await settle(p);
  assert.match(settings(p), /Couldn&#39;t back up Wed 4 Nov: no connection\. It tries again the next time you open GI Hub\.|Couldn't back up Wed 4 Nov: no connection\. It tries again the next time you open GI Hub\./);
  cf.down = false;
  const q = phone(cf, "2026-11-04", {store: h.store}); await settle(q);
  assert.ok(await cf.env.BACKUPS.get("b:2026-11-04"));
  assert.doesNotMatch(settings(q), /back up Wed 4 Nov/);
});

test("turning it off forgets the key here; deleting clears Cloudflare too", async () => {
  const cf = await cloudflare(), h = phone(cf, "2026-11-03", {state: DATA()});
  await setUp(h);
  settings(h); h.click("bkoff");
  assert.equal(h.store.has("gi-backup-v1"), false);
  assert.ok(await cf.env.BACKUPS.get("b:2026-11-03"), "the backups stay, to put back later");
  await setUp(h);
  h.click("bkdelete"); await settle(h);
  assert.equal(cf.env.BACKUPS.m.size, 0);
  assert.equal(h.store.has("gi-backup-v1"), false);
  assert.match(h.html(), /data-action="bkset"/);
});

test("the fellows' edition never backs up to Cloudflare", async () => {
  const cf = await cloudflare();
  const f = load({today: "2026-11-03", edition: "fellows", fetch: cf.fetch, state: state({f3a: [obs("2026-11-01")]}, {setup: {d: "2026-10-01"}})});
  f.store.set("gi-backup-v1", JSON.stringify({key: "x", tok: "y"}));
  f.run("backupDaily()"); await settle(f);
  f.click("setopen");
  assert.doesNotMatch(f.html(), /data-action="bk|Cloudflare/);
  assert.deepEqual(cf.calls, []);
});
