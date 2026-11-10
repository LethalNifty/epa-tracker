"use strict";
// Tell GI Hub on the phone: the two keys Settings makes, picking up what
// Claude filed from the reminder sender, putting it in GI Hub once, and
// confirming it with the next plan upload. The sender here is its real code
// (tools/agenda) with its storage in memory. Full app only. Placeholder names only.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const nodeCrypto = require("node:crypto");
const {pathToFileURL} = require("node:url");
const {load, state, ROOT} = require("./harness");

const at = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
const ev = (id, t, d, s, e, x = {}) => ({id, t, d, s, e, ...x});
const sha = k => nodeCrypto.createHash("sha256").update(k).digest("hex");
const mod = f => import(pathToFileURL(path.join(ROOT, "tools", "agenda", f)).href);
const SENDER = "https://gi-hub-agenda.lethalnifty.workers.dev", SAID = "2026-11-09T14:00:00-05:00";

function kv() {
  const m = new Map();
  return {m, async get(k) { return m.has(k) ? m.get(k) : null; }, async put(k, v) { m.set(k, String(v)); }, async delete(k) { m.delete(k); }};
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
// The sender as the phone sees it, every request the phone made (with its
// body), and c.as: the shortcut or Claude's task calling it with their key.
// c.block: requests that don't get through.
async function sender(now) {
  const w = await mod("worker.mjs");
  const c = {w, env: {AGENDA: kv(), TELL: tellNs()}, calls: [], sent: [], now, block: null, pushed: []};
  c.pushFetch = async url => { c.pushed.push(url); return {status: 201}; };
  c.fetch = async (url, init = {}) => {
    const u = new URL(url), what = (init.method || "GET") + " " + u.pathname;
    if (!u.hostname.startsWith("gi-hub-agenda.")) throw new TypeError("Load failed");
    c.calls.push(what);
    c.sent.push({what, body: init.body ? JSON.parse(init.body) : null});
    if (c.block && c.block.test(what)) throw new TypeError("Load failed");
    return w.handle(new Request(url, init), c.env, c.now, c.pushFetch);
  };
  c.as = (tok, method, p, body) => w.handle(new Request(SENDER + p, {method,
    headers: {Authorization: "Bearer " + tok, ...(body ? {"Content-Type": "application/json"} : {})}, body: body ? JSON.stringify(body) : undefined}),
  c.env, c.now, c.pushFetch);
  return c;
}
// One thing said to the shortcut, and what Claude filed for it: the results as the sender keeps them.
async function files(c, results, text = "Flight on the 11th at 9:35", said = SAID) {
  assert.equal((await c.as(c.keys.shortcut, "POST", "/inbox", {text, at: said})).status, 200);
  const {items} = await (await c.as(c.keys.claude, "GET", "/inbox")).json();
  const r = await c.as(c.keys.claude, "POST", "/results", {results: results.map(x => ({item: items.at(-1).id, ...x}))});
  assert.equal(r.status, 200);
  return (await c.env.TELL.storage.get("results")).slice(-results.length);
}
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
async function openApp(c, items = [], now = "2026-11-09T14:00") {
  const h = load({today: now.slice(0, 10), state: state({}, {agenda: {items}}), fetch: c.fetch});
  h.setNow(now);
  install(h, iphone());
  await h.run("remindInit()");
  await settle(h);
  return h;
}
// A phone with reminders and Tell GI Hub on; c.keys are the keys it made.
async function tellPhone(items = []) {
  const c = await sender(at(2026, 11, 9, 14));
  const h = await openApp(c, items);
  h.click("setopen"); h.click("remindon"); await settle(h);
  h.click("telon"); await settle(h);
  c.keys = JSON.parse(h.store.get("gi-tell-v1")).keys;
  return {c, h};
}
// A pickup at a later minute (past the 20 seconds between pickups), and the plan upload after it.
async function pick(h, now) {
  h.setNow(now);
  await h.run("tellPick()");
  await settle(h);
}
const kept = h => JSON.parse(h.store.get("gi-tell-v1"));

test("turning on makes two keys, sends only their fingerprints, and shows them to copy", async () => {
  const c = await sender(at(2026, 11, 9, 14)), h = await openApp(c);
  h.click("setopen");
  assert.match(h.html(), /Tell GI Hub uses the reminder sender: turn reminders on first\./);
  h.click("remindon"); await settle(h);
  assert.match(h.html(), /data-action="telon">Turn on Tell GI Hub<\/button>/);
  assert.ok(!c.calls.includes("PUT /tell"), "nothing about Tell GI Hub goes to the sender before you turn it on");
  h.click("telon"); await settle(h);
  const keys = kept(h).keys;
  for (const k of [keys.shortcut, keys.claude]) assert.match(k, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(keys.shortcut, keys.claude);
  assert.deepEqual(c.sent.find(x => x.what === "PUT /tell").body, {shortcut: sha(keys.shortcut), claude: sha(keys.claude)});
  // The sender knows the keys by their fingerprints: the shortcut's key now opens the inbox.
  assert.equal((await c.as(keys.shortcut, "POST", "/inbox", {text: "Dentist Friday at 9", at: SAID})).status, 200);
  const html = h.html();
  assert.match(html, /Shortcut key[\s\S]*?data-action="telcopy" data-which="shortcut"/);
  assert.match(html, /Claude key[\s\S]*?data-action="telcopy" data-which="claude"/);
  assert.ok(html.includes(keys.shortcut.slice(-4)) && !html.includes(keys.shortcut) && !html.includes(keys.claude), "only the last 4 show");
  assert.ok(!h.store.get("epa-state-v1").includes(keys.claude) && !h.val("Store.exportJSON()").includes(keys.claude), "never in the app's data or a backup");
  // Copy puts the whole key on the clipboard.
  const copied = [];
  h.ctx.navigator.clipboard = {writeText: async t => { copied.push(t); }};
  h.click("telcopy", {which: "claude"});
  await new Promise(r => setImmediate(r));
  assert.deepEqual(copied, [keys.claude]);
  assert.match(h.html(), /Claude key copied/);
  // A phone that can't copy shows the key whole, to copy by hand.
  h.ctx.navigator.clipboard = {writeText: async () => { throw new Error("not allowed"); }};
  h.click("telcopy", {which: "shortcut"});
  await new Promise(r => setImmediate(r));
  assert.ok(h.html().includes(`value="${keys.shortcut}"`));
});

test("results become Agenda events, to-dos, pearls and notes once, however often they come back", async () => {
  const {c, h} = await tellPhone();
  c.block = /^PUT \/alerts$/;   // the plan upload doesn't get through, so the results come back
  const r = await files(c, [
    {kind: "event", t: "Flight", d: "2026-11-11", s: "09:35"},
    {kind: "todo", t: "Send the slides to Casey", d: "2026-11-10", s: "08:00", q: "Did you send the slides?"},
    {kind: "pearl", t: "In a variceal bleed, start octreotide and an antibiotic", topic: "Varices"},
    {kind: "note", t: "The clinic parking moved to level 3"}]);
  await pick(h, "2026-11-09T14:05");
  await pick(h, "2026-11-09T14:06");
  h.run("tellKept.seen = []");   // even a phone that forgot what it saw adds nothing twice
  await pick(h, "2026-11-09T14:07");
  assert.equal(c.calls.filter(x => x === "GET /results").length, 3);
  const a = h.saved().agenda;
  assert.deepEqual(a.items.map(x => [x.id, x.t, x.d, x.s, x.e, x.todo || null]), [
    [r[0].id, "Flight", "2026-11-11", "09:35", null, null],
    [r[1].id, "Send the slides to Casey", "2026-11-10", "08:00", null, {q: "Did you send the slides?", tom: 0, done: null}]]);
  assert.deepEqual(h.saved().pearls.filter(x => x.t.includes("octreotide")).map(x => [x.id, x.d, x.topic]), [["p" + r[2].id.slice(1), "2026-11-09", "Varices"]]);
  assert.deepEqual(a.notes.map(n => [n.id, n.t]), [["n" + r[3].id.slice(1), "The clinic parking moved to level 3"]]);
  assert.equal(kept(h).added.length, 4, "one entry each for the Claude added card");
  // In GI Hub now, the to-do asks at its time from the phone's own plan.
  assert.ok(h.val("alertPlan(callNow())").some(x => x.kind === "todo" && x.id === r[1].id + "@2026-11-10"));
});

test("the next plan upload confirms what was picked up, even when the plan is unchanged", async () => {
  const {c, h} = await tellPhone();
  const plan = JSON.stringify(h.val("alertPlan(callNow())")), uploads = () => c.sent.filter(x => x.what === "PUT /alerts");
  const r = await files(c, [{kind: "pearl", t: "Lactulose until two or three soft stools a day"}, {kind: "note", t: "Bring the badge on Monday"}]);
  const before = uploads().length;
  await pick(h, "2026-11-09T14:05");
  assert.equal(uploads().length, before + 1, "one upload, though the plan is the same");
  assert.equal(JSON.stringify(uploads().at(-1).body.list), plan);
  assert.deepEqual(uploads().at(-1).body.ack.slice().sort(), r.map(x => x.id).sort());
  assert.deepEqual(kept(h).ack, []);
  assert.ok((await c.env.TELL.storage.get("results")).every(x => x.ack), "the sender has them as picked up");
  await pick(h, "2026-11-09T14:06");
  assert.equal(uploads().length, before + 1, "nothing new to confirm, no upload");
  // The next upload, with nothing waiting to confirm, carries the plan alone.
  h.click("setclose"); h.click("tab", {page: "agenda"});
  h.click("agnew"); h.run(`agSheet.t = "Dentist"; agSheet.d = "2026-11-13"`); h.click("agsave");
  await settle(h);
  assert.equal(uploads().length, before + 2);
  assert.equal(uploads().at(-1).body.ack, undefined);
});

test("a change moves the one event it matches, keeping its length", async () => {
  const {c, h} = await tellPhone([ev("a1", "Dentist", "2026-11-13", "09:00", "10:00"), ev("a2", "Soccer", "2026-11-12", "19:00", "21:00"),
    ev("a3", "Night float handover", "2026-11-14", "22:00", "01:00"), ev("a4", "Grand rounds", "2026-11-18", "08:00", "09:00")]);
  await files(c, [{kind: "change", m: "the dentist appointment", to: {d: "2026-11-17", s: "14:00"}},
    {kind: "change", m: "handover", to: {s: "23:30"}}, {kind: "change", m: "grand rounds", to: {d: "2026-11-25"}}],
  "Move the dentist to next Tuesday at 2, the handover to 11:30 and grand rounds a week later");
  await pick(h, "2026-11-09T14:05");
  const items = h.saved().agenda.items, by = id => items.find(x => x.id === id), when = x => [x.d, x.s, x.e, x.d2];
  assert.deepEqual(when(by("a1")), ["2026-11-17", "14:00", "15:00", null]);
  assert.deepEqual(when(by("a3")), ["2026-11-14", "23:30", "02:30", "2026-11-15"], "past midnight, still three hours");
  assert.deepEqual(when(by("a4")), ["2026-11-25", "08:00", "09:00", null]);
  assert.deepEqual(when(by("a2")), ["2026-11-12", "19:00", "21:00", null], "the rest stay");
  // What each was before is kept for Undo.
  const undo = kept(h).added.find(x => x.undo && x.undo.put && x.undo.put.id === "a1");
  assert.deepEqual([undo.kind, undo.undo.put.d, undo.undo.put.s], ["change", "2026-11-13", "09:00"]);
});

test("a change with no match becomes a note, and with two asks which", async () => {
  const {c, h} = await tellPhone([ev("a1", "Dentist", "2026-11-13", "09:00", "10:00"), ev("a2", "Dentist cleaning", "2026-11-20", "09:00", "10:00")]);
  const r = await files(c, [{kind: "change", m: "physio", cancel: true}, {kind: "change", m: "dentist", to: {s: "11:00"}}], "Cancel physio and move the dentist to 11");
  await pick(h, "2026-11-09T14:05");
  const a = h.saved().agenda;
  assert.deepEqual(a.items.map(x => [x.id, x.d, x.s]), [["a1", "2026-11-13", "09:00"], ["a2", "2026-11-20", "09:00"]], "nothing changed");
  assert.deepEqual(a.notes.map(n => [n.id, n.t]), [["n" + r[0].id.slice(1), "Couldn't find \"physio\" to cancel"]]);
  const added = kept(h).added, nf = added.find(x => x.id === r[0].id), which = added.find(x => x.id === r[1].id);
  assert.equal(nf.line, "Not found: physio, added to Notes");
  assert.deepEqual(which.ask.choices.map(x => x.id), ["a1", "a2"]);
  assert.deepEqual(which.ask.to, {s: "11:00"});
});

test("a change never touches a repeating event, a past one or a done to-do", async () => {
  const {c, h} = await tellPhone([ev("a1", "Soccer", "2026-11-12", "19:00", "21:00", {rep: "w"}), ev("a2", "Dentist", "2026-11-02", "09:00", "10:00"),
    {id: "a3", t: "Book the room", d: "2026-11-10", s: "08:00", todo: {q: "", tom: 0, done: "2026-11-09T15:00:00.000Z"}}]);
  await files(c, [{kind: "change", m: "soccer", cancel: true}, {kind: "change", m: "dentist", to: {d: "2026-11-20"}},
    {kind: "change", m: "book the room", cancel: true}], "Cancel soccer, move the dentist to the 20th, and cancel booking the room");
  await pick(h, "2026-11-09T14:05");
  const a = h.saved().agenda;
  assert.deepEqual(a.items.map(x => [x.id, x.d]), [["a1", "2026-11-12"], ["a2", "2026-11-02"], ["a3", "2026-11-10"]]);
  assert.deepEqual(a.notes.map(n => n.t), ["Couldn't find \"soccer\" to cancel", "Couldn't find \"dentist\" to move to Fri 20 Nov",
    "Couldn't find \"book the room\" to cancel"]);
});

test("a pickup with a sheet open saves but doesn't redraw", async () => {
  const {c, h} = await tellPhone();
  h.click("setclose"); h.click("tab", {page: "agenda"}); h.click("agnew");
  h.run(`agSheet.t = "Half-typed"`);
  const shown = h.html();
  await files(c, [{kind: "event", t: "Flight", d: "2026-11-11", s: "09:35"}]);
  await pick(h, "2026-11-09T14:05");
  assert.equal(h.html(), shown, "no redraw under the open sheet");
  assert.equal(h.val("agSheet.t"), "Half-typed");
  assert.ok(h.saved().agenda.items.some(x => x.t === "Flight"));
  h.click("agclose");
  assert.match(h.html(), /<b>Flight<\/b>/);
  // With nothing open, a pickup redraws.
  await files(c, [{kind: "event", t: "Soccer", d: "2026-11-12", s: "19:00"}], "Soccer Thursday evening");
  await pick(h, "2026-11-09T14:06");
  assert.match(h.html(), /<b>Soccer<\/b>/);
});

test("the test set runs from Settings and shows how Claude did", async () => {
  const {c, h} = await tellPhone();
  h.click("teltest"); await settle(h);
  assert.ok(c.calls.includes("POST /tell/test"));
  assert.equal((await c.env.TELL.storage.get("inbox")).filter(x => x.test).length, 20);
  h.click("telscore"); await settle(h);
  assert.match(h.html(), /0 of 20 right<\/b>, 0 filed so far/);
});

// ---- The Claude added card ------------------------------------------------------------------------
const week = h => { h.click("setclose"); h.click("tab", {page: "week"}); return h.html(); };
const cardOf = html => { const i = html.indexOf('<div class="card tellcard">'); return i < 0 ? "" : html.slice(i, html.indexOf("</section>", i)); };

test("the card lists what was added today with Undo, and folds away after a day", async () => {
  const {c, h} = await tellPhone();
  const r = await files(c, [{kind: "event", t: "Flight", d: "2026-11-11", s: "09:35"},
    {kind: "todo", t: "Send the slides to Casey", d: "2026-11-10", s: "08:00", chk: true},
    {kind: "idea", for: "heidi", t: "Put the medication list above the plan"}], "Flight Wednesday at 9:35, remind me about the slides, and a Heidi idea");
  await pick(h, "2026-11-09T14:05");
  const html = week(h), i = html.indexOf('<div class="card tellcard">'), card = cardOf(html);
  assert.ok(i > html.indexOf("</header>") && i < html.indexOf('class="card agnext"'), "under the header, before the rest of Week");
  assert.match(card, /Claude added/);
  const lines = ["Flight, Wed 11 Nov, 09:35", "To-do: Send the slides to Casey, Tue 10 Nov, 08:00", "Heidi idea, waits for the desktop"];
  assert.deepEqual(lines.map(l => card.indexOf(l)).every((x, k, a) => x > 0 && (k === 0 || x > a[k - 1])), true, "in the order Claude filed them");
  for (const x of r) assert.match(card, new RegExp(`data-action="telundo" data-id="${x.id}">Undo<`));
  assert.match(card, /Tue 10 Nov, 08:00<\/b><\/button><span class="tellchk mono">Check this<\/span>/);
  assert.doesNotMatch(card, /\(check this\)/);
  // An event or to-do opens from its row.
  assert.match(card, new RegExp(`data-action="agopen" data-id="${r[0].id}"`));
  // A day later it has folded away.
  h.setNow("2026-11-10T14:06");
  assert.equal(cardOf(week(h)), "");
});

test("a scope case and a which-one question wait on the card until you deal with them", async () => {
  const {c, h} = await tellPhone([ev("a1", "Dentist", "2026-11-13", "09:00", "10:00"), ev("a2", "Dentist", "2026-11-20", "09:00", "10:00")]);
  const r = await files(c, [{kind: "scope", text: "Colonoscopy, two small polyps taken with a cold snare", d: "2026-11-09"},
    {kind: "change", m: "dentist", to: {s: "11:00"}}, {kind: "note", t: "The clinic parking moved to level 3"}], "A scope case, and the dentist at 11");
  await pick(h, "2026-11-09T14:05");
  // Three days on, the note's row has folded away; the case and the question still wait.
  h.setNow("2026-11-12T14:05");
  let card = cardOf(week(h));
  assert.match(card, new RegExp(`data-action="telscope" data-id="${r[0].id}"`));
  assert.match(card, new RegExp(`data-action="telpick" data-id="${r[1].id}"`));
  assert.doesNotMatch(card, /Note: The clinic parking/);
  // Check in Endo hands the words to the Case box, and the row goes.
  h.click("telscope", {id: r[0].id});
  assert.equal(h.val("scopeCap.text"), "Colonoscopy, two small polyps taken with a cold snare");
  assert.doesNotMatch(cardOf(h.html()), /telscope/);
  // The answer shows for a day from now, with Undo.
  h.click("telpick", {id: r[1].id, item: "a2"});
  card = cardOf(h.html());
  assert.match(card, /Moved: Dentist to Fri 20 Nov, 11:00/);
  assert.match(card, new RegExp(`data-action="telundo" data-id="${r[1].id}"`));
  // However much comes after, a row still waiting is kept.
  const k = kept(h);
  k.added.unshift({id: "aaaaaaaaaa1", kind: "scope", line: "Scope case, check it in Endo", at: at(2026, 11, 1, 9), scope: {text: "Gastroscopy, normal", d: "2026-11-01"}});
  for (let i = 0; i < 45; i++) k.added.push({id: "an" + String(i).padStart(9, "0"), kind: "note", line: "Note " + i, at: at(2026, 11, 12, 14)});
  h.store.set("gi-tell-v1", JSON.stringify(k)); h.run("tellKept = null");
  await pick(h, "2026-11-12T15:00");
  assert.ok(kept(h).added.some(e => e.id === "aaaaaaaaaa1"));
  assert.equal(kept(h).added.length, 40);
});

test("Undo takes back each kind", async () => {
  const {c, h} = await tellPhone([ev("a1", "Dentist", "2026-11-13", "09:00", "10:00"), ev("a2", "Physio", "2026-11-16", "16:00", "17:00")]);
  const r = await files(c, [
    {kind: "event", t: "Flight", d: "2026-11-11", s: "09:35"},
    {kind: "todo", t: "Send the slides to Casey"},
    {kind: "change", m: "dentist", to: {d: "2026-11-17", s: "14:00"}},
    {kind: "change", m: "physio", cancel: true},
    {kind: "note", t: "The clinic parking moved to level 3"},
    {kind: "pearl", t: "Lactulose until two or three soft stools a day"},
    {kind: "pearl", t: "Rifaximin on top of lactulose for recurrent encephalopathy"},
    {kind: "idea", for: "gihub", t: "Show next week's calls on the Week tab"}], "A bit of everything");
  await pick(h, "2026-11-09T14:05");
  assert.equal(h.saved().agenda.items.length, 3, "the dentist moved, physio gone, the flight and the to-do in");
  assert.ok(await c.env.AGENDA.get("idea:" + r[7].id));
  // A pearl already sent to Drive stays; its row goes.
  h.run(`Store.state.pearls.find(p => p.t.startsWith("Rifaximin")).sent = "2026-11-09"`);
  for (const x of r) h.click("telundo", {id: x.id});
  await settle(h);
  const s = h.saved();
  assert.deepEqual(s.agenda.items.map(x => [x.id, x.d, x.s, x.e]), [["a1", "2026-11-13", "09:00", "10:00"], ["a2", "2026-11-16", "16:00", "17:00"]]);
  assert.deepEqual(s.agenda.notes, []);
  assert.deepEqual(s.pearls.map(p => p.t), ["Rifaximin on top of lactulose for recurrent encephalopathy"]);
  assert.ok(c.calls.includes("DELETE /idea/" + r[7].id));
  assert.equal(await c.env.AGENDA.get("idea:" + r[7].id), null);
  assert.match(h.html(), /Undone/);
  assert.deepEqual(kept(h).added, [], "every row went");
});

test("picking which dentist applies the change to that one", async () => {
  const {c, h} = await tellPhone([ev("a1", "Dentist", "2026-11-13", "09:00", "10:00"), ev("a2", "Dentist cleaning", "2026-11-20", "09:00", "10:00")]);
  const r = await files(c, [{kind: "change", m: "dentist", to: {s: "11:00"}}, {kind: "change", m: "dentist", cancel: true}], "Move the dentist to 11, or cancel it");
  await pick(h, "2026-11-09T14:05");
  let card = cardOf(week(h));
  assert.match(card, /Which dentist\? Move to 11:00/);
  for (const item of ["a1", "a2"]) assert.match(card, new RegExp(`data-action="telpick" data-id="${r[0].id}" data-item="${item}">Dentist`));
  assert.match(card, new RegExp(`data-action="telpick" data-id="${r[0].id}" data-item="">Neither<`));
  h.click("telpick", {id: r[0].id, item: "a2"});
  const by = id => h.saved().agenda.items.find(x => x.id === id);
  assert.deepEqual([by("a1").s, by("a2").s, by("a2").e], ["09:00", "11:00", "12:00"]);
  card = cardOf(h.html());
  assert.doesNotMatch(card, new RegExp(`data-id="${r[0].id}" data-item`));
  assert.match(card, /Moved: Dentist cleaning to Fri 20 Nov, 11:00/);
  // Neither: nothing changes and the question goes.
  h.click("telpick", {id: r[1].id, item: ""});
  assert.deepEqual(h.saved().agenda.items.map(x => x.id), ["a1", "a2"]);
  assert.doesNotMatch(cardOf(h.html()), /data-action="telpick"/);
  h.click("telundo", {id: r[0].id});
  assert.deepEqual([by("a2").s, by("a2").e], ["09:00", "10:00"]);
});

test("a scope case opens the Endo check with its words", async () => {
  const {c, h} = await tellPhone();
  const r = await files(c, [{kind: "scope", text: "Colonoscopy, two polyps, cold snare"}], "Scope case: colonoscopy, two polyps, cold snare");
  await pick(h, "2026-11-09T14:05");
  assert.match(cardOf(week(h)), new RegExp(`Scope case, check it in Endo[\\s\\S]*?data-action="telscope" data-id="${r[0].id}">Check in Endo<`));
  h.click("telscope", {id: r[0].id});
  assert.equal(h.val("scopeSheet.kind"), "capture");
  assert.deepEqual([h.val("scopeCap.text"), h.val("scopeCap.day")], ["Colonoscopy, two polyps, cold snare", "2026-11-09"]);
  assert.ok(h.val("scopeCap.cards.length") >= 1);
});

test("Week says Waiting for Claude when the sender says so, and not before", async () => {
  const {c, h} = await tellPhone();
  assert.equal((await c.as(c.keys.shortcut, "POST", "/inbox", {text: "Dentist Friday at 9", at: SAID})).status, 200);
  c.now = at(2026, 11, 9, 14, 10);
  await pick(h, "2026-11-09T14:10");
  assert.doesNotMatch(week(h), /Waiting for Claude/);
  c.now = at(2026, 11, 9, 14, 16);
  await pick(h, "2026-11-09T14:16");
  assert.match(week(h), /Waiting for Claude/);
});

// ---- Notifications ----------------------------------------------------------------------------------
test("the added notification names one thing in its title, and counts several", () => {
  const h = load({today: "2026-11-09"});
  const say = m => h.val(`noticeFor(${JSON.stringify(m)}, null, 0)`);
  assert.deepEqual(say({kind: "added", t: 5, lines: ["Flight, Wed 11 Nov, 09:35"], more: 0, fin: false}),
    {title: "Added: Flight, Wed 11 Nov, 09:35", body: "", tag: "gi-added-5", url: "./"});
  assert.deepEqual(say({kind: "added", t: 5, lines: ["Flight, Wed 11 Nov, 09:35", "To-do: Send the slides, Tue 10 Nov, 08:00"], more: 2, fin: true}),
    {title: "Added 4 things", body: "Flight, Wed 11 Nov, 09:35. To-do: Send the slides, Tue 10 Nov, 08:00, and 2 more. Open GI Hub to finish.", tag: "gi-added-5", url: "./"});
  assert.equal(say({kind: "added", t: 5, lines: ["Cancel: dentist"], more: 0, fin: true}).body, "Open GI Hub to finish.");
});

test("an event Claude added alerts with its own words before GI Hub has it", () => {
  const h = load({today: "2026-11-10", state: state({}, {agenda: {items: [ev("a1", "Dentist", "2026-11-11", "15:30", "16:30")]}})});
  h.setNow("2026-11-10T19:00");
  const s = at(2026, 11, 11, 9, 35), now = at(2026, 11, 11, 9, 5), soon = {kind: "ev", t: now, s, id: "a9b8c7d6e5f@2026-11-11", w: "Flight"};
  const said = {title: "Flight at 09:35", body: "In 30 minutes.", tag: "gi-ev-a9b8c7d6e5f@2026-11-11", url: "./#agenda"};
  assert.deepEqual(h.val(`noticeFor(${JSON.stringify(soon)}, null, ${now})`), said);
  assert.deepEqual(h.val(`noticeFor(${JSON.stringify(soon)}, remindBrief(${now}), ${now})`), said);
  const eve = at(2026, 11, 10, 19), msg = {kind: "eve", t: eve, d: "2026-11-11", w: [{id: "a9b8c7d6e5f", t: "Flight", s: "09:35"}]};
  const both = {title: "Tomorrow: 2 things", body: "Flight at 09:35, Dentist at 15:30.", tag: "gi-eve-2026-11-11", url: "./#agenda"};
  assert.deepEqual(h.val(`noticeFor(${JSON.stringify(msg)}, remindBrief(${eve}), ${eve})`), both);
  // Once GI Hub has it, it's named once.
  h.run(`agState().items.push(agItemClean({id: "a9b8c7d6e5f", t: "Flight", d: "2026-11-11", s: "09:35"})); Store.save()`);
  assert.deepEqual(h.val(`noticeFor(${JSON.stringify(msg)}, remindBrief(${eve}), ${eve})`), both);
});

test("an added push tells the open app to pick up", async () => {
  const fs = require("node:fs"), vm = require("node:vm"), handlers = {}, posted = [];
  const ctx = {URL, console, Date, Response: class {},
    caches: {open: async () => ({match: async () => undefined, put: async () => {}}), keys: async () => [], match: async () => undefined},
    importScripts: f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx),
    self: {addEventListener: (t, fn) => { handlers[t] = fn; }, skipWaiting() {},
      registration: {scope: "https://lethalnifty.github.io/epa-tracker/", showNotification: async () => {}},
      clients: {claim() {}, matchAll: async () => [{postMessage: m => posted.push(m)}], openWindow: async () => {}}}};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "sw.js"), "utf8"), ctx);
  const push = async msg => { let p; handlers.push({data: {json: () => msg}, waitUntil: x => { p = x; }}); await p; };
  await push({kind: "ev", t: 1, s: 2, id: "a1@2026-11-11"});
  assert.deepEqual(posted, [], "a reminder doesn't");
  await push({kind: "added", t: 1, lines: ["Flight, Wed 11 Nov, 09:35"], more: 0, fin: false});
  // The message is made inside the worker's sandbox, so compare it as plain data.
  assert.deepEqual(posted.map(m => ({...m})), [{tell: 1}]);
  const h = load({today: "2026-11-09"});
  h.run("window.__picks = 0; tellPick = () => { __picks++; return Promise.resolve(); }");
  h.run("appMessage({tell: 1})");
  assert.equal(h.val("__picks"), 1);
});

// ---- The + box for typing ----------------------------------------------------------------------
const tabs = h => [...h.html().matchAll(/data-action="plusto" data-to="(\w)"/g)].map(m => m[1]);
// The + opened, switched to Tell, and words typed in its box.
function typeTell(h, words) {
  h.click("scopeopen");
  h.click("plusto", {to: "t"});
  h.fire("input", {dataset: {tel: "text"}, value: words});
}

test("the + has a Tell switch only when Tell GI Hub is on", async () => {
  const off = await openApp(await sender(at(2026, 11, 9, 14)));
  off.click("scopeopen");
  assert.deepEqual(tabs(off), ["c", "e", "p"], "reminders off: no Tell");
  assert.match(off.html(), /class="segtabs three plusseg"/);

  const {h} = await tellPhone();
  h.click("setclose"); h.click("scopeopen");
  assert.deepEqual(tabs(h), ["c", "e", "p", "t"]);
  assert.match(h.html(), /class="segtabs four plusseg"/);
  assert.match(h.html(), /data-to="t">[^<]*<svg[^>]*><use href="#i-mic"\/><\/svg>Tell<\/button>/);
  // Switching to it brings up the keyboard on its box, one tap from the mic.
  let focused = 0;
  h.els.tellbox = {focus: () => { focused++; }};
  h.click("plusto", {to: "t"});
  assert.equal(h.val("plusOn"), "t");
  assert.match(h.html(), /<textarea id="tellbox"[^>]*data-tel="text"/);
  assert.equal(focused, 1);
  // The words stay while you look at Case and come back.
  h.fire("input", {dataset: {tel: "text"}, value: "Dentist Friday at 3"});
  h.click("plusto", {to: "c"}); h.click("plusto", {to: "t"});
  assert.match(h.html(), />Dentist Friday at 3<\/textarea>/);
  // Closing ends the + flow.
  h.click("telclose");
  assert.equal(h.val("plusOn"), null);
  assert.ok(!/data-tel="text"/.test(h.html()));
  assert.equal(h.val("anySheet()"), false);

  h.click("setopen"); h.click("teloff"); await settle(h); h.click("setclose");
  h.click("scopeopen");
  assert.deepEqual(tabs(h), ["c", "e", "p"], "turned off: the switch goes");
});

test("what you type goes to the inbox with the phone's clock and offset", async () => {
  const {c, h} = await tellPhone();
  h.click("setclose");
  h.setNow("2026-11-09T14:05");
  typeTell(h, "  Dentist Friday at 3  ");
  h.click("telsay"); await settle(h);
  assert.deepEqual(c.sent.filter(x => x.what === "POST /inbox").map(x => x.body),
    [{text: "Dentist Friday at 3", at: "2026-11-09T14:05:00-05:00"}]);
  const inbox = await c.env.TELL.storage.get("inbox");
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].text, "Dentist Friday at 3");
  assert.equal(inbox[0].off, -300);
  // Sent: the + closes and says so.
  assert.equal(h.val("plusOn"), null);
  assert.ok(!/data-tel="text"/.test(h.html()));
  assert.match(h.html(), /Sent to Claude\. It files it in a few minutes\./);
  // Nothing typed: nothing goes.
  typeTell(h, "   ");
  h.click("telsay"); await settle(h);
  assert.equal(c.sent.filter(x => x.what === "POST /inbox").length, 1);
  assert.match(h.html(), /Type or say something first\./);
});

test("with no signal the words stay and say Not sent", async () => {
  const {c, h} = await tellPhone();
  h.click("setclose");
  typeTell(h, "Flight on the 11th at 9:35");
  c.block = /^POST \/inbox$/;
  h.click("telsay"); await settle(h);
  assert.match(h.html(), /Not sent\. Try again when you have signal\./);
  assert.match(h.html(), />Flight on the 11th at 9:35<\/textarea>/);
  assert.equal(h.val("plusOn"), "t");
  assert.equal(await c.env.TELL.storage.get("inbox"), undefined);
  // With signal again, the same words go.
  c.block = null;
  h.click("telsay"); await settle(h);
  assert.deepEqual((await c.env.TELL.storage.get("inbox")).map(x => x.text), ["Flight on the 11th at 9:35"]);
  assert.match(h.html(), /Sent to Claude\. It files it in a few minutes\./);
});
