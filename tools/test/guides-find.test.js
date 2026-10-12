"use strict";
// One search in Guides: the Guidelines box also finds landmark trials, IBD
// drugs, biopsy protocols and the phone's own pearls, grouped, best kind first.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {load, state, ROOT} = require("./harness");

const LIB = JSON.parse(fs.readFileSync(path.join(ROOT, "guides.json"), "utf8"));
const PEARLS = [{id: "pa1", d: "2026-10-09", t: "Vedolizumab is gut selective, so no PML signal.", who: "Brook", topic: "", sent: null, ts: "2026-10-09T15:00:00Z"}];
function phone() {
  const h = load({today: "2026-10-12", state: state({}, {pearls: PEARLS})});
  h.run(`guidesAccept(${JSON.stringify(LIB)}); guidesRedraw();`);
  h.click("tab", {page: "guides"});
  return h;
}
const search = (h, q) => { h.run(`guidesTerm = ${JSON.stringify(q)}; render();`); return h.html(); };

test("one box finds every kind, with a count for each", () => {
  const h = phone(), html = search(h, "vedolizumab");
  const chips = html.slice(html.indexOf('class="bcats gfind"'), html.indexOf("</div>", html.indexOf('class="bcats gfind"')));
  assert.match(chips, /data-tab="g"[^>]*>[\s\S]*?Guidelines <b>\d+<\/b>/);
  assert.match(chips, /data-tab="t"[^>]*>[\s\S]*?Trials <b>[1-9]\d*<\/b>/);
  assert.match(chips, /data-tab="d"[^>]*>[\s\S]*?IBD drugs <b>[1-9]\d*<\/b>/);
  assert.match(chips, /data-tab="b" disabled[^>]*>[\s\S]*?Biopsy <b>0<\/b>/);
  assert.match(chips, /data-tab="p"[^>]*>[\s\S]*?Pearls <b>1<\/b>/);
  // Each kind opens where it lives.
  assert.match(html, /data-action="guidesdopen" data-id="vedolizumab"/);
  assert.match(html, /data-action="guidestropen" data-id="varsity"/);
  assert.match(html, /data-action="pearledit" data-id="pa1"/);
  assert.match(html, /<mark>Vedolizumab<\/mark>/);
  // The topic chips step aside while searching.
  assert.doesNotMatch(html, /class="bcats gcats"/);
});

test("the kind that matches best comes first", () => {
  const h = phone(), html = search(h, "vedolizumab");
  assert.ok(html.indexOf('data-action="guidesdopen" data-id="vedolizumab"') < html.indexOf('class="gt"'), "the drug leads the guideline topics");
  const html2 = search(h, "diverticulitis");
  assert.ok(html2.indexOf('id="g-diverticulitis"') > 0);
  assert.doesNotMatch(html2, /data-action="guidesdopen"/);
});

test("a count jumps to that part of Guides with the search carried over", () => {
  const h = phone();
  search(h, "vedolizumab");
  h.click("guidesfind", {tab: "d"});
  assert.equal(h.val("guidesTab"), "d");
  assert.equal(h.val("ibdTerm"), "vedolizumab");
  h.run(`guidesTab = "g"; render();`);
  h.click("guidesfind", {tab: "t"});
  assert.equal(h.val("guidesTab"), "t");
  assert.equal(h.val("trialsTerm"), "vedolizumab");
  h.run(`guidesTab = "g"; guidesTerm = "celiac"; render();`);
  h.click("guidesfind", {tab: "b"});
  assert.equal(h.val("guidesTab"), "b");
  assert.equal(h.val("biopsyTerm"), "celiac");
  h.run(`guidesTab = "g"; guidesTerm = "vedolizumab"; render();`);
  h.click("guidesfind", {tab: "p"});
  assert.equal(h.val("route.page"), "pearls");
  assert.equal(h.val("pearlsQ"), "vedolizumab");
});

test("long lists show their best three and an All link", () => {
  const h = phone(), html = search(h, "cirrhosis");
  const n = h.val(`trialsSearch(TRIALS, "cirrhosis").length`);
  assert.ok(n > 3, "cirrhosis finds more than three trials");
  assert.match(html, new RegExp(`data-action="guidesfind" data-tab="t">All ${n} in Trials`));
});

test("nothing found says so once", () => {
  const h = phone(), html = search(h, "zzqx");
  assert.match(html, /Nothing in Guides matches/);
  assert.doesNotMatch(html, /class="bgrp"/);
});
