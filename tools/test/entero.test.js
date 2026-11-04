"use strict";
// Push enteroscopy is an EGD: read however it's said, kept as one case with
// the EGD it goes on from, and counted as a gastroscopy everywhere. It shows
// on the case the way a biopsy does: "EGD · push enteroscopy".
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, state} = require("./harness");

// Placeholder staff only: real names never go in the repo.
const STAFF = [{id: "b", name: "Brook, Casey", aliases: []}, {id: "s", name: "Stone, Dana", aliases: []}];
function engine() {
  const h = load({today: "2026-11-03"});
  h.run(`globalThis.T_STAFF = ${JSON.stringify(STAFF)};`);
  h.parse = text => h.val(`scopeParse(${JSON.stringify(text)}, {today: getToday(), staff: T_STAFF})`);
  h.one = text => { const r = h.parse(text); assert.equal(r.cases.length, 1, JSON.stringify(r.cases)); return r.cases[0]; };
  h.say = c => h.val(`scopeSummary(${JSON.stringify(c)})`);
  return h;
}
const h = engine();
const ENTERO = ["egd.dx", "egd.entero"];

test("push enteroscopy is read however it's said, short forms and a misheard 'endoscopy' included", () => {
  for (const t of ["Push entero with Brook for small bowel bleed", "Push enteroscopy with Brook for IDA",
    "Push endoscopy with Brook for IDA", "Enteroscopy with Brook for obscure bleed", "Small bowel enteroscopy with Brook for IDA"]) {
    const c = h.one(t);
    assert.deepEqual(c.procs, ENTERO, t);
    assert.equal(h.say(c), "EGD · push enteroscopy", t);
    assert.deepEqual(c.leftover, [], t);
  }
});

test("push enteroscopy is read the ways iPhone dictation mishears it", () => {
  for (const t of ["Push interoscopy with Brook for IDA", "Push entero scopy with Brook for IDA", "Push enter oscopy with Brook for IDA",
    "Push intro scopy with Brook for IDA", "Push entroscopy with Brook for IDA", "Push entry scopy with Brook for IDA",
    "Push enteros copy with Brook for IDA", "Push-enteroscopy with Brook for IDA", "Bush enteroscopy with Brook for IDA",
    "Push enteroscope with Brook for IDA", "Push enter with Brook for IDA", "Interoscopy with Brook for IDA"]) {
    const c = h.one(t);
    assert.deepEqual(c.procs, ENTERO, t);
    assert.deepEqual(c.leftover, [], t);
  }
  // A push of a drug is not a push enteroscopy.
  for (const t of ["EGD with Brook for melena after an IV push of pantoprazole", "EGD with Brook, push intravenous pantoprazole"]) {
    assert.deepEqual(h.one(t).procs, ["egd.dx"], t);
  }
});

test("an EGD that goes on to a push enteroscopy is one case, not two", () => {
  const c = h.one("EGD and push enteroscopy with Brook for melena");
  assert.deepEqual(c.procs, ENTERO);
  assert.equal(c.staff, "b");
  assert.deepEqual(c.why, ["melena"]);
  // Two patients stay two cases.
  const r = h.parse("EGD with Brook for dysphagia, push enteroscopy with Stone for IDA");
  assert.deepEqual(r.cases.map(x => h.say(x)), ["EGD", "EGD · push enteroscopy"]);
});

test("how far it went and what was done stay with the push enteroscopy", () => {
  const c = h.one("Push enteroscopy with Brook to the proximal jejunum, angioectasia, APC");
  assert.deepEqual(c.procs, ["egd.dx", "egd.entero", "egd.nv.apc"]);
  assert.deepEqual(c.found, ["angio"]);
  assert.deepEqual(c.leftover, []);
  assert.equal(h.say(c), "EGD · push enteroscopy, APC");
  assert.equal(h.one("Push entero with Brook past the ligament of Treitz, biopsies").leftover.length, 0);
});

const ENT = {id: "e1", d: "2026-11-02", staff: "b", site: "stb", loc: "suite", urg: "elective", procs: ["egd.dx", "egd.entero", "egd.nv.apc"], why: ["ida"], found: ["angio"], ts: "1"};
const EGD = {id: "g1", d: "2026-11-02", staff: "b", site: "stb", loc: "suite", urg: "elective", procs: ["egd.dx", "egd.bx"], why: ["dysphagia"], found: ["eoe"], ts: "2"};
// Saved by v69, when it counted on its own line: no plain EGD code.
const OLD = {id: "o1", d: "2026-11-03", staff: "b", site: "stb", loc: "suite", urg: "elective", procs: ["egd.entero"], why: ["ida"], found: [], ts: "3"};

test("push enteroscopy counts as a gastroscopy, with no line of its own", () => {
  assert.deepEqual(h.val(`scopeFams(${JSON.stringify(ENT)})`), ["egd"]);
  assert.deepEqual(h.val(`scopeFams(${JSON.stringify(OLD)})`), ["egd"]);
  const t = h.val(`scopeTotals(${JSON.stringify([ENT, EGD, OLD])})`);
  assert.equal(t.egd, 3);
  assert.equal(t.procs, 3);
  assert.equal(t.entero, undefined);
  assert.ok(h.val(`scopeEpaParts(${JSON.stringify(ENT)})`).includes("f3a"));
  assert.ok(!h.val(`scopeFirsts(${JSON.stringify([EGD, ENT])})`).some(x => /enteroscopy/i.test(x.label)));
  // Drawn as a gastroscopy, and one saved as its own line now reads as one.
  assert.equal(h.val(`scopeGlyph(${JSON.stringify(ENT)})`), h.val(`scopeGlyph(${JSON.stringify(EGD)})`));
  assert.equal(h.say(OLD), "EGD · push enteroscopy");
});

test("the spreadsheet calls it a gastroscopy and keeps T-Res's code", () => {
  const csv = h.val(`scopeCSV(${JSON.stringify([ENT])}, ${JSON.stringify(STAFF)})`);
  const row = csv.split("\n")[1];
  assert.match(row, /,Gastroscopy,/);
  assert.match(row, /EGD: Diagnostic; EGD: Enteroscopy/);
});

test("on the card it sits under the EGD, like a biopsy", () => {
  const opts = h.val(`(scopePick = {kind: "procs", q: "push"}, scopePickOptions())`);
  assert.ok(opts.some(o => o.code === "egd.entero" && o.label === "EGD: Push enteroscopy"), JSON.stringify(opts));
  const hp = load({today: "2026-11-03"});
  hp.run(`scopeCap.cards = [{key: "k1", procs: ["egd.dx"], why: [], found: [], epa: {}, leftover: [], staff: null}]; scopePick = {kind: "procs", key: "k1"};`);
  hp.run(`scopeApplyPick("procs", "egd.entero")`);
  assert.deepEqual(hp.val(`scopeCap.cards[0].procs`), ENTERO);
  // An EGD card, so D2 can be answered as on any EGD.
  assert.notEqual(hp.val(`scopeD2HTML(scopeCap.cards[0])`), "");
});

test("the report counts it with the gastroscopies, no row of its own", () => {
  const hr = load({today: "2026-11-03", state: state({}, {scopes: {cases: [ENT, EGD], staff: STAFF, learned: [], lastReport: null, reportName: "Test Fellow", hintOff: null}})});
  const pdf = Buffer.from(hr.val(`Array.from(scopeReportPDF(scopeReportOpts()))`)).toString("latin1");
  assert.ok(pdf.includes("(Gastroscopy) Tj"));
  assert.ok(!pdf.includes("(Push enteroscopy) Tj"));
});
