"use strict";
// Agenda alerts and the reminder sender, on the phone: each event's alerts,
// the reminders the phone asks the sender for (alerts.js), what the new
// notifications say, and joining the sender. Full app only. Placeholder names only.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const nodeCrypto = require("node:crypto");
const {pathToFileURL} = require("node:url");
const {load, state, ROOT} = require("./harness");

const at = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
const p2 = n => String(n).padStart(2, "0");
const wall = t => { const d = new Date(t); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };

const ev = (id, t, d, s, e, x = {}) => ({id, t, d, s, e, ...x});
function agenda(today, items = [], opts = {}) {
  const h = load({today, state: state({}, {agenda: {items}}), ...opts});
  h.click("tab", {page: "agenda"});
  return h;
}

// ---- Each event's alerts ------------------------------------------------------------------

test("a new event alerts the evening before and 30 minutes before, and the sheet can turn either off", () => {
  const h = agenda("2026-11-09");
  h.click("agnew");
  assert.match(h.html(), /<div class="lbl mono">Alerts<\/div><div class="pickrow"><button class="pick ghost on" data-action="agalert" data-al="eve" aria-pressed="true">Evening before<\/button><button class="pick ghost on" data-action="agalert" data-al="30" aria-pressed="true">30 min before<\/button><\/div>/);
  h.run(`agSheet.t = "Dentist"`);
  h.click("agsave");
  const id = h.saved().agenda.items[0].id;
  assert.equal(h.saved().agenda.items[0].al, null, "the usual alerts are kept as no choice made");
  assert.deepEqual(h.val(`agAlerts(agState().items[0])`), ["eve", "30"]);
  h.click("agopen", {id});
  h.click("agalert", {al: "eve"});
  assert.match(h.html(), /data-al="eve" aria-pressed="false">Evening before/);
  h.click("agsave");
  assert.deepEqual(h.saved().agenda.items[0].al, ["30"]);
  h.click("agopen", {id});
  h.click("agalert", {al: "30"});
  h.click("agsave");
  assert.deepEqual(h.saved().agenda.items[0].al, []);
  assert.deepEqual(h.val(`agAlerts(agState().items[0])`), []);
});

test("an all-day event offers only the evening before", () => {
  const h = agenda("2026-11-09");
  h.click("agnew");
  h.click("agallday");
  assert.match(h.html(), /data-al="eve" aria-pressed="true">Evening before<\/button><\/div>/);
  assert.doesNotMatch(h.html(), /data-al="30"/);
  h.run(`agSheet.t = "Conference"`);
  h.click("agsave");
  assert.deepEqual(h.val(`agAlerts(agState().items[0])`), ["eve"]);
  // A timed event made all day keeps only what still applies.
  assert.deepEqual(h.val(`agAlerts({s: null, al: ["eve", "30"]})`), ["eve"]);
  assert.deepEqual(h.val(`agAlerts({s: null, al: ["30"]})`), []);
});

test("alerts survive a save and a restore, and anything else in them is dropped", () => {
  const h = agenda("2026-11-09", [ev("a1", "Dentist", "2026-11-12", "15:30", "16:30", {al: ["30", "loud", "30"]}),
    ev("a2", "Clinic", "2026-11-13", "08:00", "12:00", {al: "eve"})]);
  assert.deepEqual(h.val(`agState().items.map(x => x.al)`), [["30"], null]);
  h.run(`agUpdate("a1", {t: "Dentist, cleaning"})`);
  assert.deepEqual(h.saved().agenda.items[0].al, ["30"]);
  h.run(`window.__snap = agSnapshot(); agRemove("a1"); agRestore(window.__snap)`);
  assert.deepEqual(h.saved().agenda.items.map(x => x.al), [["30"], null]);
});

// ---- The plan the phone gives the sender ------------------------------------------------------

// A phone at a given local time, with the sample call block (Wed 28 Oct, the
// weekend from Fri 30 Oct, Tue 3 Nov) and these events.
function phone(now, items = []) {
  const h = load({today: now.slice(0, 10), state: state({}, {agenda: {items}})});
  h.setNow(now);
  h.ctx.__src = fs.readFileSync(path.join(ROOT, "tools", "test", "fixtures", "call-sample.ics"), "utf8");
  h.run(`callImport(__src, "call-sample.ics"); toast = null`);
  return h;
}
// The plan as wall times: kind, when, then the start, day and id it carries.
const planOf = (h, kinds) => h.val(`alertPlan(callNow())`).filter(a => kinds.includes(a.kind))
  .map(a => [a.kind, wall(a.t), ...(a.s ? [wall(a.s)] : []), ...(a.d ? [a.d] : []), ...(a.id ? [a.id] : [])]);

test("the plan: Monday and Wednesday at 08:00, Sunday at 17:00, 20:00 on reading nights, five weeks from midnight", () => {
  const h = phone("2026-10-26T07:00");
  assert.deepEqual(planOf(h, ["week", "ask", "pearls", "study"]).filter(a => a[1] < "2026-11-02"), [
    ["week", "2026-10-26T08:00"], ["study", "2026-10-26T20:00"], ["study", "2026-10-27T20:00"], ["ask", "2026-10-28T08:00"],
    ["pearls", "2026-11-01T17:00"]]);
  assert.deepEqual(planOf(h, ["week"]).map(a => a[1]), ["2026-10-26T08:00", "2026-11-02T08:00", "2026-11-09T08:00", "2026-11-16T08:00", "2026-11-23T08:00"]);
  const all = h.val(`alertPlan(callNow())`);
  assert.ok(all.every(a => a.t >= at(2026, 10, 26) && a.t < at(2026, 11, 30)), "35 days from local midnight");
  assert.deepEqual(all.map(a => a.t), all.map(a => a.t).sort((a, b) => a - b), "soonest first");
});

test("no 20:00 reading reminder on a night you're on call, and none after the plan's last day", () => {
  const h = phone("2026-10-26T07:00");
  assert.deepEqual(planOf(h, ["study"]).map(a => a[1].slice(0, 10)).filter(d => d <= "2026-11-06"),
    ["2026-10-26", "2026-10-27", "2026-11-02", "2026-11-04", "2026-11-06"]);
  const end = phone("2027-05-31T07:00");
  assert.deepEqual(planOf(end, ["study"]).map(a => a[1]), ["2027-05-31T20:00", "2027-06-01T20:00", "2027-06-02T20:00"]);
});

test("call: an hour before each stretch, once for a whole weekend", () => {
  const h = phone("2026-10-26T07:00");
  assert.deepEqual(planOf(h, ["call"]), [["call", "2026-10-28T16:00", "2026-10-28T17:00"], ["call", "2026-10-30T16:00", "2026-10-30T17:00"],
    ["call", "2026-11-03T16:00", "2026-11-03T17:00"]]);
});

test("events: 30 minutes before and 19:00 the evening before; all day and several days alert once, weekly every week, switched off never", () => {
  const h = phone("2026-10-26T07:00", [
    ev("a1", "Dentist", "2026-10-29", "15:30", "16:30"),
    ev("a2", "Conference", "2026-11-06", null, null, {d2: "2026-11-07"}),
    ev("a3", "Soccer", "2026-10-29", "19:00", "20:30", {rep: "w", al: ["30"]}),
    ev("a4", "Haircut", "2026-10-31", "10:00", "11:00", {al: []}),
    ev("a5", "Flight", "2026-11-10", "22:00", "06:00"),
    ev("a6", "Old dentist", "2026-10-20", "09:00", "10:00")]);
  assert.deepEqual(planOf(h, ["ev", "eve"]), [
    ["eve", "2026-10-28T19:00", "2026-10-29"],
    ["ev", "2026-10-29T15:00", "2026-10-29T15:30", "a1@2026-10-29"],
    ["ev", "2026-10-29T18:30", "2026-10-29T19:00", "a3@2026-10-29"],
    ["ev", "2026-11-05T18:30", "2026-11-05T19:00", "a3@2026-11-05"],
    ["eve", "2026-11-05T19:00", "2026-11-06"],
    ["eve", "2026-11-09T19:00", "2026-11-10"],
    ["ev", "2026-11-10T21:30", "2026-11-10T22:00", "a5@2026-11-10"],
    ["ev", "2026-11-12T18:30", "2026-11-12T19:00", "a3@2026-11-12"],
    ["ev", "2026-11-19T18:30", "2026-11-19T19:00", "a3@2026-11-19"],
    ["ev", "2026-11-26T18:30", "2026-11-26T19:00", "a3@2026-11-26"]]);
});

test("several events the same day share one evening reminder, which lists them", () => {
  const h = phone("2026-10-26T07:00", [
    ev("a1", "Dentist", "2026-10-29", "15:30", "16:30"),
    ev("a2", "Clinic", "2026-10-29", "08:00", "12:00"),
    ev("a3", "Grand rounds", "2026-10-29", null, null),
    ev("a4", "Soccer", "2026-10-29", "19:00", "20:30", {al: ["30"]})]);
  assert.deepEqual(planOf(h, ["eve"]), [["eve", "2026-10-28T19:00", "2026-10-29"]]);
  const t = at(2026, 10, 28, 19);
  assert.deepEqual(h.val(`noticeFor({kind: "eve", t: ${t}, d: "2026-10-29"}, remindBrief(${t}), ${t})`),
    {title: "Tomorrow: 3 things", body: "Grand rounds (all day), Clinic at 08:00, Dentist at 15:30.", tag: "gi-eve-2026-10-29", url: "./#agenda"});
});

test("the plan is the same from midnight to midnight, so a redraw never sends it again", () => {
  const h = phone("2026-10-26T00:01", [ev("a1", "Dentist", "2026-10-26", "06:00", "07:00")]);
  const early = h.val(`alertPlan(callNow())`);
  assert.ok(early.some(a => a.kind === "ev" && wall(a.t) === "2026-10-26T05:30"));
  h.setNow("2026-10-26T23:59");
  assert.deepEqual(h.val(`alertPlan(callNow())`), early, "the day's earlier reminders stay in");
  h.setNow("2026-10-27T00:00");
  assert.notDeepEqual(h.val(`alertPlan(callNow())`), early);
});

test("event notices come from what the phone saved; a deleted or unknown one still says something", () => {
  const h = phone("2026-10-29T15:00", [ev("a1", "Dentist", "2026-10-29", "15:30", "16:30", {n: "Bring the insurance card"}),
    ev("a2", "Conference", "2026-10-30", null, null)]);
  const now = at(2026, 10, 29, 15), s = at(2026, 10, 29, 15, 30), brief = `remindBrief(${now})`;
  const say = (msg, b = brief, t = now) => h.val(`noticeFor(${JSON.stringify(msg)}, ${b}, ${t})`);
  assert.deepEqual(say({kind: "ev", t: now, s, id: "a1@2026-10-29"}),
    {title: "Dentist at 15:30", body: "In 30 minutes. Bring the insurance card", tag: "gi-ev-a1@2026-10-29", url: "./#agenda"});
  // Moved to 16:00 after the sender last heard: the time the phone has now, without the countdown.
  h.run(`agUpdate("a1", {s: "16:00", e: "17:00"})`);
  assert.deepEqual(say({kind: "ev", t: now, s, id: "a1@2026-10-29"}),
    {title: "Dentist at 16:00", body: "Bring the insurance card", tag: "gi-ev-a1@2026-10-29", url: "./#agenda"});
  const eve = at(2026, 10, 29, 19);
  assert.deepEqual(say({kind: "eve", t: eve, d: "2026-10-30"}, `remindBrief(${eve})`, eve),
    {title: "Tomorrow: Conference (all day)", body: "", tag: "gi-eve-2026-10-30", url: "./#agenda"});
  const lost = {title: "Coming up at 15:30", body: "Open GI Hub's Agenda for what's on.", tag: "gi-ev", url: "./#agenda"};
  h.run(`agRemove("a1")`);
  assert.deepEqual(say({kind: "ev", t: now, s, id: "a1@2026-10-29"}), lost);
  assert.deepEqual(say({kind: "ev", t: now, s, id: "a1@2026-10-29"}, "null"), lost);
  assert.deepEqual(say({kind: "eve", t: eve, d: "2026-10-31"}, "null", eve),
    {title: "Tomorrow's agenda", body: "Open GI Hub's Agenda for what's on tomorrow.", tag: "gi-eve", url: "./#agenda"});
  assert.match(say({kind: "test"}, "null", 0).body, /Events: 19:00 the evening before, and 30 minutes before\.$/);
  assert.match(h.val("REMIND_WHAT"), /<span class="mono">Events<\/span><span>19:00 the evening before, and 30 minutes before<\/span>/);
});

// Runs sw.js the way a browser does, with GI Hub open in a window or not.
function worker({open = false} = {}) {
  const handlers = {}, opened = [], posted = [];
  const win = {postMessage: m => posted.push(m), focus: async () => {}};
  const ctx = {
    URL, console, Date, Response: class {},
    caches: {open: async () => ({match: async () => undefined, put: async () => {}}), keys: async () => [], match: async () => undefined},
    importScripts: f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx),
    self: {addEventListener: (t, fn) => { handlers[t] = fn; }, skipWaiting() {},
      registration: {scope: "https://lethalnifty.github.io/epa-tracker/", showNotification: async () => {}},
      clients: {claim() {}, matchAll: async () => (open ? [win] : []), openWindow: async u => { opened.push(u); }}},
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "sw.js"), "utf8"), ctx);
  const fire = async (type, ev) => { let p; handlers[type]({...ev, waitUntil: x => { p = x; }}); await p; };
  return {fire, opened, posted};
}

test("tapping an event reminder opens the Agenda, in the open app or a new one", async () => {
  const tap = {notification: {close() {}, data: {url: "./#agenda"}}};
  const shut = worker(), open = worker({open: true});
  await shut.fire("notificationclick", tap);
  assert.deepEqual(shut.opened, ["https://lethalnifty.github.io/epa-tracker/#agenda"]);
  await open.fire("notificationclick", tap);
  assert.deepEqual(open.posted.map(m => m.go), ["agenda"]);
  const fresh = load({today: "2026-10-29", location: {hash: "#agenda", pathname: "/", search: ""}});
  assert.equal(fresh.val("route.page"), "agenda");
  const h = load({today: "2026-10-29"});
  h.run(`appMessage({go: "agenda"})`);
  assert.equal(h.val("route.page"), "agenda");
});

// ---- Joining the sender --------------------------------------------------------------------------------

function kv() {
  const m = new Map();
  return {m, async get(k) { return m.has(k) ? m.get(k) : null; }, async put(k, v) { m.set(k, String(v)); }, async delete(k) { m.delete(k); }};
}
// Cloudflare as the phone sees it: the sender's own code and storage, Apple's
// push service behind it (answering c.push), and every request the phone made.
// c.hold keeps requests waiting, as a slow connection does.
async function sender(now) {
  const w = await import(pathToFileURL(path.join(ROOT, "tools", "agenda", "worker.mjs")).href);
  const c = {w, env: {AGENDA: kv()}, calls: [], now, down: false, hold: null, push: 201, pushed: []};
  c.pushFetch = async url => { c.pushed.push(url); return {status: c.push}; };
  c.fetch = async (url, init = {}) => {
    const u = new URL(url, "https://gi-hub.invalid/");
    if (!u.hostname.startsWith("gi-hub-agenda.")) throw new TypeError("Load failed");
    c.calls.push((init.method || "GET") + " " + u.pathname);
    if (c.down) throw new TypeError("Load failed");
    if (c.hold) await c.hold;
    return w.handle(new Request(url, init), c.env, c.now, c.pushFetch);
  };
  c.get = async k => JSON.parse(await c.env.AGENDA.get(k));
  return c;
}
// iPhone's push for the home-screen app, kept across opens of GI Hub: one
// subscription at a time, made with a sender's key. old: one made for the old sender.
function iphone({perm = "granted", old = false} = {}) {
  let n = 0;
  const p = {perm, sub: null, made: [], dropped: 0};
  p.make = key => {
    const ecdh = nodeCrypto.createECDH("prime256v1");
    ecdh.generateKeys();
    const json = {endpoint: "https://web.push.apple.com/Q" + (++n), expirationTime: null,
      keys: {p256dh: ecdh.getPublicKey().toString("base64url"), auth: nodeCrypto.randomBytes(16).toString("base64url")}};
    const sub = {key, toJSON: () => json, unsubscribe: async () => { if (p.sub === sub) p.sub = null; p.dropped++; return true; }};
    return sub;
  };
  if (old) p.sub = p.make("old");
  return p;
}
function install(h, p) {
  h.ctx.PushManager = function PushManager() {};
  h.ctx.Notification = {get permission() { return p.perm; }, requestPermission: async () => (p.perm = "granted")};
  h.ctx.navigator.serviceWorker = {ready: Promise.resolve({pushManager: {
    getSubscription: async () => p.sub,
    subscribe: async o => {
      const key = Buffer.from(Array.from(o.applicationServerKey)).toString("base64url");
      p.sub = p.make(key); p.made.push(key);
      return p.sub;
    }}})};
}
// Waits for the sender work in flight, if any.
const settle = h => h.run("alertsWork");
async function openApp(c, p, {now = "2026-10-26T07:00", items = [], store} = {}) {
  const h = load({today: now.slice(0, 10), store, state: store ? undefined : state({}, {agenda: {items}}), fetch: c.fetch});
  h.setNow(now);
  install(h, p);
  await h.run("remindInit()");
  await settle(h);
  return h;
}
async function connected(items = []) {
  const c = await sender(at(2026, 10, 26, 7)), p = iphone({perm: "default"});
  const h = await openApp(c, p, {items});
  h.click("setopen"); h.click("remindon");
  await settle(h);
  return {c, p, h};
}
const addDentist = async h => {
  h.click("setclose"); h.click("tab", {page: "agenda"});
  h.click("agnew"); h.run(`agSheet.t = "Dentist"; agSheet.d = "2026-10-29"`); h.click("agsave");
  await settle(h);
};

test("turning on: permission, the sender's key, a subscription made with it, then the phone, its plan and a test, all with one new token", async () => {
  const c = await sender(at(2026, 10, 26, 7)), p = iphone({perm: "default"});
  const h = await openApp(c, p, {items: [ev("a1", "Dentist", "2026-10-29", "15:30", "16:30")]});
  h.click("setopen");
  assert.match(h.html(), /<span>Reminders<\/span><span>Off<\/span>[\s\S]*?Events[\s\S]*?data-action="remindon">[\s\S]*?Turn on reminders/);
  assert.deepEqual(c.calls, [], "nothing goes to the sender before you turn them on");
  h.click("remindon");
  await settle(h);
  assert.equal(p.perm, "granted");
  assert.deepEqual(c.calls, ["GET /vapid", "PUT /sub", "PUT /alerts", "POST /test"]);
  const key = (await c.get("vapid")).pub, kept = JSON.parse(h.store.get("gi-alerts-v1"));
  assert.deepEqual(p.made, [key], "subscribed with the sender's own key");
  assert.match(kept.tok, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(await c.env.AGENDA.get("auth"), nodeCrypto.createHash("sha256").update(kept.tok).digest("hex"), "the phone's token, and no other");
  assert.equal(kept.key, key);
  assert.equal((await c.get("sub")).endpoint, "https://web.push.apple.com/Q1");
  assert.deepEqual((await c.get("alerts")).list, h.val("alertPlan(callNow())"));
  assert.deepEqual(JSON.parse(kept.sent), h.val("alertPlan(callNow())"));
  assert.deepEqual(c.pushed, ["https://web.push.apple.com/Q1"], "the test reminder went out");
  assert.match(h.html(), /<span>Reminders<\/span><span class="ok">On<\/span>/);
  assert.match(h.html(), /data-action="remindtest">Send a test<\/button><button class="btn danger" data-action="remindoff">Turn off/);
});

test("the permission question comes straight from the tap, as iPhone requires", async () => {
  const c = await sender(at(2026, 10, 26, 7)), p = iphone({perm: "default"});
  const h = await openApp(c, p);
  let asked = 0;
  h.ctx.Notification.requestPermission = async () => { asked++; return (p.perm = "granted"); };
  h.click("setopen"); h.click("remindon");
  assert.equal(asked, 1, "asked before anything waits");
  await settle(h);
  assert.match(h.html(), /<span class="ok">On<\/span>/);
});

test("a phone still on the old sender is asked to move, and one tap moves it", async () => {
  const c = await sender(at(2026, 10, 26, 7)), p = iphone({old: true});
  const h = await openApp(c, p);
  h.click("tab", {page: "plan"}); h.click("tab", {page: "week"});
  assert.match(h.html(), /class="card setnudge"><button class="sn-main" data-action="setopen">[\s\S]*?Move your reminders/);
  assert.doesNotMatch(h.html(), /reminddismiss/, "not one to put off");
  h.click("setopen");
  assert.match(h.html(), /<span>Reminders<\/span><span>Move needed<\/span>[\s\S]*?Agenda events[\s\S]*?data-action="remindon">[\s\S]*?Move reminders/);
  h.click("remindon");
  await settle(h);
  assert.equal(p.dropped, 1, "the old sender's subscription is gone");
  assert.deepEqual(p.made, [(await c.get("vapid")).pub]);
  assert.match(h.html(), /<span class="ok">On<\/span>/);
});

test("a change to the plan goes to the sender once; a redraw that changes nothing sends nothing", async () => {
  const {c, h} = await connected();
  c.calls.length = 0;
  await addDentist(h);
  for (const page of ["week", "agenda", "study", "agenda"]) h.click("tab", {page});
  await settle(h);
  assert.deepEqual(c.calls, ["PUT /alerts"]);
  assert.ok((await c.get("alerts")).list.some(a => a.kind === "ev" && a.id.endsWith("@2026-10-29")));
});

test("a change saved while an upload is still on its way goes straight after it, with no redraw", async () => {
  const {c, h} = await connected();
  c.calls.length = 0;
  let release;
  c.hold = new Promise(ok => { release = ok; });
  h.click("setclose"); h.click("tab", {page: "agenda"});
  h.click("agnew"); h.run(`agSheet.t = "Dentist"; agSheet.d = "2026-10-29"`); h.click("agsave");
  await new Promise(ok => setImmediate(ok));
  assert.deepEqual(c.calls, ["PUT /alerts"], "the first upload is on its way");
  h.click("agnew"); h.run(`agSheet.t = "Clinic"; agSheet.d = "2026-10-30"`); h.click("agsave");
  c.hold = null; release();
  await settle(h); await settle(h);
  assert.deepEqual(c.calls, ["PUT /alerts", "PUT /alerts"]);
  const days = (await c.get("alerts")).list.filter(a => a.kind === "ev").map(a => a.id.slice(-10));
  assert.ok(days.includes("2026-10-29") && days.includes("2026-10-30"), "the sender has both events");
});

test("offline, a new plan waits a minute between tries, and goes when GI Hub next opens", async () => {
  const {c, p, h} = await connected();
  const before = (await c.get("alerts")).list;
  c.calls.length = 0; c.down = true;
  await addDentist(h);
  h.click("tab", {page: "week"});
  await settle(h);
  assert.deepEqual(c.calls, ["PUT /alerts"], "one try, then a minute's wait");
  assert.deepEqual((await c.get("alerts")).list, before, "what the sender already has still goes out");
  h.setNow("2026-10-26T07:02"); h.click("tab", {page: "agenda"});
  await settle(h);
  assert.deepEqual(c.calls, ["PUT /alerts", "PUT /alerts"]);
  c.down = false; c.calls.length = 0;
  await openApp(c, p, {store: h.store, now: "2026-10-26T07:03"});
  assert.equal(c.calls.filter(x => x === "PUT /alerts").length, 1);
  assert.ok((await c.get("alerts")).list.some(a => a.kind === "ev"));
});

test("when iPhone drops the subscription the sender forgets it, the next open says so, and turning on again reconnects with the same token", async () => {
  const {c, h} = await connected();
  const tok = JSON.parse(h.store.get("gi-alerts-v1")).tok;
  c.push = 410;
  assert.equal(await c.w.sendDue(c.env, (await c.get("alerts")).list[0].t, c.pushFetch), 0);
  assert.equal(await c.env.AGENDA.get("sub"), null);
  await h.run("remindInit()");
  await settle(h);
  h.click("setclose"); h.click("tab", {page: "plan"}); h.click("tab", {page: "week"});
  assert.match(h.html(), /setnudge[\s\S]*?Reminders stopped/);
  h.click("setopen");
  assert.match(h.html(), /<span>Reminders<\/span><span>Stopped<\/span>[\s\S]*?Reminders stopped reaching this phone[\s\S]*?data-action="remindon">[\s\S]*?Turn on again/);
  c.push = 201; c.calls.length = 0;
  h.click("remindon");
  await settle(h);
  assert.deepEqual(c.calls, ["GET /vapid", "PUT /sub", "PUT /alerts", "POST /test"]);
  assert.equal(JSON.parse(h.store.get("gi-alerts-v1")).tok, tok);
  assert.match(h.html(), /<span class="ok">On<\/span>/);
});

test("a second phone can't take the sender: it says to ask Claude to free it, and connects once freed", async () => {
  const {c} = await connected();
  const p2 = iphone({perm: "default"});
  const other = await openApp(c, p2);
  other.click("setopen"); other.click("remindon");
  await settle(other);
  assert.match(other.html(), /GI Hub's sender is connected to another phone\. Ask Claude to free it\./);
  assert.match(other.html(), /<span>Reminders<\/span><span>Off<\/span>/);
  assert.equal(other.store.get("gi-alerts-v1"), undefined);
  assert.equal(p2.sub, null, "no subscription left behind");
  // Claude frees it: the sender forgets the first phone's token.
  await c.env.AGENDA.delete("auth");
  other.click("remindon");
  await settle(other);
  assert.match(other.html(), /<span class="ok">On<\/span>/);
});

test("Send a test: one test reminder now; no signal says so; a phone the sender can't reach any more is told", async () => {
  const {c, h} = await connected();
  c.pushed.length = 0; c.calls.length = 0;
  h.click("remindtest");
  await settle(h);
  assert.deepEqual(c.calls, ["POST /test"]);
  assert.equal(c.pushed.length, 1);
  assert.match(h.html(), /Test reminder sent/);
  c.down = true;
  h.click("remindtest");
  await settle(h);
  assert.match(h.html(), /Couldn't reach GI Hub's sender\. Try again when you have signal\./);
  c.down = false; c.push = 410;
  h.click("remindtest");
  await settle(h);
  assert.match(h.html(), /<span>Stopped<\/span>[\s\S]*?Reminders stopped reaching this phone/);
});

test("Turn off frees the sender and this phone; with no signal the phone keeps its token to take the sender back", async () => {
  const {c, p, h} = await connected();
  c.calls.length = 0;
  h.click("remindoff");
  await settle(h);
  assert.deepEqual(c.calls, ["DELETE /sub"]);
  for (const k of ["sub", "alerts", "auth"]) assert.equal(await c.env.AGENDA.get(k), null, k);
  assert.ok(await c.env.AGENDA.get("vapid"), "the sender keeps its own key");
  assert.equal(p.sub, null);
  assert.equal(h.store.get("gi-alerts-v1"), undefined);
  assert.match(h.html(), /<span>Reminders<\/span><span>Off<\/span>/);
  const again = await connected();
  const tok = JSON.parse(again.h.store.get("gi-alerts-v1")).tok;
  again.c.down = true;
  again.h.click("remindoff");
  await settle(again.h);
  assert.equal(again.p.sub, null);
  assert.deepEqual(JSON.parse(again.h.store.get("gi-alerts-v1")), {tok});
  assert.match(again.h.html(), /<span>Reminders<\/span><span>Off<\/span>/);
  again.c.down = false;
  again.h.click("remindon");
  await settle(again.h);
  assert.match(again.h.html(), /<span class="ok">On<\/span>/);
});

test("the fellows' edition never talks to the sender", async () => {
  const c = await sender(at(2026, 10, 26, 7));
  const f = load({edition: "fellows", today: "2026-10-26", fetch: c.fetch, state: state({}, {setup: {d: "2026-10-01"}})});
  install(f, iphone());
  await f.run("remindInit()");
  f.click("setopen");
  assert.doesNotMatch(f.html(), /Reminders/);
  f.click("setclose"); f.click("tab", {page: "week"});
  assert.deepEqual(c.calls, []);
});
