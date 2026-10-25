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
