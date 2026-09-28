"use strict";
// Reminders on the phone: what each notification says (notify.js), the brief
// the app saves for it (remind.js), the setup screens, and the service
// worker's push handling. Placeholder names only.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {load, obs, state, many, ROOT} = require("./harness");

const at = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
const sample = () => fs.readFileSync(path.join(ROOT, "tools", "test", "fixtures", "call-sample.ics"), "utf8");
function withBlock(now, opts = {}) {
  const h = load({today: now.slice(0, 10), ...opts});
  h.setNow(now);
  h.ctx.__src = sample();
  h.run(`callImport(__src, "call-sample.ics"); toast = null`);
  return h;
}
// A browser that supports push, in a given state.
function pushPhone(h, {perm = "default", sub = null, last = null} = {}) {
  h.run(`window.__vapid = "BKey"`);
  h.ctx.PushManager = function PushManager() {};
  h.ctx.Notification = {permission: perm, requestPermission: async () => "granted"};
  h.ctx.navigator.serviceWorker = {ready: Promise.resolve({pushManager: {getSubscription: async () => sub}})};
  h.run(`remindReady = true`);
  h.ctx.__sub = sub && sub.toJSON(); h.ctx.__last = last;
  h.run(`remindSub = __sub; remindLast = __last`);
}
const fakeSub = {toJSON: () => ({endpoint: "https://web.push.apple.com/QAbc123", expirationTime: null, keys: {p256dh: "BPub", auth: "Auth"}})};

// ---- What a notification says ------------------------------------------------------

test("call reminder: who's on at each site, sign-out, and the Call screen on tap", () => {
  const h = withBlock("2026-10-28T16:00");
  const n = h.val(`noticeFor({kind: "call", s: ${at(2026, 10, 28, 17)}}, remindBrief(callNow()), callNow())`);
  assert.deepEqual(n, {title: "On call from 17:00",
    body: "HSC: Attending A, no resident. St. B: Attending B, no resident. Sign-out from Fellow E (HSC) and Fellow F (St B).",
    tag: "gi-call-" + at(2026, 10, 28, 17), url: "./#call"});
});

test("weekend reminder: the Friday team, and when you're off", () => {
  const h = withBlock("2026-10-30T16:00");
  const n = h.val(`noticeFor({kind: "call", s: ${at(2026, 10, 30, 17)}}, remindBrief(callNow()), callNow())`);
  assert.equal(n.title, "Weekend call from 17:00");
  assert.equal(n.body, "HSC: Attending C, no resident. St. B: Attending D with Resident G. Sign-out from Fellow E (HSC) and Fellow F (St B). Off Mon 08:00.");
});

test("Thursday reminder: the week's EPAs and the call that week", () => {
  const h = withBlock("2026-10-29T08:00", {state: state({d1: many(4, "2026-07-10")})});
  const n = h.val(`noticeFor({kind: "week", t: callNow()}, remindBrief(callNow()), callNow())`);
  assert.match(n.title, /^Block 5, week 2 of 4 starts today$/);
  assert.match(n.body, /^Due: F1-B ×\d, [^.]*F1-A[^.]*\. Call: Fri 17:00 \(weekend\), Tue 17:00\.$/);
  assert.equal(n.url, "./");
});

test("with nothing saved on the phone, reminders still say something useful", () => {
  const h = load();
  assert.deepEqual(h.val(`noticeFor({kind: "call", s: ${at(2026, 10, 28, 17)}}, null, ${at(2026, 10, 28, 16)})`),
    {title: "On call from 17:00", body: "Open GI Hub for who's on at each site.", tag: "gi-call", url: "./#call"});
  assert.equal(h.val(`noticeFor({kind: "week"}, null, 0)`).title, "A new GI Hub week");
  assert.equal(h.val(`noticeFor({kind: "test"}, null, 0)`).title, "GI Hub reminders are on");
  assert.equal(h.val(`noticeFor({}, null, 0)`).title, "GI Hub");
});

test("the brief: this week and the next two, shifts to come with who's on, nothing past", () => {
  const h = withBlock("2026-10-31T20:00");
  const b = h.val(`remindBrief(callNow())`);
  assert.equal(b.v, 1);
  assert.deepEqual(b.weeks.map(w => [w.block, w.week, w.start]), [[5, 2, at(2026, 10, 29)], [5, 3, at(2026, 11, 5)], [5, 4, at(2026, 11, 12)]]);
  assert.deepEqual(b.call.map(st => st.segs.length), [3, 1]);
  assert.deepEqual(b.call[0].segs[1].stb, {att: "Attending D", res: "Resident G"});
});

// ---- Setting it up ---------------------------------------------------------------------

test("in a browser without push, reminders don't appear at all", () => {
  const h = withBlock("2026-10-27T12:00");
  h.click("tab", {page: "epas"});
  assert.doesNotMatch(h.html(), /Reminders/);
  h.click("tab", {page: "week"});
  assert.doesNotMatch(h.html(), /remindcard/);
});

test("Week offers to turn reminders on; Not now hides the card for good", () => {
  const h = withBlock("2026-10-27T12:00");
  pushPhone(h);
  h.click("tab", {page: "plan"}); h.click("tab", {page: "week"});
  assert.match(h.html(), /class="card remindcard"[\s\S]*?Reminders on this phone[\s\S]*?Thu 08:00[\s\S]*?data-action="remindon"/);
  h.click("reminddismiss");
  assert.doesNotMatch(h.html(), /remindcard/);
  assert.deepEqual(JSON.parse(h.store.get("gi-remind-v1")), {dismissed: true});
});

test("turning on asks permission, subscribes with the sender's key, then shows the code to send", async () => {
  const h = withBlock("2026-10-27T12:00");
  pushPhone(h);
  let opts = null;
  h.ctx.navigator.serviceWorker = {ready: Promise.resolve({pushManager: {getSubscription: async () => null,
    subscribe: async o => { opts = o; return fakeSub; }}})};
  h.click("tab", {page: "plan"}); h.click("tab", {page: "week"});
  h.click("remindon");
  await new Promise(r => setTimeout(r, 20));
  assert.equal(opts.userVisibleOnly, true);
  assert.equal(opts.applicationServerKey.constructor.name, "Uint8Array");
  const html = h.html();
  assert.match(html, /One step left[\s\S]*?Send this code to Claude[\s\S]*?web\.push\.apple\.com\/QAbc123…[\s\S]*?data-action="remindshare"/);
  assert.equal(h.val(`remindCode()`), '{"endpoint":"https://web.push.apple.com/QAbc123","keys":{"p256dh":"BPub","auth":"Auth"}}');
});

test("Share code hands the code to the share sheet", async () => {
  const h = withBlock("2026-10-27T12:00");
  pushPhone(h, {perm: "granted", sub: fakeSub});
  const shared = [];
  h.ctx.navigator.share = async d => { shared.push(d.text); };
  h.click("remindshare");
  await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(shared, ['GI Hub reminders code:\n{"endpoint":"https://web.push.apple.com/QAbc123","keys":{"p256dh":"BPub","auth":"Auth"}}']);
});

test("EPAs tab: once a reminder has arrived, status On, the next reminder and the last one", () => {
  const h = withBlock("2026-10-27T12:00");
  pushPhone(h, {perm: "granted", sub: fakeSub, last: {at: at(2026, 10, 22, 8), kind: "week"}});
  h.click("tab", {page: "epas"});
  const html = h.html();
  assert.match(html, /<h2>Reminders<\/h2><span class="mono ok">On<\/span>/);
  assert.match(html, /<span class="mono">Next<\/span><span><b>Wed 28 Oct, 16:00<\/b> · On call from 17:00<\/span>/);
  assert.match(html, /<span class="mono">Last<\/span><span>Thu 22 Oct, 08:00<\/span>/);
  assert.match(html, /data-action="remindoff">Turn off/);
  // No call soon: the next is Thursday's.
  h.setNow("2026-11-04T09:00"); h.run(`render()`);
  assert.match(h.html(), /<b>Thu 5 Nov, 08:00<\/b> · Block 5, week 3 of 4 starts today/);
});

test("blocked notifications, and Safari outside the home-screen app, each say what to do", () => {
  const h = withBlock("2026-10-27T12:00");
  pushPhone(h, {perm: "denied"});
  h.click("tab", {page: "epas"});
  assert.match(h.html(), /Blocked[\s\S]*?Turn them on in iPhone Settings, Notifications, GI Hub/);
  const s = withBlock("2026-10-27T12:00");
  s.run(`window.__vapid = "BKey"`);
  s.ctx.navigator.standalone = false;
  s.click("tab", {page: "epas"});
  assert.match(s.html(), /Home screen only[\s\S]*?Open GI Hub from your home screen/);
});

// ---- The service worker ------------------------------------------------------------------

// Runs sw.js with notify.js the way a browser does, with just enough of a worker around it.
function worker(brief) {
  const store = new Map(), shown = [], handlers = {}, messages = [];
  if (brief) store.set("__gi-brief.json", JSON.stringify(brief));
  const Response = class { constructor(b) { this.b = b; } async json() { return JSON.parse(this.b); } };
  const cache = {match: async k => (store.has(k) ? new Response(store.get(k)) : undefined), put: async (k, r) => { store.set(k, r.b); }};
  const ctx = {
    Response, URL, console, Date,
    caches: {open: async () => cache, keys: async () => [], match: async () => undefined},
    importScripts: f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx),
    self: {addEventListener: (t, fn) => { handlers[t] = fn; }, skipWaiting() {},
      registration: {scope: "https://lethalnifty.github.io/epa-tracker/", showNotification: async (t, o) => { shown.push({title: t, ...o}); }},
      clients: {claim() {}, matchAll: async () => [], openWindow: async u => { messages.push(u); }}},
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "sw.js"), "utf8"), ctx);
  const fire = async (type, ev) => { let p; handlers[type]({...ev, waitUntil: x => { p = x; }}); await p; };
  return {fire, shown, store, messages};
}

test("service worker: a push shows the notification from the brief and records its arrival", async () => {
  const h = withBlock("2026-10-28T16:00");
  const w = worker(h.val(`remindBrief(callNow())`));
  const realNow = Date.now;
  Date.now = () => at(2026, 10, 28, 16);
  try { await w.fire("push", {data: {json: () => ({kind: "call", t: at(2026, 10, 28, 16), s: at(2026, 10, 28, 17)})}}); }
  finally { Date.now = realNow; }
  assert.equal(w.shown.length, 1);
  assert.equal(w.shown[0].title, "On call from 17:00");
  assert.match(w.shown[0].body, /^HSC: Attending A, no resident\./);
  assert.equal(w.shown[0].data.url, "./#call");
  assert.deepEqual(JSON.parse(w.store.get("__gi-push.json")), {at: at(2026, 10, 28, 16), kind: "call"});
});

test("service worker: an empty or unreadable push still shows something, and a tap opens the app", async () => {
  const w = worker(null);
  await w.fire("push", {data: null});
  await w.fire("push", {data: {json: () => { throw new Error("bad"); }}});
  assert.deepEqual(w.shown.map(n => n.title), ["GI Hub", "GI Hub"]);
  await w.fire("notificationclick", {notification: {close() {}, data: {url: "./#call"}}});
  assert.deepEqual(w.messages, ["https://lethalnifty.github.io/epa-tracker/#call"]);
});

test("the service worker keeps the brief when it updates, and caches the reminder files", () => {
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  assert.match(sw, /^importScripts\("notify\.js"\);/);
  assert.match(sw, /k !== CACHE && k !== BRIEF/);
  for (const f of ["notify.js", "remind.js"]) assert.ok(sw.includes(`"${f}"`), f);
});

test("the app carries the sender's public key: a P-256 point, 65 bytes", () => {
  const src = fs.readFileSync(path.join(ROOT, "remind.js"), "utf8");
  const key = /^const REMIND_VAPID = "([A-Za-z0-9_-]+)";$/m.exec(src)[1];
  const raw = Buffer.from(key, "base64url");
  assert.equal(raw.length, 65);
  assert.equal(raw[0], 4);
});
