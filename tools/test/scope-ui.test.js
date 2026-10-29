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
const withScopes = (cases = [], extra = {}, more = {}) => state({}, {scopes: {cases, staff: STAFF, learned: [], lastReport: null, reportName: "", hintOff: null, ...extra}, ...more});
function endo(today = "2026-09-28", st) {
  const h = load({today, state: st});
  h.click("tab", {page: "endo"});
  h.type = text => h.run(`scopeField({dataset: {scopefield: "text"}, value: ${JSON.stringify(text)}})`);
  h.say = text => { h.type(text); h.click("scoperead"); };
  h.card = (i = 0) => h.val(`scopeCap.cards[${i}]`);
  return h;
}

test("the bar's Endo tab opens on Log with the capture box; Biopsy moved to Guides", () => {
  const h = endo();
  const html = h.html();
  assert.match(html, /<h1 class="title">Endo<\/h1>/);
  assert.match(html, /aria-label="Endo views"/);
  assert.doesNotMatch(html, /data-tab="biopsy"/);
  assert.match(html, /id="scopebox-tab"/);
  assert.match(html, /Read it/);
  assert.match(html, /Your logbook starts here/);
  assert.match(html, /class="nv on" data-action="tab" data-page="endo"/);
  h.click("tab", {page: "biopsy"});
  assert.match(h.html(), /Open the full Manitoba guideline/);
  assert.match(h.html(), /<h1 class="title">Guides<\/h1>/);
  assert.match(h.html(), /class="nv on" data-action="tab" data-page="guides"/);
});

test("the + button opens the capture sheet with a way to the EPA sheet", () => {
  const h = load({today: "2026-09-28"});
  assert.match(h.html(), /class="fab mid" data-action="scopeopen"/);
  h.click("scopeopen");
  assert.match(h.html(), /aria-label="Log a case"/);
  assert.match(h.html(), /id="scopebox-sheet"/);
  h.click("plusto", {to: "e"});
  assert.match(h.html(), /Log observation/);
  assert.doesNotMatch(h.html(), /id="scopebox-sheet"/);
});

test("the + stays in the bar while Endo's save bar is up: inside the bar it covers nothing", () => {
  const h = endo("2026-09-28", withScopes());
  h.say("EGD with Brook at HSC, biopsies for dysphagia, EoE");
  assert.match(h.html(), /class="savebar"/);
  assert.match(h.html(), /class="fab mid"/);
  assert.doesNotMatch(h.html(), /class="fab float"/);
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
  assert.match(html, /<\/svg>Brook</);
  assert.doesNotMatch(html, /Dr\.? Brook/);
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

test("a new date relabels the card's chip in place, so a tap that closes the picker still lands", () => {
  const h = endo("2026-09-28", withScopes());
  h.say("EGD with Brook at HSC, biopsies for dysphagia, EoE");
  const key = h.card().key;
  assert.match(h.html(), new RegExp(`<span id="cdate-${key}">Today</span>`));
  // The change event can fire as the picker closes to a tap elsewhere on the page.
  h.els.app.innerHTML = "the page being tapped";
  h.els["cdate-" + key] = {innerHTML: "Today"};
  h.fire("change", {dataset: {scopedate: key}, value: "2026-09-27"});
  assert.equal(h.els.app.innerHTML, "the page being tapped");
  assert.equal(h.els["cdate-" + key].innerHTML, "Yesterday");
  assert.equal(h.card().d, "2026-09-27");
  h.click("scopesave");
  assert.equal(h.saved().scopes.cases[0].d, "2026-09-27");
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
  assert.match(h.html(), /Add <b>F3-A<\/b> as pending with Brook/);
  h.click("scopeepa", {key, pid: "f3a"});
  h.click("scopesave");
  const o = h.saved().obs.f3a;
  assert.equal(o.length, 1);
  assert.equal(o[0].status, "pending");
  assert.equal(o[0].a, "Brook");
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
  assert.match(h.html(), />Brook · St\. B · Suite/);
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
  assert.match(h.html(), /Case 2<\/span><b>Sigmoid with Brook<\/b>/);
});

test("a tap on a colon-depth dot opens a note by it: the day, how far, who with, what else; a tap on it opens the case", () => {
  const mk = (id, d, reach, extra = {}) => ({id, d, staff: "sb", site: "hsc", loc: "suite", urg: "elective", procs: ["colo.dx"], reach, why: [], found: [], ts: id, ...extra});
  const cases = [mk("1", "2026-07-22", "sig", {staff: "sa"}),
    mk("2", "2026-10-21", "cecum", {procs: ["colo.dx", "colo.poly", "colo.hem.clip", "egd.dx"], found: ["normal", "polyp"], site: "stb", loc: "ed", urg: "urgent"}),
    mk("3", "2026-10-22", "hf", {staff: ""})];
  const h = endo("2026-10-28", withScopes(cases));
  h.click("scopetab", {tab: "progress"});
  const pop = () => (h.html().match(/<button class="dotpop[\s\S]*?<\/button>/) || [""])[0];
  // Nothing until a dot is tapped, and no line under the chart any more.
  assert.equal(pop(), "");
  assert.doesNotMatch(h.html(), /class="readout|class="ch-bg"/);
  h.click("scopedot", {id: "2"});
  assert.match(pop(), /^<button class="dotpop c dn in" style="--x:55\.2%;--y:18\.9%" data-action="scopeedit" data-id="2">/);
  // It pops in once, not on every redraw.
  h.run("render()");
  assert.match(pop(), /^<button class="dotpop c dn" style/);
  assert.match(pop(), /<span class="mono">Wed 21 Oct · Case 2<\/span>/);
  assert.match(pop(), /<b>Cecum with Brook<\/b>/);
  assert.match(pop(), /<span class="dp-s">Polypectomy, clip · Polyp · \+ EGD · St\. B · ED · Urgent<\/span>/);
  assert.match(h.html(), /class="ch-dothi sel"/);
  // The same dot again closes it; so does a tap anywhere else on the chart.
  h.click("scopedot", {id: "2"});
  assert.equal(pop(), "");
  h.click("scopedot", {id: "1"});
  assert.match(pop(), /^<button class="dotpop l up in"/);
  assert.match(pop(), /<b>Sigmoid with Attending<\/b><span class="dp-s">HSC<\/span>/);
  assert.match(h.html(), /<rect class="ch-bg" x="0" y="0" width="330" height="206" data-action="scopedot" data-id=""\/>/);
  h.click("scopedot", {id: ""});
  assert.equal(pop(), "");
  // No staff: just how far.
  h.click("scopedot", {id: "3"});
  assert.match(pop(), /^<button class="dotpop r dn in"/);
  assert.match(pop(), /<span class="mono">Thu 22 Oct · Latest<\/span><b>Hepatic flexure<\/b>/);
  // The note opens the case.
  h.click("scopeedit", {id: "3"});
  assert.equal(h.val("scopeSheet.id"), "3");
});

test("the fellows' edition gets the note by the dot too", () => {
  const mk = (id, d, reach) => ({id, d, staff: "sb", site: "hsc", loc: "suite", urg: "elective", procs: ["colo.dx"], reach, why: [], found: [], ts: id});
  const h = load({today: "2026-10-28", edition: "fellows", state: withScopes([mk("1", "2026-10-20", "sig"), mk("2", "2026-10-21", "cecum")], {}, {setup: {d: "2026-10-01"}})});
  h.click("tab", {page: "endo"});
  h.click("scopetab", {tab: "progress"});
  assert.doesNotMatch(h.html(), /class="readout|class="dotpop/);
  h.click("scopedot", {id: "1"});
  assert.match(h.html(), /<button class="dotpop l up in"[^>]*data-action="scopeedit" data-id="1">/);
  assert.match(h.html(), /<b>Sigmoid with Brook<\/b>/);
  assert.doesNotMatch(h.html(), /class="readout/);
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

test("cases imported before sites were filled take their block's hospital, once", () => {
  const c = (id, d, extra = {}) => ({id, d, staff: "sb", procs: ["egd.dx"], why: [], found: [], ts: d, ...extra});
  const cases = [c("i1", "2026-07-20", {src: "import"}), c("i2", "2026-08-17", {src: "import"}),
    c("i3", "2026-08-18", {src: "import", site: "grace"}), c("d1", "2026-08-19")];
  const h = endo("2026-09-28", withScopes(cases));
  assert.deepEqual(h.val("Store.state.scopes.cases.map(c => c.site || null)"), ["hsc", "stb", "grace", null]);
  assert.equal(h.val("Store.state.scopes.sitesFilled"), true);
  // After the one-time fill, a site cleared by hand stays cleared.
  const g = load({today: "2026-09-28", state: withScopes([c("i1", "2026-07-20", {src: "import"})], {sitesFilled: true})});
  assert.equal(g.val("Store.state.scopes.cases[0].site || null"), null);
});

test("breadth lists Not recorded once per group", () => {
  const cases = [{id: "a", d: "2026-09-20", staff: "sb", procs: ["egd.dx"], why: [], found: [], ts: "1"}];
  const h = endo("2026-09-28", withScopes(cases));
  h.click("scopetab", {tab: "progress"});
  const setting = /<span class="mono">Setting<\/span>(.*?)<\/div><\/div>/.exec(h.html())[1];
  assert.equal((setting.match(/Not recorded/g) || []).length, 1);
});

test("a case that added an EPA shows it as added and stops offering it", () => {
  const h = endo("2026-09-28", withScopes());
  h.say("EGD with Dr. Brook, biopsies");
  const key = h.card().key;
  assert.match(h.html(), /Add <b>F3-A<\/b> as pending with Brook/);
  h.click("scopeepa", {key, pid: "f3a"});
  h.click("scopesave");
  const s = h.saved(), id = s.scopes.cases[0].id;
  assert.equal(s.obs.f3a[0].src, id);
  // The row carries the tag.
  assert.match(h.html(), /class="cc sm st-f sentc">F3-A<span class="sr"> added, pending<\/span>/);
  // The card records it and no longer offers it.
  h.click("scopeedit", {id});
  assert.match(h.html(), /<div class="offer sent">.*?<b>F3-A<\/b> added, pending with Brook/);
  assert.doesNotMatch(h.html(), /data-action="scopeepa"/);
  h.click("scopeupdate");
  assert.equal(h.saved().obs.f3a.length, 1);
  // A copy is a new case: it is offered again.
  h.click("scopeagain", {id});
  assert.match(h.html(), /data-action="scopeepa"[^>]*data-pid="f3a"/);
  h.click("scopeclose");
  // Approved in Entrada, then deleted: the card follows the observation.
  h.run(`Store.setObsStatus("f3a", 0, "approved")`);
  h.click("scopeedit", {id});
  assert.match(h.html(), /<b>F3-A<\/b> added, approved with Brook/);
  h.click("scopeclose");
  h.run(`Store.removeObs("f3a", 0)`);
  h.click("scopeedit", {id});
  assert.match(h.html(), /data-action="scopeepa"[^>]*data-pid="f3a"/);
});

test("an EPA added from a case before cases were linked is matched on load", () => {
  const cases = [{id: "a", d: "2026-09-20", staff: "sb", procs: ["egd.dx"], why: [], found: [], ts: "1"}];
  const st = withScopes(cases);
  st.obs = {f3a: [{d: "2026-09-20", a: "Dr. Brook", n: "From scope log: EGD", status: "pending", ts: "2026-09-20T18:00:00.000Z"}]};
  const h = endo("2026-09-28", st);
  assert.equal(h.val("Store.state.obs.f3a[0].src"), "a");
  h.click("scopeedit", {id: "a"});
  assert.match(h.html(), /<b>F3-A<\/b> added, pending with Brook/);
});

test("every sheet has a handle and a close button the handle can use", () => {
  const h = endo("2026-09-28", withScopes());
  h.click("scopeopen");
  assert.match(h.html(), /<div class="grab"><\/div><div class="shead plushead"><div class="segtabs three plusseg"[\s\S]*?<\/div><button class="iconbtn" data-action="scopeclose"/);
});

test("the switch sits above the capture box, clear of the keyboard", () => {
  const h = endo("2026-09-28", withScopes());
  h.click("scopeopen");
  const sheet = h.html().slice(h.html().indexOf('class="sheet scopesheet'));
  assert.ok(sheet.indexOf('data-action="plusto" data-to="e"') > 0);
  assert.ok(sheet.indexOf('data-action="plusto" data-to="e"') < sheet.indexOf('id="scopebox-sheet"'));
  h.click("plusto", {to: "e"});
  assert.doesNotMatch(h.html(), /class="sheet scopesheet/);
  assert.match(h.html(), /Log observation/);
});

test("patient age: off by default, switched on in Settings, then an Age row on every card", () => {
  const h = endo("2026-09-28", withScopes());
  h.say("EGD with Brook, 72 year old, dysphagia");
  assert.doesNotMatch(h.html(), /aria-label="Patient age"/);
  h.click("scopeclear");
  h.click("setopen");
  assert.match(h.html(), /Patient age range/);
  assert.match(h.html(), /data-action="scopeage" data-v="off" aria-pressed="true"/);
  h.click("scopeage", {v: "on"});
  assert.equal(h.saved().scopes.ageOn, true);
  assert.match(h.html(), /data-action="scopeage" data-v="on" aria-pressed="true"/);
  h.click("setclose");
  h.say("EGD with Brook, 72 year old, dysphagia");
  assert.match(h.html(), /aria-label="Patient age"/);
  assert.equal(h.card().age, "50-75");
  const key = h.card().key;
  h.click("scopeset", {key, kind: "age", v: "75+"});
  h.click("scopesave");
  assert.equal(h.saved().scopes.cases[0].age, "75+");
  h.click("scopetab", {tab: "progress"});
  assert.match(h.html(), /<span class="mono">Age<\/span>/);
});

test("ages survive a backup restore and an edit; Another like that starts without one", () => {
  const c = {id: "k1", d: "2026-09-27", staff: "sb", procs: ["egd.dx"], why: [], found: [], age: "18-49", ts: "2026-09-27T18:00:00.000Z"};
  const h = endo("2026-09-28", withScopes([c], {ageOn: true}));
  assert.equal(h.saved().scopes.ageOn, true);
  h.click("scopeedit", {id: "k1"});
  assert.match(h.html(), /data-kind="age" data-v="18-49" aria-pressed="true"/);
  h.click("scopeupdate");
  assert.equal(h.saved().scopes.cases[0].age, "18-49");
  h.click("scopeagain", {id: "k1"});
  assert.equal(h.val("scopeSheet.card.age"), null);
});

test("the fellows' Settings has the age switch too", () => {
  const h = load({today: "2026-09-28", edition: "fellows", state: state({}, {setup: {d: "2026-09-01"}})});
  h.click("setopen");
  assert.match(h.html(), /Patient age range/);
});

test("Other: type what it was in Why, Found or Did; it shows on the card, saves, edits and comes off", () => {
  const h = endo("2026-09-28", withScopes());
  h.say("EGD with Brook");
  const key = h.card().key;
  h.click("scopechip", {key, kind: "why"});
  h.run(`scopeField({dataset: {scopefield: "pick"}, value: "Pre-op check"})`);
  assert.match(h.val("scopePickListHTML()"), /<button class="pkrow addnew" data-action="scopeaddother">[^]*?<span>Add “Pre-op check” as Other<\/span><\/button>/);
  h.click("scopeaddother");
  assert.deepEqual([h.card().why, h.card().whyOther], [["other"], "Pre-op check"]);
  assert.match(h.html(), /<span class="chip on">Other: Pre-op check<button class="chip-x"/);
  h.click("scopechip", {key, kind: "found"});
  h.run(`scopeField({dataset: {scopefield: "pick"}, value: "Cameron lesion"})`);
  h.click("scopeaddother");
  h.click("scopechip", {key, kind: "procs"});
  h.run(`scopeField({dataset: {scopefield: "pick"}, value: "Capsule placement"})`);
  h.click("scopeaddother");
  assert.deepEqual([h.card().procs, h.card().otherLabel], [["egd.dx", "other.x"], "Capsule placement"]);
  assert.match(h.html(), /<span class="chip on">Other: Capsule placement<button/);
  h.click("scopesave");
  const c = h.saved().scopes.cases[0];
  assert.deepEqual([c.why, c.whyOther, c.found, c.foundOther, c.otherLabel], [["other"], "Pre-op check", ["other"], "Cameron lesion", "Capsule placement"]);
  // Opened again, the words come back; taking the chip off takes them away.
  h.click("scopeedit", {id: c.id});
  assert.equal(h.val("scopeSheet.card.foundOther"), "Cameron lesion");
  h.click("scopedrop", {key: h.val("scopeSheet.card.key"), kind: "found", code: "other"});
  assert.deepEqual([h.val("scopeSheet.card.found"), h.val("scopeSheet.card.foundOther")], [[], ""]);
});

test("the fellows' picker offers Other too", () => {
  const h = load({today: "2026-09-28", edition: "fellows", state: withScopes([], {}, {setup: {d: "2026-09-01"}})});
  h.run(`go({page: "endo"})`);
  h.run(`scopeField({dataset: {scopefield: "text"}, value: "EGD with Brook"})`);
  h.click("scoperead");
  h.click("scopechip", {key: h.val("scopeCap.cards[0].key"), kind: "why"});
  h.run(`scopeField({dataset: {scopefield: "pick"}, value: "Pre-op check"})`);
  assert.match(h.val("scopePickListHTML()"), /Add “Pre-op check” as Other/);
});
