"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, obs, state, many} = require("./harness");

test("EPAs tab: stage groups, done EPAs folded, pending shown as text", () => {
  const h = load({today: "2026-09-24", state: state({d1: many(4, "2026-07-10"), c2: [obs("2026-09-01", {status: "pending"})]})});
  h.click("tab", {page: "epas"});
  const html = h.html();
  assert.match(html, /<h1 class="title">EPAs<\/h1>/);
  assert.match(html, /<details class="donegrp"><summary>[\s\S]*?Done \(1\)<\/summary><button class="epa st-ttd" data-action="open" data-code="D1">/);
  assert.match(html, /<span class="tag warn">1 pending<\/span>/);
  assert.doesNotMatch(html, /[\u23F3\u{1F680}\u{1F3C5}\u{1F512}\u{1F389}]/u);
});

test("bottom bar: Week, EPAs, Study, Endo, Guides in a capsule, the log button beside it; current tab highlighted", () => {
  const h = load({today: "2026-09-24"});
  h.click("tab", {page: "study"});
  const nav = h.html().slice(h.html().indexOf('<nav class="bnav"'));
  assert.deepEqual([...nav.matchAll(/data-page="(\w+)"/g)].map(m => m[1]), ["week", "epas", "study", "endo", "guides"]);
  // The log button sits after the capsule, not inside it, so the five tabs share its width evenly.
  const bar = nav.slice(nav.indexOf('<div class="tabbar">'), nav.indexOf('class="fab"'));
  assert.equal([...bar.matchAll(/class="nv/g)].length, 5);
  assert.ok(nav.indexOf('class="fab"') < nav.indexOf('</nav>'));
  // The lens sits under the third tab.
  assert.match(nav, /<span class="lens" style="--at:2"/);
  assert.match(nav, /class="nv on" data-action="tab" data-page="study"/);
});

test("the year plan lives inside EPAs: the switch shows it and EPAs stays lit", () => {
  const h = load({today: "2026-09-24"});
  h.click("tab", {page: "epas"});
  assert.match(h.html(), /class="segtabs"/);
  h.click("tab", {page: "plan"});
  assert.match(h.html(), /Year 1 plan/);
  assert.match(h.html(), /class="on" data-action="tab" data-page="plan"/);
  assert.match(h.html(), /class="nv on" data-action="tab" data-page="epas"/);
});

test("EPA detail keeps its tab highlighted and goes back to it", () => {
  const h = load({today: "2026-09-24"});
  h.click("tab", {page: "plan"});
  h.click("open", {code: "C2"});
  assert.match(h.html(), /class="nv on" data-action="tab" data-page="epas"/);
  h.click("back");
  assert.equal(h.val("route.page"), "plan");
});

test("export falls back to a download and stamps the backup date", () => {
  const h = load({today: "2026-09-24"});
  h.click("export");
  assert.deepEqual(h.downloads, ["epa-backup-2026-09-24.json"]);
  assert.match(h.saved().lastBackup, /^\d{4}-\d{2}-\d{2}T/);
});

test("export uses the share sheet when the phone offers it", async () => {
  const h = load({today: "2026-09-24"});
  const shared = [];
  h.ctx.navigator.canShare = () => true;
  h.ctx.navigator.share = async data => { shared.push(data.files[0].name); };
  h.click("export");
  await new Promise(r => setImmediate(r));
  assert.deepEqual(shared, ["epa-backup-2026-09-24.json"]);
  assert.deepEqual(h.downloads, []);
  assert.match(h.saved().lastBackup, /^\d{4}-/);
});

test("a cancelled share does not count as a backup", async () => {
  const h = load({today: "2026-09-24"});
  h.ctx.navigator.canShare = () => true;
  h.ctx.navigator.share = async () => { const e = new Error("cancel"); e.name = "AbortError"; throw e; };
  h.click("export");
  await new Promise(r => setImmediate(r));
  assert.equal(h.val("Store.state.lastBackup"), null);
});

test("Week is the home screen", () => {
  const h = load({today: "2026-09-24"});
  assert.equal(h.val("route.page"), "week");
  assert.match(h.html(), /<p class="eyebrow mono">Block 4 · Motility\/Nutrition<\/p><h1 class="title">Week 1 of 4<\/h1>/);
  assert.match(h.html(), /class="nv on" data-action="tab" data-page="week"/);
});

test("This week lists only Foundations, carried first, and names the stage", () => {
  const h = load({today: "2026-09-24"});
  const html = h.html();
  assert.match(html, /<h2>This week<\/h2><span class="mono">Foundations · 4 due<\/span>/);
  assert.match(html, /data-part="f1b"><span class="tick"><\/span><span class="cc">F1-B<\/span><span class="wname">Assessment and plan<\/span><span class="tag warn">carried<\/span><span class="wn">×3<\/span>/);
  assert.match(html, /data-part="f2">.*?<span class="wn">×1<\/span>/);
  assert.doesNotMatch(html, /class="wrow[^"]*" data-action="sheet" data-part="[cdp]/);
});

test("recap shows once per block week", () => {
  const h = load({today: "2026-09-24", state: state({c2: many(2, "2026-09-20")})});
  assert.match(h.html(), /Your week, Jared/);
  assert.match(h.html(), /Logged last week: <b>C2 ×2<\/b>/);
  h.click("dismissrecap", {key: "4-1"});
  assert.doesNotMatch(h.html(), /Your week, Jared/);
  assert.doesNotMatch(load({today: "2026-09-24", state: h.saved()}).html(), /Your week, Jared/);
  assert.match(load({today: "2026-10-01", state: h.saved()}).html(), /Your week, Jared/);
});

test("chase list approves in place", () => {
  const h = load({today: "2026-09-24", state: state({c2: [obs("2026-09-01", {status: "pending", a: "Dr. A"})]})});
  assert.match(h.html(), /1 form pending 14\+ days/);
  assert.match(h.html(), /<span class="num">1 Sep<\/span> · A<\/span>/);
  h.click("chaseok", {part: "c2", obs: "0"});
  assert.equal(h.saved().obs.c2[0].status, "approved");
  assert.doesNotMatch(h.html(), /pending 14\+ days/);
});

test("a pending form says what it is, who it was with and the note", () => {
  const h = load({today: "2026-09-24", state: state({f3a: [obs("2026-09-01", {status: "pending", a: "Dr. A", n: "From scope log: EGD \u00b7 biopsy"})]})});
  const row = /<div class="crow">.*?<\/div>/.exec(h.html())[0];
  assert.match(row, /<b>EGD<\/b>/);
  assert.match(row, /<span class="num">1 Sep<\/span> · A · EGD · biopsy<\/span>/);
  assert.doesNotMatch(row, /From scope log/);
});

test("a pending form with no assessor takes the name from that day's scopes, and a tap fills it in", () => {
  const staff = [{id: "sa", name: "Attending, Alpha", aliases: [], hidden: false}, {id: "sb", name: "Brook, Casey", aliases: [], hidden: false}];
  const c = (id, d, st, procs) => ({id, d, staff: st, procs, why: [], found: [], ts: d});
  const cases = [c("a", "2026-09-01", "sb", ["egd.dx"]), c("b", "2026-09-01", "sa", ["colo.dx"]), c("c", "2026-09-02", "sa", ["egd.dx"]), c("d", "2026-09-02", "sb", ["egd.dx"])];
  const h = load({today: "2026-09-24", state: state({
    f3a: [obs("2026-09-01", {status: "pending"}), obs("2026-09-02", {status: "pending"})],
    f1a: [obs("2026-09-01", {status: "pending"}), obs("2026-09-03", {status: "pending"})],
  }, {scopes: {cases, staff, learned: []}})});
  const rows = h.html().match(/<div class="crow">.*?<\/div>/g);
  const row = (part, i) => rows.find(r => r.includes(`data-part="${part}" data-obs="${i}"`));
  // The EGD that day was with Brook, so F3-A (EGD) suggests Brook alone.
  assert.match(row("f3a", 0), /data-a="Brook"/);
  assert.match(row("f3a", 0), /<i>Brook\?<\/i> from your scope log/);
  // Two staff fit: both are named, neither is filled in.
  assert.match(row("f3a", 1), /<i>Attending or Brook\?<\/i>/);
  assert.doesNotMatch(row("f3a", 1), /data-a=/);
  // Not a scope EPA: whoever was scoped with that day.
  assert.match(row("f1a", 0), /<i>Brook or Attending\?<\/i>/);
  // No scopes that day.
  assert.match(row("f1a", 1), /No assessor yet · tap to add/);
  h.click("sheet", {part: "f3a", obs: "0", chase: "1", a: "Brook"});
  assert.equal(h.val("sheet.a"), "Brook");
  assert.equal(h.val("chaseOpen"), true);
  h.click("sheetsave");
  assert.equal(h.saved().obs.f3a[0].a, "Brook");
  assert.match(h.html(), /<span class="num">1 Sep<\/span> · Brook<\/span>/);
});

test("estimated completion shows both dates", () => {
  const h = load({today: "2026-09-24", state: state({c8a: many(16, "2026-09-01")})});
  assert.match(h.html(), /At your current pace<\/div><div class="fin-val warn">Oct 2027<\/div>/);
  assert.match(h.html(), /If you hit the plan<\/div><div class="fin-val ok">Jun 30, 2027<\/div>/);
});

test("look for lists case types for this week's parts", () => {
  const h = load({today: "2026-09-24"});
  assert.match(h.html(), /<h2>Look for<\/h2>/);
  assert.match(h.html(), /Upper GI tract disease/);
});

test("outside Year 1 the Week tab explains itself", () => {
  assert.match(load({today: "2027-07-05"}).html(), /Year 1 is done/);
  assert.match(load({today: "2026-06-15"}).html(), /Fellowship starts July 2, 2026/);
});

test("recap separates what's carried onto this week from what moved to a later block", () => {
  const h = load({today: "2026-11-19"});   // Block 6 is Radiology: only EGD notes fit this block
  assert.match(h.html(), /Carried onto this week: <b>F3-B ×3<\/b>/);
  assert.match(h.html(), /Moved to a later block: <b>[^<]*F1-B ×12/);
  assert.doesNotMatch(h.html(), /Carried onto this week: <b>[^<]*F1-B/);
});

test("pace estimate says what it is based on", () => {
  const h = load({today: "2026-09-24", state: state({c8a: many(16, "2026-09-01")})});
  assert.match(h.html(), /<div class="fin-note">16 in the last 8 weeks<\/div>/);
});

test("Plan: completion up top, Foundations now, Core after", () => {
  const h = load({today: "2026-09-24"});
  h.click("tab", {page: "plan"});
  const html = h.html();
  assert.match(html, /<h2>Finish line<\/h2>/);
  assert.match(html, /<li class="blk now st-f">[\s\S]*?<span class="mono">Blk 04<\/span><span class="tag solid">Now<\/span>[\s\S]*?<h3>Motility\/Nutrition<\/h3>/);
  assert.match(html, /<button class="pchip st-f" data-action="open" data-code="F1"><b>F1-B<\/b><span class="x">×12<\/span><\/button>/);
  assert.match(html, /<li class="blk past">[\s\S]*?Blk 01[\s\S]*?Consults HSC[\s\S]*?Nothing logged here/);
});

test("Plan: getting ahead empties the end of the year first", () => {
  const h = load({today: "2026-09-25", state: state({c8a: many(2, "2026-09-25")})});
  h.click("tab", {page: "plan"});
  assert.match(h.html(), /Blk 12[\s\S]*?<b>C8-A<\/b><span class="x">×4<\/span>/);
});

test("Plan explains the stage order", () => {
  const h = load({today: "2026-09-24"});
  h.click("tab", {page: "plan"});
  assert.match(h.html(), /You're on Foundations\. Core opens once every Foundations observation is logged/);
});

test("EPAs tab: Transition to Discipline is marked as behind you", () => {
  const h = load({today: "2026-09-24"});
  h.click("tab", {page: "epas"});
  assert.match(h.html(), /<h2>Transition to Discipline<\/h2>[\s\S]*?<p class="stagenote">[\s\S]*?Earlier stage: the coach won't suggest these\./);
});

test("the dial has one tick per required observation, lit by status and stage", () => {
  const h = load({today: "2026-09-24", state: state({f1b: [...many(3, "2026-09-10"), obs("2026-09-11", {status: "pending"})]})});
  const html = h.html();
  assert.equal((html.match(/<line class="t /g) || []).length, 139);
  assert.equal((html.match(/class="t lit st-f"/g) || []).length, 3);
  assert.equal((html.match(/class="t pend st-f"/g) || []).length, 1);
  assert.equal((html.match(/class="t off next st-f"/g) || []).length, 27);   // the rest of Foundations, tinted as next
  assert.match(html, /<div class="dial-num" data-count="4">4<\/div><div class="dial-lbl">of 139 logged<\/div>/);
});

test("stage cards show where each stage stands", () => {
  const h = load({today: "2026-09-24"});
  assert.match(h.html(), /<button class="stg st-f now" data-action="tab" data-page="epas">/);
  assert.match(h.html(), /<button class="stg st-core locked"[\s\S]*?Locked<\/span>/);
});

test("the monitor powers on from standby, and later draws show it finished", () => {
  const h = load({today: "2026-09-24"});
  // The tests have no screen, so nothing arms the power-on.
  assert.match(h.html(), /<section class="monitor"/);
  // Armed: every draw keeps it dark in standby until it switches on.
  h.run(`liveBootState = "wait"; render();`);
  assert.match(h.html(), /<section class="monitor boot standby"/);
  assert.match(h.html(), /<svg class="dial intro"/);
  h.click("tab", {page: "plan"});
  h.click("tab", {page: "week"});
  assert.match(h.html(), /<section class="monitor boot standby"/);
  // Running or done: a redraw shows the finished monitor rather than starting over.
  h.run(`liveBootState = "run"; render();`);
  assert.match(h.html(), /<section class="monitor"/);
  assert.doesNotMatch(h.html(), /dial intro/);
});

test("pages animate in on navigation, not on every redraw", () => {
  const h = load({today: "2026-09-24"});
  h.click("tab", {page: "epas"});
  assert.match(h.html(), /<main class="page enter">/);
  h.click("dismissnudge");
  assert.match(h.html(), /<main class="page">/);
});

test("a screen that throws shows a recovery screen with export, not a blank page", () => {
  const h = load({today: "2026-09-24"});
  const err = console.error; console.error = () => {};
  try { h.run(`viewWeek = () => { throw new Error("boom"); }; render();`); } finally { console.error = err; }
  assert.match(h.html(), /This screen hit a problem/);
  assert.match(h.html(), /data-action="export"/);
  assert.match(h.html(), /data-action="reload"/);
});

test("This week comes before the week in review", () => {
  const h = load({today: "2026-09-24"});
  assert.ok(h.html().indexOf("<h2>This week</h2>") < h.html().indexOf("Your week, Jared"));
});

test("Back returns to where the list was scrolled", () => {
  const h = load({today: "2026-09-24"});
  const pos = [];
  h.ctx.scrollTo = (x, y) => { pos.push(y); h.ctx.scrollY = y; };
  h.click("tab", {page: "epas"});
  h.ctx.scrollY = 640;
  h.click("open", {code: "C2"});
  assert.equal(pos.at(-1), 0);        // the detail opens at the top
  h.click("back");
  assert.equal(pos.at(-1), 640);      // and Back lands where you were
});
