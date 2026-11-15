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
