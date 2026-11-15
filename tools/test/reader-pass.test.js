"use strict";
// The case reader, second pass: words taken back ("no polyps", "rule out EoE",
// "colon cancer screening") add nothing; a tool after "with" is not a person;
// "then" inside one patient's story stays one case; a dilation's type said
// after it; a day said with its year; and Read again keeps what was fixed on a
// card by hand.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, state} = require("./harness");

// Placeholder staff only.
const STAFF = [{id: "b", name: "Brook, Casey", aliases: []}, {id: "s", name: "Stone, Dana", aliases: []}];
function engine(today = "2026-11-12") {
  const h = load({today});
  h.run(`globalThis.T_STAFF = ${JSON.stringify(STAFF)};`);
  h.parse = text => h.val(`scopeParse(${JSON.stringify(text)}, {today: getToday(), staff: T_STAFF})`);
  h.one = text => { const r = h.parse(text); assert.equal(r.cases.length, 1, text + " " + JSON.stringify(r.cases)); return r.cases[0]; };
  return h;
}
const h = engine();

test("a finding taken back is not a finding", () => {
  const none = ["colonoscopy with Brook, no polyps", "EGD with Brook, no varices", "colonoscopy with Brook, negative for polyps",
    "colonoscopy with Brook, no colitis, random biopsies", "EGD with Brook to rule out EoE, biopsies", "EGD with Brook, varices: none",
    "colonoscopy with Brook for colon cancer screening, to the cecum", "colonoscopy with Brook for family history of colon cancer",
    "colonoscopy with Brook, no polyps, masses or diverticula", "EGD with Brook, no evidence of active bleeding", "EGD with Brook, polyps not seen"];
  for (const t of none) assert.deepEqual(h.one(t).found, [], t);
  assert.deepEqual(h.one("colonoscopy with Brook, normal, no polyps").found, ["normal"]);
  // Taken-back words leave the text with what took them back.
  assert.deepEqual(h.one("EGD with Brook, without varices").leftover, []);
});

test("only as far as the clause goes: but, a comma, and; a list with or goes on", () => {
  assert.deepEqual(h.one("EGD with Brook, no varices but portal hypertensive gastropathy").found, ["phg"]);
  assert.deepEqual(h.one("EGD with Brook, no bleeding, a clean based ulcer in the antrum").found, ["gu"]);
  assert.deepEqual(h.one("EGD with Brook, no varices and a hiatus hernia").found, ["hh"]);
  assert.deepEqual(h.one("EGD with Brook, gastritis, no ulcers").found, ["gastritis"]);
  assert.deepEqual(h.one("colonoscopy with Brook, no polyps or masses, sigmoid diverticulosis").found, ["divertic"]);
  // "No change in" takes nothing back.
  assert.deepEqual(h.one("EGD with Brook, no change in the Barrett's segment").found, ["barretts"]);
});

test("a bleed taken back is no reason and doesn't make the case urgent", () => {
  const c = h.one("colonoscopy with Brook, polyp removed with cold snare, no active bleeding");
  assert.deepEqual([c.why, c.found], [[], ["polyp"]]);
  assert.equal(h.val(`scopeInfer(${JSON.stringify(c)}).urg`), "elective");
  const b = h.one("upper GI bleed, EGD with Brook, ulcer with no active bleeding, clipped");
  assert.deepEqual([b.why, b.found], [["ugib"], ["pud"]]);
  assert.deepEqual(h.one("EGD for dysphagia with Brook, no melena").why, ["dysphagia"]);
});

test("history and screening words make a reason, not a finding", () => {
  const c = h.one("colonoscopy with Brook for history of polyps");
  assert.deepEqual([c.why, c.found], [["surv"], []]);
  assert.deepEqual(h.one("colonoscopy with Brook for colon cancer screening").why, ["crc"]);
});

test("a tool, a drug or a manner after with is not a new staff name, so staff carry over", () => {
  for (const t of ["colonoscopy, polyp removed with cold snare", "EGD, ulcer injected with epi", "EGD with propofol for dysphagia",
    "colonoscopy, polyp removed with a hot snare", "EGD, dilated with a balloon", "colonoscopy with ease to the cecum"]) {
    const c = h.one(t);
    assert.equal(c.staffHeard, null, t);
  }
  const r = h.parse("EGD with Brook for dysphagia. Colonoscopy, polyp removed with cold snare");
  const carried = h.val(`scopeCarry(${JSON.stringify(r.cases)}, [], getToday()).map(c => c.staff)`);
  assert.deepEqual(carried, ["b", "b"]);
  // A real new name after with still offers itself.
  assert.equal(h.one("EGD with Morrow for dysphagia").staffHeard, "Morrow");
});

test("then inside one patient's story stays one case; then with a procedure or a new patient starts the next", () => {
  const one = h.one("colonoscopy with Brook I got to the transverse and then staff took over and removed a polyp");
  assert.deepEqual(one.procs, ["colo.dx", "colo.poly"]);
  assert.deepEqual(h.one("EGD with Brook for dysphagia and then dilated with a balloon").procs, ["egd.dx", "egd.dil.balloon"]);
  assert.equal(h.parse("colonoscopy with Brook to the cecum then an EGD with Stone for reflux").cases.length, 2);
  assert.equal(h.parse("EGD with Brook for melena, ulcer clipped, then a 60 year old for dysphagia").cases.length, 2);
  // "Next" still starts the next case.
  assert.equal(h.parse("EGD with Brook for dysphagia, next colonoscopy with Stone").cases.length, 2);
});

test("a dilation's type said after it; with no type it stays untyped", () => {
  assert.deepEqual(h.one("EGD with Brook, dilated with a balloon").procs, ["egd.dx", "egd.dil.balloon"]);
  assert.deepEqual(h.one("EGD with Brook, dilation using a Savary").procs, ["egd.dx", "egd.dil.savary"]);
  assert.deepEqual(h.one("EGD with Brook, dilated with an 18 mm CRE balloon").procs, ["egd.dx", "egd.dil.balloon"]);
  assert.deepEqual(h.one("EGD with Brook, dilated to 15 mm").procs, ["egd.dx", "egd.dil"]);
});

test("a day said with its year keeps the day; distances stay; identifiers still go", () => {
  const g = t => h.val(`scopeGuard(${JSON.stringify(t)})`);
  assert.deepEqual(g("EGD November 12 2026 for dysphagia"), {text: "EGD November 12 2026 for dysphagia", removed: 0});
  assert.equal(h.one("EGD with Brook November 12 2026 for dysphagia").d, "2026-11-12");
  assert.equal(g("polyps at 25 30 35 cm").removed, 0);
  assert.equal(g("PHIN 123 456 789 EGD").removed, 1);
  assert.equal(g("EGD 12 2026 123456").removed, 1);
});

test("eosinophilic esophagitis is EoE, not esophagitis too", () => {
  assert.deepEqual(h.one("EGD with Brook for dysphagia, eosinophilic esophagitis with rings").found, ["eoe"]);
  assert.deepEqual(h.one("EGD with Brook, LA grade B esophagitis").found, ["esophagitis"]);
});

test("Read again keeps what was fixed on the cards by hand", () => {
  const st = state({}, {scopes: {cases: [], staff: STAFF.map(p => ({...p, hidden: false})), learned: [], lastReport: null, reportName: "", hintOff: null}});
  const e = load({today: "2026-11-12", state: st});
  e.click("tab", {page: "endo"});
  const type = text => e.run(`scopeField({dataset: {scopefield: "text"}, value: ${JSON.stringify(text)}})`);
  type("EGD with Brook for dysphagia. Colonoscopy with Stone to the cecum");
  e.click("scoperead");
  const [k1, k2] = e.val("scopeCap.cards.map(c => c.key)");
  // By hand: the first card's staff and a finding; the second card's note.
  e.click("scopechip", {key: k1, kind: "staff"});
  e.click("scopepicked", {kind: "staff", code: "s"});
  e.click("scopechip", {key: k1, kind: "found"});
  e.click("scopepicked", {kind: "found", code: "eoe"});
  e.run(`scopeCap.cards[1].note = "Good prep"`);
  // The words change for the second case only.
  type("EGD with Brook for dysphagia. Colonoscopy with Stone to the cecum, a polyp removed with cold snare");
  e.click("scoperead");
  const cards = e.val("scopeCap.cards");
  assert.equal(cards.length, 2);
  assert.deepEqual([cards[0].key, cards[0].staff, cards[0].found], [k1, "s", ["eoe"]]);
  assert.deepEqual([cards[1].procs, cards[1].note], [["colo.dx", "colo.poly"], "Good prep"]);
  // A case read fresh (one more than before) starts clean.
  type("EGD with Brook for dysphagia. Colonoscopy with Stone to the cecum. Flex sig with Brook");
  e.click("scoperead");
  const three = e.val("scopeCap.cards");
  assert.equal(three.length, 3);
  assert.deepEqual([three[0].staff, three[0].found], ["s", ["eoe"]], "the unchanged first case kept its fixes");
  assert.equal(three[2].note, "");
});
