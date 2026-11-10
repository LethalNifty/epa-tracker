"use strict";
// Picking up a call schedule or swap Claude filed, with the pictures it keeps:
// the phone holds it for a check, never takes a result without its pictures
// while they can still come, and confirms it so the sender deletes them. The
// sender here is its real code (tools/agenda) with its storage in memory.
// Full app only. Placeholder names only.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const nodeCrypto = require("node:crypto");
const {pathToFileURL} = require("node:url");
const {load, state, ROOT} = require("./harness");

const at = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
const mod = f => import(pathToFileURL(path.join(ROOT, "tools", "agenda", f)).href);
const SENDER = "https://gi-hub-agenda.lethalnifty.workers.dev", SAID = "2026-11-09T14:00:00-05:00";
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);

// KV as Cloudflare gives it: each value as it was put, strings or bytes.
function kv() {
  const m = new Map();
  return {m,
    async get(k, type) {
      if (!m.has(k)) return null;
      const v = m.get(k);
      if (type === "arrayBuffer") return typeof v === "string" ? new TextEncoder().encode(v).buffer : new Uint8Array(v).slice().buffer;
      return typeof v === "string" ? v : new TextDecoder().decode(v);
    },
    async put(k, v) { m.set(k, typeof v === "string" ? v : new Uint8Array(v).slice()); },
    async delete(k) { m.delete(k); }};
}
// The inbox's one Durable Object, in memory.
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
// The sender as the phone sees it, every request the phone made, and c.as: the
// shortcut or Claude's task calling it with their key. c.block: requests that don't get through.
async function sender(now) {
  const w = await mod("worker.mjs");
  const c = {w, env: {AGENDA: kv(), TELL: tellNs()}, calls: [], sent: [], now, block: null};
  c.pushFetch = async () => ({status: 201});
  c.fetch = async (url, init = {}) => {
    const u = new URL(url), what = (init.method || "GET") + " " + u.pathname;
    if (!u.hostname.startsWith("gi-hub-agenda.")) throw new TypeError("Load failed");
    c.calls.push(what);
    c.sent.push({what, body: init.body ? JSON.parse(init.body) : null});
    if (c.block && c.block.test(what)) throw new TypeError("Load failed");
    return w.handle(new Request(url, init), c.env, c.now, c.pushFetch);
  };
  c.as = (tok, method, p, body, headers) => w.handle(new Request(SENDER + p, {method, body,
    headers: {Authorization: "Bearer " + tok, ...(headers || (body ? {"Content-Type": "application/json"} : {}))}}), c.env, c.now, c.pushFetch);
  return c;
}
const files = c => [...c.env.AGENDA.m.keys()].filter(k => k.startsWith("file:")).sort();
// iPhone's push for the home-screen app.
function iphone() {
  let n = 0;
  const p = {perm: "default", sub: null};
  p.make = key => {
    const ecdh = nodeCrypto.createECDH("prime256v1");
    ecdh.generateKeys();
    const json = {endpoint: "https://web.push.apple.com/Q" + (++n), expirationTime: null,
      keys: {p256dh: ecdh.getPublicKey().toString("base64url"), auth: nodeCrypto.randomBytes(16).toString("base64url")}};
    const sub = {key, toJSON: () => json, unsubscribe: async () => { if (p.sub === sub) p.sub = null; return true; }};
    return sub;
  };
  return p;
}
function install(h, p) {
  h.ctx.PushManager = function PushManager() {};
  h.ctx.Notification = {get permission() { return p.perm; }, requestPermission: async () => (p.perm = "granted")};
  h.ctx.navigator.serviceWorker = {ready: Promise.resolve({pushManager: {
    getSubscription: async () => p.sub,
    subscribe: async o => { p.sub = p.make(Buffer.from(Array.from(o.applicationServerKey)).toString("base64url")); return p.sub; }}})};
}
// Waits until the sender work in flight, and anything it started, is done.
async function settle(h) {
  for (let p = h.run("alertsWork"); ; p = h.run("alertsWork")) { await p; if (p === h.run("alertsWork")) return; }
}
// A phone with reminders and Tell GI Hub on that knows which fellow is you; c.keys are the keys it made.
async function tellPhone() {
  const c = await sender(at(2026, 11, 9, 14));
  const h = load({today: "2026-11-09", state: state({}), fetch: c.fetch});
  h.setNow("2026-11-09T14:00");
  install(h, iphone());
  await h.run("remindInit()");
  await settle(h);
  h.click("setopen"); h.click("remindon"); await settle(h);
  h.click("telon"); await settle(h);
  h.click("setclose");
  h.run(`RosterStore.state.me = "Casey"`);
  c.keys = JSON.parse(h.store.get("gi-tell-v1")).keys;
  return {c, h};
}
async function pick(h, now) {
  h.setNow(now);
  await h.run("tellPick()");
  await settle(h);
}
const kept = h => JSON.parse(h.store.get("gi-tell-v1"));
const got = async (h, expr) => JSON.parse(JSON.stringify(await h.run(expr)));
const DAYS = ["2026-11-19", "2026-11-20"].map(d => ({d,
  hsc: {day: {fellows: ["Brook"], res: ["Resident G"], att: "Ames"}, night: {fellow: "Casey", res: ["Resident K"], att: "Ames"}},
  stb: {day: {fellows: ["Rowan"], res: ["Resident M"], att: "Ellis"}, night: {fellow: "Casey", res: ["Resident K"], att: "Ellis"}}}));
// The two sheets shared to Add to GI Hub, and Claude's call result for them, as the sender keeps it.
async function sheets(c) {
  for (const [bytes, type] of [[PNG, "image/png"], [JPEG, "image/jpeg"]])
    assert.equal((await c.as(c.keys.shortcut, "POST", "/inbox", bytes, {"Content-Type": type, "X-At": SAID})).status, 200);
  const {items} = await (await c.as(c.keys.claude, "GET", "/inbox")).json();
  const [hsc, stb] = items.map(x => x.id);
  const r = await c.as(c.keys.claude, "POST", "/results", JSON.stringify({results: [{item: hsc, with: [stb], kind: "call", days: DAYS,
    notes: [], people: [], rules: [], look: [],
    sheets: [{site: "hsc", from: "2026-11-19", to: "2026-12-16", file: hsc}, {site: "stb", from: "2026-11-19", to: "2026-12-16", file: stb}]}]}));
  assert.equal(r.status, 200);
  const [res] = (await c.env.TELL.storage.get("results")).slice(-1);
  return {hsc, stb, rid: res.id, line: res.line};
}

test("a call result is held for a check with its two pictures, and confirmed", async () => {
  const {c, h} = await tellPhone();
  const {hsc, stb, rid, line} = await sheets(c);
  assert.equal(line, "Call schedule, Thu 19 Nov to Wed 16 Dec, check it in Call");
  await pick(h, "2026-11-09T14:05");
  assert.deepEqual(c.calls.filter(x => x.startsWith("GET /file/")).sort(), ["GET /file/" + hsc, "GET /file/" + stb].sort());
  assert.deepEqual(h.val(`Object.keys(RosterStore.state.pend)`), [rid]);
  assert.deepEqual(h.val(`RosterStore.state.pend["${rid}"].r.sheets.map(x => x.file)`), [hsc, stb]);
  assert.deepEqual((await got(h, `rosterPics.keys()`)).sort(), [hsc, stb].sort());
  const pic = await h.run(`rosterPics.get("${hsc}")`);
  assert.deepEqual([pic.type, Array.from(new Uint8Array(pic.bytes))], ["image/png", Array.from(PNG)]);
  // On the Claude added card, and nothing goes into Call until it's checked.
  assert.deepEqual(kept(h).added.map(e => [e.id, e.kind, e.line, e.call]), [[rid, "call", line, rid]]);
  assert.deepEqual(h.val(`CallStore.list()`), []);
  // Confirmed with the plan upload: the sender deletes the pictures.
  assert.ok(c.sent.some(x => x.what === "PUT /alerts" && x.body.ack && x.body.ack.includes(rid)));
  assert.deepEqual(files(c), []);
  assert.deepEqual(kept(h).ack, []);
});

test("no signal for the pictures: the result waits for the next pickup, unconfirmed", async () => {
  const {c, h} = await tellPhone();
  const {hsc, stb, rid} = await sheets(c);
  // The first picture comes, then the signal goes.
  c.block = new RegExp("^GET /file/" + stb + "$");
  await pick(h, "2026-11-09T14:05");
  assert.deepEqual(h.val(`RosterStore.state.pend`), {});
  assert.ok(!kept(h).seen.includes(rid) && !kept(h).ack.includes(rid), "not seen, not confirmed");
  assert.deepEqual(kept(h).added, []);
  assert.equal(files(c).length, 2, "the sender still has both");
  c.block = null;
  await pick(h, "2026-11-09T14:06");
  assert.deepEqual(h.val(`Object.keys(RosterStore.state.pend)`), [rid]);
  assert.deepEqual((await got(h, `rosterPics.keys()`)).sort(), [hsc, stb].sort());
  assert.equal(c.calls.filter(x => x === "GET /file/" + hsc).length, 1, "a picture already here isn't fetched again");
  assert.deepEqual(files(c), []);
});

test("an expired picture doesn't stop the check", async () => {
  const {c, h} = await tellPhone();
  const {hsc, stb, rid} = await sheets(c);
  c.env.AGENDA.m.delete("file:" + stb);   // its 3 days are up
  await pick(h, "2026-11-09T14:05");
  assert.deepEqual(h.val(`[Object.keys(RosterStore.state.pend), RosterStore.state.pend["${rid}"].lost]`), [[rid], 1]);
  assert.deepEqual(await got(h, `rosterPics.keys()`), [hsc]);
  assert.ok(kept(h).seen.includes(rid));
});

test("a swap is held for a check, with no pictures to fetch", async () => {
  const {c, h} = await tellPhone();
  assert.equal((await c.as(c.keys.shortcut, "POST", "/inbox", JSON.stringify({text: "Brook is taking my call on Nov 20", at: SAID}))).status, 200);
  const {items} = await (await c.as(c.keys.claude, "GET", "/inbox")).json();
  assert.equal((await c.as(c.keys.claude, "POST", "/results", JSON.stringify({results: [{item: items[0].id, kind: "callswap",
    slots: [{d: "2026-11-20", site: "both", slot: "night", from: "me", to: "Brook"}]}]}))).status, 200);
  await pick(h, "2026-11-09T14:05");
  const [e] = kept(h).added;
  assert.deepEqual([e.kind, e.line], ["callswap", "Call swap on Fri 20 Nov, check it in Call"]);
  assert.deepEqual(h.val(`RosterStore.state.pend["${e.id}"].r`), {kind: "callswap", slots: [{d: "2026-11-20", site: "both", slot: "night", from: "me", to: "Brook"}]});
  assert.ok(!c.calls.some(x => x.startsWith("GET /file/")));
});

test("the Claude added row waits until the check is done", async () => {
  const {c, h} = await tellPhone();
  const {rid, line} = await sheets(c);
  await pick(h, "2026-11-09T14:05");
  // Two days on, still waiting for its check.
  h.setNow("2026-11-11T15:00");
  h.click("tab", {page: "week"});
  assert.ok(h.html().includes(line));
  assert.equal(h.val(`tellWaits(tellLoad().added[0])`), true);
  // Checked: an ordinary row, gone after its day.
  h.run(`delete RosterStore.state.pend["${rid}"]`);
  h.click("tab", {page: "plan"}); h.click("tab", {page: "week"});
  assert.ok(!h.html().includes(line));
});
