"use strict";
// Repeats beyond weekly, monthly and yearly: every 2 weeks, until a day, on
// set weekdays, the nth weekday of the month, daily, and days left out; read
// from calendar files (INTERVAL, UNTIL, COUNT, BYDAY, EXDATE, a time moved or
// cancelled on its own), and set on your own events. A repeat GI Hub can't
// follow keeps its first day and says so.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, state} = require("./harness");

const app = load({today: "2026-11-03"});
const item = x => JSON.stringify({id: "a1", t: "Thing", d: "2026-11-03", d2: null, s: "12:00", e: "13:00", rep: null, n: "", uid: null, ts: "", ...x});
// The days in [from, to] an occurrence starts on.
const on = (x, from, to) => app.val(`(() => { const it = agItemClean(${item(x)}), out = [];
  for (let d = ${JSON.stringify(from)}; d <= ${JSON.stringify(to)}; d = agAddDays(d, 1)) if (agStartsOn(it, d)) out.push(d); return out; })()`);

test("every 2 weeks, until a day; Tuesday Nov 3 to Dec 15", () => {
  assert.deepEqual(on({rep: "w", every: 2}, "2026-11-01", "2026-12-15"), ["2026-11-03", "2026-11-17", "2026-12-01", "2026-12-15"]);
  assert.deepEqual(on({rep: "w", until: "2026-11-24"}, "2026-11-01", "2026-12-15"), ["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24"]);
  assert.deepEqual(on({rep: "w", skip: ["2026-11-10"]}, "2026-11-01", "2026-11-17"), ["2026-11-03", "2026-11-17"]);
});

test("weekly on set days, the nth weekday monthly, daily, every 2 months", () => {
  assert.deepEqual(on({rep: "w", days: [1, 3, 5]}, "2026-11-02", "2026-11-08"), ["2026-11-03", "2026-11-04", "2026-11-06"]);
  // The 1st Tuesday each month; the last Friday.
  assert.deepEqual(on({rep: "m", nth: {n: 1, wd: 2}}, "2026-11-01", "2027-01-31"), ["2026-11-03", "2026-12-01", "2027-01-05"]);
  assert.deepEqual(on({d: "2026-11-27", rep: "m", nth: {n: -1, wd: 5}}, "2026-11-01", "2027-01-31"), ["2026-11-27", "2026-12-25", "2027-01-29"]);
  assert.deepEqual(on({rep: "d", until: "2026-11-05"}, "2026-11-01", "2026-11-08"), ["2026-11-03", "2026-11-04", "2026-11-05"]);
  assert.deepEqual(on({rep: "m", every: 2}, "2026-11-01", "2027-03-31"), ["2026-11-03", "2027-01-03", "2027-03-03"]);
  assert.equal(app.val(`agRepWords(agItemClean(${item({rep: "w", days: [1, 3, 5]})}))`), "Mon, Wed and Fri");
  assert.equal(app.val(`agRepWords(agItemClean(${item({rep: "m", nth: {n: 2, wd: 2}})}))`), "2nd Tuesday monthly");
  assert.equal(app.val(`agRepWords(agItemClean(${item({rep: "w", every: 2})}))`), "Every 2 weeks");
});

test("a plain repeat saves nothing extra", () => {
  assert.deepEqual(app.val(`agItemClean(${item({rep: "w", every: 1, days: [2], skip: []})})`),
    {id: "a1", t: "Thing", d: "2026-11-03", d2: null, s: "12:00", e: "13:00", rep: "w", n: "", uid: null, ts: "", al: null});
});

const ics = (...evs) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...evs.flatMap(e => ["BEGIN:VEVENT", ...e, "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");
const imp = (h, src) => { h.ctx.__src = src; return h.val(`(() => { const r = agImport(__src, "x.ics"); delete r.before; return r; })()`); };
const byUid = (h, uid) => h.val(`Store.state.agenda.items.find(x => x.uid === ${JSON.stringify(uid)}) || null`);
const ev = (uid, more) => [`UID:${uid}`, "SUMMARY:Journal club", "DTSTART:20261103T120000", "DTEND:20261103T130000", ...more];

test("a calendar file's repeat comes in whole: interval, until, count, weekdays, the nth weekday", () => {
  const h = load({today: "2026-11-03"});
  const r = imp(h, ics(ev("r1", ["RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20270629T045959Z"]),
    ev("r2", ["RRULE:FREQ=WEEKLY;COUNT=3"]), ev("r3", ["RRULE:FREQ=WEEKLY;WKST=SU;BYDAY=TU,TH"]),
    ev("r4", ["RRULE:FREQ=MONTHLY;BYDAY=1TU"]), ev("r5", ["RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR"])));
  assert.equal(r.added, 5);
  assert.equal(r.odd, undefined, "every one of them is a repeat GI Hub follows");
  const a = n => { const x = byUid(h, n); return [x.rep, x.every || 1, x.until || null, x.days || null, x.nth || null]; };
  assert.deepEqual(a("r1"), ["w", 2, "2027-06-28", null, null]);
  assert.deepEqual(a("r2"), ["w", 1, "2026-11-17", null, null]);
  assert.deepEqual(a("r3"), ["w", 1, null, [2, 4], null]);
  assert.deepEqual(a("r4"), ["m", 1, null, null, {n: 1, wd: 2}]);
  assert.deepEqual(a("r5"), ["w", 1, null, [1, 2, 3, 4, 5], null]);
});

test("days left out, a time moved on its own, and one cancelled on its own", () => {
  const h = load({today: "2026-11-03"});
  imp(h, ics(ev("s1", ["RRULE:FREQ=WEEKLY", "EXDATE:20261110T120000", "EXDATE:20261124T120000,20261201T120000"]),
    ["UID:s1", "SUMMARY:Journal club (moved)", "RECURRENCE-ID:20261117T120000", "DTSTART:20261118T150000", "DTEND:20261118T160000"],
    ["UID:s1", "STATUS:CANCELLED", "RECURRENCE-ID:20261208T120000", "DTSTART:20261208T120000"]));
  const s = byUid(h, "s1");
  assert.ok(s, "a cancelled time never cancels the whole series");
  assert.deepEqual(s.skip, ["2026-11-10", "2026-11-17", "2026-11-24", "2026-12-01", "2026-12-08"]);
  const moved = byUid(h, "s1@2026-11-17");
  assert.deepEqual([moved.d, moved.s, moved.rep], ["2026-11-18", "15:00", null]);
  // The same file again changes nothing; a day skipped by hand stays skipped.
  h.run(`agUpdate(${JSON.stringify(s.id)}, {skip: [...Store.state.agenda.items.find(x => x.uid === "s1").skip, "2026-12-15"]})`);
  const again = imp(h, ics(ev("s1", ["RRULE:FREQ=WEEKLY", "EXDATE:20261110T120000"])));
  assert.ok(byUid(h, "s1").skip.includes("2026-12-15"));
  assert.equal(again.added, 0);
});

test("a repeat GI Hub can't follow keeps its first day, and the toast says so", () => {
  const h = load({today: "2026-11-03"});
  h.click("tab", {page: "agenda"});
  h.run(`agImportText(${JSON.stringify(ics(ev("o1", ["RRULE:FREQ=MONTHLY;BYDAY=TU;BYSETPOS=-1"])))}, "x.ics")`);
  const o = byUid(h, "o1");
  assert.deepEqual([o.d, o.rep], ["2026-11-03", null]);
  h.run("render()");
  assert.match(h.html(), /“Journal club” has only its first day: its repeat is one GI Hub can&#39;t follow|“Journal club” has only its first day: its repeat is one GI Hub can't follow/);
});

test("your own event: every 2 weeks, until, skip one time, bring it back", () => {
  const h = load({today: "2026-11-03", state: state({}, {agenda: {items: [{id: "a1", t: "Clinic", d: "2026-11-03", s: "13:00", e: "17:00", rep: "w", n: ""}]}})});
  h.click("tab", {page: "agenda"});
  h.click("agday", {day: "2026-11-10"});
  assert.match(h.html(), /data-action="agopen" data-id="a1" data-on="2026-11-10"/);
  h.click("agopen", {id: "a1", on: "2026-11-10"});
  assert.match(h.html(), /Skip Tue 10 Nov only/);
  h.click("agskip");
  assert.deepEqual(h.saved().agenda.items[0].skip, ["2026-11-10"]);
  assert.match(h.html(), /Tue 10 Nov skipped/);
  h.click("undo");
  assert.equal(h.saved().agenda.items[0].skip, undefined);
  // Every 2 weeks until the end of January.
  h.click("agopen", {id: "a1"});
  h.click("agrep", {rep: "w2"});
  h.fire("input", {dataset: {ag: "until"}, value: "2027-01-26"});
  h.click("agsave");
  const it = h.saved().agenda.items[0];
  assert.deepEqual([it.rep, it.every, it.until], ["w", 2, "2027-01-26"]);
  h.click("agopen", {id: "a1"});
  assert.match(h.html(), /aria-pressed="true">Every 2 weeks</);
  // An until before the first day is caught.
  h.fire("input", {dataset: {ag: "until"}, value: "2026-10-01"});
  h.click("agsave");
  assert.match(h.html(), /It stops repeating before it starts/);
});
