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

// ---- Filing, picking up, confirming ---------------------------------------------------------------
const items = async b => (await op(b, "items", {key: CK})).data.items;
const file = (b, results, now = NOW) => op(b, "file", {key: CK, body: {results}, now});
const pick = (b, now = NOW) => op(b, "results", {who: "phone", now});
const at = k => `2026-11-09T14:${String(k).padStart(2, "0")}:00-05:00`;

test("Claude's results replace the item they came from", async () => {
  const b = await ready();
  await say(b, "Flight on the 11th at 9:35");
  await say(b, "Pearl: octreotide for variceal bleeding, and remind me to book the car service", at(6));
  const [one, two] = await items(b);
  const r = await file(b, [
    {item: one.id, kind: "event", t: "Flight", d: "2026-11-11", s: "09:35"},
    {item: two.id, kind: "pearl", t: "Octreotide for variceal bleeding"},
    {item: two.id, kind: "todo", t: "Book the car service", q: "Did you book the car service?"},
  ]);
  assert.equal(r.status, 200);
  assert.equal(r.data.kept, 3);
  assert.equal(r.data.skipped, 0);
  assert.deepEqual(r.data.left, []);
  const got = (await pick(b)).data.results;
  assert.deepEqual(got.map(x => x.kind), ["event", "pearl", "todo"]);
  for (const x of got) { assert.match(x.id, /^a[a-z0-9]{10}$/); assert.ok(x.item && x.said && x.line); }
  assert.equal(got[0].item, one.id);
  assert.equal(got[2].q, "Did you book the car service?");
  assert.equal((await items(b)).length, 0);
});

test("a late second run changes nothing", async () => {
  const b = await ready();
  await say(b, "Dentist Friday at 9");
  const [x] = await items(b), res = [{item: x.id, kind: "event", t: "Dentist", d: "2026-11-13", s: "09:00"}];
  await file(b, res);
  const again = await file(b, res);
  assert.equal(again.data.kept, 0);
  assert.equal(again.data.skipped, 1);
  assert.equal(again.data.added, null);
  assert.equal((await pick(b)).data.results.length, 1);
});

test("what Claude couldn't file becomes a note in your words", async () => {
  const b = await ready();
  await say(b, "Something odd on the 31st");
  await say(b, "Another thing", at(7));
  const [one, two] = await items(b);
  await file(b, [{item: one.id, kind: "event", t: "Odd", d: "2026-11-31"}, {item: two.id, kind: "spell"}, "not a result"]);
  assert.deepEqual((await pick(b)).data.results.map(x => [x.kind, x.t]), [["note", "Something odd on the 31st"], ["note", "Another thing"]]);
  assert.equal((await op(b, "file", {key: CK, body: {results: "nope"}})).status, 400);
});

test("a to-do without a time asks at the next 08:00", async () => {
  const {resultClean} = await mod("tell.mjs");
  const item = said => ({id: "iaaaaaaaaaa", text: "x", said, off: -300});
  const at14 = item("2026-11-09T14:00:00-05:00"), at0630 = item("2026-11-09T06:30:00-05:00");
  const when = (r, it = at14) => { const x = resultClean(r, it); return x && [x.d, x.s]; };
  assert.deepEqual(when({kind: "todo", t: "Reply to the email"}), ["2026-11-10", "08:00"]);
  assert.deepEqual(when({kind: "todo", t: "Reply to the email"}, at0630), ["2026-11-09", "08:00"]);
  assert.deepEqual(when({kind: "todo", t: "Reply", d: "2026-11-09"}), ["2026-11-09", "15:00"]);
  assert.deepEqual(when({kind: "todo", t: "Reply", d: "2026-11-12"}), ["2026-11-12", "08:00"]);
  assert.deepEqual(when({kind: "todo", t: "Reply", s: "16:00"}), ["2026-11-09", "16:00"]);
  assert.deepEqual(when({kind: "todo", t: "Reply", s: "09:00"}), ["2026-11-10", "09:00"]);
  assert.equal(when({kind: "todo", t: "Reply", d: "2026-02-30"}), null);
  assert.equal(when({kind: "todo", t: "  "}), null);
});

test("each line says what was added and when", async () => {
  const {resultClean} = await mod("tell.mjs");
  const it = {id: "iaaaaaaaaaa", text: "x", said: "2026-11-09T14:00:00-05:00", off: -300};
  const line = r => resultClean(r, it).line;
  assert.equal(line({kind: "event", t: "Flight", d: "2026-11-11", s: "09:35"}), "Flight, Wed 11 Nov, 09:35");
  assert.equal(line({kind: "event", t: "Remembrance Day service", d: "2026-11-11"}), "Remembrance Day service, Wed 11 Nov");
  assert.equal(line({kind: "event", t: "Vacation", d: "2026-12-23", d2: "2026-12-27"}), "Vacation, Wed 23 Dec to Sun 27 Dec");
  assert.equal(line({kind: "todo", t: "Reply to the email", d: "2026-11-10", s: "08:00"}), "To-do: Reply to the email, Tue 10 Nov, 08:00");
  assert.equal(line({kind: "change", m: "dentist", to: {d: "2026-11-13", s: "09:00"}}), "Move dentist to Fri 13 Nov, 09:00");
  assert.equal(line({kind: "change", m: "flight", cancel: true}), "Cancel: flight");
  assert.equal(line({kind: "scope", text: "Colonoscopy, two polyps, cold snare"}), "Scope case, check it in Endo");
  assert.equal(line({kind: "pearl", t: "A SAAG of 11 g/L or more points to portal hypertension"}), "Pearl: A SAAG of 11 g/L or more points to portal hypertension");
  assert.equal(line({kind: "idea", for: "heidi", t: "Meds above the plan"}), "Heidi idea, waits for the desktop");
  assert.equal(line({kind: "idea", for: "gihub", t: "Call on the month view"}), "GI Hub idea, waits for the desktop");
  assert.equal(line({kind: "note", t: "Look into a new stethoscope"}), "Note: Look into a new stethoscope");
  assert.equal(line({kind: "event", t: "Dentist", d: "2026-11-13", s: "09:00", chk: true}), "Dentist, Fri 13 Nov, 09:00 (check this)");
  assert.equal(line({kind: "note", t: "x".repeat(80)}).length, "Note: ".length + 60);
  // A change needs a new day or time, or cancel; a scope case needs its words.
  assert.equal(resultClean({kind: "change", m: "dentist"}, it), null);
  assert.equal(resultClean({kind: "scope", text: ""}, it), null);
});

test("the added notice lists six and counts the rest, and says Open GI Hub for a change", async () => {
  const b = await ready();
  for (let k = 0; k < 8; k++) await say(b, "Note " + k, at(k));
  const r = await file(b, (await items(b)).map(x => ({item: x.id, kind: "note", t: x.text})));
  assert.equal(r.data.added.kind, "added");
  assert.equal(r.data.added.t, NOW);
  assert.deepEqual(r.data.added.lines, ["Note: Note 0", "Note: Note 1", "Note: Note 2", "Note: Note 3", "Note: Note 4", "Note: Note 5"]);
  assert.equal(r.data.added.more, 2);
  assert.equal(r.data.added.fin, false);
  await say(b, "Move the dentist to Friday", at(9));
  const [c] = await items(b);
  const r2 = await file(b, [{item: c.id, kind: "change", m: "dentist", to: {d: "2026-11-13"}}]);
  assert.equal(r2.data.added.fin, true);
  assert.equal(r2.data.added.more, 0);
});

test("confirmed results stop coming back, and go after ten minutes", async () => {
  const b = await ready();
  for (let k = 0; k < 3; k++) await say(b, "Note " + k, at(k));
  await file(b, (await items(b)).map(x => ({item: x.id, kind: "note", t: x.text})));
  const got = (await pick(b)).data.results;
  assert.equal((await op(b, "ack", {who: "phone", body: {ids: [got[0].id], at: NOW}})).status, 401);
  assert.equal((await op(b, "ack", {who: "worker", body: {ids: [got[0].id], at: NOW}})).status, 200);
  assert.deepEqual((await pick(b, NOW + MIN)).data.results.map(x => x.id), [got[1].id, got[2].id]);
  assert.equal((await b.storage.get("results")).length, 3);
  await pick(b, NOW + 11 * MIN);
  assert.deepEqual((await b.storage.get("results")).map(x => x.id), [got[1].id, got[2].id]);
});

test("waiting shows after a quarter hour", async () => {
  const b = await ready();
  await say(b, "Dentist Friday at 9");
  assert.equal((await pick(b, NOW + 14 * MIN)).data.wait, null);
  assert.deepEqual((await pick(b, NOW + 15 * MIN)).data.wait, {n: 1, since: NOW, err: null});
});

test("ideas come back for the desktop", async () => {
  const b = await ready();
  await say(b, "Heidi idea: put the meds list above the plan");
  const [x] = await items(b);
  const r = await file(b, [{item: x.id, kind: "idea", for: "heidi", t: "Put the meds list above the plan"}]);
  assert.equal(r.data.ideas.length, 1);
  const idea = r.data.ideas[0];
  assert.match(idea.id, /^a[a-z0-9]{10}$/);
  assert.deepEqual([idea.for, idea.t, idea.said], ["heidi", "Put the meds list above the plan", AT]);
  assert.equal((await pick(b)).data.results[0].kind, "idea");
});

// ---- Starting Claude, and alerts before GI Hub opens -------------------------------------------------
const SEC = 1000;
const tick = (b, at, ready = true) => op(b, "tick", {who: "worker", body: {at, ready}, now: at});
const fired = (b, at, status, retry) => op(b, "fired", {who: "worker", body: {at, status, retry}, now: at});
const fires = async (b, at, ready = true) => (await tick(b, at, ready)).data.fire;

test("Claude starts once the newest thing said is a minute old", async () => {
  const b = await ready();
  assert.equal((await op(b, "tick", {key: CK, body: {at: NOW, ready: true}})).status, 401);
  await say(b, "Dentist Friday at 9");
  assert.equal(await fires(b, NOW + 30 * SEC), false);
  await say(b, "Call the bank", at(10), NOW + 40 * SEC);
  assert.equal(await fires(b, NOW + 61 * SEC), false);
  assert.equal(await fires(b, NOW + 100 * SEC), true);
  assert.equal(await fires(b, NOW + 160 * SEC), false);
});

test("a run under way isn't started again until it's a quarter hour late", async () => {
  const b = await ready();
  await say(b, "Dentist Friday at 9");
  const T = NOW + 61 * SEC;
  assert.equal(await fires(b, T), true);
  await fired(b, T, 200);
  assert.equal(await fires(b, T + 14 * MIN), false);
  assert.equal(await fires(b, T + 15 * MIN), true);
  await fired(b, T + 15 * MIN, 200);
  assert.equal(await fires(b, T + 44 * MIN), false);
  assert.equal(await fires(b, T + 45 * MIN), true);
});

test("a refused start waits as the task says", async () => {
  const b = await ready();
  await say(b, "Dentist Friday at 9");
  let T = NOW + 61 * SEC;
  const after = async (status, retry, wait) => {
    assert.equal(await fires(b, T), true);
    await fired(b, T, status, retry);
    assert.equal(await fires(b, T + wait - SEC), false);
    T += wait;
  };
  await after(429, 120, 2 * MIN);
  await after(429, undefined, 10 * MIN);
  await after(429, 7200, 60 * MIN);
  await after(503, undefined, 2 * MIN);
  await after(0, undefined, 5 * MIN);
  await after(401, undefined, 60 * MIN);
  assert.equal((await pick(b, T)).data.wait.err, 401);
  assert.equal(await fires(b, T), true);
});

test("nothing starts before the task is set up", async () => {
  const b = await ready();
  await say(b, "Dentist Friday at 9");
  assert.equal(await fires(b, NOW + 61 * SEC, false), false);
  assert.equal(await fires(b, NOW + 5 * MIN, false), false);
  assert.equal((await pick(b, NOW + 15 * MIN)).data.wait.err, "setup");
  assert.equal(await fires(b, NOW + 16 * MIN), true);
});

test("filed results end the run", async () => {
  const b = await ready();
  await say(b, "Dentist Friday at 9");
  const T = NOW + 61 * SEC;
  assert.equal(await fires(b, T), true);
  await fired(b, T, 200);
  await file(b, (await items(b)).map(x => ({item: x.id, kind: "note", t: x.text})), T + MIN);
  assert.deepEqual(await b.storage.get("run"), {});
  assert.equal(await fires(b, T + 2 * MIN), false);
  await say(b, "Call the bank", at(10), T + 3 * MIN);
  assert.equal(await fires(b, T + 3 * MIN + 59 * SEC), false);
  assert.equal(await fires(b, T + 4 * MIN), true);
});

test("an event and a to-do alert before the phone picks them up", async () => {
  const b = await ready();
  for (const [k, text] of ["Flight on the 11th at 9:35", "Dinner on the 11th at 6", "Reply to the email tomorrow at 8",
    "Vacation on the 12th", "Conference on December 21st at 10"].entries()) await say(b, text, at(k));
  const [x, y, z, v, c] = await items(b);
  await file(b, [
    {item: x.id, kind: "event", t: "Flight", d: "2026-11-11", s: "09:35"},
    {item: y.id, kind: "event", t: "Dinner", d: "2026-11-11", s: "18:00"},
    {item: z.id, kind: "todo", t: "Reply to the email", d: "2026-11-10", s: "08:00", q: "Did you reply?"},
    {item: v.id, kind: "event", t: "Vacation", d: "2026-11-12"},
    {item: c.id, kind: "event", t: "Conference", d: "2026-12-21", s: "10:00"},
  ]);
  const [f, dn, r, vac] = (await pick(b)).data.results;
  assert.deepEqual((await tick(b, NOW + 2 * MIN)).data.pending, [
    {t: Date.UTC(2026, 10, 10, 13), kind: "todo", id: r.id + "@2026-11-10", w: "Reply to the email", q: "Did you reply?"},
    {t: Date.UTC(2026, 10, 11, 0), kind: "eve", d: "2026-11-11", w: [{id: f.id, t: "Flight", s: "09:35"}]},
    {t: Date.UTC(2026, 10, 11, 0), kind: "eve", d: "2026-11-11", w: [{id: dn.id, t: "Dinner", s: "18:00"}]},
    {t: Date.UTC(2026, 10, 11, 14, 5), kind: "ev", s: Date.UTC(2026, 10, 11, 14, 35), id: f.id + "@2026-11-11", w: "Flight"},
    {t: Date.UTC(2026, 10, 11, 22, 30), kind: "ev", s: Date.UTC(2026, 10, 11, 23), id: dn.id + "@2026-11-11", w: "Dinner"},
    {t: Date.UTC(2026, 10, 12, 0), kind: "eve", d: "2026-11-12", w: [{id: vac.id, t: "Vacation", s: null}]},
  ]);
  // Fifteen minutes on, the to-do's alert is past and gone.
  assert.equal((await tick(b, Date.UTC(2026, 10, 10, 13, 16))).data.pending[0].kind, "eve");
});

test("confirmed results still alert, carrying when they were confirmed", async () => {
  const b = await ready();
  await say(b, "Flight on the 11th at 9:35");
  const [x] = await items(b);
  await file(b, [{item: x.id, kind: "event", t: "Flight", d: "2026-11-11", s: "09:35"}]);
  const [f] = (await pick(b)).data.results;
  const A = NOW + MIN;
  await op(b, "ack", {who: "worker", body: {ids: [f.id], at: A}, now: A});
  const {pending} = (await tick(b, A + MIN)).data;
  assert.deepEqual(pending.map(p => [p.kind, p.ack]), [["eve", A], ["ev", A]]);
  assert.deepEqual((await tick(b, A + 10 * MIN)).data.pending, []);
});

test("tests never alert", async () => {
  const b = await ready();
  await b.storage.put("inbox", [{id: "itest000001", text: "Flight on the 11th at 9:35", said: AT, off: -300, got: NOW, test: true}]);
  await file(b, [{item: "itest000001", kind: "event", t: "Flight", d: "2026-11-11", s: "09:35"}]);
  assert.equal((await b.storage.get("tests")).itest000001.length, 1);
  assert.deepEqual((await tick(b, NOW + 2 * MIN)).data.pending, []);
});
