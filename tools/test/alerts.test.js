"use strict";
// Agenda alerts and the reminder sender, on the phone: each event's alerts,
// the reminders the phone asks the sender for (alerts.js), what the new
// notifications say, and joining the sender. Full app only. Placeholder names only.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
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
