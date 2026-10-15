"use strict";
// The fellows' edition: the same app with Study, Pearls, the call card,
// reminders and the year plan left out, its own saved progress, first-run
// setup with a catch-up from Entrada, and a Home tab.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {load, obs, state, many, ROOT} = require("./harness");

const LIB = JSON.parse(fs.readFileSync(path.join(ROOT, "guides.json"), "utf8"));
const fellow = (opts = {}) => load({today: "2026-10-08", edition: "fellows", ...opts});
// A fellow who has set up, with these observations.
const setUp = (obsByPart = {}) => state(obsByPart, {setup: {d: "2026-10-01"}});
const navPages = h => { const nav = h.html().slice(h.html().indexOf('<nav class="bnav"'));
  return [...nav.matchAll(/data-page="(\w+)"/g)].map(m => m[1]); };

test("the full app is untouched: its own key, five tabs, Pearl on the +", () => {
  const h = load({today: "2026-10-08", state: state({d1: many(2, "2026-07-10")})});
  assert.equal(h.val("FELLOWS"), false);
  assert.equal(h.val("KEY"), "epa-state-v1");
  assert.deepEqual(navPages(h), ["week", "epas", "study", "endo", "guides"]);
  assert.deepEqual(h.val("PLUS.map(x => x[1])"), ["Case", "EPA", "Pearl"]);
});

test("a fellow's first open is setup, with no bar, and saves under its own key", () => {
  const h = fellow();
  assert.equal(h.val("KEY"), "gihub-fellows-v1");
  const html = h.html();
  assert.match(html, /EPAs and scopes, on your phone/);
  assert.match(html, /Everything stays on this phone/);
  assert.doesNotMatch(html, /class="bnav"/);
  h.run(`felField({dataset: {fel: "name"}, value: "Test Fellow, PGY-5"})`);
  h.click("felnext");
  assert.match(h.html(), /What Entrada already has/);
  assert.match(h.html(), /Start<\/button>/);
  // Foundations all approved, two D1s and one C2.
  h.click("felall", {stage: "f"});
  h.click("felstep", {part: "d1", by: "1"});
  h.click("felstep", {part: "d1", by: "1"});
  h.click("felstep", {part: "c2", by: "1"});
  h.click("felstep", {part: "c2", by: "-1"});
  h.click("felstep", {part: "c2", by: "1"});
  assert.match(h.html(), /Start with 34 approved/);
  h.click("feldone");
  const s = h.saved();
  assert.equal(s.obs.f1b.length, 12);
  assert.equal(s.obs.d1.length, 2);
  assert.equal(s.obs.c2.length, 1);
  assert.ok(Object.values(s.obs).flat().every(o => o.status === "approved" && o.pre === true && o.d === ""));
  assert.equal(s.scopes.reportName, "Test Fellow, PGY-5");
  assert.deepEqual(s.setup, {d: "2026-10-08"});
  assert.equal(h.store.get("epa-state-v1"), undefined);
  // Home, with the bar.
  assert.deepEqual(navPages(h), ["week", "epas", "endo", "guides"]);
  assert.match(h.html(), /<span>Home<\/span>/);
  assert.match(h.html(), /34 approved observations added/);
});

test("setup's steppers stay between none and what is required", () => {
  const h = fellow();
  h.click("felnext");
  h.click("felstep", {part: "d2a", by: "-1"});
  assert.equal(h.val("felSetup.n.d2a"), 0);
  for (let i = 0; i < 5; i++) h.click("felstep", {part: "d2a", by: "1"});
  assert.equal(h.val("felSetup.n.d2a"), 2);
  h.click("felall", {stage: "ttd"});
  assert.deepEqual([h.val("felSetup.n.d1"), h.val("felSetup.n.d2b")], [4, 4]);
  // Tapped again, All approved clears the stage.
  h.click("felall", {stage: "ttd"});
  assert.deepEqual([h.val("felSetup.n.d1"), h.val("felSetup.n.d2a")], [0, 0]);
  h.click("felback");
  assert.match(h.html(), /Your name, as it prints on the procedure log/);
});

test("Home: the dial, the stages, what is left in the stage, the scope log; no weekly plan", () => {
  const h = fellow({state: setUp({d1: many(4, "2026-07-10"), f2: [obs("2026-09-01", {status: "pending"})]})});
  const html = h.html();
  assert.match(html, /<p class="eyebrow mono">Block 4<\/p><h1 class="title">Week 3 of 4<\/h1>/);
  assert.doesNotMatch(html, /Motility/);
  assert.match(html, /class="monitor/);
  assert.match(html, /Adult GI · 2026–27/);
  assert.match(html, /Still to log<\/h2><span class="mono">Foundations · /);
  assert.match(html, /Log your first case/);
  assert.doesNotMatch(html, /This week<\/h2>|Week in review|class="callcard|Reading/);
  // The chase list is there once a form waits 14+ days.
  assert.match(html, /1 form pending 14\+ days/);
  // Tapping a row opens the log sheet for that part.
  h.click("sheet", {part: "f3a"});
  assert.equal(h.val("sheet.pid"), "f3a");
});

test("EPAs has no year plan; the + logs a case or an EPA, not a pearl", () => {
  const h = fellow({state: setUp()});
  h.click("tab", {page: "epas"});
  assert.doesNotMatch(h.html(), /Year plan/);
  assert.doesNotMatch(h.html(), /this block<\/span>/);
  assert.deepEqual(h.val("PLUS.map(x => x[1])"), ["Case", "EPA"]);
  h.click("plusto", {to: "e"});
  assert.match(h.html(), /class="segtabs plusseg"/);
  assert.doesNotMatch(h.html(), /data-to="p"/);
});

test("Settings: catch up from Entrada again, adding only, never removing", () => {
  const h = fellow({state: setUp({c2: [...many(3, "2026-09-01"), obs("2026-09-02", {status: "pending"})]})});
  h.click("setopen");
  assert.match(h.html(), /Catch up from Entrada/);
  assert.doesNotMatch(h.html(), /Reminders/);
  h.click("felagain");
  assert.match(h.html(), /<p class="eyebrow mono">Catch up<\/p>/);
  assert.equal(h.val("felSetup.n.c2"), 3);
  h.click("felstep", {part: "c2", by: "-1"});
  assert.equal(h.val("felSetup.n.c2"), 3);
  h.click("felstep", {part: "c2", by: "1"});
  h.click("felstep", {part: "c2", by: "1"});
  assert.match(h.html(), /Add 2 approved/);
  h.click("feldone");
  const c2 = h.saved().obs.c2;
  assert.equal(c2.length, 6);
  assert.equal(c2.filter(o => o.status === "approved").length, 5);
  assert.deepEqual(h.saved().setup, {d: "2026-10-01"});
  // Cancel leaves everything as it was.
  h.click("felagain");
  h.click("felstep", {part: "c3", by: "1"});
  h.click("felcancel");
  assert.equal(h.saved().obs.c3, undefined);
  assert.match(h.html(), /<span>Home<\/span>/);
});

test("a fellow with data skips setup; the first backup nudge waits 30 days from setup", () => {
  const h = fellow({state: setUp({d1: many(1, "2026-09-01")})});
  assert.doesNotMatch(h.html(), /What Entrada already has|EPAs and scopes, on your phone/);
  assert.doesNotMatch(h.html(), /No backup in over 30 days/);
  h.setToday("2026-11-02");
  h.click("tab", {page: "epas"});
  assert.match(h.html(), /No backup in over 30 days/);
  // Restored from a backup with no setup in it: straight in, and set up from then.
  const r = fellow();
  r.run(`Store.importJSON(${JSON.stringify(JSON.stringify(state({d1: many(1, "2026-09-01")})))})`);
  r.run("felSetup = null; render()");
  assert.doesNotMatch(r.html(), /EPAs and scopes, on your phone/);
});

test("a caught-up observation reads From Entrada in its EPA", () => {
  const h = fellow({state: setUp({d1: [obs("", {pre: true})]})});
  h.click("open", {code: "D1"});
  assert.match(h.html(), /<span class="odate">From Entrada<\/span>/);
  assert.match(h.html(), /All EPAs|Home/);
});

test("Guides and Trials show no rotation chip in the fellows' edition", () => {
  const h = fellow({state: setUp()});
  h.run(`guidesAccept(${JSON.stringify(LIB)}); guidesRedraw();`);
  h.click("tab", {page: "guides"});
  assert.match(h.html(), /Canadian first/);
  assert.doesNotMatch(h.html(), /data-chip="block"/);
  h.click("guidestab", {tab: "t"});
  assert.doesNotMatch(h.html(), /data-chip="block"/);
});

test("finish line: the year sets a first finish date at setup, and it can be changed", () => {
  const h = fellow();
  assert.match(h.html(), /Finish every EPA by<input type="date" data-fel="by" min="2026-07-01" value="2027-12-31">/);
  assert.match(h.html(), /18 months is a good target for a PGY-4/);
  h.click("felyear", {year: "pgy5"});
  assert.match(h.html(), /data-fel="by" min="2025-07-01" value="2027-03-31"/);
  h.run(`felField({dataset: {fel: "by"}, value: "2027-02-28"})`);
  h.run(`felField({dataset: {fel: "by"}, value: ""})`);
  h.click("felnext");
  h.click("feldone");
  assert.deepEqual(h.saved().goal, {year: "pgy5", start: "2025-07-01", by: "2027-02-28"});
  // Settings: the year resets the date to that year's first guess; the date can then be moved.
  h.click("setopen");
  assert.match(h.html(), /Finish line<\/span>[\s\S]*data-action="felgoalyear" data-year="pgy5" aria-pressed="true"/);
  assert.match(h.html(), /<a class="btn" href="reminder\.ics" target="_blank" rel="noopener">[\s\S]*?Add a reminder to my calendar<\/a>/);
  h.click("felgoalyear", {year: "pgy4"});
  assert.deepEqual(h.saved().goal, {year: "pgy4", start: "2026-07-01", by: "2027-12-31"});
  h.run(`felField({dataset: {fel: "goalby"}, value: "2027-09-30"})`);
  assert.equal(h.saved().goal.by, "2027-09-30");
});

test("finish line on Home: what is left, a month's worth, the pace, against an even line", () => {
  const pre = n => Array.from({length: n}, () => obs("", {pre: true}));
  const st = setUp({d1: pre(4), d2a: pre(2), d2b: pre(4), f1a: pre(2), f2: pre(2), f3a: pre(6), f1b: many(10, "2026-09-20")});
  st.goal = {year: "pgy4", start: "2026-07-01", by: "2027-12-31"};
  const html = fellow({state: st}).html();
  assert.match(html, /<h2>Finish line<\/h2><span class="mono">Goal Dec 31, 2027<\/span>/);
  // 30 of 139 logged: 10 dated in the last 8 weeks, and the 20 caught up at setup spread from July 1
  // to today, 56 of those 99 days in the window (about 11 more). 109 left at about 2.7 a week: July 2027.
  assert.match(html, /<div class="fin-val ok">Jul 2027<\/div><div class="fin-note">About 21 in the last 8 weeks<\/div>/);
  assert.match(html, /<div class="fin-val">8 a month<\/div><div class="fin-note">109 left · 15 months<\/div>/);
  assert.match(html, /Ahead of an even pace\./);
  assert.match(html, /<i class="plan" style="width:18\.1/);
  // Set up before there was a finish date: Home asks for one.
  assert.match(fellow({state: setUp()}).html(), /Pick a finish date/);
});

test("an invite code that has ended locks the app, with a way back in and a backup", async () => {
  const h = fellow({state: setUp({d1: many(1, "2026-09-01")})});
  const settle = () => h.run("new Promise(r => setTimeout(r, 5))");
  // No check here (the full app, a preview) or no signal: nothing locks.
  h.run(`globalThis.fetch = async () => ({status: 404, ok: false}); felCheckAccess();`);
  await settle();
  assert.match(h.html(), /<span>Home<\/span>/);
  h.run(`globalThis.fetch = async () => { throw new Error("offline"); }; felCheckAccess();`);
  await settle();
  assert.equal(h.val("felLocked"), false);
  // The code was taken out: locked, no bar, a backup still possible.
  h.run(`globalThis.fetch = async () => ({status: 401, ok: false}); felCheckAccess();`);
  await settle();
  assert.match(h.html(), /This invite code has ended/);
  assert.doesNotMatch(h.html(), /class="bnav"/);
  assert.match(h.html(), /data-action="export"/);
  // A wrong new code says so; a right one reloads into the app.
  h.run(`globalThis.__sent = []; globalThis.fetch = async (u, o) => { __sent.push(o && o.body); return {status: 401, ok: false}; };`);
  h.run(`felField({dataset: {fel: "code"}, value: "WX3N-8HRB"})`);
  h.click("felcode");
  await settle();
  assert.equal(h.val("__sent[0]"), JSON.stringify({code: "WX3N-8HRB"}));
  assert.match(h.html(), /That code doesn't work/);
  h.run(`globalThis.location = {reload() { globalThis.__reloaded = true; }}; globalThis.fetch = async () => ({status: 200, ok: true});`);
  h.click("felcode");
  await settle();
  assert.equal(h.val("__reloaded"), true);
});

test("the + sheet offers what is left in the fellow's stage, never the full app's weekly plan; Today is labelled early on", () => {
  const st = setUp({d1: many(4, "2026-07-10"), f1a: many(2, "2026-08-01")});
  st.goal = {year: "pgy4", start: "2026-07-01", by: "2027-12-31"};
  const h = fellow({state: st});
  assert.match(h.html(), /<span class="t" style="left:[\d.]+%">Today<\/span>/);
  assert.doesNotMatch(h.html(), /<span>Jul 2026<\/span>/);
  h.click("plusto", {to: "e"});
  const html = h.html();
  assert.match(html, /Still to log in Foundations/);
  assert.doesNotMatch(html, /This week's EPAs/);
  const offered = [...html.matchAll(/data-action="pickpart" data-part="(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(offered, ["f1b", "f2", "f3a", "f3b", "f4"]);
});

test("caught-up observations stop counting toward pace once setup is more than 8 weeks back", () => {
  const caught = n => Array.from({length: n}, () => obs("", {pre: true, ts: "2026-07-15T12:00:00.000Z"}));
  const st = setUp({d1: caught(4), f1a: caught(2), f1b: many(4, "2026-09-20")});
  st.goal = {year: "pgy4", start: "2026-07-01", by: "2027-12-31"};
  const html = fellow({state: st}).html();
  assert.match(html, /<div class="fin-note">4 in the last 8 weeks<\/div>/);
});
