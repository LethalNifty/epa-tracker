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

test("the plan reads every chapter, question set and Yamada supplement once, 460 pages", () => {
  assert.equal(v("STUDY_ITEMS.length"), 51);
  assert.equal(v("studySeq().total"), 460);
  const ids = v("STUDY_ITEMS.map(x => x.id)");
  for (let c = 1; c <= 40; c++) assert.equal(ids.filter(x => x === "c" + c).length, 1, "c" + c);
  for (let q = 1; q <= 7; q++) assert.equal(ids.filter(x => x === "q" + q).length, 1, "q" + q);
  for (let y = 1; y <= 4; y++) assert.equal(ids.filter(x => x === "y" + y).length, 1, "y" + y);
});

test("the nutrition supplement is Yamada pages in Block 4, straight after Chapter 3", () => {
  assert.deepEqual(v("STUDY_PLAN[4]"), ["c3", "y1", "y2", "y3", "y4", "c7"]);
  const y1 = v("STUDY_BY_ID.y1");
  assert.deepEqual([y1.book, y1.y, y1.p, y1.n, y1.pdf, y1.sec, y1.block], ["Yamada", 23, [463, 474], 12, 77, 3, 4]);
  assert.deepEqual(v("['y2', 'y3', 'y4'].map(id => [STUDY_BY_ID[id].y, STUDY_BY_ID[id].p, STUDY_BY_ID[id].pdf])"),
    [[59, [1170, 1181], 76], [123, [2462, 2463], 69], [123, [2471, 2473], 69]]);
  assert.equal(v("studyItemLabel(STUDY_BY_ID.y1)"), "Y 23");
  assert.equal(v("studyItemLabel(STUDY_BY_ID.c3)"), "Ch 3");
  assert.equal(v("studyItemLabel(STUDY_BY_ID.q3)"), "Q III");
  // The bookmark of anyone part-way through Chapter 3 still points at the same page.
  assert.deepEqual(v("[studyAt(5).item.id, studyAt(5).page]"), ["c3", 40]);
});

test("IBS and constipation moved to Block 7, with the other colon chapters, before the colon questions", () => {
  assert.deepEqual(v("STUDY_PLAN[7]"), ["c19", "c20", "c21", "c22", "q5"]);
});

test("block loads match the plan", () => {
  const per = v("[4,5,6,7,8,9,10,11,12].map(b => studyDue(b) - studyDue(b - 1))");
  assert.deepEqual(per, [52, 54, 59, 54, 48, 48, 50, 49, 46]);
  assert.equal(v("studyDue(3)"), 0);
  assert.equal(v("studyDue(13)"), 460);
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
  assert.deepEqual(v("[studyAt(10).item.id, studyAt(10).page]"), ["y1", 463]);
  assert.deepEqual(v("[studyAt(39).item.id, studyAt(39).page]"), ["c7", 83]);
  assert.equal(v("studyIndexOf(STUDY_BY_ID.c3, 35)"), 0);
  assert.equal(v("studyIndexOf(STUDY_BY_ID.c3, 36)"), 1);
  assert.equal(v("studyIndexOf(STUDY_BY_ID.c7, 83)"), 39);
  assert.equal(v("studyIndexOf(STUDY_BY_ID.c3, 22)"), -1);   // not one of the chapter's pages
  assert.equal(v("studyPP(8, 12)"), "43–44, 463–464");
  assert.equal(v("studyPdfPP(0, 4)"), "50–53");
});

test("a page number two books share is found in the item it belongs to", () => {
  // Printed p. 466 is in Mayo's Gallstones chapter and in Yamada's Nutrition Support.
  assert.equal(v("studyIndexOf(STUDY_BY_ID.y1, 466)"), 13);
  assert.equal(v("studyIndexOf(STUDY_BY_ID.c40, 466)"), v("studyItemStart(STUDY_BY_ID.c40)") + 11);
  assert.notEqual(v("studyIndexOf(STUDY_BY_ID.c40, 466)"), 13);
});

test("Yamada pages give their own PDF page numbers and are named as Yamada's", () => {
  assert.equal(v("studyPdfPP(10, 13)"), "540–542");            // 463 + 77
  assert.equal(v("studyPdfPP(22, 24)"), "1246–1247");          // 1170 + 76
  assert.equal(v("studyPdfPP(34, 36)"), "2531–2532");          // 2462 + 69
  assert.equal(v("studyPdfNote(0, 4)"), "PDF 50–53");
  assert.equal(v("studyPdfNote(10, 13)"), "Yamada PDF 540–542");
  assert.equal(v("studyPdfNote(9, 13)"), "PDF 59, Yamada PDF 540–542");
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

test("the first night: 52 pages over 13 nights is 4, pp. 35–38", () => {
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
  const f = tonight("2026-10-02", {"2026-09-30": 5});
  assert.equal(f.from, 5);
});

test("part-read tonight is partial, not done", () => {
  const t = tonight("2026-09-30", {"2026-09-30": 2});
  assert.equal(t.partial, true);
  assert.equal(t.done, false);
});

test("a range ends on the chapter when the chapter ends a page away", () => {
  // From 7 with 4 due, the end would be 11: Ch 3 ends at 10, so stop there.
  assert.deepEqual(v("studySnap(7, 4)"), {from: 7, to: 10});
  // From 5 with 4 due, the end would be 9: finish the chapter at 10.
  assert.deepEqual(v("studySnap(5, 4)"), {from: 5, to: 10});
  // Two pages away, or far from any boundary: unchanged.
  assert.deepEqual(v("studySnap(4, 4)"), {from: 4, to: 8});
  assert.deepEqual(v("studySnap(12, 4)"), {from: 12, to: 16});
});

test("unfinished pages carry into the next block", () => {
  // Fri 23 Oct, Block 5's first reading night, with 40 read: 106 - 40 = 66
  // over 16 nights is 4 (4.1, rounded): pp. 40..44 of the run.
  assert.equal(v(`studyCountNights(${D("2026-10-23")}, blockEnd(5), [], [])`), 16);
  const t = tonight("2026-10-23", {"2026-10-21": 40});
  assert.deepEqual([t.from, t.to], [40, 44]);
});

test("the last night of a block is capped at 10 pages", () => {
  const t = tonight("2026-10-21", {});
  assert.equal(t.n, 10);
});

test("ahead: the block's pages are read, tonight is free with pages to keep going", () => {
  const t = tonight("2026-10-12", {"2026-10-09": 52});
  assert.equal(t.ahead, true);
  assert.deepEqual([t.keep.from, t.keep.to], [52, 56]);
});

test("off nights offer the next night's pages", () => {
  const t = tonight("2026-10-01", {"2026-09-30": 4});
  assert.equal(t.kind, "thu");
  assert.equal(t.keep.from, 4);
  assert.equal(v(`fmtDate(new Date(${JSON.stringify(t.next.day)}))`), "2026-10-02");
});

test("the whole plan read is complete", () => {
  assert.equal(tonight("2026-11-02", {"2026-11-01": 460}).kind, "complete");
});

test("plan delta: an even spread over the block's nights", () => {
  assert.equal(v(`studyPlanDelta(${D("2026-09-30")}, ${st({})}, [])`), 0);
  // After 5 on the first night: 52/13 = 4 expected, 5 read.
  assert.equal(v(`studyPlanDelta(${D("2026-09-30")}, ${st({"2026-09-30": 5})}, [])`), 1);
  // Nothing read by Mon 5 Oct: two nights gone, 8 expected.
  assert.equal(v(`studyPlanDelta(${D("2026-10-05")}, ${st({})}, [])`), -8);
});

test("pace needs a week; then pages per week and a finish date", () => {
  assert.equal(v(`studyPace(${D("2026-10-02")}, ${st({"2026-09-30": 4})}).rate`), null);
  const p = v(`studyPace(${D("2026-10-28")}, ${st({"2026-09-30": 4, "2026-10-26": 44})})`);
  assert.equal(p.rate, 10);   // 40 pages in the last 28 days
  assert.ok(p.date);
});

test("the nights grid: 28 days from Thursday, pages spread evenly", () => {
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
  assert.equal(total, 52);
  const nights = n.filter(x => x.kind === "read").map(x => x.pages);
  assert.equal(nights.length, 13);
  assert.ok(Math.min(...nights) >= 2 && Math.max(...nights) <= 6, nights.join(","));
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

test("the brief names Yamada on a Yamada night, so the notification says which book", () => {
  // 13 read by Mon 5 Oct: Tuesday is four pages of Yamada's Nutrition Support.
  const b = v(`studyBriefNights(${D("2026-10-06")}, ${st({"2026-10-05": 13})}, [])`);
  assert.equal(b[0].pp, "466–469");
  assert.equal(b[0].what, "Y 23 · Nutrition Support (Yamada)");
  assert.equal(b[0].book, "Yamada");
  // A Mayo night, or a night across both books, names no single book.
  assert.equal(v(`studyBriefNights(${D("2026-09-30")}, ${st({})}, [])`)[0].book, undefined);
  assert.equal(v(`studyBriefNights(${D("2026-10-05")}, ${st({"2026-10-02": 9})}, [])`)[0].book, undefined);
});
