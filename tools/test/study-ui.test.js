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
  assert.match(html, /<b>35–37<\/b>/);
  assert.match(html, /Esophageal Motility/);
  assert.match(html, /data-action="studydone"/);
  assert.equal((html.match(/class="ng /g) || []).length, 28);
  assert.equal((html.match(/<i class="(lit|tn|)"/g) || []).length, 431);
  assert.equal((html.match(/class="qrow"/g) || []).length, 7);
});

test("before the plan starts, Study previews the first night", () => {
  const html = study("2026-09-29").html();
  assert.match(html, /Starts Wed 30 Sep/);
  assert.match(html, /First night · Wed 30 Sep/);
  assert.match(html, /I read pp\. 35–37/);
});

test("Done moves the bookmark to the end of tonight, with undo", () => {
  const h = study("2026-09-30");
  h.click("studydone");
  assert.deepEqual(h.saved().study.log, {"2026-09-30": 3});
  assert.match(h.html(), /Done for tonight/);
  assert.match(h.html(), /Done · through p\. 37/);   // the toast
  h.click("undo");
  assert.deepEqual(h.saved().study.log, {});
});

test("Stopped somewhere else: pick a chapter and the last page read", () => {
  const h = study("2026-10-05", withStudy({"2026-10-02": 6}));
  h.click("studystop");
  assert.match(h.html(), /Where did you stop\?/);
  h.click("studyitem", {id: "c7"});
  assert.match(h.html(), /data-action="studypick" data-i="11">83</);
  h.click("studypick", {i: "15"});   // p. 87 is run index 14, so through it is 15
  assert.match(h.html(), /Through p\. 87 · Ch 7/);
  h.click("studysave");
  assert.equal(h.saved().study.log["2026-10-05"], 15);
});

test("an off night says why and offers the next pages", () => {
  const html = study("2026-10-01", withStudy({"2026-09-30": 3})).html();
  assert.match(html, /Thursday: soccer night\./);
  assert.match(html, /I read pp\. 38–40/);
  assert.match(html, /Next reading night · Fri 2 Oct/);
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
  const html = study("2027-05-20", withStudy({"2027-05-19": 431})).html();
  assert.match(html, /Mayo, pass 1: read/);
  assert.doesNotMatch(html, /data-action="studydone"/);
});

test("Week shows the Tonight card, linking to Study", () => {
  const h = load({today: "2026-09-30"});
  const html = h.html();
  assert.match(html, /class="card studycard" data-action="tab" data-page="study"/);
  assert.match(html, /pp\. 35–37/);
  h.run(`Store.setStudyCursor(3, getToday()); render();`);
  assert.match(h.html(), /Reading done/);
});

test("study rides in the backup, and old backups load with an empty study", () => {
  const h = load({today: "2026-09-30", state: withStudy({"2026-09-30": 3})});
  assert.deepEqual(JSON.parse(h.val("Store.exportJSON()")).study.log, {"2026-09-30": 3});
  const old = JSON.stringify({v: 1, obs: {}, lines: {}, lastBackup: null});
  assert.equal(h.val(`Store.importJSON(${JSON.stringify(old)}).ok`), true);
  assert.deepEqual(h.saved().study, {log: {}, q: {}, pauses: []});
  const withIt = JSON.stringify({v: 1, obs: {}, lines: {}, study: {log: {"2026-10-02": 9}, q: {}, pauses: []}});
  h.val(`Store.importJSON(${JSON.stringify(withIt)}).ok`);
  assert.deepEqual(h.saved().study.log, {"2026-10-02": 9});
});

test("a night across two chapters is named for the main one, with a note for the other", () => {
  // 22 read on 14 Oct: tonight is p. 95 (the end of Ch 7) and pp. 237-240 of Ch 21.
  const html = study("2026-10-14", withStudy({"2026-10-13": 22})).html();
  assert.match(html, /<div class="sm-ch mono">Ch 7 → Ch 21<\/div><div class="sm-title">Constipation and Fecal Incontinence<\/div>/);
  assert.match(html, /Starts with the last page of Ch 7\. \d pages/);
});
