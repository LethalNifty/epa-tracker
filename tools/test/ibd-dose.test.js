"use strict";
// IBD drugs: the dose rows. Every biologic and small molecule splits its dose
// into Induction, Maintenance, Going up and Going down, plus Adjust for where
// the label changes the dose; each line comes from a monograph or a guideline.
// Off-label lines carry a flag and a guideline source. Anti-TNF cards end
// Going up with how to read a drug level; the other biologics say levels
// aren't advised. The older drugs keep one dose list.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {load, ROOT} = require("./harness");

const LIB = JSON.parse(fs.readFileSync(path.join(ROOT, "guides.json"), "utf8"));
function phone() {
  const h = load({today: "2026-10-11"});
  h.run(`guidesAccept(${JSON.stringify(LIB)}); guidesRedraw();`);
  h.click("tab", {page: "guides"});
  h.click("guidestab", {tab: "d"});
  return h;
}
const H = load({today: "2026-10-11"});
const DRUGS = H.val("IBD_DRUGS"), SRC = H.val("IBD_SRC");
const byId = Object.fromEntries(DRUGS.map(d => [d.id, d]));
const keys = line => String(line[1] || "").split(/\s+/).filter(Boolean);
const ADV = ["infliximab", "adalimumab", "golimumab", "certolizumab", "vedolizumab", "ustekinumab", "risankizumab",
  "mirikizumab", "guselkumab", "tofacitinib", "upadacitinib", "ozanimod", "etrasimod"];
const TNF = ["infliximab", "adalimumab", "golimumab", "certolizumab"];
const row = (id, r) => byId[id].dose[r] || [];
const words = (id, r) => row(id, r).map(l => l[0]).join(" ");
// The one dose line on a card that matches, wherever it sits.
function lineWith(id, re) {
  const hits = H.val(`ibdDoseLines(IBD_BY_ID.${id})`).filter(l => re.test(l[0]));
  assert.equal(hits.length, 1, `${id}: ${hits.length} dose lines match ${re}`);
  return hits[0];
}
// One row of an open card, from its heading to the next row.
function rowHTML(html, id, r) {
  const card = html.slice(html.indexOf(`id="d-${id}"`));
  const at = card.indexOf(`<div class="dz-row r-${r}">`);
  assert.ok(at >= 0, `${id} has no ${r} row`);
  const next = card.indexOf(`<div class="dz-row`, at + 10), end = card.indexOf("</section>", at);
  return card.slice(at, next >= 0 && next < end ? next : end);
}

// ---- The data -------------------------------------------------------------------------------
test("biologics and small molecules split the dose into rows; the older drugs keep one list", () => {
  assert.deepEqual(H.val("IBD_DOSE_ROWS"),
    [["ind", "Induction"], ["main", "Maintenance"], ["up", "Going up"], ["down", "Going down"], ["adj", "Adjust for"]]);
  for (const d of DRUGS) {
    if (!ADV.includes(d.id)) { assert.ok(Array.isArray(d.dose) && d.dose.length, d.id + " keeps its list"); continue; }
    assert.ok(!Array.isArray(d.dose), d.id + " has rows");
    for (const k of Object.keys(d.dose)) assert.ok(["ind", "main", "up", "down", "adj", "lv"].includes(k), d.id + " row " + k);
    for (const r of ["ind", "main", "up", "down"]) assert.ok(Array.isArray(d.dose[r]), d.id + " has no " + r);
    assert.ok(d.dose.main.length, d.id + " maintenance");
  }
  // Every row but certolizumab's induction has something in it: it has no IBD dose in Canada.
  for (const id of ADV) if (id !== "certolizumab") assert.ok(row(id, "ind").length, id + " induction");
});

test("ibdDoseLines gives every dose line, rows then drug levels, and the older lists as they are", () => {
  const ifx = byId.infliximab.dose;
  const want = ["ind", "main", "up", "down", "adj"].flatMap(r => ifx[r] || []).concat(ifx.lv);
  assert.deepEqual(H.val("ibdDoseLines(IBD_BY_ID.infliximab)"), want);
  assert.deepEqual(H.val("ibdDoseLines(IBD_BY_ID.mesalamine)"), byId.mesalamine.dose);
});

test("a dose line is [text, sources], or [text, sources, \"off\"] when it is off-label", () => {
  for (const id of ADV) for (const l of H.val(`ibdDoseLines(IBD_BY_ID.${id})`)) {
    assert.ok(l.length === 2 || (l.length === 3 && l[2] === "off"), id + ": " + l[0]);
    if (l[2] === "off") assert.ok(keys(l).some(k => !k.startsWith("hc")), id + " off-label line rests on the label alone: " + l[0]);
  }
});

test("off-label options are flagged; the label's own steps are not", () => {
  const off = [["infliximab", /^A shorter interval/], ["infliximab", /albumin/], ["infliximab", /240 mg/],
    ["adalimumab", /UC: a shorter interval/], ["certolizumab", /400 mg/], ["ustekinumab", /reinduction/], ["upadacitinib", /8 more weeks of 45 mg/]];
  for (const [id, re] of off) assert.equal(lineWith(id, re)[2], "off", id + " " + re);
  const label = [["infliximab", /Up to 10 mg\/kg/], ["adalimumab", /40 mg every week/], ["golimumab", /100 mg every 4 weeks/],
    ["vedolizumab", /300 mg every 4 weeks/], ["ustekinumab", /back to every 8/], ["guselkumab", /200 mg SC at week 12/],
    ["tofacitinib", /8 more weeks of 10 mg/], ["upadacitinib", /From 15 to 30 mg/]];
  for (const [id, re] of label) assert.equal(lineWith(id, re)[2], undefined, id + " " + re);
});

test("going up starts with the label's step, cited to its monograph, and off-label options come last", () => {
  const steps = [["infliximab", /10 mg\/kg/, "hcRemicade"], ["adalimumab", /40 mg every week/, "hcHumira"],
    ["golimumab", /100 mg every 4 weeks/, "hcSimponi"], ["vedolizumab", /300 mg every 4 weeks/, "hcEntyvio"],
    ["ustekinumab", /every 8/, "hcStelara"], ["risankizumab", /180 to 360 mg/, "hcSkyrizi"],
    ["mirikizumab", /weeks 12, 16 and 20/, "hcOmvoh"], ["guselkumab", /200 mg SC at week 12, then every 4 weeks/, "hcTremfya"],
    ["tofacitinib", /10 mg twice daily/, "hcXeljanz"], ["upadacitinib", /30 mg/, "hcRinvoq"]];
  for (const [id, re, hc] of steps) {
    const first = row(id, "up")[0];
    assert.match(first[0], re, id);
    assert.ok(keys(first).includes(hc), id + " cites " + hc);
  }
  for (const id of ADV) {
    const flags = row(id, "up").map(l => l[2] === "off");
    assert.deepEqual(flags, flags.slice().sort((a, b) => a - b), id + ": a label line comes after an off-label one");
  }
  // Escalation numbers the guidelines give.
  assert.match(words("tofacitinib", "up"), /half/);
  assert.match(words("upadacitinib", "up"), /48%/);
  assert.match(words("ustekinumab", "up"), /55%/);
  assert.match(words("infliximab", "up"), /93%/);
});

test("going down only where a source supports it; the S1P modulators have no up or down", () => {
  assert.match(words("tofacitinib", "down"), /29%.*63%/);
  assert.match(words("ustekinumab", "down"), /every 12 weeks/);
  assert.match(words("risankizumab", "down"), /360 to 180 mg/);
  assert.match(words("upadacitinib", "down"), /30 to 15 mg/);
  for (const id of ["ozanimod", "etrasimod"]) { assert.deepEqual(row(id, "up"), [], id); assert.deepEqual(row(id, "down"), [], id); }
  for (const id of ["vedolizumab", "mirikizumab", "guselkumab"]) assert.deepEqual(row(id, "down"), [], id);
  // Anti-TNFs: stepping down combination therapy, by disease.
  for (const id of ["infliximab", "adalimumab"]) {
    assert.match(words(id, "down"), /Crohn's.*immunomodulator/, id);
    assert.match(words(id, "down"), /UC.*keeping the anti-TNF/, id);
  }
  assert.doesNotMatch(words("golimumab", "down"), /Crohn's/);
  assert.doesNotMatch(words("certolizumab", "down"), /UC/);
});

test("drug levels: anti-TNFs read the trough with its antibodies; the other biologics say levels aren't advised", () => {
  const read = H.val("IBD_TNF_LEVELS");
  assert.equal(read.length, 3);
  assert.match(read[0][0], /no antibodies/);
  assert.match(read[1][0], /high-titre antibodies/);
  assert.match(read[2][0], /On target/);
  for (const l of read) assert.ok(keys(l).includes("aga17"), l[0]);
  const target = {infliximab: /5 mg\/L/, adalimumab: /7\.5 mg\/L/, certolizumab: /20 mg\/L/, golimumab: /too little data/};
  for (const id of TNF) {
    const lv = byId[id].dose.lv;
    assert.deepEqual(lv.slice(0, 3), read, id);
    assert.match(lv.slice(3).map(l => l[0]).join(" "), target[id], id);
  }
  for (const id of ["vedolizumab", "ustekinumab", "risankizumab", "mirikizumab", "guselkumab"]) {
    assert.deepEqual(byId[id].dose.lv, [H.val("IBD_NO_LEVELS")], id);
    assert.match(byId[id].dose.lv[0][0], /too little evidence/);
  }
  for (const id of ["tofacitinib", "upadacitinib", "ozanimod", "etrasimod"]) assert.equal(byId[id].dose.lv, undefined, id);
});

test("adjust for: the label's changes for kidney, liver, age, other drugs and blood counts", () => {
  const tofa = words("tofacitinib", "adj");
  for (const re of [/Kidney/, /liver/, /fluconazole/, /5 mg once daily/, /Hemoglobin/, /Neutrophils/]) assert.match(tofa, re);
  const upa = words("upadacitinib", "adj");
  for (const re of [/65 or older/, /kidney/, /CYP3A4/, /hemoglobin/]) assert.match(upa, re);
  assert.match(words("ozanimod", "adj"), /every other day/);
  assert.match(words("ozanimod", "adj"), /restart the titration/);
  assert.match(words("etrasimod", "adj"), /Severe liver impairment/);
  for (const id of ADV) for (const l of row(id, "adj")) assert.ok(keys(l).every(k => k.startsWith("hc")), id + ": " + l[0]);
});

test("where sources differ: tofacitinib's maintenance dose and risankizumab's Crohn's maintenance", () => {
  const differ = id => byId[id].differ.find(l => /maintenance/i.test(l[0]));
  assert.deepEqual(keys(differ("tofacitinib")), ["hcXeljanz", "acg25uc"]);
  assert.match(differ("risankizumab")[0], /360 mg only/);
  assert.deepEqual(keys(differ("risankizumab")), ["hcSkyrizi", "aga25cd"]);
});

test("sources: the Skyrizi monograph is the one the doses were checked against; the ustekinumab meta-analysis is listed", () => {
  assert.equal(SRC.hcSkyrizi.d, "2026-10-16");
  assert.equal(SRC.cgh22ust.u, "https://doi.org/10.1016/j.cgh.2021.10.002");
  assert.equal(SRC.cgh22ust.y, 2022);
});

test("search reaches the new dose lines", () => {
  const find = q => H.val(`ibdSearch(IBD_DRUGS, ${JSON.stringify(q)}).map(d => d.id)`);
  assert.deepEqual(find("reinduction"), ["ustekinumab"]);
  assert.deepEqual(find("antibodies trough"), TNF);
});

// ---- The view -------------------------------------------------------------------------------
test("a biologic's dose shows its rows in order, with off-label pills and a drug-levels box", () => {
  const h = phone();
  h.click("guidesdrug", {id: "infliximab"});
  const html = h.html();
  assert.match(html, /<section class="ds dose"><h4 class="mono">Dose<\/h4>/);
  const at = ["Induction", "Maintenance", "Going up", "Going down"].map(t => html.indexOf(`${t}</h5>`));
  assert.ok(at.every(i => i > 0), "every row has its heading");
  assert.deepEqual(at, at.slice().sort((a, b) => a - b), "rows in order");
  assert.ok(!html.includes("Adjust for</h5>"), "no empty Adjust for row");
  assert.match(html, /<i class="dz-m" aria-hidden="true">↑<\/i>Going up/);
  assert.match(html, /<i class="dz-m" aria-hidden="true">↓<\/i>Going down/);
  const up = rowHTML(html, "infliximab", "up");
  assert.match(up, /<li class="off"><span class="offtag mono">Off-label<\/span>/);
  assert.match(up, /<div class="dz-lv"><p class="mono">Drug levels<\/p><ul class="dl">/);
  assert.match(up, /at least 5 mg\/L/);
  assert.ok(up.indexOf('class="dz-lv"') > up.lastIndexOf("<li class=\"off\">"), "the box closes the row");
});

test("an empty row says there's nothing in the sources; Adjust for shows when there is something", () => {
  const h = phone();
  h.click("guidesdrug", {id: "etrasimod"});
  const html = h.html();
  for (const r of ["up", "down"])
    assert.match(rowHTML(html, "etrasimod", r), /<p class="dl-none">None in the label or the guidelines used here\.<\/p>/, r);
  assert.match(rowHTML(html, "etrasimod", "adj"), /Adjust for<\/h5><ul class="dl">/);
});

test("certolizumab: no induction in the sources, and its Going up is the drug-levels box alone", () => {
  const h = phone();
  h.click("guidesdrug", {id: "certolizumab"});
  const html = h.html();
  assert.match(rowHTML(html, "certolizumab", "ind"), /None in the label or the guidelines used here/);
  const up = rowHTML(html, "certolizumab", "up");
  assert.match(up, /class="dz-lv"/);
  assert.doesNotMatch(up, /dl-none/);
  assert.match(rowHTML(html, "certolizumab", "main"), /<li class="off">/);
});

test("an older drug keeps its single dose list", () => {
  const h = phone();
  h.click("guidesdrug", {id: "mesalamine"});
  const html = h.html();
  assert.match(html, /<section class="ds"><h4 class="mono">Dose<\/h4><ul class="dl">/);
  assert.doesNotMatch(html, /class="dz-row/);
});
