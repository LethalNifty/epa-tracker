"use strict";
// The scope log engine: the number guard, reading dictation, carry-forward,
// inference, EPA mapping, the numbers, the spreadsheet and import.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load} = require("./harness");

// Placeholder staff only: real names never go in the repo.
const STAFF = [
  {id: "a", name: "Attending, Alpha", aliases: []},
  {id: "b", name: "Brook, Casey", aliases: []},
  {id: "s", name: "Stone, Dana", aliases: []},
  {id: "k", name: "Kowalczyk, Robin", aliases: ["cove all check"]},
];
function engine(today = "2026-09-28") {
  const h = load({today});
  h.run(`globalThis.T_STAFF = ${JSON.stringify(STAFF)};`);
  h.parse = (text, extra = "") => h.val(`scopeParse(${JSON.stringify(text)}, {today: getToday(), staff: T_STAFF${extra}})`);
  h.one = (text, extra) => { const r = h.parse(text, extra); assert.equal(r.cases.length, 1, JSON.stringify(r.cases)); return r.cases[0]; };
  return h;
}
const h = engine();

test("the number guard removes identifiers before anything is read", () => {
  const g = t => h.val(`scopeGuard(${JSON.stringify(t)})`);
  assert.deepEqual(g("MRN 1234567 EGD"), {text: "EGD", removed: 1});
  assert.equal(g("PHIN is 123 456 789, colon").text, "colon");
  assert.equal(g("DOB March 3 1950, EGD").removed, 1);
  assert.equal(g("two polyps, 12 mm").removed, 0);
  assert.equal(g("chart 20260903 ok").removed, 1);
  const r = h.parse("EGD with Brook, MRN 55512345, gastritis");
  assert.equal(r.removed, 1);
  assert.deepEqual(r.cases[0].leftover, []);
});

test("an EGD with staff, biopsies and a finding", () => {
  const c = h.one("EGD with Brook, biopsies, gastritis");
  assert.equal(c.staff, "b");
  assert.deepEqual(c.procs, ["egd.dx", "egd.bx"]);
  assert.deepEqual(c.found, ["gastritis"]);
  assert.deepEqual(c.leftover, []);
});

test("colonoscopy reach is how far the fellow got, not the staff", () => {
  const c = h.one("Colonoscopy with Alpha, I got to the hepatic flexure, staff took it to the cecum, two cold snare polypectomies");
  assert.equal(c.staff, "a");
  assert.equal(c.reach, "hf");
  assert.deepEqual(c.procs, ["colo.dx", "colo.poly"]);
  assert.deepEqual(c.found, ["polyp"]);
});

test("reach phrases", () => {
  assert.equal(h.one("screening colon, made it to the TI").reach, "ti");
  assert.deepEqual(h.one("screening colon, made it to the TI").procs, ["colo.screen"]);
  assert.equal(h.one("colonoscopy, staff took over at the splenic flexure").reach, "sf");
  assert.equal(h.one("colonoscopy, polyp in the transverse, I got to the sigmoid").reach, "sig");
  assert.equal(h.one("colonoscopy all the way").reach, "cecum");
  assert.equal(h.one("colon, reached the cecum and intubated the TI").reach, "ti");
  assert.equal(h.one("colon, polyp in the ascending").reach, null);
});

test("dictation without punctuation still reads", () => {
  const c = h.one("colonoscopy with alpha i got to the hepatic flexure staff took it to the cecum two cold snare polypectomies");
  assert.equal(c.reach, "hf");
  assert.equal(c.staff, "a");
  assert.deepEqual(c.procs, ["colo.dx", "colo.poly"]);
  assert.equal(h.one("colon with brook staff took over at the transverse").reach, "tverse");
  assert.equal(h.one("colon got to the descending before staff took over").reach, "desc");
  const r = h.parse("EGD with Brook for dysphagia biopsies then colon to the cecum with Alpha");
  assert.equal(r.cases.length, 2);
  assert.equal(r.cases[0].staff, "b");
  assert.equal(r.cases[1].staff, "a");
  assert.equal(r.cases[1].reach, "cecum");
});

test("upper GI bleed hemostasis", () => {
  const c = h.one("EGD for melena, actively bleeding duodenal ulcer, clips and epi");
  assert.deepEqual(c.procs, ["egd.dx", "egd.nv.clip", "egd.nv.inj"]);
  assert.deepEqual(c.why, ["melena"]);
  assert.deepEqual(c.found.sort(), ["active", "du"]);
});

test("variceal banding, PEG and dilation", () => {
  const b = h.one("banded varices");
  assert.deepEqual(b.procs, ["egd.dx", "egd.ev.band"]);
  assert.deepEqual(b.found, ["ev"]);
  assert.deepEqual(h.one("PEG with Brook").procs, ["egd.dx", "egd.peg"]);
  assert.deepEqual(h.one("EGD, savary dilation of a stricture").procs, ["egd.dx", "egd.dil.bougie"]);
  assert.deepEqual(h.one("EGD for dysphagia, balloon dilated").procs, ["egd.dx", "egd.dil.balloon"]);
  assert.deepEqual(h.one("colonoscopy to the cecum, removed a 2 cm polyp").procs, ["colo.dx", "colo.poly", "colo.bigpoly"]);
});

test("food bolus is a foreign body removal", () => {
  const c = h.one("EGD for a food bolus, pushed it through");
  assert.ok(c.procs.includes("egd.fb"));
  assert.deepEqual(c.why, ["fb"]);
});

test("ERCP stents and sphincterotomy; a stone is a finding, not a person", () => {
  const c = h.one("ERCP with Brook, sphincterotomy, bile duct stone, plastic stent");
  assert.deepEqual(c.procs, ["ercp.dx", "ercp.sphinc", "ercp.plastic"]);
  assert.deepEqual(c.found, ["stones"]);
  assert.equal(c.staff, "b");
  assert.deepEqual(h.one("ERCP, metal stent for malignant stricture").procs, ["ercp.dx", "ercp.metal"]);
  assert.equal(h.one("EGD with Stone").staff, "s");
  assert.equal(h.one("EGD with Dr. Stone").staff, "s");
});

test("paracentesis", () => {
  assert.deepEqual(h.one("diagnostic paracentesis in the ED").procs, ["para.dx"]);
  assert.deepEqual(h.one("therapeutic tap, 6 litres off").procs, ["para.ther"]);
});

test("splitting a day into cases", () => {
  const r = h.parse("EGD with Brook. Then a colon to the transverse.");
  assert.equal(r.cases.length, 2);
  assert.deepEqual(r.cases[1].procs, ["colo.dx"]);
  assert.equal(r.cases[1].reach, "tverse");
  const both = h.one("EGD and colonoscopy with Brook, got to the sigmoid");
  assert.deepEqual(both.procs, ["colo.dx", "egd.dx"].sort((a, b) => both.procs.indexOf(a) - both.procs.indexOf(b)));
  assert.equal(both.reach, "sig");
  const three = h.one("three EGDs with Brook");
  assert.equal(three.n, 3);
  assert.deepEqual(three.procs, ["egd.dx"]);
  const day = h.parse("This morning at HSC with Alpha: an EGD with biopsies for dysphagia. Next, a colonoscopy to the hepatic flexure. Then another one.");
  assert.equal(day.cases.length, 3);
  assert.deepEqual(day.cases[2].procs, ["colo.dx"]);
  assert.equal(day.cases[2].reach, "hf");
});

test("dates", () => {
  const d = t => h.one("EGD " + t).d;
  assert.equal(h.one("EGD").d, null);
  assert.equal(d("yesterday"), "2026-09-27");
  assert.equal(d("on Friday"), "2026-09-25");
  assert.equal(d("on Monday"), "2026-09-28");
  assert.equal(d("last Monday"), "2026-09-21");
  assert.equal(d("on September 3rd"), "2026-09-03");
  assert.equal(d("on the 3rd"), "2026-09-03");
  assert.equal(d("on the 30th"), "2026-08-30");
  assert.equal(d("3rd of August"), "2026-08-03");
});

test("staff: first names, misheard names, aliases, unknown names", () => {
  assert.equal(h.one("EGD with Casey").staff, "b");
  assert.equal(h.one("EGD with Brooke").staff, "b");
  assert.equal(h.one("EGD with Kovalchik").staff, "k");
  assert.equal(h.one("EGD, cove all check was staff").staff, "k");
  const u = h.one("EGD with Dr. Pat Morrow, gastritis");
  assert.equal(u.staff, null);
  assert.equal(u.staffHeard, "Pat Morrow");
  assert.equal(h.one("EGD for melena").staff, null);
});

test("site, location and urgency words", () => {
  const c = h.one("urgent EGD at St. B in the ICU");
  assert.equal(c.site, "stb");
  assert.equal(c.loc, "icu");
  assert.equal(c.urg, "urgent");
  assert.equal(h.one("EGD at the Grace, outpatient").urg, "elective");
  assert.equal(h.one("E G D in the E D at H S C").site, "hsc");
  assert.equal(h.one("E G D in the E D at H S C").loc, "ed");
});

test("leftover words are shown, never guessed", () => {
  assert.deepEqual(h.one("EGD with Brook, patient was lovely, very pleasant").leftover, ["lovely", "pleasant"]);
});

test("learned phrases win", () => {
  const c = h.one("EGD, watermelon vessels", `, learned: [{kind: "found", heard: "watermelon vessels", code: "gave"}]`);
  assert.deepEqual(c.found, ["gave"]);
  assert.deepEqual(c.leftover, []);
});

test("staff matching scores", () => {
  assert.deepEqual(h.val(`scopeStaffMatch("brook", T_STAFF)`), {id: "b", score: 3});
  assert.equal(h.val(`scopeStaffMatch("brooke", T_STAFF)`).score, 2);
  assert.equal(h.val(`scopeStaffMatch("zzz", T_STAFF)`), null);
});

// ---- Carry-forward and inference -------------------------------------------------------------------
test("carry-forward within a dictation and from today's saved cases", () => {
  const drafts = h.parse("EGD with Brook at HSC. Then a colon to the cecum.").cases;
  const out = h.val(`scopeCarry(${JSON.stringify(drafts)}, [], getToday())`);
  assert.equal(out[0].d, "2026-09-28");
  assert.equal(out[1].staff, "b");
  assert.equal(out[1].site, "hsc");
  assert.equal(out[1].loc, "suite");
  assert.equal(out[1].carried.staff, true);
  const saved = [{id: "x", d: "2026-09-28", staff: "a", site: "grace", loc: "ed", ts: "2026-09-28T15:00:00Z", procs: ["egd.dx"]}];
  const later = h.val(`scopeCarry(${JSON.stringify(h.parse("EGD, gastritis").cases)}, ${JSON.stringify(saved)}, getToday())`);
  assert.equal(later[0].staff, "a");
  assert.equal(later[0].site, "grace");
  assert.equal(later[0].loc, "ed");
  const other = h.val(`scopeCarry(${JSON.stringify(h.parse("EGD yesterday").cases)}, ${JSON.stringify(saved)}, getToday())`);
  assert.equal(other[0].staff, null);
});

test("urgency: said, ED/ICU, or logged on call at night or on a weekend", () => {
  const inf = (draft, now, extra = "") => h.val(`scopeInfer(${JSON.stringify(draft)}, {now: ${now}, stretches: T_STR, staff: T_STAFF${extra}})`);
  // A weekday call stretch Mon 28 Sep 17:00 to Tue 08:00, Attending Alpha on at HSC.
  h.run(`globalThis.T_STR = [{s: +new Date(2026, 8, 28, 17), e: +new Date(2026, 8, 29, 8), segs: [{hsc: {att: "Dr. Alpha Attending"}, stb: {att: "Someone Else"}}]}];`);
  const base = {d: "2026-09-28", staff: "a", site: null, loc: "suite", urg: null, procs: ["egd.dx"]};
  assert.equal(inf(base, "+new Date(2026, 8, 28, 21)").urg, "urgent");
  assert.equal(inf(base, "+new Date(2026, 8, 28, 21)").site, "hsc");
  assert.equal(inf(base, "+new Date(2026, 8, 28, 17, 30)").urg, "elective");
  assert.equal(inf({...base, d: "2026-09-28"}, "+new Date(2026, 8, 29, 2)").urg, "urgent");
  assert.equal(inf({...base, urg: "elective"}, "+new Date(2026, 8, 28, 21)").urg, "elective");
  assert.equal(inf({...base, loc: "ed"}, "0").urg, "urgent");
  assert.equal(inf(base, "+new Date(2026, 8, 30, 21)").urg, "elective");
  // A weekend stretch, daytime Saturday.
  h.run(`T_STR.push({s: +new Date(2026, 9, 2, 17), e: +new Date(2026, 9, 5, 8), segs: []});`);
  assert.equal(inf({...base, d: "2026-10-03"}, "+new Date(2026, 9, 3, 11)").urg, "urgent");
});

// ---- EPA mapping ---------------------------------------------------------------------------------------
test("which EPA parts a case could count toward", () => {
  const parts = c => h.val(`scopeEpaParts(${JSON.stringify(c)})`);
  assert.deepEqual(parts({procs: ["egd.dx", "egd.bx"]}), ["f3a"]);
  assert.deepEqual(parts({procs: ["fs.dx"]}), ["f4"]);
  assert.deepEqual(parts({procs: ["colo.dx"], reach: "sig"}), ["f4", "c6"]);
  assert.deepEqual(parts({procs: ["colo.hem.apc"]}), ["c8a"]);
  assert.deepEqual(parts({procs: ["egd.dx", "egd.nv.clip"]}), ["f3a", "c8a"]);
});

// ---- Numbers -------------------------------------------------------------------------------------------
const CASES = [
  {id: "1", d: "2026-07-12", procs: ["egd.dx"], staff: "a", site: "hsc", loc: "suite", urg: "elective", ts: "1"},
  {id: "2", d: "2026-07-22", procs: ["colo.dx"], reach: "hf", staff: "b", ts: "2"},
  {id: "3", d: "2026-08-21", procs: ["egd.dx", "colo.screen"], reach: "sig", staff: "b", ts: "3"},
  {id: "4", d: "2026-08-26", procs: ["colo.dx", "colo.poly"], reach: "cecum", staff: "a", urg: "urgent", ts: "4"},
  {id: "5", d: "2026-08-28", procs: ["egd.dx", "egd.nv.clip"], found: ["du", "active"], staff: "a", ts: "5"},
  {id: "6", d: "2026-09-02", procs: ["colo.hem.apc"], staff: "s", ts: "6"},
  {id: "7", d: "2026-09-03", procs: ["colo.dx", "colo.bigpoly", "colo.poly"], reach: "ti", ts: "7"},
];
test("totals by family, a bidirectional counting both", () => {
  const t = h.val(`scopeTotals(${JSON.stringify(CASES)})`);
  assert.equal(t.egd, 3);
  assert.equal(t.colo, 5);
  assert.equal(t.cases, 7);
  assert.equal(t.procs, 8);
  assert.equal(h.val(`scopeTotals(${JSON.stringify(CASES)}, "2026-08-01", "2026-08-31")`).cases, 3);
});

test("reach series and the rolling cecum share", () => {
  const s = h.val(`scopeReachSeries(${JSON.stringify(CASES)})`);
  assert.deepEqual(s.map(x => x.reach), ["hf", "sig", "cecum", "ti"]);
  assert.deepEqual(s.map(x => x.i), [1, 2, 3, 4]);
  const sh = h.val(`scopeCecumShare(scopeReachSeries(${JSON.stringify(CASES)}), 3)`);
  assert.deepEqual(sh.map(x => x.share), [0, 0, 33, 67]);
});

test("therapeutics against C8, observed from the checklist lines", () => {
  const rows = h.val(`scopeTherapy(${JSON.stringify(CASES)}, PART_BY_ID.c8a.items, id => id === "c8a-4" ? 1 : 0)`);
  const by = Object.fromEntries(rows.map(r => [r.stem, r]));
  assert.equal(by["non-variceal hemostasis"].done, 2);
  assert.equal(by["non-variceal hemostasis"].observed, 1);
  assert.equal(by["non-variceal hemostasis"].min, 8);
  assert.equal(by["polypectomy"].done, 2);
  assert.equal(by["polypectomy >1 cm"].done, 1);
  assert.equal(by["actively bleeding"].done, 1);
  assert.equal(by["variceal hemostasis"].done, 0);
});

test("firsts, breadth, the week and the change since a date", () => {
  const f = h.val(`scopeFirsts(${JSON.stringify(CASES)})`);
  assert.deepEqual(f.slice(0, 3).map(x => [x.label, x.d]), [["First procedure logged", "2026-07-12"],
    ["First colonoscopy you drove", "2026-07-22"], ["First colonoscopy to the cecum", "2026-08-26"]]);
  assert.ok(f.some(x => x.label === "First terminal ileum intubation" && x.d === "2026-09-03"));
  const b = h.val(`scopeBreadth(${JSON.stringify(CASES)}, null, null, T_STAFF)`);
  assert.equal(b.staff[0].id, "a");
  assert.equal(b.staff[0].n, 3);
  assert.equal(b.staff[b.staff.length - 1].id, "none");
  assert.equal(b.urg.urgent, 1);
  const w = h.val(`scopeWeek(${JSON.stringify(CASES)}, "2026-08-20", "2026-08-27")`);
  assert.deepEqual(w, {n: 2, procs: 3, furthest: "cecum"});
  const ch = h.val(`scopeChange(${JSON.stringify(CASES)}, "2026-08-25")`);
  assert.equal(ch.cases, 4);
  assert.equal(ch.colos, 2);
  assert.equal(ch.shareThen, 0);
  assert.equal(ch.shareNow, 50);
});

test("summaries read like the fellow says them", () => {
  const s = c => h.val(`scopeSummary(${JSON.stringify(c)})`);
  assert.equal(s({procs: ["egd.dx", "egd.bx", "egd.nv.clip"]}), "EGD · biopsy, clip");
  assert.equal(s({procs: ["colo.dx", "colo.poly"], reach: "hf"}), "Colonoscopy to HF · polypectomy");
  assert.equal(s({procs: ["egd.dx", "colo.screen"], reach: "sig"}), "EGD + Screening colonoscopy to Sig");
  assert.equal(s({procs: ["colo.hem.apc"]}), "Colonoscopy · APC");
  assert.equal(s({procs: ["egd.entero"]}), "Push enteroscopy");
});

test("the spreadsheet: T-Res codes, quoting and a byte order mark", () => {
  const cases = [{id: "1", d: "2026-08-26", procs: ["colo.dx", "colo.poly"], reach: "tverse", staff: "b", site: "stb", loc: "suite",
    urg: "elective", why: ["surv"], found: ["polyp", "divertic"], note: 'said "hi", then left'}];
  const csv = h.val(`scopeCSV(${JSON.stringify(cases)}, T_STAFF)`);
  assert.ok(csv.startsWith("﻿Date,Procedure,"));
  assert.match(csv, /2026-08-26,Colonoscopy,ColoDiag: To Tverse; Colo: Polypectomy,Transverse,Polyp surveillance,Polyp; Diverticulosis,"Brook, Casey",St\. Boniface,Endoscopy suite,Elective,"said ""hi"", then left"\r\n$/);
});

test("import merges by id and staff by name", () => {
  const empty = {cases: [], staff: [{id: "x1", name: "Brook, Casey", aliases: []}], learned: []};
  const file = {kind: "gi-scopes", v: 1, staff: [{id: "p1", name: "Brook, Casey", aliases: ["brooke"]}, {id: "p2", name: "Attending, Alpha"}],
    cases: [{id: "t1", d: "2026-07-12", staff: "p1", procs: ["egd.dx", "nope"]}, {id: "t2", d: "2026-07-13", staff: "p2", procs: ["egd.bx"]}, {id: "bad"}]};
  const r = h.val(`scopeImport(${JSON.stringify(empty)}, ${JSON.stringify(file)})`);
  assert.equal(r.ok, true);
  assert.equal(r.added, 2);
  assert.equal(r.skipped, 1);
  assert.equal(r.staffAdded, 1);
  assert.equal(r.next.cases[0].staff, "x1");
  assert.deepEqual(r.next.cases[0].procs, ["egd.dx"]);
  assert.deepEqual(r.next.staff[0].aliases, ["brooke"]);
  const again = h.val(`scopeImport(${JSON.stringify(r.next)}, ${JSON.stringify(file)})`);
  assert.equal(again.added, 0);
  assert.equal(h.val(`scopeImport(${JSON.stringify(empty)}, {kind: "other"})`).ok, false);
});
