"use strict";
// The Study tab, the Tonight card on Week, the study sheets, and study in the backup.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, state} = require("./harness");

const withStudy = (log = {}, extra = {}) => state({}, {study: {log, q: {}, pauses: [], ...extra}});
const study = (today, st) => { const h = load({today, state: st}); h.click("tab", {page: "study"}); return h; };

test("Study renders tonight's pages on the first reading night", () => {
  const h = study("2026-09-30");
  const html = h.html();
  assert.match(html, /<h1 class="title">Study<\/h1>/);
  assert.match(html, /Tonight · Wed 30 Sep/);
  assert.match(html, /<b>35–38<\/b>/);
  assert.match(html, /Esophageal Motility/);
  assert.match(html, /data-action="studydone"/);
  assert.equal((html.match(/class="ng /g) || []).length, 28);
  assert.equal((html.match(/<i class="(lit|tn|)"/g) || []).length, 460);
  assert.equal((html.match(/class="qrow"/g) || []).length, 7);
});

test("before the plan starts, Study previews the first night", () => {
  const html = study("2026-09-29").html();
  assert.match(html, /Starts Wed 30 Sep/);
  assert.match(html, /First night · Wed 30 Sep/);
  assert.match(html, /I read pp\. 35–38/);
});

test("Done moves the bookmark to the end of tonight, with undo", () => {
  const h = study("2026-09-30");
  h.click("studydone");
  assert.deepEqual(h.saved().study.log, {"2026-09-30": 4});
  assert.match(h.html(), /Done for tonight/);
  assert.match(h.html(), /Done · through p\. 38/);   // the toast
  h.click("undo");
  assert.deepEqual(h.saved().study.log, {});
});

test("Stopped somewhere else: pick a chapter and the last page read", () => {
  const h = study("2026-10-05", withStudy({"2026-10-02": 6}));
  h.click("studystop");
  assert.match(h.html(), /Where did you stop\?/);
  h.click("studyitem", {id: "c7"});
  assert.match(h.html(), /data-action="studypick" data-i="40">83</);
  h.click("studypick", {i: "44"});   // p. 87 is run index 43, so through it is 44
  assert.match(h.html(), /Through p\. 87 · Ch 7/);
  h.click("studysave");
  assert.equal(h.saved().study.log["2026-10-05"], 44);
});

test("an off night says why and offers the next pages", () => {
  const html = study("2026-10-01", withStudy({"2026-09-30": 3})).html();
  assert.match(html, /Thursday: soccer night\./);
  assert.match(html, /I read pp\. 38–41/);
  assert.match(html, /Next reading night · Fri 2 Oct/);
});

test("while there are pages to read, Study says how to highlight; once tonight is done it stops", () => {
  const tip = /Highlight only what you didn't know: the number, the drug, the term\. For a whole table or figure, highlight its title\. Aim for 3 to 6 marks a page\./;
  const h = study("2026-09-30");
  assert.match(h.html(), tip);
  h.click("studydone");
  assert.doesNotMatch(h.html(), tip);
  // An off night still offers pages, so the tip stays.
  assert.match(study("2026-10-01", withStudy({"2026-09-30": 4})).html(), tip);
  // The whole plan read: nothing to highlight.
  assert.doesNotMatch(study("2027-05-20", withStudy({"2027-05-19": 460})).html(), tip);
});

test("a call night is a night off", () => {
  const h = load({today: "2026-10-07"});
  h.run(`CallStore.state.shifts = {a: {uid: "a", s: new Date(2026, 9, 7, 17).getTime(), e: new Date(2026, 9, 8, 8).getTime(),
    so: null, hsc: {att: "Attending A", res: null}, stb: {att: "Attending B", res: null}}};`);
  h.click("tab", {page: "study"});
  assert.match(h.html(), /You're on call tonight\./);
});

test("pause: the sheet saves a range and tonight becomes a night off", () => {
  const h = study("2026-10-05");
  h.click("studypause");
  h.click("studypausechip", {a: "2026-10-05", b: "2026-10-07"});
  h.click("studysave");
  assert.deepEqual(h.saved().study.pauses, [{a: "2026-10-05", b: "2026-10-07"}]);
  assert.match(h.html(), /Paused until Thu 8 Oct\./);
  h.click("studyunpause", {i: "0"});
  assert.deepEqual(h.saved().study.pauses, []);
});

test("a finished question set asks for a score, and the score is saved", () => {
  const q3end = load({today: "2026-11-02"}).val("studyItemEnd(STUDY_BY_ID.q3)");
  const h = study("2026-11-02", withStudy({"2026-11-01": q3end}));
  assert.match(h.html(), /Small Bowel and Nutrition questions done/);
  h.click("studyscore", {id: "q3"});
  assert.match(h.html(), /Out of/);
  h.click("studystep", {f: "r", k: "1"});
  h.click("studysave");
  assert.deepEqual([h.saved().study.q.q3.r, h.saved().study.q.q3.of], [7, 8]);
  assert.doesNotMatch(h.html(), /questions done/);
  assert.match(h.html(), /<span class="mono qs[^"]*">7\/8<\/span>/);
});

test("the whole book read shows the pass complete", () => {
  const html = study("2027-05-20", withStudy({"2027-05-19": 460})).html();
  assert.match(html, /Mayo, pass 1: read/);
  assert.doesNotMatch(html, /data-action="studydone"/);
});

test("Week shows the Tonight card, linking to Study", () => {
  const h = load({today: "2026-09-30"});
  const html = h.html();
  assert.match(html, /class="card studycard" data-action="tab" data-page="study"/);
  assert.match(html, /pp\. 35–38/);
  h.run(`Store.setStudyCursor(4, getToday()); render();`);
  assert.match(h.html(), /Reading done/);
});

test("study rides in the backup, and old backups load with an empty study", () => {
  const h = load({today: "2026-09-30", state: withStudy({"2026-09-30": 3})});
  assert.deepEqual(JSON.parse(h.val("Store.exportJSON()")).study.log, {"2026-09-30": 3});
  const old = JSON.stringify({v: 1, obs: {}, lines: {}, lastBackup: null});
  assert.equal(h.val(`Store.importJSON(${JSON.stringify(old)}).ok`), true);
  assert.deepEqual(h.saved().study, {log: {}, q: {}, pauses: [], qa: {}});
  const withIt = JSON.stringify({v: 1, obs: {}, lines: {}, study: {log: {"2026-10-02": 9}, q: {}, pauses: []}});
  h.val(`Store.importJSON(${JSON.stringify(withIt)}).ok`);
  assert.deepEqual(h.saved().study.log, {"2026-10-02": 9});
});

test("a night across two readings is named for the main one, with a note for the other", () => {
  // 9 read by Mon 5 Oct: tonight is p. 44 (the end of Ch 3) and pp. 463-465 of Yamada.
  const html = study("2026-10-05", withStudy({"2026-10-02": 9})).html();
  assert.match(html, /<div class="sm-ch mono">Ch 3 → Y 23<\/div><div class="sm-title">Nutrition Support \(Yamada\)<\/div>/);
  assert.match(html, /Starts with the last page of Ch 3\. 4 pages · PDF 59, Yamada PDF 540–542/);
});

test("a Yamada night names the book and where to find the pages in its PDF", () => {
  // 13 read by Mon 5 Oct: Tuesday is pp. 466-469 of Yamada's Nutrition Support.
  const h = study("2026-10-06", withStudy({"2026-10-05": 13}));
  const html = h.html();
  assert.match(html, /<div class="sm-ch mono">Y 23<\/div><div class="sm-title">Nutrition Support \(Yamada\)<\/div>/);
  assert.match(html, /<b>466–469<\/b>/);
  assert.match(html, /4 pages · Yamada PDF 543–546/);
  assert.match(html, /Yamada's PDF page numbers are shown with each night's pages\./);
  h.click("tab", {page: "week"});
  assert.match(h.html(), /pp\. 466–469/);
  assert.match(h.html(), /Y 23 · Nutrition Support \(Yamada\)/);
});

test("two readings from the same Yamada chapter share one label", () => {
  // 35 read by Fri 16 Oct: Monday is the rest of the PEG pages, then Ch 7.
  const html = study("2026-10-19", withStudy({"2026-10-16": 35})).html();
  assert.match(html, /<div class="sm-ch mono">Y 123 → Ch 7<\/div><div class="sm-title">PEG: Complications \(Yamada\)<\/div>/);
});
