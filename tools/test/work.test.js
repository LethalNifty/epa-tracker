"use strict";
// For your CV: talks, abstracts and posters, papers and teaching, kept in
// Year 1 so far as they happen; Copy gives the list to paste into a CV. In the
// saved state, so it goes in the backup. Full app only. Placeholder titles only.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, state} = require("./harness");

const typeIn = (h, f, value) => h.fire("input", {dataset: {work: f}, value});
function phone() {
  const h = load({today: "2026-11-15", state: state({})});
  h.run(`route = {page: "plan"}; render();`);
  h.click("reviewopen");
  return h;
}
function add(h, k, t, d, w, n) {
  h.click("reviewworknew");
  h.click("reviewworkkind", {k});
  typeIn(h, "t", t); typeIn(h, "d", d);
  if (w) typeIn(h, "w", w);
  if (n) typeIn(h, "n", n);
  h.click("reviewworksave");
}

test("an empty list says what it's for; Add opens its sheet over Year 1 so far", () => {
  const h = phone();
  assert.match(h.html(), /<span>For your CV<\/span>/);
  assert.match(h.html(), /Add each one as it happens, and Copy gives you the list to paste into your CV\./);
  assert.doesNotMatch(h.html(), /reviewworkcopy/);
  h.click("reviewworknew");
  assert.match(h.html(), /aria-label="Add to your CV list"/);
  assert.match(h.html(), /aria-label="Year 1 so far"/, "Year 1 so far stays under it");
  h.click("reviewworksave");
  assert.match(h.html(), /Give it a title first\./);
});

test("added items show newest first, and Copy gives them by kind, one line each", () => {
  const h = phone();
  add(h, "talk", "A teaching talk on a motility topic", "2026-10-05", "Motility rounds");
  add(h, "abstract", "A case report", "2026-10-15", "A national meeting", "Submitted");
  add(h, "talk", "A guideline discussion", "2026-10-06", "GI rounds");
  const saved = h.saved().work;
  assert.equal(saved.length, 3);
  assert.deepEqual(saved.map(x => x.k).sort(), ["abstract", "talk", "talk"]);
  const html = h.html(), at = s => html.indexOf(s);
  assert.ok(at("A case report") < at("A guideline discussion") && at("A guideline discussion") < at("A teaching talk"), "newest first");
  assert.match(html, /<span>Abstract or poster · A national meeting · Submitted<\/span>/);
  assert.equal(h.val("workText()"), "Talks\n- A guideline discussion. GI rounds. 6 Oct 2026.\n- A teaching talk on a motility topic. Motility rounds. 5 Oct 2026.\n\n" +
    "Abstracts and posters\n- A case report. A national meeting. 15 Oct 2026. Submitted.");
  // A phone that can't copy shows the text to select instead.
  h.run(`navigator.clipboard = {writeText: () => Promise.reject(new Error("no"))}`);
  h.click("reviewworkcopy");
  return new Promise(r => setTimeout(r, 20)).then(() => {
    h.run("render()");
    assert.match(h.html(), /<textarea class="cv-show mono" readonly[^>]*>Talks\n- A guideline discussion/);
  });
});

test("an item can be changed or deleted, with Undo", () => {
  const h = phone();
  add(h, "paper", "A retrospective cohort", "2026-11-01", "A journal", "In preparation");
  const id = h.saved().work[0].id;
  h.click("reviewworkopen", {id});
  assert.match(h.html(), /aria-label="Edit"/);
  typeIn(h, "n", "Submitted");
  h.click("reviewworksave");
  assert.equal(h.saved().work[0].n, "Submitted");
  h.click("reviewworkopen", {id});
  h.click("reviewworkdel");
  assert.deepEqual(h.saved().work, []);
  h.click("undo");
  assert.equal(h.saved().work[0].t, "A retrospective cohort");
});

test("the list goes in the backup and comes back with it; damaged entries are dropped", () => {
  const h = phone();
  add(h, "teach", "Small-group teaching", "2026-11-10", "Third-year students");
  const backup = h.val("Store.exportJSON()");
  const h2 = load({today: "2026-11-15"});
  assert.equal(h2.val(`Store.importJSON(${JSON.stringify(backup)}).ok`), true);
  assert.equal(h2.saved().work[0].t, "Small-group teaching");
  assert.deepEqual(h2.val(`workClean([{t: "", d: "2026-11-01"}, {t: "No day"}, {t: "Kept", d: "2026-11-01", k: "nonsense"}]).map(x => [x.t, x.k])`), [["Kept", "other"]]);
});

test("the fellows' edition has no Year 1 so far, so no list", () => {
  const f = load({today: "2026-11-15", edition: "fellows", state: state({}, {setup: {d: "2026-07-01"}})});
  f.run(`route = {page: "plan"}; render();`);
  assert.doesNotMatch(f.html(), /reviewopen|For your CV/);
});

// Paste a list: a whole list at once, the way Copy writes it (or close to it).
const PASTE = [
  "Talks",
  "- A guideline discussion. GI rounds. 6 Oct 2026.",
  "- A talk on one thing vs. another. Motility rounds. 5 Oct 2026.",
  "",
  "Abstracts and posters",
  "- A case report. A national meeting. 15 Oct 2026. Submitted.",
  "- A line with no day. A meeting.",
  "Papers:",
  "\u2022 A cohort study. A journal. Oct 30, 2026. In preparation",
  "1. A second paper. 2026-11-02.",
].join("\n");
const rows = h => h.saved().work.map(x => [x.k, x.t, x.d, x.w, x.n]);

test("Paste a list adds each line under its heading, says first what it will do, and Undo takes them all back", () => {
  const h = phone();
  assert.match(h.html(), /data-action="reviewworkpaste">Paste a list</);
  h.click("reviewworkpaste");
  assert.match(h.html(), /aria-label="Paste a list"/);
  assert.match(h.html(), /aria-label="Year 1 so far"/, "Year 1 so far stays under it");
  typeIn(h, "text", PASTE);
  h.run("render()");
  assert.match(h.html(), /5 to add · 1 line with no day, left out/);
  h.click("reviewworkpastesave");
  assert.deepEqual(rows(h), [
    ["talk", "A guideline discussion", "2026-10-06", "GI rounds", ""],
    ["talk", "A talk on one thing vs. another", "2026-10-05", "Motility rounds", ""],
    ["abstract", "A case report", "2026-10-15", "A national meeting", "Submitted"],
    ["paper", "A cohort study", "2026-10-30", "A journal", "In preparation"],
    ["paper", "A second paper", "2026-11-02", "", ""],
  ]);
  assert.doesNotMatch(h.html(), /aria-label="Paste a list"/, "the sheet closes");
  assert.match(h.html(), /Added 5 to your CV list/);
  h.click("undo");
  assert.deepEqual(h.saved().work, []);
});

test("pasting the same list again adds nothing and says so", () => {
  const h = phone();
  h.click("reviewworkpaste"); typeIn(h, "text", PASTE); h.click("reviewworkpastesave");
  h.click("reviewworkpaste"); typeIn(h, "text", PASTE + "\n- A guideline discussion. GI rounds. 6 Oct 2026.");
  h.run("render()");
  assert.match(h.html(), /0 to add · 5 already on the list · 1 line with no day, left out/);
  h.click("reviewworkpastesave");
  assert.match(h.html(), /Nothing new to add\. Each line needs a day, like 5 Oct 2026\./);
  assert.equal(h.saved().work.length, 5);
});

test("what Copy gives pastes back the same", () => {
  const h = phone();
  add(h, "talk", "A teaching talk on a motility topic", "2026-10-05", "Motility rounds");
  add(h, "abstract", "A case report", "2026-10-15", "A national meeting", "Submitted");
  add(h, "teach", "Small-group teaching", "2026-11-10");
  add(h, "other", "A committee", "2026-09-01", "The program", "Fellow member");
  const text = h.val("workText()"), was = rows(h).sort();
  const h2 = phone();
  h2.click("reviewworkpaste"); typeIn(h2, "text", text); h2.click("reviewworkpastesave");
  assert.deepEqual(rows(h2).sort(), was);
});

test("the day can be written a few ways; a day that can't be is not taken", () => {
  const h = phone(), day = (s, y, m, d) => h.val(`workDayOf(${JSON.stringify(s)}, new Date(${y}, ${m - 1}, ${d}))`);
  assert.equal(day("5 Oct 2026", 2026, 11, 15), "2026-10-05");
  assert.equal(day("October 5, 2026", 2026, 11, 15), "2026-10-05");
  assert.equal(day("Sept 3 2026.", 2026, 11, 15), "2026-09-03");
  assert.equal(day("2026-10-05", 2026, 11, 15), "2026-10-05");
  assert.equal(day("23 Nov", 2026, 11, 15), "2026-11-23", "no year: this year");
  assert.equal(day("20 Dec", 2026, 1, 10), "2025-12-20", "no year, and this year's would be months ahead: last year");
  for (const s of ["31 Feb 2026", "2026-02-31", "Day 12", "CDDW 2027", "GI rounds"]) assert.equal(day(s, 2026, 11, 15), null, s);
});
