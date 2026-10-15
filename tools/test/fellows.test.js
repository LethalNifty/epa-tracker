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
