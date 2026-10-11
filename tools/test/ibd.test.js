"use strict";
// IBD drugs: the third Guides view. The data (ibd.js) is checked for shape,
// sources and wording; the view (ibd-view.js) is driven through the app's own
// taps on a phone with the guideline library loaded.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {load, ROOT} = require("./harness");

const LIB = JSON.parse(fs.readFileSync(path.join(ROOT, "guides.json"), "utf8"));
// A phone on Guides, switched to IBD drugs unless told otherwise.
function phone(tab = "d") {
  const h = load({today: "2026-10-11"});
  h.run(`guidesAccept(${JSON.stringify(LIB)}); guidesRedraw();`);
  h.click("tab", {page: "guides"});
  if (tab) h.click("guidestab", {tab});
  return h;
}
const H = load({today: "2026-10-11"});
const DRUGS = H.val("IBD_DRUGS"), SRC = H.val("IBD_SRC"), BASE = H.val("IBD_BASE"), PREP = H.val("IBD_PREP");
const SITS = H.val("IBD_SITS"), CLASSES = H.val("IBD_CLASSES");
const byId = Object.fromEntries(DRUGS.map(d => [d.id, d]));
const keys = line => String(line[1] || "").split(/\s+/).filter(Boolean);
// Every [text, sources] line in the data, with where it sits.
function allLines() {
  const out = [];
  for (const d of DRUGS) {
    const add = (where, ls) => ls.forEach(l => out.push({where: d.id + " " + where, l}));
    add("how", [d.how]); add("use", d.use); add("dose", d.dose); add("avoid", d.avoid); add("harm", d.harm); add("preg", d.preg);
    add("monitor", d.monitor); add("before", d.before.extra);
    if (d.warn) add("warn", [d.warn]);
    if (d.differ) add("differ", d.differ);
  }
  for (const [id, l] of Object.entries(BASE)) out.push({where: "base " + id, l});
  for (const [k, ls] of Object.entries(PREP)) ls.forEach(l => out.push({where: "prep " + k, l}));
  for (const s of SITS) {
    out.push({where: "sit " + s.id, l: [s.sum, s.src]});
    for (const [id, r] of Object.entries(s.r)) out.push({where: "sit " + s.id + " " + id, l: [r[1], r[2]]});
  }
  return out;
}

// ---- The data -------------------------------------------------------------------------------
test("one entry for every IBD drug sold in Canada", () => {
  assert.deepEqual(DRUGS.map(d => d.id), ["mesalamine", "sulfasalazine", "budesonide", "steroids", "thiopurines", "mtx", "cyclosporine",
    "infliximab", "adalimumab", "golimumab", "certolizumab", "vedolizumab", "ustekinumab", "risankizumab", "mirikizumab", "guselkumab",
    "tofacitinib", "upadacitinib", "ozanimod", "etrasimod"]);
  // Not sold here: listed apart, never as a card.
  assert.ok(H.val("IBD_SOON").some(([n]) => /filgotinib/i.test(n)));
  assert.ok(!DRUGS.some(d => /filgotinib|jyseleca/i.test(d.n + d.brands)));
});

test("every card has the parts a card needs", () => {
  const cls = new Set(CLASSES.map(c => c.id));
  for (const d of DRUGS) {
    assert.ok(cls.has(d.cls), d.id + " class");
    assert.ok(d.n && d.brands && d.k !== undefined, d.id);
    assert.ok(d.dz.length && d.dz.every(z => z === "uc" || z === "cd"), d.id + " disease");
    assert.ok(d.route.length && d.route.every(r => ["oral", "rectal", "iv", "sc"].includes(r)), d.id + " route");
    for (const part of ["use", "dose", "avoid", "harm", "monitor"]) assert.ok(d[part].length, d.id + " has no " + part);
    assert.ok(Array.isArray(d.preg), d.id + " pregnancy");
    assert.ok(d.before.base.every(id => BASE[id]), d.id + " work-up");
  }
});

test("every line names its source, and every source is cited", () => {
  const used = new Set();
  for (const {where, l} of allLines()) {
    assert.equal(typeof l[0], "string", where);
    assert.ok(l[0].length >= 3, where + " is empty");
    const ks = keys(l);
    assert.ok(ks.length, where + " has no source: " + l[0]);
    for (const k of ks) { assert.ok(SRC[k], where + " cites unknown " + k); used.add(k); }
  }
  assert.deepEqual(Object.keys(SRC).filter(k => !used.has(k)), []);
});

test("sources: monographs open Health Canada's database and carry their date; the rest link securely", () => {
  for (const [k, s] of Object.entries(SRC)) {
    assert.ok(s.w && s.t, k);
    if (s.w === "HC") {
      assert.match(s.u, /^https:\/\/health-products\.canada\.ca\/dpd-bdpp\/info\?lang=eng&code=\d+$/, k);
      assert.match(s.d, /^20\d\d-\d\d-\d\d$/, k + " monograph date");
    } else if (s.u) assert.match(s.u, /^https:\/\//, k);
    else assert.ok(k === "acr15" || s.w === "Practice", k + " has no link");
  }
});

test("written for Canada: no em-dashes, cut-off text or Elentra, and SI units", () => {
  const text = JSON.stringify([DRUGS, PREP, BASE, SITS, SRC, H.val("IBD_SOON"), H.val("IBD_ORDER")]);
  assert.deepEqual(text.match(/[—…]|elentra/gi), null);
  assert.deepEqual(text.match(/mg\/dL|µg\/mL|ng\/mL|\bmcg\b|mmol\/dL/g), null);
  const view = fs.readFileSync(path.join(ROOT, "ibd-view.js"), "utf8");
  assert.deepEqual(view.match(/—/g), null);
});

test("off-label use in Canada is flagged on the card", () => {
  assert.deepEqual(DRUGS.filter(d => d.off).map(d => d.id), ["thiopurines", "mtx", "cyclosporine", "certolizumab"]);
});

test("situations judge real drugs, with a verdict, a reason and a source", () => {
  assert.equal(new Set(SITS.map(s => s.id)).size, SITS.length);
  for (const s of SITS) {
    assert.ok(s.n && s.sum, s.id);
    for (const [id, r] of Object.entries(s.r)) {
      assert.ok(byId[id], s.id + " names unknown drug " + id);
      assert.ok(["ok", "care", "avoid"].includes(r[0]), s.id + " " + id);
    }
  }
  const preg = SITS.find(s => s.id === "preg").r;
  for (const id of ["mtx", "tofacitinib", "upadacitinib", "ozanimod", "etrasimod"]) assert.equal(preg[id][0], "avoid", id);
  for (const id of ["infliximab", "adalimumab", "vedolizumab", "ustekinumab", "thiopurines"]) assert.equal(preg[id][0], "ok", id);
});

test("each work-up adds what that drug needs to the shared tests", () => {
  const own = id => H.val(`ibdWorkup(IBD_BY_ID.${id}).filter(x => x.own).map(x => x.line[0]).join(" ")`);
  assert.match(own("thiopurines"), /TPMT/);
  assert.match(own("thiopurines"), /NUDT15/);
  assert.match(own("tofacitinib"), /lipid/i);
  assert.match(own("upadacitinib"), /lipid/i);
  for (const id of ["ozanimod", "etrasimod"]) { assert.match(own(id), /ECG/, id); assert.match(own(id), /eye|fundus/i, id); }
  // Every advanced therapy starts from TB and hepatitis B.
  for (const d of DRUGS.filter(d => ["tnf", "itg", "il", "jak", "s1p"].includes(d.cls)))
    for (const id of ["tb", "hbv"]) assert.ok(d.before.base.includes(id), d.id + " " + id);
});

test("serious side effects name the specific cancers and harms, not just 'cancer'", () => {
  const harm = id => byId[id].harm.map(l => l[0]).join(" ");
  assert.match(harm("thiopurines"), /Pancreatitis/);
  assert.match(harm("thiopurines"), /hepatosplenic T-cell lymphoma/);
  assert.match(harm("thiopurines"), /melanoma/);
  for (const id of ["infliximab", "adalimumab", "golimumab", "certolizumab"]) {
    assert.match(harm(id), /Hepatosplenic T-cell lymphoma/, id);
    assert.match(harm(id), /melanoma, Merkel cell|melanoma and Merkel cell/, id);
  }
  assert.match(harm("infliximab"), /Hodgkin/);
  assert.match(harm("tofacitinib"), /lung cancer/);
  assert.match(harm("ozanimod"), /basal cell/);
  // Past cancer is never left vague.
  const text = JSON.stringify(DRUGS);
  assert.doesNotMatch(text, /Past cancer: weigh carefully\./);
  assert.doesNotMatch(text, /"(Serious infections including TB; )?lymphoma and other cancers\."/i);
  assert.equal(H.val(`ibdSearch(IBD_DRUGS, "pancreatitis")[0].id`), "thiopurines");
});

test("the copied work-up reads like an order list", () => {
  const up = H.val("ibdWorkupText(IBD_BY_ID.upadacitinib)");
  assert.match(up, /^Before upadacitinib:\n- IGRA/);
  assert.match(up, /lipid/i);
  assert.match(H.val("ibdWorkupText(IBD_BY_ID.mesalamine)"), /^Before mesalamine \(5-ASA\):/);
  assert.match(H.val("ibdWorkupText(null)"), /^Before advanced therapy:\n(- .+\n)+- Pregnancy test/);
});

test("search finds drugs by brand, test and class", () => {
  const find = q => H.val(`ibdSearch(IBD_DRUGS, ${JSON.stringify(q)}).map(d => d.id)`);
  assert.deepEqual(find("Skyrizi"), ["risankizumab"]);
  assert.deepEqual(find("remicade"), ["infliximab"]);
  assert.deepEqual(find("ecg"), ["ozanimod", "etrasimod"]);
  assert.equal(find("tpmt")[0], "thiopurines");
  assert.deepEqual(find("jak").slice(0, 2), ["tofacitinib", "upadacitinib"]);
  assert.deepEqual(find("zzz"), []);
});

// ---- The view -------------------------------------------------------------------------------
test("Guides has an IBD drugs view, with the map, the shared card and every drug", () => {
  const h = phone();
  const html = h.html();
  assert.match(html, /class="segtabs four"/);
  assert.match(html, /class="on" data-action="guidestab" data-tab="d" aria-current="page">IBD drugs</);
  assert.match(html, /class="monitor guidemon ibdmon intro"/);
  assert.equal((html.match(/data-action="guidesdmap"/g) || []).length, 7);
  assert.match(html, /id="ibd-prep"/);
  assert.equal((html.match(/<article class="dr /g) || []).length, 20);
  assert.match(html, /Not in Canada yet/);
  assert.match(html, /Checked .*2026, against current Health Canada monographs/);
  assert.match(html, /Reference tool: check the monograph/);
});

test("the map plays its entrance once per visit", () => {
  const h = phone();
  assert.match(h.html(), /<animateMotion/);
  h.click("guidesdrug", {id: "vedolizumab"});
  assert.doesNotMatch(h.html(), /<animateMotion|ibdmon intro/);
  h.click("guidestab", {tab: "g"});
  h.click("guidestab", {tab: "d"});
  assert.match(h.html(), /<animateMotion/);
});

test("a drug opens into its card and closes again", () => {
  const h = phone();
  h.click("guidesdrug", {id: "infliximab"});
  const html = h.html();
  assert.match(html, /<article class="dr c-tnf open fresh" id="d-infliximab">/);
  for (const sec of ["Use", "Dose", "Avoid or use with care", "Serious side effects", "Pregnancy and breastfeeding", "Before starting", "Once started", "Where sources differ", "Sources"])
    assert.ok(html.includes(`>${sec}</h4>`), sec);
  assert.match(html, /Health Canada boxed warning/);
  assert.match(html, /href="https:\/\/health-products\.canada\.ca\/dpd-bdpp\/info\?lang=eng&amp;code=\d+"/);
  assert.match(html, /<span class="st ca" title="[^"]*">HC<\/span>/);
  // Only the card just opened slides open; it is plain on the next draw.
  h.click("guidesdrug", {id: "vedolizumab"});
  assert.match(h.html(), /<article class="dr c-tnf open" id="d-infliximab">/);
  h.click("guidesdrug", {id: "infliximab"});
  assert.match(h.html(), /<article class="dr c-tnf" id="d-infliximab">/);
});

test("an off-label drug says so, and the list explains the dot", () => {
  const h = phone();
  assert.match(h.html(), /class="offkey"/);
  h.click("guidesdrug", {id: "certolizumab"});
  assert.match(h.html(), /class="dr-offnote".*Not approved for IBD in Canada/);
});

test("a target on the map shows its class and lights; tapping it again shows all", () => {
  const h = phone();
  h.click("guidesdmap", {pin: "jak"});
  let html = h.html();
  assert.match(html, /class="ibd-pin h-flu on"/);
  assert.match(html, /ibdmon picked/);
  assert.match(html, /JAK inhibitors\. <button/);
  assert.deepEqual([...html.matchAll(/id="d-([a-z]+)"/g)].map(m => m[1]), ["tofacitinib", "upadacitinib"]);
  assert.equal(h.val("guidesJump"), null);
  h.click("guidesdmap", {pin: "broad"});
  assert.deepEqual([...h.html().matchAll(/id="d-([a-z]+)"/g)].map(m => m[1]), ["budesonide", "steroids", "thiopurines", "mtx", "cyclosporine"]);
  h.click("guidesdmap", {pin: "broad"});
  assert.equal((h.html().match(/<article class="dr /g) || []).length, 20);
});

test("UC and Crohn's narrow the list", () => {
  const h = phone();
  h.click("guidesdchip", {chip: "uc"});
  const uc = [...h.html().matchAll(/id="d-([a-z]+)"/g)].map(m => m[1]);
  assert.ok(uc.length < 20 && uc.every(id => byId[id].dz.includes("uc")));
  h.click("guidesdchip", {chip: "cd"});
  const cd = [...h.html().matchAll(/id="d-([a-z]+)"/g)].map(m => m[1]);
  assert.ok(cd.length < 20 && cd.includes("certolizumab"));
  assert.ok(cd.every(id => byId[id].dz.includes("cd")));
});

test("chip rows in Guides keep their place, bring a newly picked chip into view and fade the edges with more chips", () => {
  const h = phone();
  h.run(`
    var __cls = new Set(), __on = {offsetLeft: 900, offsetWidth: 90, getAttribute: k => k === "data-chip" ? window.__chip : null};
    var __row = {scrollLeft: 0, clientWidth: 390, scrollWidth: 1300, querySelector: () => __on,
      classList: {toggle: (c, v) => { if (v) __cls.add(c); else __cls.delete(c); }}};
    document.querySelectorAll = () => [__row];
    window.__chip = "all"; guidesCatsAfterRender();
    __row.scrollLeft = 300; __row.onscroll();
    window.__chip = "s:pso"; guidesCatsAfterRender();`);
  // The new pick (900 to 990) ends up clear of the right fade.
  assert.equal(h.val("__row.scrollLeft"), 900 + 90 + 54 - 390);
  assert.deepEqual(h.val("[...__cls].sort()"), ["fl", "fr"]);
  // A redraw with the same pick keeps the place the user scrolled to.
  h.run(`__row.scrollLeft = 1300 - 390; __row.onscroll(); guidesCatsAfterRender();`);
  assert.equal(h.val("__row.scrollLeft"), 910);
  assert.deepEqual(h.val("[...__cls]"), ["fl"]);
});

test("a situation groups the drugs by verdict, each with its reason", () => {
  const h = phone();
  h.click("guidesdchip", {chip: "s:preg"});
  const html = h.html();
  assert.match(html, /<div class="ibd-sit"><p class="mono">Pregnancy<\/p>/);
  const at = s => html.indexOf(s);
  assert.ok(at(">Good fit<") < at(">Use with care<") && at(">Use with care<") < at(">Avoid<"));
  assert.ok(at(">Avoid<") < at('id="d-mtx"'));
  assert.ok(at('id="d-infliximab"') < at(">Use with care<"));
  assert.match(html, /<span class="dr-sub why">Contraindicated; stop 1 to 3 months before conception\.<\/span>/);
});

test("search: one match opens its card; a search about the shared card opens it", () => {
  const h = phone();
  h.run(`ibdField({id: "ibdq", value: "skyrizi", selectionStart: 7})`);
  let html = h.html();
  assert.match(html, /<article class="dr c-il open" id="d-risankizumab">/);
  assert.match(html, /1 of 20 drugs/);
  assert.match(html, /<mark>Skyrizi<\/mark>/);
  h.click("guidesdclear");
  h.run(`ibdField({id: "ibdq", value: "shingrix", selectionStart: 8})`);
  assert.match(h.html(), /<section class="ibd-prep open" id="ibd-prep">/);
  h.run(`ibdField({id: "ibdq", value: "nothing like this", selectionStart: 1})`);
  assert.match(h.html(), /No drug matches/);
});

test("the shared card opens with tests, results, vaccines, yearly checks and babies", () => {
  const h = phone();
  h.click("guidesdprep");
  const html = h.html();
  for (const sec of ["Tests", "If a result is positive", "Vaccines", "Once on therapy", "Starting in hospital", "Babies exposed in pregnancy"])
    assert.ok(html.includes(`>${sec}</h4>`), sec);
  assert.match(html, /Shingrix/);
  assert.match(html, /data-action="guidesdcopy">/);
});

test("copy: the work-up goes to the clipboard, or the toast says copying isn't available", async () => {
  const h = phone();
  h.click("guidesdcopy", {id: "upadacitinib"});
  assert.match(h.html(), /Copy isn't available here/);
  h.run(`navigator.clipboard = {writeText: t => { window.__copied = t; return Promise.resolve(); }}`);
  h.click("guidesdcopy", {id: "upadacitinib"});
  await new Promise(r => setImmediate(r));
  assert.match(h.val("window.__copied"), /^Before upadacitinib:/);
  assert.match(h.html(), /Copied the work-up/);
});

test("a deep link opens a drug's card from anywhere in the app", () => {
  const h = phone(null);
  h.click("tab", {page: "week"});
  h.click("guidesdopen", {id: "vedolizumab"});
  assert.equal(h.val("route.page"), "guides");
  assert.equal(h.val("guidesTab"), "d");
  assert.match(h.html(), /<article class="dr c-itg open" id="d-vedolizumab">/);
});

test("an IBD topic in Guidelines links to the drug reference", () => {
  const h = phone("g");
  h.click("guidestoggle", {id: "uc"});
  assert.match(h.html(), /data-action="guidestab" data-tab="d">.*Open the IBD drug reference/);
  h.click("guidestoggle", {id: "eoe"});
  assert.doesNotMatch(h.html().split('id="t-eoe"')[1] || "", /Open the IBD drug reference/);
});
