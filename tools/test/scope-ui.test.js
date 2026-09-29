"use strict";
// The Endo tab: the capture box and cards, saving and undo, editing, the
// staff roster and learning, the EPA offer, Progress, the Week recap line,
// import, and the scope log in the backup.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {load, state} = require("./harness");

// Placeholder staff only.
const STAFF = [{id: "sa", name: "Attending, Alpha", aliases: [], hidden: false}, {id: "sb", name: "Brook, Casey", aliases: [], hidden: false}];
const withScopes = (cases = [], extra = {}) => state({}, {scopes: {cases, staff: STAFF, learned: [], lastReport: null, reportName: "", hintOff: null, ...extra}});
function endo(today = "2026-09-28", st) {
  const h = load({today, state: st});
  h.click("tab", {page: "endo"});
  h.type = text => h.run(`scopeField({dataset: {scopefield: "text"}, value: ${JSON.stringify(text)}})`);
  h.say = text => { h.type(text); h.click("scoperead"); };
  h.card = (i = 0) => h.val(`scopeCap.cards[${i}]`);
  return h;
}

test("the bar's Endo tab opens on Log with the capture box; Biopsy lives inside", () => {
  const h = endo();
  const html = h.html();
  assert.match(html, /<h1 class="title">Endo<\/h1>/);
  assert.match(html, /class="segtabs three"/);
  assert.match(html, /id="scopebox-tab"/);
  assert.match(html, /Read it/);
  assert.match(html, /Your logbook starts here/);
  assert.match(html, /class="nv on" data-action="tab" data-page="endo"/);
  h.click("scopetab", {tab: "biopsy"});
  assert.match(h.html(), /Open the full Manitoba guideline/);
  assert.doesNotMatch(h.html(), /<h1 class="title">Biopsy<\/h1>/);
});

test("the + button opens the capture sheet with a way to the EPA sheet", () => {
  const h = load({today: "2026-09-28"});
  assert.match(h.html(), /class="fab" data-action="scopeopen"/);
  h.click("scopeopen");
  assert.match(h.html(), /aria-label="Log a case"/);
  assert.match(h.html(), /id="scopebox-sheet"/);
  h.click("sheet");
  assert.match(h.html(), /Log observation/);
  assert.doesNotMatch(h.html(), /id="scopebox-sheet"/);
});

test("say a case, read it, confirm, save; undo takes it back", () => {
  const h = endo("2026-09-28", withScopes());
  h.say("EGD with Brook at HSC, biopsies for dysphagia, EoE");
  const c = h.card();
  assert.equal(c.staff, "sb");
  assert.equal(c.site, "hsc");
  assert.equal(c.loc, "suite");
  assert.equal(c.urg, "elective");
  assert.deepEqual(c.procs, ["egd.dx", "egd.bx"]);
  const html = h.html();
  assert.match(html, /class="scard/);
  assert.match(html, /<b>EGD<\/b>/);
  assert.match(html, />Biopsy</);
  assert.match(html, /Dr\. Brook/);
  assert.match(html, /Save case/);
  h.click("scopesave");
  const saved = h.saved().scopes.cases;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].d, "2026-09-28");
  assert.equal(saved[0].staff, "sb");
  assert.deepEqual(saved[0].why, ["dysphagia"]);
  assert.match(h.html(), /Case saved/);
  assert.match(h.html(), /<h2>Today<\/h2>/);
  h.click("undo");
  assert.equal(h.saved().scopes.cases.length, 0);
});

test("a whole day becomes several cards; three EGDs save three cases", () => {
  const h = endo("2026-09-28", withScopes());
  h.say("Three EGDs with Alpha. Then a colonoscopy to the hepatic flexure.");
  assert.equal(h.val("scopeCap.cards.length"), 2);
  assert.equal(h.card(1).staff, "sa");
  assert.match(h.html(), /Save all 4/);
  h.click("scopesave");
  assert.equal(h.saved().scopes.cases.length, 4);
  assert.match(h.html(), /4 procedures saved/);
});

test("a colonoscopy needs its reach: tap a landmark, or choose therapy only", () => {
  const h = endo("2026-09-28", withScopes());
  h.say("colonoscopy with Brook");
  const key = h.card().key;
  h.click("scopesave");
  assert.equal(h.saved().scopes.cases.length, 0);
  assert.match(h.html(), /Tap how far you got/);
  h.click("scopereach", {key, r: "tverse"});
  assert.equal(h.card().reach, "tverse");
  assert.match(h.html(), /Colonoscopy to transverse/);
  h.click("scopereach", {key, r: "none"});
  assert.equal(h.card().reach, null);
  assert.ok(!h.card().procs.includes("colo.dx"));
  h.click("scopereach", {key, r: "cecum"});
  h.click("scopesave");
  assert.equal(h.saved().scopes.cases[0].reach, "cecum");
});

test("chips: remove, add through search, site and location toggles, urgency", () => {
  const h = endo("2026-09-28", withScopes());
  h.say("EGD with Brook, gastritis");
  const key = h.card().key;
  h.click("scopedrop", {key, kind: "found", code: "gastritis"});
  assert.deepEqual(h.card().found, []);
  h.click("scopechip", {key, kind: "found"});
  assert.match(h.html(), /class="sheet picksheet/);
  h.run(`scopeField({dataset: {scopefield: "pick"}, value: "angio"})`);
  assert.deepEqual(h.val("scopePickOptions().map(o => o.code)"), ["angio"]);
  h.click("scopepicked", {kind: "found", code: "angio"});
  assert.deepEqual(h.card().found, ["angio"]);
  h.click("scopeset", {key, kind: "loc", v: "icu"});
  assert.equal(h.card().loc, "icu");
  assert.equal(h.card().urg, "urgent");
  h.click("scopeset", {key, kind: "site", v: "grace"});
  assert.equal(h.card().site, "grace");
  h.click("scopeurg", {key});
  assert.equal(h.card().urg, "elective");
});

test("an unknown name can be added as staff; a correction teaches the spelling", () => {
  const h = endo("2026-09-28", withScopes());
  h.say("EGD with Dr. Pat Morrow");
  assert.match(h.html(), /Add Pat Morrow/);
  h.click("scopenewstaff", {key: h.card().key});
  const id = h.card().staff;
  assert.equal(h.val(`scopeData().staff.find(p => p.id === ${JSON.stringify(id)}).name`), "Pat Morrow");
  // Dictation heard someone else; picking the right person teaches the app.
  h.click("scopeclear");
  h.say("EGD with Brooklyn");
  const key = h.card().key;
  h.click("scopechip", {key, kind: "staff"});
  h.click("scopepicked", {kind: "staff", code: "sa"});
  assert.deepEqual(h.saved().scopes.staff.find(p => p.id === "sa").aliases, ["brooklyn"]);
  h.click("scopeclear");
  h.say("EGD with Brooklyn");
  assert.equal(h.card().staff, "sa");
});

test("leftover words: teach what they mean, or move them to the note", () => {
  const h = endo("2026-09-28", withScopes());
  h.say("EGD with Brook, watermelon, lovely");
  const key = h.card().key;
  assert.match(h.html(), /Didn&#39;t catch|Didn't catch/);
  h.click("scopeteach", {key, w: "watermelon"});
  assert.match(h.html(), /You said “watermelon”/);
  h.click("scopepicked", {kind: "found", code: "gave"});
  assert.deepEqual(h.card().found, ["gave"]);
  assert.deepEqual(h.card().leftover, ["lovely"]);
  assert.deepEqual(h.saved().scopes.learned, [{kind: "found", heard: "watermelon", code: "gave"}]);
  h.click("scopetonote", {key});
  assert.equal(h.card().note, "lovely");
});

test("the EPA offer adds a pending observation with the staff member, only in the active stage", () => {
  const h = endo("2026-09-28", withScopes());
  h.say("EGD with Brook");
  const key = h.card().key;
  assert.match(h.html(), /Add <b>F3-A<\/b> as pending with Dr\. Brook/);
  h.click("scopeepa", {key, pid: "f3a"});
  h.click("scopesave");
  const o = h.saved().obs.f3a;
  assert.equal(o.length, 1);
  assert.equal(o[0].status, "pending");
  assert.equal(o[0].a, "Dr. Brook");
  assert.equal(o[0].n, "From scope log: EGD");
  assert.match(h.html(), /F3-A pending/);
  h.click("undo");
  assert.equal((h.saved().obs.f3a || []).length, 0);
  // Colonoscopy (C6) is Core: no offer while Foundations is open.
  h.say("colonoscopy with Brook to the cecum");
  assert.doesNotMatch(h.html(), /<b>C6<\/b>/);
  assert.match(h.html(), /<b>F4<\/b>/);
});

test("no staff, no offer; the number guard shows on the box", () => {
  const h = endo("2026-09-28", withScopes());
  h.say("EGD, MRN 12345678");
  assert.doesNotMatch(h.html(), /class="offer/);
  assert.match(h.html(), /Removed a number that could identify a patient/);
  assert.doesNotMatch(JSON.stringify(h.val("scopeCap")), /12345678/);
});

test("carry-forward from today's saved case, and the context line", () => {
  const cases = [{id: "x1", d: "2026-09-28", staff: "sb", site: "stb", loc: "suite", urg: "elective", procs: ["egd.dx"], why: [], found: [], ts: "2026-09-28T14:00:00.000Z"}];
  const h = endo("2026-09-28", withScopes(cases));
  assert.match(h.html(), /Dr\. Brook · St\. B · Suite/);
  h.say("EGD, gastritis");
  assert.equal(h.card().staff, "sb");
  assert.equal(h.card().site, "stb");
  assert.match(h.html(), /class="on carried"/);
});

test("today's rows edit, delete with undo, and log another like that", () => {
  const cases = [{id: "x1", d: "2026-09-28", staff: "sb", site: "hsc", loc: "suite", urg: "elective", procs: ["colo.dx", "colo.poly"], reach: "hf", why: [], found: ["polyp"], ts: "1"},
    {id: "x0", d: "2026-09-25", staff: "sa", site: "hsc", loc: "suite", urg: "urgent", procs: ["egd.dx", "egd.nv.clip"], why: ["melena"], found: ["du"], ts: "0"}];
  const h = endo("2026-09-28", withScopes(cases));
  const html = h.html();
  assert.match(html, /Colonoscopy to HF · polypectomy/);
  assert.match(html, /<h2>Earlier<\/h2>/);
  assert.match(html, /Fri 25 Sep/);
  assert.match(html, /class="urgtick"/);
  h.click("scopeedit", {id: "x1"});
  assert.match(h.html(), /Edit case/);
  const key = h.val("scopeSheet.card.key");
  h.click("scopereach", {key, r: "cecum"});
  h.click("scopeupdate");
  assert.equal(h.saved().scopes.cases.find(c => c.id === "x1").reach, "cecum");
  h.click("scopeedit", {id: "x1"});
  h.click("scopedelete");
  assert.equal(h.saved().scopes.cases.length, 1);
  h.click("undo");
  assert.equal(h.saved().scopes.cases.length, 2);
  h.click("scopeagain", {id: "x0"});
  assert.match(h.html(), /Another like that/);
  h.click("scopesavecopy");
  const all = h.saved().scopes.cases;
  assert.equal(all.length, 3);
  assert.equal(all[2].d, "2026-09-28");
  assert.deepEqual(all[2].procs, ["egd.dx", "egd.nv.clip"]);
});

test("search earlier cases", () => {
  const cases = [{id: "a", d: "2026-09-20", staff: "sb", procs: ["egd.dx"], why: [], found: ["gastritis"], ts: "1"},
    {id: "b", d: "2026-09-21", staff: "sa", procs: ["colo.dx"], reach: "sig", why: [], found: [], ts: "2"}];
  const h = endo("2026-09-28", withScopes(cases));
  h.run(`scopeSearch = "gastritis"`);
  const html = h.val("scopeRecentHTML()");
  assert.match(html, /EGD/);
  assert.doesNotMatch(html, /Colonoscopy/);
});

test("before the next case: ask while Foundations EPAs need these; dismiss for the day", () => {
  const cases = [{id: "x1", d: "2026-09-28", staff: "sb", procs: ["egd.dx"], why: [], found: [], ts: "1"}];
  const h = endo("2026-09-28", withScopes(cases));
  assert.match(h.html(), /Before your next case/);
  assert.match(h.html(), /F3-A \(EGD\) needs 6, F4 \(Flex sig\) needs 6/);
  h.click("scopehintoff");
  assert.doesNotMatch(h.html(), /Before your next case/);
  assert.equal(h.saved().scopes.hintOff, "2026-09-28");
});

test("Progress: colon depth, totals, the cecum share, therapeutics, firsts, breadth, report", () => {
  const mk = (id, d, reach, extra = {}) => ({id, d, staff: "sb", site: "hsc", loc: "suite", urg: "elective", procs: ["colo.dx"], reach, why: [], found: [], ts: id, ...extra});
  const cases = [mk("1", "2026-07-22", "hf"), mk("2", "2026-08-21", "sig"), mk("3", "2026-08-26", "cecum"), mk("4", "2026-09-10", "ti"), mk("6", "2026-09-12", "cecum"),
    {id: "5", d: "2026-09-11", staff: "sa", procs: ["egd.dx", "egd.nv.clip"], found: ["du", "active"], why: [], urg: "urgent", ts: "5"}];
  const h = endo("2026-09-28", withScopes(cases));
  h.click("scopetab", {tab: "progress"});
  const html = h.html();
  assert.match(html, /Colon depth/);
  const depth = html.slice(html.indexOf('class="chart depth'), html.indexOf("</svg>", html.indexOf('class="chart depth')));
  assert.equal((depth.match(/class="ch-dot(hi)?[" ]/g) || []).length, 5);
  assert.match(html, /3\/5 last 5/);
  assert.match(html, /<h2>Totals<\/h2>/);
  assert.match(html, /<h2>Reached the cecum<\/h2>/);
  assert.match(html, /Non-variceal hemostasis/);
  assert.match(html, /<b>1<\/b> done · 0\/8 observed/);
  assert.match(html, /First colonoscopy to the cecum/);
  assert.match(html, /<h2>Breadth<\/h2>/);
  assert.match(html, /Export report \(PDF\)/);
  h.click("scopedot", {id: "2"});
  assert.match(h.html(), /Case 2<\/span><b>Sigmoid<\/b>/);
});

test("Progress with nothing logged invites logging", () => {
  const h = endo("2026-09-28", withScopes());
  h.click("scopetab", {tab: "progress"});
  assert.match(h.html(), /Every colonoscopy you drive lands here/);
});

test("the Week recap mentions last week's scopes", () => {
  const cases = [{id: "a", d: "2026-09-28", procs: ["colo.dx"], reach: "hf", why: [], found: [], ts: "1"},
    {id: "b", d: "2026-09-29", procs: ["egd.dx"], why: [], found: [], ts: "2"}];
  const h = load({today: "2026-10-01", state: withScopes(cases)});
  assert.match(h.html(), /Scopes last week: <b>2<\/b> · furthest colon: <b>hepatic flexure<\/b>/);
});

test("staff screen: rename, hide, add", () => {
  const h = endo("2026-09-28", withScopes());
  h.click("scopestaffopen");
  assert.match(h.html(), /aria-label="Staff"/);
  assert.match(h.html(), /value="Brook, Casey"/);
  h.click("scopehide", {id: "sb"});
  assert.equal(h.saved().scopes.staff.find(p => p.id === "sb").hidden, true);
  h.run(`scopeField({dataset: {scopefield: "addstaff"}, value: "Delta, Echo"})`);
  h.click("scopeaddstaff");
  assert.ok(h.saved().scopes.staff.some(p => p.name === "Delta, Echo"));
  h.run(`scopeFieldChange({dataset: {staffname: "sa"}, value: "Attending, Alfa"})`);
  assert.equal(h.saved().scopes.staff.find(p => p.id === "sa").name, "Attending, Alfa");
});

test("import a cases file: merge, report, undo", () => {
  const file = fs.readFileSync(path.join(__dirname, "fixtures", "scope-import.json"), "utf8");
  const h = endo("2026-09-28", withScopes());
  h.run(`scopeImportText(${JSON.stringify(file)})`);
  const s = h.saved().scopes;
  assert.equal(s.cases.length, 4);
  assert.ok(s.staff.some(p => p.name === "Foxtrot, Golf"));
  assert.match(h.val("toast.msg"), /Imported 4 cases, 1 staff/);
  h.run(`scopeImportText(${JSON.stringify(file)})`);
  assert.equal(h.saved().scopes.cases.length, 4);
  assert.match(h.val("toast.msg"), /\(4 already here\)/);
  h.run(`scopeImportText("not json")`);
  assert.match(h.val("scopeErr"), /Couldn't read that file/);
});

test("the backup keeps the scope log; an older backup loads with an empty one", () => {
  const cases = [{id: "a", d: "2026-09-20", staff: "sb", procs: ["egd.dx"], why: [], found: [], ts: "1"}];
  const h = load({today: "2026-09-28", state: withScopes(cases)});
  const json = h.val("Store.exportJSON()");
  assert.equal(JSON.parse(json).scopes.cases.length, 1);
  assert.equal(JSON.parse(json).scopes.staff[1].name, "Brook, Casey");
  const g = load({today: "2026-09-28"});
  g.run(`Store.importJSON(${JSON.stringify(json)})`);
  assert.equal(g.saved().scopes.cases.length, 1);
  const old = load({today: "2026-09-28", state: state({})});
  assert.deepEqual(old.val("Store.state.scopes.cases"), []);
  assert.equal(old.val("Store.hasData()"), false);
});
