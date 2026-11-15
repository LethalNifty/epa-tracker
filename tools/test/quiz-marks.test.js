"use strict";
// A trial: a question worth several marks takes the marks won (0 to all), as
// the exam marks it, and the question bank adds marks by section of the book
// against the 70% line. Got it and Missed stay for one-mark questions.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, state} = require("./harness");

function phone() {
  const h = load({today: "2026-10-05", state: state({}, {study: {log: {"2026-10-02": 300}, q: {}, pauses: [], qa: {}}})});
  h.run(`StudyQ.status = "ready"; StudyQ.list = studyqAccept({q: [
    {id: "c3-1", item: "c3", page: STUDY_BY_ID.c3.p[0], q: "List TWO causes.", a: ["One", "Two"], marks: 2},
    {id: "c3-2", item: "c3", page: STUDY_BY_ID.c3.p[0] + 1, q: "Name one.", a: ["One"]},
    {id: "c7-1", item: "c7", page: STUDY_BY_ID.c7.p[0], q: "List THREE.", a: ["A", "B", "C"], marks: 3}]}); render();`);
  return h;
}

test("a question worth several marks takes the marks won; tapping the same count clears it", () => {
  const h = phone();
  h.click("studytab", {tab: "p"});
  h.click("studybank", {id: "c3"});
  h.click("studyreveal", {id: "c3-1"});
  assert.match(h.html(), /<span class="mono qm-l">Marks<\/span><button class="pillbtn qm qn missed"[^>]*>0<\/button><button class="pillbtn qm qn part"[^>]*>1<\/button><button class="pillbtn qm qn got"[^>]*>2<\/button><span class="mono qm-of">of 2<\/span>/);
  h.click("studymark", {id: "c3-1", got: "1"});
  assert.deepEqual(h.saved().study.qa["c3-1"], {ok: false, d: "2026-10-05", got: 1});
  assert.match(h.html(), /<button class="pillbtn qm qn on part"[^>]*aria-pressed="true">1<\/button>/);
  h.click("studymark", {id: "c3-1", got: "1"});
  assert.equal(h.saved().study.qa["c3-1"], undefined);
  h.click("studymark", {id: "c3-1", got: "2"});
  assert.deepEqual(h.saved().study.qa["c3-1"], {ok: true, d: "2026-10-05", got: 2});
  // A one-mark question keeps Got it and Missed.
  h.click("studyreveal", {id: "c3-2"});
  assert.match(h.html(), /data-id="c3-2" data-ok="1">[\s\S]*?Got it/);
});

test("marks by section against the 70% line, from the questions answered", () => {
  const h = phone();
  h.run(`Store.setQMark("c3-1", false, 1); Store.setQMark("c3-2", true); Store.setQMark("c7-1", true, 3); route = {page: "study"}; studyTab = "p"; render();`);
  const html = h.html(), list = html.slice(html.indexOf('class="card list marklist"'));
  assert.match(list, /<span>Line at 70%<\/span>/);
  assert.match(list, /<div class="mk-row"><span>All sections<\/span><span class="mono"><b>83%<\/b> · 5 of 6 marks<\/span>/);
  assert.match(list, /<div class="mk-row low"><span>Esophagus<\/span><span class="mono"><b>67%<\/b> · 2 of 3 marks<\/span>/);
  assert.match(list, /<div class="mk-row"><span>Stomach<\/span><span class="mono"><b>100%<\/b> · 3 of 3 marks<\/span>/);
  // Marked the old way (Got it on a three-mark question): all three.
  h.run(`Store.state.study.qa["c7-1"] = {ok: true, d: "2026-10-01"}; render();`);
  assert.match(h.html(), /<span>Stomach<\/span><span class="mono"><b>100%<\/b> · 3 of 3 marks/);
});

test("nothing answered: no marks block", () => {
  const h = phone();
  h.click("tab", {page: "study"});
  h.click("studytab", {tab: "p"});
  assert.match(h.html(), /<h2>Question bank<\/h2>/);
  assert.doesNotMatch(h.html(), /marklist/);
});
