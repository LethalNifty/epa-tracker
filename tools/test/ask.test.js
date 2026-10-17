"use strict";
// What to ask for on Week (by where you are today), ticking the context
// checklist as an observation is logged, a started later stage reading Open,
// and the perianal fistula card's newer drugs.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, obs, state, many} = require("./harness");

const TODAY = "2026-10-16";
// Foundations still open; one Core form pending (C4), C5 already past its count.
const st = (extra = {}) => state({f1a: many(2, "2026-08-01"), f1b: many(10, "2026-08-10"), c4: [obs("2026-10-01", {status: "pending"})],
  c5: many(3, "2026-10-02", {status: "pending"})}, extra);
const owner = (s = st()) => load({today: TODAY, state: s});
const rowsOf = html => [...html.matchAll(/class="arow" data-action="sheet" data-part="(\w+)"/g)].map(m => m[1]);

test("a later stage with forms logged reads Open, not Locked; an empty one stays Locked", () => {
  const h = owner();
  assert.match(h.html(), /stg st-core open"[^]*?<span class="stg-state mono">Open<\/span>/);
  assert.match(h.html(), /stg st-ttp locked"[^]*?Locked<\/span>/);
  h.run(`go({page: "epas"})`);
  const epas = h.html();
  assert.match(epas, /<h2>Core<\/h2><span class="mono state">Open<\/span>/);
  assert.doesNotMatch(epas, /Opens once every Foundations observation is logged/);
  assert.match(epas, /Opens once every Core observation is logged/);
});

test("What to ask for: pick where you are; the EPAs that suit it, with the checklist lines still open", () => {
  const h = owner();
  assert.match(h.html(), /<h2>What to ask for<\/h2>/);
  assert.doesNotMatch(h.html(), /class="arow"/);
  h.click("askset", {set: "fu"});
  // C5 is already at its count; the rest of the follow-up list, best fit first.
  assert.deepEqual(rowsOf(h.html()), ["c2", "c3", "c4", "f2"]);
  const c3 = h.html().slice(h.html().indexOf('data-part="c3" data-ask'));
  // Outpatient, not inpatient, at clinic; kinds of case before assessors.
  assert.match(c3, /<span class="aopen">Outpatient ×2 · Patients with IBD ×3 · Patients with chronic liver disease ×3 · Pancreatic disease · Esophageal disease · \d+ more<\/span>/);
  assert.doesNotMatch(c3.slice(0, c3.indexOf("</button>")), /Inpatient/);
  assert.equal(h.saved().ask, "fu");
  // The longest Royal College lines get short names here; the EPA page keeps the full wording.
  assert.match(h.html(), /Chronic liver disease or transplant ×2 · Chronic pancreatobiliary disease ×2 · Inflammatory bowel disease ×2 · Refractory GERD, H\. pylori or CF ×2 · Celiac or eosinophilic disease ×2 · \d+ more/);
  // Lines already ticked count.
  h.run(`Store.state.lines["c2-8"] = {v: 1}; render();`);
  assert.match(h.html(), /Inflammatory bowel disease · /);
  assert.doesNotMatch(h.html(), /Inflammatory bowel disease ×2/);
  // Ward: inpatient lines, no outpatient ones.
  h.click("askset", {set: "ward"});
  const ward = h.html().slice(h.html().indexOf('data-part="c3" data-ask'));
  assert.match(ward, /Inpatient ×2/);
  assert.doesNotMatch(ward.slice(0, ward.indexOf("</button>")), /Outpatient/);
  // Tapping the chosen one again folds it away.
  h.click("askset", {set: "ward"});
  assert.equal(h.saved().ask, null);
  assert.doesNotMatch(h.html(), /class="arow"/);
});

test("logging from What to ask for opens that EPA with the setting's line ticked to start", () => {
  const h = owner(st({ask: "fu"}));
  h.click("sheet", {part: "c3", ask: "fu"});
  assert.deepEqual(h.val("sheet.tick"), ["outpatient"]);
  assert.match(h.html(), /<div class="lbl mono">Also tick on the checklist<\/div>/);
  assert.match(h.html(), /class="pick ghost on" data-action="sheettick" data-name="outpatient" aria-pressed="true">Outpatient<span class="tn">0\/2<\/span>/);
  // C2 has no outpatient line: nothing ticked to start.
  h.click("closesheet");
  h.click("sheet", {part: "c2", ask: "fu"});
  assert.deepEqual(h.val("sheet.tick"), []);
});

test("checklist ticks: saved with the observation, numbered lines tick in order, undo and delete take them back", () => {
  const h = owner();
  h.run(`Store.state.lines["c2-1"] = {v: 1}; Store.save();`);
  h.click("sheet", {part: "c2"});
  h.click("sheettick", {name: "Inflammatory bowel disease"});
  h.click("sheettick", {name: "Assessor"});
  h.click("sheettick", {name: "direct observation"});
  h.click("sheettick", {name: "direct observation"});
  assert.deepEqual(h.val("sheet.tick"), ["Inflammatory bowel disease", "Assessor"]);
  h.click("sheetsave");
  let s = h.saved();
  // The second assessor line, since the first was ticked already.
  assert.deepEqual([s.lines["c2-1"].v, s.lines["c2-2"].v, s.lines["c2-8"].v], [1, 1, 1]);
  assert.deepEqual(s.obs.c2[0].tk, ["c2-2", "c2-8"]);
  assert.match(h.html(), /C2 logged as pending, 2 checklist lines ticked/);
  h.click("undo");
  s = h.saved();
  assert.equal((s.obs.c2 || []).length, 0);
  assert.deepEqual([s.lines["c2-1"].v, s.lines["c2-2"], s.lines["c2-8"]], [1, undefined, undefined]);
  // Log it again, then delete it from its sheet: the lines go back; undo puts them back.
  h.click("sheet", {part: "c2"});
  h.click("sheettick", {name: "Inflammatory bowel disease"});
  h.click("sheetsave");
  assert.equal(h.saved().lines["c2-8"].v, 1);
  h.click("sheet", {part: "c2", obs: "0"});
  assert.doesNotMatch(h.html(), /Also tick on the checklist/);
  h.click("sheetdelete");
  assert.equal(h.saved().lines["c2-8"], undefined);
  h.click("undo");
  assert.equal(h.saved().lines["c2-8"].v, 1);
  // A line with a note keeps the note when it goes back to zero.
  h.run(`Store.state.lines["c2-8"].n = "flare clinic"; Store.bumpLines(["c2-8"], -1);`);
  assert.deepEqual(h.saved().lines["c2-8"], {v: 0, n: "flare clinic"});
  // Picking another EPA clears the ticks; a full group isn't offered.
  h.click("sheet", {part: "c2"});
  h.click("sheettick", {name: "Assessor"});
  h.click("pickpart", {part: "c3"});
  assert.deepEqual(h.val("sheet.tick"), []);
  h.run(`for (const id of ["c4-1", "c4-2"]) Store.state.lines[id] = {v: 1};`);
  h.click("pickpart", {part: "c4"});
  assert.doesNotMatch(h.html(), /data-name="Assessor"/);
  assert.match(h.html(), /data-name="Elective"/);
});

test("a restored backup keeps where you are", () => {
  const h = owner(st({ask: "scope"}));
  assert.equal(h.val("Store.importJSON(Store.exportJSON()).ok"), true);
  assert.equal(h.saved().ask, "scope");
});

test("the fellows' edition: no What to ask for, no checklist ticks in the sheet", () => {
  const h = load({today: TODAY, edition: "fellows", state: st({setup: {d: "2026-10-01"}})});
  assert.doesNotMatch(h.html(), /What to ask for/);
  h.click("sheet", {part: "c2"});
  assert.doesNotMatch(h.html(), /Also tick on the checklist/);
});

test("perianal fistula: guselkumab and upadacitinib are on the card, with what their evidence is", () => {
  const h = owner();
  const fist = h.val(`IBD_SITS.find(s => s.id === "fist")`);
  assert.match(fist.sum, /Guselkumab now has a positive fistula trial \(2026\); upadacitinib has supporting data\./);
  assert.equal(fist.r.guselkumab[0], "care");
  assert.match(fist.r.guselkumab[1], /FUZION.*27 to 28% vs 10%.*not yet published/);
  assert.equal(fist.r.guselkumab[2], "ddw26fz");
  assert.match(fist.r.upadacitinib[1], /45% vs 6%/);
  assert.equal(fist.r.upadacitinib[2], "cgh25up");
  assert.equal(fist.r.infliximab[0], "ok");
});
