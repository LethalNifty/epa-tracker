"use strict";
// Endo's Earlier list draws a page at a time, so a long log stays quick on the
// phone, and its search waits for a pause in typing before it redraws.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, state} = require("./harness");

// Placeholder staff only.
const STAFF = [{id: "sb", name: "Brook, Casey", aliases: [], hidden: false}];
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// 130 earlier cases, two a day from 15 July.
const CASES = Array.from({length: 130}, (_, k) => {
  const d = iso(new Date(2026, 6, 15 + Math.floor(k / 2)));
  return {id: "k" + k, d, staff: "sb", site: "stb", loc: "suite", urg: "elective", procs: ["egd.dx"], why: ["dysphagia"], found: [], ts: d + "T1" + (k % 2) + ":00:00.000Z"};
});
function endo() {
  const h = load({today: "2026-11-03", state: state({}, {scopes: {cases: CASES, staff: STAFF, learned: [], lastReport: null, reportName: "", hintOff: null}})});
  h.click("tab", {page: "endo"});
  h.rows = html => (html.match(/class="srow[ "]/g) || []).length;
  return h;
}

test("Earlier shows 24, then 50 more at a time", () => {
  const h = endo();
  assert.equal(h.rows(h.html()), 24);
  assert.match(h.html(), /Show 50 more/);
  h.click("scopemore");
  assert.equal(h.rows(h.html()), 74);
  h.click("scopemore");
  assert.equal(h.rows(h.html()), 124);
  assert.match(h.html(), /Show 6 more/);
  h.click("scopemore");
  assert.equal(h.rows(h.html()), 130);
  assert.doesNotMatch(h.html(), /data-action="scopemore"/);
});

test("a search shows its first 50 matches, with more after", () => {
  const h = endo();
  h.run(`scopeSearch = "brook"`);
  const html = h.val("scopeRecentHTML()");
  assert.equal(h.rows(html), 50);
  assert.match(html, /Show 50 more/);
});

test("a new search starts from its first page", () => {
  const h = endo();
  h.click("scopemore"); h.click("scopemore");
  h.fire("input", {dataset: {scopefield: "search"}, value: "brook"});
  assert.equal(h.rows(h.val("scopeRecentHTML()")), 50);
});

test("the search redraws once typing pauses, not on every letter", async () => {
  const h = endo();
  let draws = 0;
  h.els.scoperecent = {set innerHTML(v) { draws++; }, get innerHTML() { return ""; }};
  for (const v of ["b", "br", "bro"]) h.fire("input", {dataset: {scopefield: "search"}, value: v});
  assert.equal(draws, 0, "not while typing");
  await new Promise(r => setTimeout(r, 400));
  assert.equal(draws, 1);
  assert.equal(h.val("scopeSearch"), "bro");
});
