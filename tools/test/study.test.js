"use strict";
// The Mayo reading plan (study.js): the plan's pages, reading nights, tonight's
// share, and where you stand.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load} = require("./harness");

const app = load({today: "2026-09-28"});
const v = app.val, run = app.run;
const D = iso => `new Date(${iso.slice(0, 4)}, ${+iso.slice(5, 7) - 1}, ${+iso.slice(8, 10)}, 12)`;
const H = (iso, h) => `new Date(${iso.slice(0, 4)}, ${+iso.slice(5, 7) - 1}, ${+iso.slice(8, 10)}, ${h}).getTime()`;
const st = (log = {}, extra = {}) => JSON.stringify({log, q: {}, pauses: [], ...extra});
const tonight = (iso, log, extra, stretches = "[]") => v(`studyTonight(${D(iso)}, ${st(log, extra)}, ${stretches})`);

test("the plan reads every chapter and question set once, 431 pages", () => {
  assert.equal(v("STUDY_ITEMS.length"), 47);
  assert.equal(v("studySeq().total"), 431);
  const ids = v("STUDY_ITEMS.map(x => x.id)");
  for (let c = 1; c <= 40; c++) assert.equal(ids.filter(x => x === "c" + c).length, 1, "c" + c);
  for (let q = 1; q <= 7; q++) assert.equal(ids.filter(x => x === "q" + q).length, 1, "q" + q);
});

test("block loads match the plan", () => {
  const per = v("[4,5,6,7,8,9,10,11,12].map(b => studyDue(b) - studyDue(b - 1))");
  assert.deepEqual(per, [42, 54, 59, 35, 48, 48, 50, 49, 46]);
  assert.equal(v("studyDue(3)"), 0);
  assert.equal(v("studyDue(13)"), 431);
});

test("each question set comes after every chapter it covers", () => {
  const order = v("STUDY_ITEMS.map(x => [x.id, x.sec])");
  order.forEach(([id, sec], i) => {
    if (id[0] !== "q") return;
    const later = order.slice(i + 1).filter(([x, s]) => x[0] === "c" && s === sec);
    assert.deepEqual(later, [], id + " before its chapters");
  });
});

test("run index and printed pages map both ways", () => {
  assert.deepEqual(v("[studyAt(0).item.id, studyAt(0).page]"), ["c3", 35]);
  assert.deepEqual(v("[studyAt(10).item.id, studyAt(10).page]"), ["c7", 83]);
  assert.equal(v("studyPageIndex(35)"), 0);
  assert.equal(v("studyPageIndex(36)"), 1);
  assert.equal(v("studyPageIndex(83)"), 10);
  assert.equal(v("studyPageIndex(22)"), -1);   // a blank page, never read
  assert.equal(v("studyPP(8, 12)"), "43–44, 83–84");
  assert.equal(v("studyPdfPP(0, 4)"), "50–53");
});

test("reading nights: Mon, Tue, Wed, Fri from 30 Sep", () => {
  const k = iso => v(`studyNightKind(${D(iso)}, [], [])`);
  assert.equal(k("2026-09-29"), "before");
  assert.equal(k("2026-09-30"), "read");
  assert.equal(k("2026-10-01"), "thu");
  assert.equal(k("2026-10-02"), "read");
  assert.equal(k("2026-10-03"), "weekend");
  assert.equal(k("2026-10-04"), "weekend");
  assert.equal(k("2026-10-05"), "read");
  assert.equal(k("2027-07-01"), "after");
});

test("a call night is one you're on call at 20:00; post-call is a reading night", () => {
  const s = `[{s: ${H("2026-10-05", 17)}, e: ${H("2026-10-06", 8)}}]`;
  assert.equal(v(`studyNightKind(${D("2026-10-05")}, ${s}, [])`), "call");
  assert.equal(v(`studyNightKind(${D("2026-10-06")}, ${s}, [])`), "read");
});

test("a pause covers its first and last day", () => {
  const p = `[{a: "2026-10-05", b: "2026-10-07"}]`;
  assert.equal(v(`studyNightKind(${D("2026-10-05")}, [], ${p})`), "pause");
  assert.equal(v(`studyNightKind(${D("2026-10-07")}, [], ${p})`), "pause");
  assert.equal(v(`studyNightKind(${D("2026-10-09")}, [], ${p})`), "read");
});

test("Block 4 has 13 reading nights from 30 Sep", () => {
  assert.equal(v(`studyCountNights(${D("2026-09-30")}, blockEnd(4), [], [])`), 13);
});

test("the first night: 42 pages over 13 nights is 4, pp. 35–38", () => {
  const t = tonight("2026-09-30", {});
  assert.equal(t.kind, "read");
  assert.deepEqual([t.from, t.to, t.n], [0, 4, 4]);
  assert.equal(v("studyPP(0, 4)"), "35–38");
  assert.equal(t.done, false);
  assert.equal(t.next.from, 4);   // Friday picks up where tonight ends
});

test("before the start, the card previews Wednesday", () => {
  const t = tonight("2026-09-28", {});
  assert.equal(t.kind, "before");
  assert.equal(v(`fmtDate(new Date(${JSON.stringify(t.next.day)}))`), "2026-09-30");
  assert.deepEqual([t.next.from, t.next.to], [0, 4]);
});

test("done once the bookmark reaches the end of tonight", () => {
  const t = tonight("2026-09-30", {"2026-09-30": 4});
  assert.equal(t.done, true);
  assert.deepEqual([t.from, t.to], [0, 4]);
  const f = tonight("2026-10-02", {"2026-09-30": 4});
  assert.equal(f.from, 4);
});

test("part-read tonight is partial, not done", () => {
  const t = tonight("2026-09-30", {"2026-09-30": 2});
  assert.equal(t.partial, true);
  assert.equal(t.done, false);
});

test("a range ends on the chapter when the chapter ends within 2 pages", () => {
  // From 7 with 4 due, the end would be 11: Ch 3 ends at 10, so stop there.
  assert.deepEqual(v("studySnap(7, 4)"), {from: 7, to: 10});
  // From 5 with 4 due, the end would be 9: finish the chapter at 10.
  assert.deepEqual(v("studySnap(5, 4)"), {from: 5, to: 10});
  // Far from any boundary, unchanged.
  assert.deepEqual(v("studySnap(12, 4)"), {from: 12, to: 16});
});

test("unfinished pages carry into the next block", () => {
  // Fri 23 Oct, Block 5's first reading night, with 30 read: 96 - 30 = 66
  // over 16 nights is 5, and 30..35 snaps to Ch 21's end at 36.
  assert.equal(v(`studyCountNights(${D("2026-10-23")}, blockEnd(5), [], [])`), 16);
  const t = tonight("2026-10-23", {"2026-10-21": 30});
  assert.deepEqual([t.from, t.to], [30, 36]);
});

test("the last night of a block is capped at 10 pages", () => {
  const t = tonight("2026-10-21", {});
  assert.equal(t.n, 10);
});

test("ahead: the block's pages are read, tonight is free with pages to keep going", () => {
  const t = tonight("2026-10-12", {"2026-10-09": 42});
  assert.equal(t.ahead, true);
  assert.deepEqual([t.keep.from, t.keep.to], [42, 46]);
});

test("off nights offer the next night's pages", () => {
  const t = tonight("2026-10-01", {"2026-09-30": 4});
  assert.equal(t.kind, "thu");
  assert.equal(t.keep.from, 4);
  assert.equal(v(`fmtDate(new Date(${JSON.stringify(t.next.day)}))`), "2026-10-02");
});

test("the whole plan read is complete", () => {
  assert.equal(tonight("2026-11-02", {"2026-11-01": 431}).kind, "complete");
});

test("plan delta: an even spread over the block's nights", () => {
  assert.equal(v(`studyPlanDelta(${D("2026-09-30")}, ${st({})}, [])`), 0);
  // After tonight's 4 on the first night: 42/13 = 3.2 expected, 4 read.
  assert.equal(v(`studyPlanDelta(${D("2026-09-30")}, ${st({"2026-09-30": 4})}, [])`), 1);
  // Nothing read by Mon 5 Oct: two nights gone, 6.5 expected.
  assert.equal(v(`studyPlanDelta(${D("2026-10-05")}, ${st({})}, [])`), -6);
});

test("pace needs a week; then pages per week and a finish date", () => {
  assert.equal(v(`studyPace(${D("2026-10-02")}, ${st({"2026-09-30": 4})}).rate`), null);
  const p = v(`studyPace(${D("2026-10-28")}, ${st({"2026-09-30": 4, "2026-10-26": 44})})`);
  assert.equal(p.rate, 10);   // 40 pages in the last 28 days
  assert.ok(p.date);
});

test("the nights grid: 28 days from Thursday, planned pages ahead", () => {
  const n = v(`studyNights(4, ${D("2026-09-30")}, ${st({})}, [])`);
  assert.equal(n.length, 28);
  assert.equal(v(`fmtDate(new Date(${JSON.stringify(n[0].date)}))`), "2026-09-24");
  const wed = n.find(x => x.key === "2026-09-30");
  assert.equal(wed.state, "today");
  assert.equal(wed.pages, 4);
  const fri = n.find(x => x.key === "2026-10-02");
  assert.equal(fri.state, "future");
  assert.ok(fri.pages >= 3);
  const total = n.reduce((a, x) => a + x.pages, 0);
  assert.equal(total, 42);
});

test("the nights grid marks done, missed and extra", () => {
  const n = v(`studyNights(4, ${D("2026-10-06")}, ${st({"2026-09-30": 4, "2026-10-01": 7})}, [])`);
  const by = k => n.find(x => x.key === k).state;
  assert.equal(by("2026-09-30"), "done");
  assert.equal(by("2026-10-01"), "extra");
  assert.equal(by("2026-10-02"), "missed");
  assert.equal(by("2026-10-03"), "past");
});

test("a finished question set asks for a score once", () => {
  const q3 = v("studyItemEnd(STUDY_BY_ID.q3)");
  assert.equal(v(`studyNeedsScore(${st({"2026-11-02": q3})}).id`), "q3");
  assert.equal(v(`studyNeedsScore(${st({"2026-11-02": q3}, {q: {q3: {r: 6, of: 8}}})})`), null);
});

test("the brief writes out tonight and 13 days after", () => {
  const b = v(`studyBriefNights(${D("2026-09-30")}, ${st({})}, [])`);
  assert.equal(b.length, 14);
  assert.equal(b[0].kind, "read");
  assert.equal(b[0].pp, "35–38");
  assert.equal(b[0].what, "Ch 3 · Esophageal Motility");
  assert.equal(b[1].kind, "thu");
});
