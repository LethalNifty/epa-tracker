"use strict";
// Push enteroscopy is its own procedure: read from how it's said, kept as one
// case with the EGD it starts as, and counted on its own line everywhere.
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

test("push enteroscopy is read however it's said, short forms and a misheard 'endoscopy' included", () => {
  for (const t of ["Push entero with Brook for small bowel bleed", "Push enteroscopy with Brook for IDA",
    "Push endoscopy with Brook for IDA", "Enteroscopy with Brook for obscure bleed", "Small bowel enteroscopy with Brook for IDA"]) {
    const c = h.one(t);
    assert.deepEqual(c.procs, ["egd.entero"], t);
    assert.equal(h.say(c), "Push enteroscopy", t);
    assert.deepEqual(c.leftover, [], t);
  }
});

test("an EGD that goes on to a push enteroscopy is one case, not two", () => {
  const c = h.one("EGD and push enteroscopy with Brook for melena");
  assert.deepEqual(c.procs, ["egd.entero"]);
  assert.equal(c.staff, "b");
  assert.deepEqual(c.why, ["melena"]);
  // Two patients stay two cases.
  const r = h.parse("EGD with Brook for dysphagia, push enteroscopy with Stone for IDA");
  assert.deepEqual(r.cases.map(x => h.say(x)), ["EGD", "Push enteroscopy"]);
});

test("how far it went and what was done stay with the push enteroscopy", () => {
  const c = h.one("Push enteroscopy with Brook to the proximal jejunum, angioectasia, APC");
  assert.deepEqual(c.procs, ["egd.entero", "egd.nv.apc"]);
  assert.deepEqual(c.found, ["angio"]);
  assert.deepEqual(c.leftover, []);
  assert.equal(h.say(c), "Push enteroscopy · APC");
  assert.equal(h.one("Push entero with Brook past the ligament of Treitz, biopsies").leftover.length, 0);
});

const ENT = {id: "e1", d: "2026-11-02", staff: "b", site: "stb", loc: "suite", urg: "elective", procs: ["egd.entero", "egd.nv.apc"], why: ["ida"], found: ["angio"], ts: "1"};
const EGD = {id: "g1", d: "2026-11-02", staff: "b", site: "stb", loc: "suite", urg: "elective", procs: ["egd.dx", "egd.bx"], why: ["dysphagia"], found: ["eoe"], ts: "2"};

test("push enteroscopy counts on its own line, not as a gastroscopy", () => {
  assert.deepEqual(h.val(`scopeFams(${JSON.stringify(ENT)})`), ["entero"]);
  const t = h.val(`scopeTotals(${JSON.stringify([ENT, EGD])})`);
  assert.equal(t.entero, 1);
  assert.equal(t.egd, 1);
  assert.equal(t.procs, 2);
  // It still offers the EGD observation: the fellow did the upper scope.
  assert.ok(h.val(`scopeEpaParts(${JSON.stringify(ENT)})`).includes("f3a"));
  assert.ok(h.val(`scopeFirsts(${JSON.stringify([EGD, ENT])})`).some(x => x.label === "First push enteroscopy"));
});

test("the spreadsheet names it, and keeps T-Res's code", () => {
  const csv = h.val(`scopeCSV(${JSON.stringify([ENT])}, ${JSON.stringify(STAFF)})`);
  const row = csv.split("\n")[1];
  assert.match(row, /Push enteroscopy/);
  assert.match(row, /EGD: Enteroscopy/);
});

test("the picker offers Push enteroscopy by name, and it takes the place of a plain EGD", () => {
  const opts = h.val(`(scopePick = {kind: "procs", q: "push"}, scopePickOptions())`);
  assert.ok(opts.some(o => o.code === "egd.entero" && o.label === "Push enteroscopy"), JSON.stringify(opts));
  const hp = load({today: "2026-11-03"});
  hp.run(`scopeCap.cards = [{key: "k1", procs: ["egd.dx"], why: [], found: [], epa: {}, leftover: [], staff: null}]; scopePick = {kind: "procs", key: "k1"};`);
  hp.run(`scopeApplyPick("procs", "egd.entero")`);
  assert.deepEqual(hp.val(`scopeCap.cards[0].procs`), ["egd.entero"]);
  hp.run(`scopePick = {kind: "procs", key: "k1"}; scopeApplyPick("procs", "egd.dx")`);
  assert.deepEqual(hp.val(`scopeCap.cards[0].procs`), ["egd.dx"]);
});

test("the report gives push enteroscopy its own row", () => {
  const hr = load({today: "2026-11-03", state: state({}, {scopes: {cases: [ENT, EGD], staff: STAFF, learned: [], lastReport: null, reportName: "Test Fellow", hintOff: null}})});
  const pdf = Buffer.from(hr.val(`Array.from(scopeReportPDF(scopeReportOpts()))`)).toString("latin1");
  assert.ok(pdf.includes("(Push enteroscopy) Tj"));
  assert.ok(pdf.includes("(Gastroscopy) Tj"));
});
