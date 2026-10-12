"use strict";
// The Sunday pearls reminder: 17:00 Winnipeg time, written on the phone from
// how many pearls wait to be sent, and a tap that opens the Pearls page.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {load, state, ROOT} = require("./harness");
const {dueReminders} = require("../push/schedule");

const at = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
const P = (id, d, t, extra = {}) => ({id, d, t, who: "", topic: "", sent: null, ts: d + "T15:00:00.000Z", ...extra});
const twoToSend = () => state({}, {pearls: [P("pa", "2026-10-13", "One", {sent: "2026-10-14"}), P("pb", "2026-10-15", "Two"), P("pc", "2026-10-16", "Three")]});
function phone(now, st) {
  const h = load({today: now.slice(0, 10), state: st});
  h.setNow(now);
  return h;
}
const notice = h => h.val(`noticeFor({kind: "pearls", t: callNow()}, remindBrief(callNow()), callNow())`);

test("the sender: Sundays at 17:00 Winnipeg time, and no other day", () => {
  const due = dueReminders(at(2026, 10, 17, 12), at(2026, 10, 31, 12), []).filter(x => x.kind === "pearls");
  assert.deepEqual(due, [{kind: "pearls", t: at(2026, 10, 18, 17)}, {kind: "pearls", t: at(2026, 10, 25, 17)}]);
  // Back-to-back windows send it once.
  assert.equal(dueReminders(at(2026, 10, 18, 16, 45), at(2026, 10, 18, 17), []).filter(x => x.kind === "pearls").length, 1);
  assert.equal(dueReminders(at(2026, 10, 18, 17), at(2026, 10, 18, 17, 15), []).filter(x => x.kind === "pearls").length, 0);
});

test("the brief carries how many pearls wait to be sent, and never their words or names", () => {
  const h = phone("2026-10-18T12:00", twoToSend());
  const b = h.val("remindBrief(callNow())");
  assert.deepEqual(b.pearls, {unsent: 2});
  assert.doesNotMatch(JSON.stringify(b), /"Two"|"Three"/);
});

test("Sunday reminder: how many to send, and the Pearls page on tap", () => {
  const n = notice(phone("2026-10-18T17:00", twoToSend()));
  assert.deepEqual(n, {title: "2 pearls to send", body: "Send them from GI Hub so they're in Drive for tonight's cards.",
    tag: "gi-pearls-" + at(2026, 10, 18), url: "./#pearls"});
  const one = state({}, {pearls: [P("pa", "2026-10-15", "One")]});
  assert.equal(notice(phone("2026-10-18T17:00", one)).title, "1 pearl to send");
});

test("with every pearl sent, Sunday asks for this week's", () => {
  const n = notice(phone("2026-10-18T17:00", state()));
  assert.equal(n.title, "Any pearls this week?");
  assert.equal(n.body, "Catch them in GI Hub while you still remember.");
  assert.equal(n.url, "./#pearls");
});

test("with nothing saved on the phone, the Sunday reminder still says something useful", () => {
  const h = phone("2026-10-18T17:00", state());
  assert.deepEqual(h.val(`noticeFor({kind: "pearls"}, null, 0)`),
    {title: "Pearls", body: "Open GI Hub to send this week's pearls.", tag: "gi-pearls", url: "./#pearls"});
});

test("the phone's own preview: on a Sunday afternoon the next reminder is the pearls one", () => {
  const h = phone("2026-10-18T12:00", twoToSend());
  const nx = h.val("remindNext(callNow())");
  assert.deepEqual(nx.msg, {kind: "pearls", t: at(2026, 10, 18, 17)});
  assert.equal(nx.notice.title, "2 pearls to send");
  // After 17:00 it moves on to Monday's EPAs.
  h.setNow("2026-10-18T17:30");
  assert.equal(h.val("remindNext(callNow()).msg.kind"), "week");
});

test("the reminder list and the test reminder name the Sunday one", () => {
  const h = phone("2026-10-18T12:00", state());
  assert.match(h.val("REMIND_WHAT"), /<span class="mono">Sun 17:00<\/span><span>Pearls to send, before Sunday's cards<\/span>/);
  assert.match(h.val(`noticeFor({kind: "test"}, null, 0).body`), /Sundays at 17:00: pearls to send\./);
});

test("a link to the Pearls page opens it from anywhere, over any open sheet", () => {
  const h = phone("2026-10-18T12:00", twoToSend());
  h.click("pearlnew");
  h.run(`appOpenFromLink("pearls")`);
  assert.equal(h.val("route.page"), "pearls");
  assert.equal(h.val("route.from"), "study");
  assert.equal(h.val("pearlSheet"), null);
  h.run(`appOpenFromLink("study")`);
  assert.equal(h.val("route.page"), "study");
});

// The service worker, run the way a browser does, with an app window open or not.
function worker(open) {
  const handlers = {}, posted = [], opened = [];
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
  return {fire, posted, opened};
}

test("tapping the Sunday reminder opens the Pearls page, whether or not GI Hub is open", async () => {
  const tap = {notification: {close() {}, data: {url: "./#pearls"}}};
  const shut = worker(false);
  await shut.fire("notificationclick", tap);
  assert.deepEqual(shut.opened, ["https://lethalnifty.github.io/epa-tracker/#pearls"]);
  const open = worker(true);
  await open.fire("notificationclick", tap);
  assert.deepEqual(JSON.parse(JSON.stringify(open.posted)), [{go: "pearls"}]);   // made inside the worker's sandbox
});
