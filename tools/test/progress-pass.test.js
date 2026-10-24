"use strict";
// The progress pass: an optional D2 on each EGD, the block report card on
// Endo Progress, and Year 1 so far (the year in review once it ends).
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, state} = require("./harness");

// Placeholder staff only: real names never go in the repo.
const STAFF = [{id: "sa", name: "Attending, Alpha", aliases: [], hidden: false}, {id: "sb", name: "Brook, Casey", aliases: [], hidden: false},
  {id: "ss", name: "Stone, Dana", aliases: [], hidden: false}];
const withScopes = (cases = [], extra = {}, more = {}) => state({}, {scopes: {cases, staff: STAFF, learned: [], lastReport: null, reportName: "", hintOff: null, ...extra}, ...more});
function engine(today = "2026-10-09") {
  const h = load({today});
  h.run(`globalThis.T_STAFF = ${JSON.stringify(STAFF)};`);
  h.parse = (text, extra = ", d2: true") => h.val(`scopeParse(${JSON.stringify(text)}, {today: getToday(), staff: T_STAFF${extra}})`);
  h.one = (text, extra) => { const r = h.parse(text, extra); assert.equal(r.cases.length, 1, JSON.stringify(r.cases)); return r.cases[0]; };
  return h;
}
function endo(today = "2026-10-09", st, opts = {}) {
  const h = load({today, state: st, ...opts});
  h.click("tab", {page: "endo"});
  h.type = text => h.run(`scopeField({dataset: {scopefield: "text"}, value: ${JSON.stringify(text)}})`);
  h.say = text => { h.type(text); h.click("scoperead"); };
  h.card = (i = 0) => h.val(`scopeCap.cards[${i}]`);
  return h;
}
const egd = (id, d, extra = {}) => ({id, d, staff: "sb", site: "hsc", loc: "suite", urg: "elective", procs: ["egd.dx"], reach: null, why: [], found: [], note: "", ts: d + "T15:00:00.000Z", ...extra});
const colo = (id, d, reach, extra = {}) => ({id, d, staff: "sb", site: "hsc", loc: "suite", urg: "elective", procs: ["colo.dx"], reach, why: [], found: [], note: "", ts: d + "T16:00:00.000Z", ...extra});

// ---- D2 ---------------------------------------------------------------------------------------

test("D2: 'to D2' is yours, staff taking over at the pylorus is theirs, nothing said is not recorded", () => {
  const h = engine();
  assert.equal(h.one("EGD with Brook to D2, gastritis").d2, "yes");
  assert.equal(h.one("gastroscopy with Brook, got to the second part of the duodenum").d2, "yes");
  assert.equal(h.one("EGD with Brook, staff took over at the pylorus, biopsies").d2, "staff");
  assert.equal(h.one("EGD with Brook, couldn't get through the pylorus").d2, "staff");
  assert.equal(h.one("EGD with Brook, biopsies, EoE").d2, null);
});

test("D2 words never land in Didn't catch, and the reading is kept only when D2 is on", () => {
  const h = engine();
  for (const t of ["EGD with Brook to D2, gastritis", "EGD with Brook, staff took over at the pylorus"]) {
    const c = h.one(t, "");
    assert.equal(c.d2, null);
    assert.deepEqual(c.leftover, [], t);
  }
});

test("D2 belongs to the EGD: a colonoscopy handover is still the reach, and two cases keep their own", () => {
  const h = engine();
  const c = h.one("colonoscopy with Brook, staff took over at the hepatic flexure");
  assert.equal(c.reach, "hf");
  assert.equal(c.d2, null);
  const both = h.one("EGD to D2 and colonoscopy to the cecum with Brook");
  assert.equal(both.d2, "yes");
  assert.equal(both.reach, "cecum");
  const r = h.parse("EGD with Brook to D2. Colonoscopy with Stone, staff took over at the splenic flexure");
  assert.equal(r.cases.length, 2);
  assert.equal(r.cases[0].d2, "yes");
  assert.equal(r.cases[1].d2, null);
  assert.equal(r.cases[1].reach, "sf");
});

test("the EGD card has a D2 row that starts at Not recorded; other cards have none", () => {
  const h = endo("2026-10-09", withScopes());
  h.say("EGD with Brook, biopsies");
  assert.match(h.html(), /aria-label="D2 yourself"/);
  assert.match(h.html(), /data-action="scoped2" data-key="[^"]+" data-v="" aria-pressed="true">Not recorded/);
  h.click("scopeclear");
  h.say("colonoscopy with Brook to the cecum");
  assert.doesNotMatch(h.html(), /aria-label="D2 yourself"/);
});

test("D2 is saved from the card, shows in the case's name, and can go back to not recorded", () => {
  const h = endo("2026-10-09", withScopes());
  h.say("EGD with Brook to D2, biopsies");
  assert.equal(h.card().d2, "yes");
  assert.match(h.html(), /<b>EGD to D2<\/b>/);
  const key = h.card().key;
  h.click("scoped2", {key, v: "staff"});
  assert.equal(h.card().d2, "staff");
  h.click("scopesave");
  const c = h.saved().scopes.cases[0];
  assert.equal(c.d2, "staff");
  h.click("scopeedit", {id: c.id});
  h.click("scoped2", {key: h.val("scopeSheet.card.key"), v: ""});
  h.click("scopeupdate");
  assert.equal(h.saved().scopes.cases[0].d2, undefined);
});

test("an old EGD stays not recorded: nothing asks for D2 after the fact", () => {
  const h = endo("2026-10-09", withScopes([egd("k1", "2026-10-01")]));
  assert.doesNotMatch(h.html(), /D2/);
  h.click("scopetab", {tab: "progress"});
  assert.doesNotMatch(h.html(), /D2 yourself/);
});

test("the fellows' edition has no D2 row", () => {
  const h = endo("2026-10-09", state({}, {setup: {d: "2026-09-01"}}), {edition: "fellows"});
  h.say("EGD with Brook to D2, biopsies");
  assert.doesNotMatch(h.html(), /D2 yourself/);
  assert.equal(h.card().d2 || null, null);
});

test("D2 survives an import and comes out in the spreadsheet; the PDF's procedure column is unchanged", () => {
  const h = engine();
  const r = h.val(`scopeImport({cases: [], staff: [], learned: []}, {kind: "gi-scopes", staff: [], cases: [${JSON.stringify(egd("t1", "2026-10-01", {d2: "yes"}))}]})`);
  assert.equal(r.next.cases[0].d2, "yes");
  const csv = h.val(`scopeCSV([${JSON.stringify(egd("t1", "2026-10-01", {d2: "yes"}))}, ${JSON.stringify(egd("t2", "2026-10-02"))}], T_STAFF)`);
  assert.match(csv.split("\r\n")[0], /D2 yourself/);
  assert.match(csv.split("\r\n")[1], /,Yes,/);
  assert.equal(h.val(`scopeReportProc(${JSON.stringify(egd("t1", "2026-10-01", {d2: "yes", procs: ["egd.dx", "egd.bx"]}))})`), "EGD · biopsy");
  assert.doesNotMatch(h.val(`scopeCSV([${JSON.stringify(egd("t2", "2026-10-02"))}], T_STAFF)`), /D2/);
});
