"use strict";
// Tell GI Hub's inbox (tools/agenda/tell.mjs): the Durable Object that keeps
// what you say until Claude files it, and Claude's results until GI Hub picks
// them up. Run here over in-memory storage, the way Cloudflare runs it.
// Placeholder names only.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {ROOT} = require("./harness");

const mod = f => import(pathToFileURL(path.join(ROOT, "tools", "agenda", f)).href);
const NOW = Date.UTC(2026, 10, 9, 19);        // Mon 9 Nov 2026, 14:00 in Winnipeg
const MIN = 60000;
const AT = "2026-11-09T14:05:00-05:00";       // the phone's clock, as the shortcut sends it
const SK = "S".repeat(43), CK = "C".repeat(43);
const fp = k => crypto.createHash("sha256").update(k).digest("hex");

// Durable Object storage as Cloudflare gives it: what's read is a copy.
function mem() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? structuredClone(m.get(k)) : undefined; },
    async put(k, v) { m.set(k, structuredClone(v)); },
    async delete(k) { return m.delete(k); },
  };
}
async function box() {
  const {Tell} = await mod("tell.mjs");
  const storage = mem();
  return {obj: new Tell({storage}, {}), storage};
}
// One request to the object, as the Worker sends it: who the Worker matched
// (the phone), the fingerprint of any other key, the time, the body.
async function op(b, name, {who = null, key = null, body = null, now = NOW} = {}) {
  const req = new Request("https://tell/op", {method: "POST", body: JSON.stringify({op: name, who, fp: key ? fp(key) : null, now, body})});
  const res = await b.obj.fetch(req);
  const out = await res.json();
  assert.equal(res.status, out.status);
  return out;
}
// An inbox with both keys set, as Settings leaves it.
async function ready() {
  const b = await box();
  assert.equal((await op(b, "keys", {who: "phone", body: {shortcut: fp(SK), claude: fp(CK)}})).status, 200);
  return b;
}
const say = (b, text, at = AT, now = NOW) => op(b, "say", {key: SK, body: {text, at}, now});

// ---- Keys, and what you say -----------------------------------------------------------------

test("keys need the phone; the shortcut and Claude keys open only their own doors", async () => {
  const b = await box();
  assert.equal((await say(b, "Dentist Friday at 9")).status, 401);
  assert.equal((await op(b, "keys", {body: {shortcut: fp(SK), claude: fp(CK)}})).status, 401);
  assert.equal((await op(b, "keys", {who: "phone", body: {shortcut: "short", claude: fp(CK)}})).status, 400);
  assert.equal((await op(b, "keys", {who: "phone", body: {shortcut: fp(SK), claude: fp(CK)}})).status, 200);
  assert.equal((await say(b, "Dentist Friday at 9")).status, 200);
  assert.equal((await op(b, "items", {key: SK})).status, 401);
  assert.equal((await op(b, "items", {key: CK})).status, 200);
  assert.equal((await op(b, "say", {key: CK, body: {text: "x", at: AT}})).status, 401);
  assert.equal((await op(b, "say", {key: "X".repeat(43), body: {text: "x", at: AT}})).status, 401);
  // The + box on the phone sends with the phone's own token.
  assert.equal((await op(b, "say", {who: "phone", body: {text: "Typed on the phone", at: AT}})).status, 200);
});

test("what you say waits with the phone's clock and offset", async () => {
  const b = await ready();
  await say(b, "Dentist Friday at 9");
  await say(b, "No seconds", "2026-11-09T14:06-05:00");
  await say(b, "From a phone on UTC", "2026-11-09T19:07:00Z");
  await say(b, "Not a time", "yesterday");
  await say(b, "Too old", "2026-09-30T10:00:00-05:00");
  const {data} = await op(b, "items", {key: CK});
  assert.deepEqual(data.items.map(x => [x.text, x.said]), [
    ["Dentist Friday at 9", AT],
    ["No seconds", "2026-11-09T14:06:00-05:00"],
    ["From a phone on UTC", "2026-11-09T19:07:00+00:00"],
    ["Not a time", "2026-11-09T14:00:00-05:00"],
    ["Too old", "2026-11-09T14:00:00-05:00"],
  ]);
  for (const x of data.items) assert.match(x.id, /^i[a-z0-9]{10}$/);
  assert.equal(new Set(data.items.map(x => x.id)).size, 5);
  assert.deepEqual(Object.keys(data.items[0]).sort(), ["id", "said", "text"]);
});

test("the same words sent twice from Reminders are one item", async () => {
  const b = await ready();
  assert.deepEqual((await say(b, "Book the car service")).data, {ok: true});
  assert.deepEqual((await say(b, "Book the car service")).data, {ok: true, dup: true});
  await say(b, "Book the car service", "2026-11-09T15:00:00-05:00");
  assert.equal((await op(b, "items", {key: CK})).data.items.length, 2);
});

test("the inbox refuses empty, overlong and overflowing sends", async () => {
  const b = await ready();
  assert.equal((await say(b, "")).status, 400);
  assert.equal((await say(b, "   ")).status, 400);
  assert.equal((await op(b, "say", {key: SK, body: {at: AT}})).status, 400);
  assert.equal((await say(b, "x".repeat(4001))).status, 400);
  assert.equal((await say(b, "  padded  ")).status, 200);
  assert.equal((await op(b, "items", {key: CK})).data.items[0].text, "padded");
  for (let k = 1; k < 50; k++) assert.equal((await say(b, "Thing " + k)).status, 200);
  assert.equal((await say(b, "One too many")).status, 429);
});

test("turning off drops the keys", async () => {
  const b = await ready();
  assert.equal((await op(b, "off", {key: SK})).status, 401);
  assert.equal((await op(b, "off", {who: "phone"})).status, 200);
  assert.equal((await say(b, "Dentist Friday at 9")).status, 401);
  assert.equal((await op(b, "items", {key: CK})).status, 401);
});

test("unknown ops answer 404", async () => {
  const b = await ready();
  assert.equal((await op(b, "nope", {who: "phone"})).status, 404);
});
