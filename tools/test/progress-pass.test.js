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

// ---- The block report card ----------------------------------------------------------------------
// Block 3 runs 27 Aug to 23 Sep, Block 4 from 24 Sep; on 9 Oct Block 4 is 16 days in.
const {obs} = require("./harness");
const BLOCKS = [
  colo("b1", "2026-08-28", "sf"), egd("b2", "2026-08-30"), colo("b3", "2026-09-02", "hf"), colo("b4", "2026-09-20", "cecum"),
  colo("n1", "2026-09-25", "cecum"), colo("n2", "2026-09-30", "ti"), egd("n3", "2026-10-01", {d2: "yes"}), colo("n4", "2026-10-02", "hf"),
  egd("n5", "2026-10-05", {d2: "staff"}), egd("n6", "2026-10-06"), colo("n7", "2026-10-07", "cecum", {procs: ["colo.dx", "colo.poly"], found: ["polyp"]}),
];
const OBS = {f3a: [obs("2026-09-10"), obs("2026-09-15"), obs("2026-10-01", {status: "pending"})]};
const card = (h, num = 4) => h.val(`scopeBlockCard(${JSON.stringify(BLOCKS)}, ${JSON.stringify(OBS)}, ${num}, getToday())`);
const row = (bc, label) => bc.rows.find(r => r.label === label);

test("block card: rates and reach compare whole blocks, with arrows", () => {
  const bc = card(engine());
  assert.equal(bc.num, 4);
  assert.equal(bc.prev, 3);
  assert.equal(bc.elapsed, 16);
  assert.deepEqual(row(bc, "To the cecum yourself"), {label: "To the cecum yourself", now: "3 of 4", was: "1 of 3", dir: "up", kind: "rate"});
  assert.deepEqual(row(bc, "Usual reach"), {label: "Usual reach", now: "Cecum", was: "HF", dir: "up", kind: "rate"});
});

test("block card: counts compare the same days of each block, so a block in progress isn't behind", () => {
  const bc = card(engine());
  assert.deepEqual(row(bc, "Procedures"), {label: "Procedures", now: "7", was: "3", dir: "up", kind: "count"});
  assert.deepEqual(row(bc, "Therapeutic cases"), {label: "Therapeutic cases", now: "1", was: "0", dir: "up", kind: "count"});
  assert.deepEqual(row(bc, "EPAs logged"), {label: "EPAs logged", now: "1", was: "1", dir: "same", kind: "count"});
  assert.match(bc.note, /Counts compare the first 16 days of each block/);
});

test("block card: D2 counts answered EGDs only and says how many were left out", () => {
  const bc = card(engine());
  assert.deepEqual(row(bc, "D2 yourself"), {label: "D2 yourself", now: "1 of 2", was: "None", dir: null, kind: "rate"});
  assert.match(bc.note, /1 EGD not recorded, left out/);
  const none = engine().val(`scopeBlockCard(${JSON.stringify(BLOCKS.filter(c => !c.d2))}, {}, 4, getToday())`);
  assert.equal(none.rows.find(r => r.label === "D2 yourself"), undefined);
  assert.doesNotMatch(none.note, /D2|EGD/);
});

test("block card: a day strip for the block, and Block 1 stands alone", () => {
  const bc = card(engine());
  assert.equal(bc.days.length, 28);
  assert.deepEqual(bc.days.slice(0, 2).map(x => [x.d, x.n, x.future]), [["2026-09-24", 0, false], ["2026-09-25", 1, false]]);
  assert.equal(bc.days[16].future, true);
  assert.equal(bc.scopeDays, 7);
  const one = engine("2026-07-20").val(`scopeBlockCard([${JSON.stringify(colo("x", "2026-07-15", "sf"))}], {}, 1, getToday())`);
  assert.equal(one.prev, null);
  assert.equal(row(one, "To the cecum yourself").was, null);
  assert.equal(row(one, "To the cecum yourself").dir, null);
  assert.equal(engine().val(`scopeBlockCard([], {}, 5, getToday())`), null);
});

test("Progress opens with the block card; the arrows step back a block; fellows don't get it", () => {
  const h = endo("2026-10-09", withScopes(BLOCKS, {}, {obs: OBS}));
  h.click("scopetab", {tab: "progress"});
  let html = h.html();
  assert.match(html, /aria-label="Block report card"/);
  assert.ok(html.indexOf("Block report card") < html.indexOf("Colon depth"));
  assert.match(html, /Block 4 · Motility\/Nutrition/);
  assert.match(html, /Against Block 3/);
  assert.match(html, /<b>3 of 4<\/b>/);
  assert.match(html, /data-action="scopeblock" data-step="1" disabled/);
  h.click("scopeblock", {step: "-1"});
  html = h.html();
  assert.match(html, /Block 3 · Hepatology/);
  assert.match(html, /Against Block 2/);
  assert.doesNotMatch(html, /data-action="scopeblock" data-step="1" disabled/);
  const f = endo("2026-10-09", state({}, {setup: {d: "2026-09-01"}, scopes: {cases: BLOCKS, staff: STAFF, learned: []}}), {edition: "fellows"});
  f.click("scopetab", {tab: "progress"});
  assert.doesNotMatch(f.html(), /Block report card/);
});

// ---- Year 1 so far, the year in review once it ends -----------------------------------------------
const YEAR = BLOCKS.map(c => c.id === "n1" ? {...c, staff: "ss"} : c);
const STUDY = {log: {"2026-09-30": 4, "2026-10-02": 8, "2026-10-05": 12}, q: {}, pauses: [], qa: {q1: {ok: true}, q2: {ok: false}}};
const yearState = () => withScopes(YEAR, {}, {obs: OBS, study: STUDY});
function yearOf(today = "2026-10-09") {
  const h = load({today, state: yearState()});
  return {h, y: h.val("reviewYear(Store.state, getToday())")};
}

test("year so far: procedures by month, the cecum, the best run and the busiest list", () => {
  const {y} = yearOf();
  assert.equal(y.title, "Year 1 so far");
  assert.equal(y.over, false);
  assert.equal(y.procs, 11);
  assert.deepEqual(y.months.map(m => [m.label, m.n, m.future]).slice(0, 5),
    [["Jul", 0, false], ["Aug", 2, false], ["Sep", 4, false], ["Oct", 5, false], ["Nov", 0, true]]);
  assert.equal(y.months.length, 12);
  assert.deepEqual([y.colos, y.cecum], [7, 4]);
  assert.equal(y.firstCecum, "2026-09-20");
  assert.deepEqual(y.bestRun, {n: 3, d: "2026-09-30"});
  assert.deepEqual(y.busiest, {n: 1, d: "2026-08-28"});
  assert.equal(y.scopeDays, 11);
  assert.deepEqual(y.mostWith, {name: "Brook", n: 10});
  assert.equal(y.tx, 1);
});

test("year so far: D2 answered only, EPAs against the 133, and the reading", () => {
  const {h, y} = yearOf();
  assert.deepEqual(y.d2, {yes: 1, of: 2, left: 2});
  assert.equal(y.epas.req, 133);
  assert.equal(y.epas.logged, h.val("tally(PARTS).logged"));
  assert.equal(y.epas.stage, h.val("STAGE_NAMES[currentStage()]"));
  assert.deepEqual([y.study.pages, y.study.nights, y.study.answered, y.study.right], [12, 3, 2, 1]);
  assert.equal(y.study.total, h.val("studySeq().total"));
});

test("on 30 June it becomes the year in review", () => {
  const {y} = yearOf("2027-06-30");
  assert.equal(y.title, "Year 1 in review");
  assert.equal(y.over, true);
  assert.equal(y.months.filter(m => m.future).length, 0);
  assert.equal(y.span, "July 2026 to June 2027");
});

test("Year 1 so far opens from the block card and from the Year plan, with Save as image", () => {
  const h = endo("2026-10-09", yearState());
  h.click("scopetab", {tab: "progress"});
  assert.match(h.html(), /data-action="reviewopen"[^>]*>[^<]*(?:<[^>]+>)*[^<]*Year 1 so far/);
  h.click("reviewopen");
  let html = h.html();
  assert.match(html, /role="dialog" aria-modal="true" aria-label="Year 1 so far"/);
  assert.match(html, /data-action="reviewsave"/);
  assert.match(html, /Save as image/);
  assert.match(html, /Best run to the cecum/);
  assert.match(html, /D2 yourself/);
  h.click("reviewclose");
  assert.doesNotMatch(h.html(), /aria-label="Year 1 so far"/);
  h.click("tab", {page: "plan"});
  assert.match(h.html(), /data-action="reviewopen"/);
});

test("the image draws the title and the numbers; the fellows' edition has no year view", () => {
  const {h} = yearOf();
  const calls = h.val(`(() => { const out = []; const ctx = new Proxy({}, {get: (o, k) => k === "measureText" ? (s => ({width: String(s).length * 10})) :
    k in o ? o[k] : (...a) => { if (k === "fillText") out.push(String(a[0])); }, set: (o, k, v) => { o[k] = v; return true; }});
    reviewDraw(ctx, reviewYear(Store.state, getToday()), 1080, 1350); return out; })()`);
  assert.ok(calls.includes("Year 1 so far"), calls.join("|"));
  assert.ok(calls.includes("11"), calls.join("|"));
  const f = endo("2026-10-09", state({}, {setup: {d: "2026-09-01"}, scopes: {cases: YEAR, staff: STAFF, learned: []}}), {edition: "fellows"});
  f.click("scopetab", {tab: "progress"});
  assert.doesNotMatch(f.html(), /reviewopen/);
});
