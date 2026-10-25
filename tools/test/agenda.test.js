"use strict";
// Agenda's model (agenda.js): saved events made whole, which days an event
// covers (repeats, several days, past midnight), Manitoba's general holidays,
// the usual week, and the backup.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, state} = require("./harness");

const app = load({today: "2026-10-27"});
const v = app.val;
const item = x => JSON.stringify({id: "a1", t: "Thing", d: "2026-10-27", d2: null, s: "09:00", e: "10:00", rep: null, n: "", uid: null, ts: "", ...x});
const span = (x, iso) => v(`agSpan(${item(x)}, ${JSON.stringify(iso)})`);

test("a fresh agenda holds the user's usual week: 8 to 6, Thursday half day until 5", () => {
  const a = v("agClean(undefined)");
  assert.deepEqual(a.items, []);
  for (const d of ["1", "2", "3", "5"]) assert.deepEqual(a.usual.days[d], [{a: "08:00", b: "18:00", t: "Work"}], d);
  assert.deepEqual(a.usual.days["4"], [{a: "08:00", b: "12:00", t: "Work"}, {a: "12:00", b: "17:00", t: "Half day"}]);
  assert.deepEqual([a.usual.days["0"], a.usual.days["6"]], [[], []]);
  assert.deepEqual([a.usual.early, a.usual.late], ["07:00", "22:00"]);
});

test("saved events are made whole: no title or a bad date drops one, a bad time makes it all day", () => {
  const a = v(`agClean({items: [${item({t: "  "})}, ${item({id: "a2", d: "27/10/2026"})}, ${item({id: "a3", t: " Dentist ", s: "9am"})}, 5], usual: {days: {}}})`);
  assert.equal(a.items.length, 1);
  assert.equal(a.items[0].t, "Dentist");
  assert.equal(a.items[0].s, null);
  assert.equal(a.items[0].e, null);
  // A usual week with no days keeps the defaults for days it doesn't name.
  assert.deepEqual(a.usual.days["1"], [{a: "08:00", b: "18:00", t: "Work"}]);
});

test("a one-off event covers its own day only", () => {
  assert.deepEqual(span({}, "2026-10-27"), {allDay: false, from: "09:00", to: "10:00", cont: false, more: false});
  assert.equal(span({}, "2026-10-28"), null);
});

test("weekly repeats land on the same weekday from the first day on, never before", () => {
  assert.ok(span({rep: "w"}, "2026-11-03"));
  assert.equal(span({rep: "w"}, "2026-11-04"), null);
  assert.equal(span({rep: "w"}, "2026-10-20"), null);
});

test("monthly on the 31st skips short months; yearly on Feb 29 waits for a leap year", () => {
  const m = {d: "2026-10-31", rep: "m"};
  assert.ok(span(m, "2026-10-31"));
  assert.equal(span(m, "2026-11-30"), null);
  assert.ok(span(m, "2026-12-31"));
  const y = {d: "2024-02-29", rep: "y", s: null, e: null};
  assert.equal(span(y, "2027-02-28"), null);
  assert.equal(span(y, "2027-03-01"), null);
  assert.ok(span(y, "2028-02-29"));
});

test("an all-day event over several days covers each one, across a month's end", () => {
  const trip = {d: "2026-10-30", d2: "2026-11-02", s: null, e: null};
  assert.deepEqual(span(trip, "2026-10-30"), {allDay: true, from: null, to: null, cont: false, more: true});
  assert.deepEqual(span(trip, "2026-10-31"), {allDay: true, from: null, to: null, cont: true, more: true});
  assert.deepEqual(span(trip, "2026-11-02"), {allDay: true, from: null, to: null, cont: true, more: false});
  assert.equal(span(trip, "2026-11-03"), null);
});

test("a timed event past midnight shows from its start on day one and until its end on day two", () => {
  const late = {d: "2026-10-30", d2: "2026-10-31", s: "22:00", e: "02:00"};
  assert.deepEqual(span(late, "2026-10-30"), {allDay: false, from: "22:00", to: "24:00", cont: false, more: true});
  assert.deepEqual(span(late, "2026-10-31"), {allDay: false, from: null, to: "02:00", cont: true, more: false});
  // A weekly one across midnight repeats both halves.
  assert.ok(span({...late, rep: "w"}, "2026-11-07"));
});

test("Manitoba's general holidays, 2026 and 2027", () => {
  const h26 = v("agHolidays(2026)"), h27 = v("agHolidays(2027)"), on = (list, d) => (list.find(x => x.d === d) || {}).name;
  assert.equal(on(h26, "2026-09-07"), "Labour Day");
  assert.equal(on(h26, "2026-09-30"), "Truth and Reconciliation Day");
  assert.equal(on(h26, "2026-10-12"), "Thanksgiving");
  assert.equal(on(h26, "2026-11-11"), "Remembrance Day");
  assert.equal(on(h26, "2026-12-25"), "Christmas Day");
  assert.equal(on(h27, "2027-01-01"), "New Year's Day");
  assert.equal(on(h27, "2027-02-15"), "Louis Riel Day");
  assert.equal(on(h27, "2027-03-26"), "Good Friday");
  assert.equal(on(h27, "2027-05-24"), "Victoria Day");
  assert.equal(on(h27, "2027-07-01"), "Canada Day");
  assert.equal(h26.length, 10);
  assert.equal(v(`agHoliday("2026-10-12")`), "Thanksgiving");
  assert.equal(v(`agHoliday("2026-10-13")`), null);
});

test("events add, change and go, with a snapshot to undo; the usual week saves", () => {
  const h = load({today: "2026-10-27"});
  const id = h.val(`agAdd({t: "Dentist", d: "2026-11-03", s: "14:30", e: "15:30"})`);
  assert.match(id, /^a[a-z0-9]+$/);
  assert.equal(h.saved().agenda.items[0].t, "Dentist");
  h.run(`window.__snap = agSnapshot(); agUpdate(${JSON.stringify(id)}, {t: "Dentist cleaning"})`);
  assert.equal(h.saved().agenda.items[0].t, "Dentist cleaning");
  h.run(`agRemove(${JSON.stringify(id)})`);
  assert.deepEqual(h.saved().agenda.items, []);
  h.run(`agRestore(__snap)`);
  assert.equal(h.saved().agenda.items[0].t, "Dentist");
  h.run(`agSetUsual({days: {"4": [{a: "08:00", b: "12:00", t: "Work"}, {a: "12:00", b: "16:00", t: "Half day"}]}})`);
  assert.equal(h.saved().agenda.usual.days["4"][1].b, "16:00");
  assert.equal(h.saved().agenda.usual.days["1"][0].b, "18:00");
});

test("a backup from before Agenda restores with the usual week; one with events keeps them", () => {
  const h = load({today: "2026-10-27"});
  assert.equal(h.val(`Store.importJSON(JSON.stringify(${JSON.stringify(state({}))})).ok`), true);
  assert.deepEqual(h.saved().agenda.items, []);
  assert.equal(h.saved().agenda.usual.days["4"][1].t, "Half day");
  h.run(`agAdd({t: "Florida", d: "2026-11-13", d2: "2026-11-17"})`);
  const backup = h.val("Store.exportJSON()");
  const h2 = load({today: "2026-10-27"});
  assert.equal(h2.val(`Store.importJSON(${JSON.stringify(backup)}).ok`), true);
  assert.deepEqual(h2.saved().agenda.items.map(x => [x.t, x.d, x.d2, x.s]), [["Florida", "2026-11-13", "2026-11-17", null]]);
});

// ---- A day's rows -------------------------------------------------------------------------
const fs = require("node:fs");
const path = require("node:path");
const {ROOT} = require("./harness");
const sample = fs.readFileSync(path.join(ROOT, "tools", "test", "fixtures", "call-sample.ics"), "utf8");
// Call from the sample: Wed 28 Oct 17:00 to Thu 08:00, the weekend from Fri 30 Oct 17:00 to Mon 08:00, Tue 3 Nov.
function withCall(today, extra = {}) {
  const h = load({today, state: state({}, extra)});
  h.ctx.__src = sample;
  h.run(`callImport(__src, "call-sample.ics"); toast = null`);
  return h;
}
const rows = (h, iso) => h.val(`agDay(${JSON.stringify(iso)})`);
const ev = (id, t, d, s, e, x = {}) => ({id, t, d, s, e, ...x});

test("a workday: the block's name for work, your own event, tonight's reading with its pages", () => {
  const h = withCall("2026-10-27", {agenda: {items: [ev("a1", "Dentist", "2026-10-27", "18:30", "19:15")]}});
  const r = rows(h, "2026-10-27");
  assert.deepEqual(r.map(x => [x.k, x.from, x.to]), [["work", "08:00", "18:00"], ["ev", "18:30", "19:15"], ["read", "20:00", null]]);
  assert.equal(r[0].t, "Consults SBH");
  assert.deepEqual([r[1].t, r[1].id], ["Dentist", "a1"]);
  assert.match(r[2].t, /^(Mayo|Yamada) \d+ · pp?\. \d+/);
});

test("Thursday keeps its half day; a holiday has no work and says its name", () => {
  const h = withCall("2026-10-27");
  assert.deepEqual(rows(h, "2026-10-29").filter(x => x.k === "work").map(x => [x.t, x.from, x.to]),
    [["Consults SBH", "08:00", "12:00"], ["Half day", "12:00", "17:00"]]);
  const hol = rows(h, "2026-10-12");
  assert.deepEqual(hol.map(x => x.k), ["hol"]);
  assert.equal(hol[0].t, "Thanksgiving");
});

test("call: the night it starts, the morning it ends, and a whole day in the middle of a weekend", () => {
  const h = withCall("2026-10-27");
  const wed = rows(h, "2026-10-28");
  const call = wed.find(x => x.k === "call");
  assert.deepEqual([call.t, call.from, call.more], ["On call", "17:00", true]);
  assert.match(call.sub, /^to Thu 08:00 · HSC Attending A · St\. B Attending B$/);
  const read = wed.find(x => x.k === "read");
  assert.deepEqual([read.t, read.sub, read.off], ["No reading tonight", "On call", true]);
  const thu = rows(h, "2026-10-29").find(x => x.k === "call");
  assert.deepEqual([thu.from, thu.to, thu.cont], [null, "08:00", true]);
  const sat = rows(h, "2026-10-31");
  assert.deepEqual(sat.map(x => x.k), ["call"]);
  assert.equal(sat[0].allDay, true);
});

test("marks for the strip and the month", () => {
  const h = withCall("2026-10-27", {agenda: {items: [ev("a1", "Dentist", "2026-10-28", "14:30", "15:30")]}});
  assert.deepEqual(h.val(`agMarks("2026-10-28")`), {hol: null, call: true, read: false, ev: 1});
  assert.deepEqual(h.val(`agMarks("2026-10-27")`), {hol: null, call: false, read: true, ev: 0});
  assert.deepEqual(h.val(`agMarks("2026-10-12")`), {hol: "Thanksgiving", call: false, read: false, ev: 0});
});

test("the next thing: your next event in the coming week, not one that's over", () => {
  const items = [ev("a1", "Old", "2026-10-26", "10:00", "11:00"), ev("a2", "Lunch", "2026-10-27", "11:00", "12:00"),
    ev("a3", "Dentist", "2026-10-28", "14:30", "15:30")];
  const h = withCall("2026-10-27", {agenda: {items}});
  h.setNow("2026-10-27T12:00");
  assert.deepEqual(h.val("agNext(callNow())"), {iso: "2026-10-28", from: "14:30", t: "Dentist", id: "a3"});
  const far = load({today: "2026-10-27", state: state({}, {agenda: {items: [ev("a9", "Far", "2026-11-09", "09:00", "10:00")]}})});
  assert.equal(far.val("agNext(callNow())"), null);
});

// ---- Add from file ------------------------------------------------------------------------
const ics = (...evs) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...evs.flatMap(e => ["BEGIN:VEVENT", ...e, "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");
const imp = (h, src) => { h.ctx.__src = src; return h.val(`(() => { const r = agImport(__src, "x.ics"); delete r.before; return r; })()`); };
const byUid = (h, uid) => h.val(`Store.state.agenda.items.find(x => x.uid === ${JSON.stringify(uid)}) || null`);

test("a call file goes to Call, not to your events", () => {
  const h = load({today: "2026-10-27"});
  const r = imp(h, sample);
  assert.equal(r.call, true);
  assert.ok(h.val("CallStore.list().length") > 0);
  assert.deepEqual(h.val("Store.state.agenda.items"), []);
});

test("an invite becomes an event; an all-day one ends the day before its DTEND", () => {
  const h = load({today: "2026-10-27"});
  const r = imp(h, ics(["UID:x1", "SUMMARY:Journal club", "DTSTART:20261104T120000", "DTEND:20261104T130000", "LOCATION:Room 3"],
    ["UID:x2", "SUMMARY:Florida", "DTSTART;VALUE=DATE:20261113", "DTEND;VALUE=DATE:20261118"]));
  assert.deepEqual([r.ok, r.added, r.changed, r.removed], [true, 2, 0, 0]);
  const jc = byUid(h, "x1"), fl = byUid(h, "x2");
  assert.deepEqual([jc.t, jc.d, jc.d2, jc.s, jc.e, jc.n], ["Journal club", "2026-11-04", null, "12:00", "13:00", "Room 3"]);
  assert.deepEqual([fl.t, fl.d, fl.d2, fl.s], ["Florida", "2026-11-13", "2026-11-17", null]);
});

test("time zones: a New York time converts; a Windows zone name keeps the time as written", () => {
  const h = load({today: "2026-10-27"});
  imp(h, ics(["UID:f1", "SUMMARY:Flight home", "DTSTART;TZID=America/New_York:20261117T093500", "DTEND;TZID=America/New_York:20261117T120500"],
    ["UID:o1", "SUMMARY:Rounds", "DTSTART;TZID=Central Standard Time:20261105T070000", "DTEND;TZID=Central Standard Time:20261105T080000"]));
  assert.equal(h.val(`(() => { const it = Store.state.agenda.items.find(x => x.uid === "f1"); return agDate(it.d).getTime() + agMin(it.s) * 60000; })()`),
    Date.UTC(2026, 10, 17, 14, 35));
  const r = byUid(h, "o1");
  assert.deepEqual([r.d, r.s, r.e], ["2026-11-05", "07:00", "08:00"]);
});

test("a yearly repeat; the same UID again updates; cancelled removes; Undo puts it back", () => {
  const h = load({today: "2026-10-27"});
  const bday = (summary, extra = []) => ics(["UID:b1", "SUMMARY:" + summary, "DTSTART;VALUE=DATE:20270312", "DTEND;VALUE=DATE:20270313", "RRULE:FREQ=YEARLY", ...extra]);
  imp(h, bday("A birthday"));
  assert.equal(byUid(h, "b1").rep, "y");
  assert.deepEqual(imp(h, bday("A friend's birthday")), {ok: true, call: false, added: 0, changed: 1, removed: 0});
  assert.equal(byUid(h, "b1").t, "A friend's birthday");
  h.ctx.__src = ics(["UID:b1", "STATUS:CANCELLED", "DTSTART;VALUE=DATE:20270312"]);
  h.run(`window.__r = agImport(__src, "x.ics")`);
  assert.equal(h.val("__r.removed"), 1);
  assert.equal(byUid(h, "b1"), null);
  h.run(`agRestore(__r.before)`);
  assert.equal(byUid(h, "b1").t, "A friend's birthday");
});

test("a file that isn't a calendar, or has no events, says so", () => {
  const h = load({today: "2026-10-27"});
  assert.deepEqual(imp(h, "hello"), {ok: false, error: "That file isn't a calendar. Pick an .ics file."});
  assert.deepEqual(imp(h, ics()), {ok: false, error: "No events in that file."});
});
