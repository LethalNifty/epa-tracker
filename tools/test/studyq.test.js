"use strict";
// Study questions: the encrypted file (tools/studyq/build.js), opening it on
// the phone (studyq.js), and the questions on the Study tab. Invented
// questions only; the real ones never enter this repository.
const test = require("node:test");
const assert = require("node:assert/strict");
const {webcrypto} = require("node:crypto");
const {load, state} = require("./harness");
const {validate, encrypt, planItems} = require("../studyq/build.js");

const PW = "test-password-long-enough";
const QS = [
  {id: "c3-1", item: "c3", page: 35, q: "List TWO example questions.", a: ["First", "Second"], marks: 1},
  {id: "c3-2", item: "c3", page: 37, q: "Name one more.", a: ["Third"], marks: 0.5},
  {id: "c3-3", item: "c3", page: 40, q: "A question for a later night.", a: ["Later"]},
];
const withStudy = (log = {}, extra = {}) => state({}, {study: {log, q: {}, pauses: [], qa: {}, ...extra}});
// A phone with the question file on the site, optionally a saved password.
async function phone(today, st, {pw = null, file = encrypt({v: 1, q: QS}, PW, {iter: 1000})} = {}) {
  const h = load({today, state: st});
  h.ctx.crypto = webcrypto;
  h.ctx.TextEncoder = TextEncoder;
  h.ctx.fetch = async () => file ? {ok: true, json: async () => file} : {ok: false};
  if (pw) h.run(`localStorage.setItem("gi-studyq-v1", ${JSON.stringify(JSON.stringify({pw}))})`);
  await h.run("studyqInit()");
  h.click("tab", {page: "study"});
  return h;
}

test("validation: unknown item, page outside its item, duplicate id, no answer", () => {
  const items = planItems();
  assert.deepEqual(validate(QS, items), []);
  // A Yamada reading is an item like any other, checked against its own pages.
  assert.deepEqual(validate([{id: "y1-1", item: "y1", page: 466, q: "?", a: ["a"]}], items), []);
  assert.match(validate([{id: "y1-2", item: "y1", page: 475, q: "?", a: ["a"]}], items)[0], /outside y1 \(pp\. 463-474\)/);
  const bad = validate([
    {id: "x1", item: "c99", page: 35, q: "?", a: ["a"]},
    {id: "x2", item: "c3", page: 50, q: "?", a: ["a"]},
    {id: "x2", item: "c3", page: 36, q: "?", a: ["a"]},
    {id: "x3", item: "c3", page: 36, q: "?", a: []},
  ], items);
  assert.equal(bad.length, 4, bad.join("\n"));
  assert.match(bad[0], /unknown item/);
  assert.match(bad[1], /outside c3 \(pp\. 35-44\)/);
  assert.match(bad[2], /duplicate id/);
  assert.match(bad[3], /model answer/);
});

test("the file holds only ciphertext", () => {
  const f = encrypt({v: 1, q: QS}, PW, {iter: 1000});
  assert.deepEqual(Object.keys(f).sort(), ["ct", "iter", "iv", "kdf", "salt", "v"]);
  assert.doesNotMatch(JSON.stringify(f), /example questions/);
});

test("locked until the password is typed; then the phone remembers it", async () => {
  const h = await phone("2026-09-30");
  assert.equal(h.val("StudyQ.status"), "locked");
  assert.match(h.html(), /Tonight's questions are locked/);
  assert.equal(await h.run(`studyqUnlock("wrong-password-123")`), false);
  assert.equal(h.val("StudyQ.err"), "That password didn't open the questions. Check it and try again.");
  assert.equal(await h.run(`studyqUnlock(${JSON.stringify(PW)})`), true);
  assert.equal(JSON.parse(h.store.get("gi-studyq-v1")).pw, PW);
  h.run("render()");
  assert.match(h.html(), /Before you read/);
  // The password is never in the backup.
  assert.doesNotMatch(h.val("Store.exportJSON()"), new RegExp(PW));
});

test("tonight's questions are the ones on tonight's pages", async () => {
  const h = await phone("2026-09-30", undefined, {pw: PW});
  const html = h.html();
  assert.equal(h.val("StudyQ.status"), "ready");
  assert.match(html, /<span class="mono">Before you read<\/span><span class="mono">2 questions · 1.5 marks<\/span>/);
  assert.match(html, /List TWO example questions\./);
  assert.match(html, /Name one more\./);
  assert.doesNotMatch(html, /A question for a later night/);   // p. 40 is a later night
  assert.match(html, /Answer in your head first, even a guess, then read pp\. 35–38 to check\./);
  h.click("tab", {page: "week"});
  assert.match(h.html(), /2 questions first · Ch 3 · Esophageal Motility/);
});

test("Show answer, then Got it or Missed; tapping the same mark clears it", async () => {
  const h = await phone("2026-09-30", undefined, {pw: PW});
  assert.doesNotMatch(h.html(), /<li>First<\/li>/);
  h.click("studyreveal", {id: "c3-1"});
  assert.match(h.html(), /<li>First<\/li><li>Second<\/li>/);
  h.click("studymark", {id: "c3-1", ok: "0"});
  assert.equal(h.saved().study.qa["c3-1"].ok, false);
  h.click("studymark", {id: "c3-1", ok: "0"});
  assert.equal(h.saved().study.qa["c3-1"], undefined);
});

test("the bank lists questions on pages already read, with missed counts", async () => {
  const h = await phone("2026-10-05", withStudy({"2026-10-02": 6}, {qa: {"c3-1": {ok: false, d: "2026-09-30"}, "c3-2": {ok: true, d: "2026-09-30"}}}), {pw: PW});
  const html = h.html();
  assert.match(html, /<h2>Question bank<\/h2><span class="mono"><b>2<\/b>\/3 answered · 1 missed<\/span>/);
  h.click("studybank", {id: "c3"});
  h.click("studybankfilter", {f: "missed"});
  assert.match(h.html(), /List TWO example questions\./);
  assert.doesNotMatch(h.html().slice(h.html().indexOf("studysheet")), /Name one more\./);
});

test("Not tonight moves tonight's pages and questions to the next reading night, with undo", async () => {
  const h = await phone("2026-09-30", undefined, {pw: PW});
  h.click("studyskip");
  assert.deepEqual(h.saved().study.pauses, [{a: "2026-09-30", b: "2026-09-30", skip: true}]);
  assert.match(h.html(), /Skipped tonight\./);
  assert.match(h.html(), /Next reading night · Fri 2 Oct · pp\. 35–/);
  assert.match(h.html(), /If you read tonight/);
  assert.doesNotMatch(h.html(), /class="prow"/);   // not listed as a pause
  h.click("studyunskip");
  assert.deepEqual(h.saved().study.pauses, []);
  assert.match(h.html(), /Before you read/);
});

test("a question on a page number two books share lands in its own reading", async () => {
  // Printed p. 466 is in Mayo's Gallstones chapter and in Yamada's Nutrition Support.
  const qs = [
    {id: "g-1", item: "c40", page: 466, q: "A gallstones question.", a: ["Mayo"]},
    {id: "n-1", item: "y1", page: 466, q: "A nutrition question.", a: ["Yamada"]},
  ];
  const h = await phone("2026-10-06", withStudy({"2026-10-05": 13}), {pw: PW, file: encrypt({v: 1, q: qs}, PW, {iter: 1000})});
  assert.deepEqual(h.val("StudyQ.list.map(x => [x.id, x.i])"), [["n-1", 13], ["g-1", h.val("studyItemStart(STUDY_BY_ID.c40)") + 11]]);
  // Tonight is Yamada pp. 466-469: only the nutrition question is asked.
  assert.match(h.html(), /A nutrition question\./);
  assert.doesNotMatch(h.html(), /A gallstones question\./);
});

test("no question file yet: no card, no lock", async () => {
  const h = await phone("2026-09-30", undefined, {file: null});
  assert.equal(h.val("StudyQ.status"), "none");
  assert.doesNotMatch(h.html(), /qcard/);
});
