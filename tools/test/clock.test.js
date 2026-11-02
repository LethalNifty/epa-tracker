"use strict";
// Manitoba stopped changing its clocks in November 2026, so Winnipeg is UTC-5
// all year. Block 5 was read before the phone knew: its times from Nov 1 were
// saved on the old winter clock (UTC-6) and read an hour late on the new one.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load} = require("./harness");

const NEW_CLOCK = "Etc/GMT+5", OLD_CLOCK = "America/Chicago";
const z = (m, d, h) => Date.UTC(2026, m - 1, d, h);
const who = {so: null, hsc: {att: "Attending A", res: null}, stb: {att: "Attending B", res: null}};
const shift = (uid, s, e) => ({uid, s, e, ...who});
// Block 5 as the phone saved it in October: 17:00 and 08:00 on the clock of the day.
const savedInOctober = () => ({
  fri: shift("fri", z(10, 30, 22), z(10, 31, 13)),
  sat: shift("sat", z(10, 31, 13), z(11, 1, 14)),
  sun: shift("sun", z(11, 1, 14), z(11, 2, 14)),
  tue: shift("tue", z(11, 10, 23), z(11, 11, 14)),
});

// The app opening on a phone with these shifts saved, on this clock.
function opened(shifts, now, clock = NEW_CLOCK) {
  process.env.TZ = clock;
  const h = load({today: now.slice(0, 10)});
  h.setNow(now);
  h.store.set("gi-call-v1", JSON.stringify({v: 1, shifts, nums: {hsc: "", stb: ""}, last: null}));
  h.run(`CallStore.load(); render()`);
  return h;
}
test.afterEach(() => { process.env.TZ = NEW_CLOCK; });

test("the weekend ends Monday at 08:00 and the next call starts at 17:00, as the file says", () => {
  const html = opened(savedInOctober(), "2026-11-02T07:06").html();
  assert.match(html, /Off Mon 08:00/);
  assert.match(html, />54 min</);
  assert.match(html, /17:00 → Mon 08:00/);
  assert.match(html, /Next call Tue 10 Nov, 17:00/);
  assert.doesNotMatch(html, /09:00|18:00/);
});

test("the repair is saved, keeps the weekend whole and leaves times before the change alone", () => {
  const h = opened(savedInOctober(), "2026-11-02T07:06");
  const {shifts} = JSON.parse(h.store.get("gi-call-v1"));
  assert.deepEqual([shifts.fri.s, shifts.fri.e], [z(10, 30, 22), z(10, 31, 13)]);
  assert.deepEqual([shifts.sat.s, shifts.sat.e], [z(10, 31, 13), z(11, 1, 13)]);
  assert.deepEqual([shifts.sun.s, shifts.sun.e], [z(11, 1, 13), z(11, 2, 13)]);
  assert.deepEqual([shifts.tue.s, shifts.tue.e], [z(11, 10, 22), z(11, 11, 13)]);
  const st = h.val(`callStretches(CallStore.list())`);
  assert.equal(st.length, 2);
  assert.equal(h.val(`callHours(${st[0].s}, ${st[0].e})`), 63);
});

test("opening the app again moves nothing further", () => {
  const h = opened(savedInOctober(), "2026-11-02T07:06");
  const once = h.store.get("gi-call-v1");
  h.run(`CallStore.load()`);
  assert.equal(h.store.get("gi-call-v1"), once);
  assert.equal(h.val(`callHM(CallStore.state.shifts.tue.s)`), "17:00");
});

test("a phone still on the old clock is left alone until it learns", () => {
  const h = opened(savedInOctober(), "2026-11-02T07:06", OLD_CLOCK);
  assert.equal(h.val(`CallStore.state.shifts.tue.s`), z(11, 10, 23));
  assert.equal(h.val(`callHM(CallStore.state.shifts.tue.s)`), "17:00");
  assert.match(h.html(), /Off Mon 08:00/);
});

test("Block 5 read again on the new clock is already right and stays put", () => {
  const h = opened({}, "2026-11-02T07:06");
  h.ctx.__src = ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "UID:tue", "DTSTART:20261110T170000", "DTEND:20261111T080000",
    "X-GI-CALL-HSC-ATTENDING:Attending A", "X-GI-CALL-STB-ATTENDING:Attending B", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  h.run(`callImport(__src, "block.ics"); CallStore.load()`);
  assert.deepEqual(h.val(`[CallStore.state.shifts.tue.s, CallStore.state.shifts.tue.e]`), [z(11, 10, 22), z(11, 11, 13)]);
});

test("later blocks were read on the new clock, so even an 18:00 start keeps its hour", () => {
  const later = {thu: shift("thu", z(11, 24, 23), z(11, 25, 14))};
  const h = opened(later, "2026-11-20T12:00");
  assert.deepEqual(h.val(`[CallStore.state.shifts.thu.s, CallStore.state.shifts.thu.e]`), [z(11, 24, 23), z(11, 25, 14)]);
});
