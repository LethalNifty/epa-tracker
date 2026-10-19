"use strict";
// Landmark trials: the curated cards (trials.js), their search, and the
// Trials view in Guides with its links to guideline topics and IBD drugs.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {load, state, ROOT} = require("./harness");

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
// The app's own escaping, to find a field's text in the markup.
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
    for (const f of ["n", "au", "j", "line", "design", "why", "q", "who", "use", "arms", "res", "now"])
      assert.ok(typeof t[f] === "string" && t[f].length > 2, t.id + " is missing " + f);
    // Limitations: two or three short points, in place of the old one-line catch.
    assert.ok(Array.isArray(t.lim) && t.lim.length >= 2 && t.lim.length <= 3, t.id + " limitations");
    for (const l of t.lim) assert.ok(typeof l === "string" && l.length > 8 && l.length <= 170, t.id + " limitation: " + l);
    // The old one-line catch stays for the fellows' edition, which keeps the old card.
    assert.ok(typeof t.catch === "string" && t.catch.length > 8, t.id + " catch");
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
  // Biopsy last: the view used least.
  const order = ["Guidelines", "Trials", "IBD drugs", "Biopsy"].map(l => html.indexOf(`>${l}</button>`));
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

test("tapping a trial opens its card: why, the question, who and who it's for, result, what changed, limitations, Canada and links", () => {
  const h = trialsTab();
  h.click("guidestrtoggle", {id: "confirm"});
  const c = card(h.html(), "confirm");
  const t = h.val("TRIALS_BY_ID.confirm");
  assert.match(c, /<article class="lt open/);
  // Why they did it and what they asked come first, before who was in it.
  const why = c.indexOf("Why they did it"), q = c.indexOf('class="lt-q"'), who = c.indexOf(">Who<");
  assert.ok(why > 0 && why < q && q < who, "why, then the question, then who");
  assert.ok(c.includes(t.why.slice(0, 30)));
  assert.match(c, /<dt class="mono">Use for<\/dt><dd>/);
  assert.match(c, /32% vs 17%/);
  assert.doesNotMatch(c, /The catch/);
  const lims = /<h4 class="mono">[^]*?Limitations<\/h4><ul class="dl">([^]*?)<\/ul>/.exec(c);
  assert.ok(lims, "a Limitations list");
  assert.equal((lims[1].match(/<li>/g) || []).length, t.lim.length);
  assert.match(c, /In Canada/);
  assert.match(c, /pubmed\.ncbi\.nlm\.nih\.gov\/33657294/);
  assert.match(c, /doi\.org\/10\.1056\/NEJMoa2008290/);
  assert.match(c, /data-action="guidesopen" data-id="ascites"/);
  h.click("guidestrtoggle", {id: "confirm"});
  assert.doesNotMatch(card(h.html(), "confirm"), /Limitations/);
});

test("the fellows' edition keeps the old card: the question, who, the catch; no why, use or limitations", () => {
  const h = load({today: "2026-10-12", edition: "fellows", state: state({}, {setup: {d: "2026-10-01"}})});
  h.run(`guidesAccept(${JSON.stringify(LIB)}); guidesRedraw();`);
  h.click("tab", {page: "guides"});
  h.click("guidestab", {tab: "t"});
  h.click("guidestrtoggle", {id: "confirm"});
  const c = card(h.html(), "confirm");
  assert.match(c, /The catch<\/h4><p>/);
  assert.ok(c.includes(esc(h.val("TRIALS_BY_ID.confirm.catch"))));
  assert.match(c, /class="lt-q"/);
  assert.doesNotMatch(c, /Why they did it|Use for|Limitations/);
  // A weekly-watch trial opens to its note alone.
  h.click("guidestrwtoggle", {id: "42815507"});
  const body = h.html().slice(h.html().indexOf('class="ltw-body"'));
  assert.match(body, /^class="ltw-body"><p>Noninferiority trial/);
  assert.doesNotMatch(body.slice(0, body.indexOf("</article>")), /Why they did it|Use for|Limitations/);
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

// ---- New from the weekly watch ---------------------------------------------------------------
const WATCH = LIB.tr || [];
// A phone whose guideline news is already seen, so only the watch's trials can light a dot.
function watchPhone(page = "week") {
  const h = load({today: "2026-10-12"});
  h.run(`guidesAccept(${JSON.stringify(LIB)}); Store.markGuidesSeen(guidesNews(Guides.data.topics, getToday()).map(n => n.k)); guidesRedraw();`);
  if (page) h.click("tab", {page});
  return h;
}
const rows = html => (html.match(/<article class="ltw[ "]/g) || []).length;

test("the watch's trials in guides.json: our own gist, a real topic, a link, newest first", () => {
  assert.ok(WATCH.length >= 8);
  const topics = new Set(LIB.topics.map(t => t.id));
  for (const r of WATCH) {
    assert.match(r.k, /^\d+$/);
    assert.match(r.d, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(r.u, /^https:\/\//);
    assert.ok(["NEJM", "Lancet", "JAMA"].includes(r.w), r.w);
    assert.ok(r.t && r.t.length <= 80, r.k + " gist");
    assert.ok(topics.has(r.tp), r.k + " topic " + r.tp);
    // The same few lines as a landmark card: why, the question, who, who it's for, limitations.
    for (const f of ["why", "q", "who", "use"]) assert.ok(typeof r[f] === "string" && r[f].length > 8, r.k + " is missing " + f);
    assert.ok(Array.isArray(r.lim) && r.lim.length >= 2 && r.lim.length <= 3, r.k + " limitations");
    for (const l of r.lim) assert.ok(typeof l === "string" && l.length > 8 && l.length <= 170, r.k + " limitation: " + l);
    assert.deepEqual([r.n, r.t, r.x, r.why, r.q, r.who, r.use, ...r.lim].filter(s => /[—–]/.test(s)), [], r.k + " has a long dash");
  }
  assert.deepEqual(WATCH.map(r => r.d), WATCH.map(r => r.d).slice().sort().reverse());
});

test("Trials opens with the running list from the weekly watch, newest first, four then all", () => {
  const h = watchPhone("guides");
  h.click("guidestab", {tab: "t"});
  let html = h.html();
  assert.match(html, /New from the weekly watch<\/span><span>8<\/span>/);
  assert.equal(rows(html), 4);
  assert.ok(html.indexOf("RESOLVE") < html.indexOf("REFIT2"), "newest first");
  assert.ok(html.indexOf("New from the weekly watch") < html.indexOf('id="trialsq"'), "above the search");
  assert.match(html, /data-action="guidestrwmore">Show all 8</);
  h.click("guidestrwmore");
  html = h.html();
  assert.equal(rows(html), 8);
  assert.doesNotMatch(html, /guidestrwmore/);
  // A section chip or a search hides the running list.
  h.click("guidestrchip", {chip: "liver"});
  assert.doesNotMatch(h.html(), /New from the weekly watch/);
});

test("a watch trial opens like a landmark card: why, the question, who, who it's for, what they found, limitations, its topic and the paper", () => {
  const h = watchPhone("guides");
  h.click("guidestab", {tab: "t"});
  assert.doesNotMatch(h.html(), /class="ltw-body"/);
  h.click("guidestrwtoggle", {id: "42815507"});
  const html = h.html();
  const r = WATCH.find(x => x.k === "42815507");
  assert.match(html, /<article class="ltw open" id="tw-42815507">/);
  const body = html.slice(html.indexOf('class="ltw-body"'), html.indexOf("</article>", html.indexOf('class="ltw-body"')));
  const at = s => body.indexOf(s);
  assert.ok(at("Why they did it") > 0 && at("Why they did it") < at('class="lt-q"') && at('class="lt-q"') < at(">Who<") &&
    at(">Who<") < at(">Use for<") && at(">Use for<") < at("What they found") && at("What they found") < at("Limitations"), "in order");
  assert.ok(body.includes(esc(r.why).slice(0, 30)) && body.includes(esc(r.q)));
  assert.match(body, /SVR12 was 98.8%/);
  assert.equal((/Limitations<\/h4><ul class="dl">([^]*?)<\/ul>/.exec(body)[1].match(/<li>/g) || []).length, r.lim.length);
  assert.match(html, /data-action="guidesopen" data-id="hcv"/);
  assert.match(html, /href="https:\/\/doi.org\/10.1016\/S0140-6736\(26\)01380-2"/);
  assert.match(html, /href="https:\/\/pubmed.ncbi.nlm.nih.gov\/42815507\/"/);
  h.click("guidesopen", {id: "hcv"});
  assert.equal(h.val("guidesTab"), "g");
});

test("new watch trials light the bar and the Trials switch until Trials is opened; the rows keep their dots that visit", () => {
  const h = watchPhone("week");
  assert.equal(h.val("trialsWatchUnseenCount()"), 8);
  assert.match(h.html(), /data-page="guides">.*class="nvdot"/);
  h.click("tab", {page: "guides"});
  assert.match(h.html(), /data-tab="t">Trials<i class="gdot"/);
  h.click("guidestab", {tab: "t"});
  assert.ok(h.saved().guides.seen.includes("tr:42815507"));
  assert.equal(h.val("trialsWatchUnseenCount()"), 0);
  assert.equal((h.html().match(/class="gdot"/g) || []).length, 4);
  h.click("guidestab", {tab: "g"});
  assert.doesNotMatch(h.html(), /data-tab="t">Trials<i class="gdot"/);
  h.click("tab", {page: "week"});
  assert.doesNotMatch(h.html(), /class="nvdot"/);
  h.click("tab", {page: "guides"});
  h.click("guidestab", {tab: "t"});
  assert.doesNotMatch(h.html(), /class="gdot"/);
});

test("searching Trials finds the watch's trials too", () => {
  const h = watchPhone("guides");
  h.click("guidestab", {tab: "t"});
  h.run(`trialsTerm = "bepirovirsen"; render();`);
  let html = h.html();
  assert.match(html, /From the weekly watch<\/span><span class="mono n">1</);
  assert.match(html, /id="tw-42206582"/);
  assert.doesNotMatch(html, /No trial matches/);
  h.run(`trialsTerm = "hepatitis b"; render();`);   // by its topic's name
  assert.match(h.html(), /id="tw-42206582"/);
  h.run(`trialsTerm = "zzqx"; render();`);
  html = h.html();
  assert.doesNotMatch(html, /From the weekly watch/);
  assert.match(html, /No trial matches/);
});

test("the library takes only well-formed watch trials, and one with a landmark card is left to the card", () => {
  const h = load({today: "2026-10-12"});
  const lib = {...LIB, tr: [
    {k: "1", w: "NEJM", d: "2026-10-01", n: "OK", t: "Kept", x: "", u: "https://doi.org/x", tp: "hcv",
      why: "Because", q: 7, lim: ["One", 2, "Three", "Four"]},
    {k: "2", w: "NEJM", d: "2026-10-02", n: "Bad link", t: "Dropped", u: "javascript:alert(1)", tp: "hcv"},
    {k: "3", w: "NEJM", d: "Oct 2026", n: "Bad date", t: "Dropped", u: "https://doi.org/y", tp: "hcv"},
    {k: "4", w: "Lancet", d: "2026-09-01", n: "No topic", t: "Kept, no topic", u: "https://doi.org/z", tp: "nowhere"},
    {k: "19474425", w: "NEJM", d: "2026-09-02", n: "AIM", t: "Has a landmark card", u: "https://doi.org/w", tp: "barretts"}]};
  h.run(`guidesAccept(${JSON.stringify(lib)});`);
  assert.deepEqual(h.val("Guides.data.trials.map(r => r.k)"), ["1", "19474425", "4"]);
  assert.equal(h.val("Guides.data.trials[2].tp"), null);
  assert.deepEqual(h.val("trialsWatch(Guides.data).map(r => r.k)"), ["1", "4"]);
  // The extra lines keep only text, and three limitations at most.
  const r = h.val("Guides.data.trials[0]");
  assert.deepEqual([r.why, r.q, r.who, r.use, r.lim], ["Because", "", "", "", ["One", "Three", "Four"]]);
  // An older entry with none of them still opens to its note alone.
  h.run(`guidesAccept(${JSON.stringify({...LIB, tr: [{k: "5", w: "NEJM", d: "2026-10-01", t: "Gist", x: "The note.", u: "https://doi.org/v", tp: "hcv"}]})}); trialsWatchOpen.add("5");`);
  h.click("tab", {page: "guides"});
  h.click("guidestab", {tab: "t"});
  const open = h.html().slice(h.html().indexOf('id="tw-5"'));
  assert.match(open, /<div class="ltw-body"><p>The note\.<\/p>/);
  assert.doesNotMatch(open.slice(0, open.indexOf("</article>")), /Why they did it|Limitations/);
  const old = {...LIB};
  delete old.tr;
  h.run(`guidesAccept(${JSON.stringify(old)});`);
  assert.deepEqual(h.val("Guides.data.trials"), []);
});
