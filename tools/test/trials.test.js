"use strict";
// Landmark trials: the curated cards (trials.js), their search, and the
// Trials view in Guides with its links to guideline topics and IBD drugs.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {load, ROOT} = require("./harness");

const LIB = JSON.parse(fs.readFileSync(path.join(ROOT, "guides.json"), "utf8"));
// A phone with the guideline library loaded, on the Guides tab unless told otherwise.
function phone(today = "2026-10-12", page = "guides") {
  const h = load({today});
  h.run(`guidesAccept(${JSON.stringify(LIB)}); guidesRedraw();`);
  if (page) h.click("tab", {page});
  return h;
}
function trialsTab(today) {
  const h = phone(today);
  h.click("guidestab", {tab: "t"});
  return h;
}
// The markup of one trial card.
function card(html, id) {
  const at = html.indexOf(`id="t-${id}"`);
  assert.ok(at > 0, "no card for " + id);
  return html.slice(html.lastIndexOf("<article", at), html.indexOf("</article>", at));
}
const ids = (h, q) => h.val(`trialsSearch(TRIALS, ${JSON.stringify(q)}).map(t => t.id)`);

// ---- The cards -------------------------------------------------------------------------------
test("the trial file: 48 cards, each complete, each under a real guideline topic", () => {
  const h = load({today: "2026-10-12"});
  const trials = h.val("TRIALS");
  assert.equal(trials.length, 48);
  const topics = new Map(LIB.topics.map(t => [t.id, t]));
  const seen = new Set();
  for (const t of trials) {
    assert.match(t.id, /^[a-z0-9-]+$/);
    assert.ok(!seen.has(t.id), "duplicate id " + t.id); seen.add(t.id);
    assert.ok(t.tp.length >= 1 && t.tp.every(x => topics.has(x)), t.id + " topics " + t.tp);
    assert.equal(t.s, topics.get(t.tp[0]).s, t.id + " sits in its first topic's section");
    for (const f of ["n", "au", "j", "line", "design", "q", "who", "arms", "res", "now", "catch"])
      assert.ok(typeof t[f] === "string" && t[f].length > 2, t.id + " is missing " + f);
    assert.ok(t.y >= 1950 && t.y <= 2026, t.id + " year " + t.y);
    assert.ok(t.key && t.key.v && t.key.l, t.id + " key result");
    assert.match(t.pmid, /^\d{6,9}$/, t.id + " PubMed id");
    assert.match(t.doi, /^10\.\d{4,}\/\S+$/, t.id + " DOI");
  }
  // Grouped like the guideline library, oldest first within a section.
  const order = LIB.sections.map(s => s.id);
  for (let i = 1; i < trials.length; i++) {
    const a = trials[i - 1], b = trials[i];
    const sa = order.indexOf(a.s), sb = order.indexOf(b.s);
    assert.ok(sa < sb || (sa === sb && a.y <= b.y), a.id + " before " + b.id);
  }
});

test("cards read the Canadian way: SI units, Canadian drug names, no em-dashes", () => {
  const h = load({today: "2026-10-12"});
  const text = h.val("TRIALS").map(t => JSON.stringify(t)).join("\n");
  assert.doesNotMatch(text, /—/);
  for (const bad of [/mg\/dL/i, /g\/dL/i, /per deciliter/i, /paracetamol/i, /ciclosporin/i, /lactated Ringer/i, /\baspirin\b/i, /ursodeoxycholic/i, /elentra/i])
    assert.doesNotMatch(text, bad);
});

test("Canadian-led trials are marked, and Canadian notes say where Canada differs", () => {
  const h = load({today: "2026-10-12"});
  assert.deepEqual(h.val("TRIALS.filter(t => t.ca).map(t => t.id)"), ["compass-ppi", "confirm"]);
  assert.match(h.val("TRIALS_BY_ID.confirm.canada"), /terlipressin/i);
  assert.match(h.val("TRIALS_BY_ID.essence.canada"), /Health Canada/);
  assert.match(h.val("TRIALS_BY_ID['nor-switch'].canada"), /Manitoba/);
});

test("IBD trials link to the IBD drug cards", () => {
  const h = load({today: "2026-10-12"});
  const drugs = new Set(h.val("IBD_DRUGS.map(d => d.id)"));
  for (const t of h.val("TRIALS")) for (const d of t.drugs || []) assert.ok(drugs.has(d), t.id + " drug " + d);
  assert.deepEqual(h.val("TRIALS_BY_ID.sonic.drugs"), ["infliximab", "thiopurines"]);
  assert.deepEqual(h.val("TRIALS_BY_ID.varsity.drugs"), ["vedolizumab", "adalimumab"]);
});

// ---- Search and lookups -----------------------------------------------------------------------
test("search finds a trial by its name, author, drug or condition", () => {
  const h = load({today: "2026-10-12"});
  assert.equal(ids(h, "predesci")[0], "predesci");
  assert.equal(ids(h, "terlipressin")[0], "confirm");
  assert.equal(ids(h, "Ogilvie")[0], "ponec");
  assert.equal(ids(h, "tranexamic")[0], "halt-it");
  assert.equal(ids(h, "TXA")[0], "halt-it");
  assert.equal(ids(h, "biosimilar")[0], "nor-switch");
  assert.equal(ids(h, "LIR!C")[0], "lirc");
  assert.deepEqual(ids(h, "Villanueva").slice(0, 2).sort(), ["predesci", "villanueva-2013"]);
  assert.deepEqual(ids(h, "zzqx"), []);
  assert.equal(ids(h, "").length, 48);
});

test("each guideline topic knows its landmark trials, oldest first", () => {
  const h = load({today: "2026-10-12"});
  assert.deepEqual(h.val(`trialsForTopic("acute-pancreatitis").map(t => t.id)`), ["python", "poncho", "apec", "waterfall"]);
  assert.deepEqual(h.val(`trialsForTopic("gerd").map(t => t.id)`), []);
});

test("this block's trials follow this block's guideline topics", () => {
  const h = phone("2026-10-12", null);
  // Block 4, Motility/Nutrition.
  assert.deepEqual(h.val(`trialsForBlock(Guides.data.topics, 4).map(t => t.id)`), ["werner-poem", "treet", "ponec", "epanic", "effort"]);
});

// ---- The view ---------------------------------------------------------------------------------
test("Trials is the second view in Guides, grouped by section, one card per trial", () => {
  const html = trialsTab().html();
  assert.match(html, /class="segtabs four"/);
  const order = ["Guidelines", "Trials", "Biopsy", "IBD drugs"].map(l => html.indexOf(`>${l}</button>`));
  assert.ok(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), "tab order " + order);
  assert.match(html, /data-tab="t" aria-current="page">Trials</);
  assert.equal((html.match(/<article class="lt[ "]/g) || []).length, 48);
  for (const s of ["Esophagus", "IBD", "Bleeding", "Liver", "Nutrition"]) assert.match(html, new RegExp(`<span class="mono">${s}</span>`));
  // Closed, a card still gives the bottom line.
  assert.match(card(html, "halt-it"), /did not reduce deaths/);
});

test("a closed card's corner keeps long journal names short", () => {
  const html = trialsTab().html();
  assert.match(card(html, "boss"), /<span class="lt-cite mono">Gastro<span class="yr">2025<\/span>/);
  assert.match(card(html, "profile"), /<span class="lt-cite mono">Lancet Gastro<span class="yr">2024<\/span>/);
  assert.match(card(html, "sung-2010"), /<span class="lt-cite mono">Annals<span class="yr">2010<\/span>/);
});

test("the monitor spans the trials' years and counts the Canadian-led ones", () => {
  const html = trialsTab().html();
  assert.match(html, /class="monitor guidemon ltmon/);
  assert.match(html, />1955</);
  assert.match(html, /48 trials/);
});

test("tapping a trial opens its card: result, what changed, the catch, Canada and links", () => {
  const h = trialsTab();
  h.click("guidestrtoggle", {id: "confirm"});
  const c = card(h.html(), "confirm");
  assert.match(c, /<article class="lt open/);
  assert.match(c, /32% vs 17%/);
  assert.match(c, /The catch/);
  assert.match(c, /In Canada/);
  assert.match(c, /pubmed\.ncbi\.nlm\.nih\.gov\/33657294/);
  assert.match(c, /doi\.org\/10\.1056\/NEJMoa2008290/);
  assert.match(c, /data-action="guidesopen" data-id="ascites"/);
  h.click("guidestrtoggle", {id: "confirm"});
  assert.doesNotMatch(card(h.html(), "confirm"), /The catch/);
});

test("an IBD trial card links to its drugs", () => {
  const h = trialsTab();
  h.click("guidestrtoggle", {id: "sonic"});
  const c = card(h.html(), "sonic");
  assert.match(c, /data-action="guidesdopen" data-id="infliximab"/);
  assert.match(c, /data-action="guidesdopen" data-id="thiopurines"/);
});

test("a trial link opens Guides at that trial from any page", () => {
  const h = phone("2026-10-12", "week");
  h.click("guidestropen", {id: "sonic"});
  assert.equal(h.val("route.page"), "guides");
  assert.equal(h.val("guidesTab"), "t");
  assert.match(card(h.html(), "sonic"), /<article class="lt open/);
});

test("search and section chips narrow the list", () => {
  const h = trialsTab();
  h.run(`trialsTerm = "albumin"; render();`);
  let html = h.html();
  assert.match(html, /id="t-sort-1999"/);
  assert.match(html, /id="t-attire"/);
  assert.doesNotMatch(html, /id="t-sonic"/);
  h.run(`trialsTerm = ""; render();`);
  h.click("guidestrchip", {chip: "pancreas"});
  html = h.html();
  assert.equal((html.match(/<article class="lt[ "]/g) || []).length, 6);
  h.click("guidestrchip", {chip: "block"});
  html = h.html();
  for (const id of ["werner-poem", "treet", "ponec", "epanic", "effort"]) assert.match(html, new RegExp(`id="t-${id}"`));
  assert.doesNotMatch(html, /id="t-sonic"/);
});

test("Trials works before the guideline library has downloaded", () => {
  const h = load({today: "2026-10-12"});
  h.click("tab", {page: "guides"});
  h.click("guidestab", {tab: "t"});
  const html = h.html();
  assert.equal((html.match(/<article class="lt[ "]/g) || []).length, 48);
  assert.match(html, /<span class="mono">Liver<\/span>/);
});

// ---- Links from the guideline library -----------------------------------------------------------
test("a guideline topic lists its landmark trials, each opening the trial card", () => {
  const h = phone();
  h.click("guidestoggle", {id: "upper-gi-bleeding"});
  const html = h.html();
  assert.match(html, /Landmark trials/);
  assert.match(html, /data-action="guidestropen" data-id="villanueva-2013"/);
  assert.match(html, /data-action="guidestropen" data-id="halt-it"/);
});

test("searching the guideline library also finds trials by name", () => {
  const h = phone();
  h.run(`guidesTerm = "PREDESCI"; render();`);
  assert.match(h.html(), /data-action="guidestropen" data-id="predesci"/);
  h.run(`guidesTerm = "zzqx"; render();`);
  assert.doesNotMatch(h.html(), /data-action="guidestropen"/);
});
