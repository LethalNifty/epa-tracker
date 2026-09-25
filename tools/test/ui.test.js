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

test("bottom bar: tabs plus the log button, current tab highlighted", () => {
  const h = load({today: "2026-09-24"});
  h.click("tab", {page: "plan"});
  assert.match(h.html(), /<nav class="bnav"/);
  assert.match(h.html(), /class="nv on" data-action="tab" data-page="plan"/);
  assert.match(h.html(), /class="fab" data-action="sheet"/);
});

test("EPA detail keeps its tab highlighted and goes back to it", () => {
  const h = load({today: "2026-09-24"});
  h.click("tab", {page: "plan"});
  h.click("open", {code: "C2"});
  assert.match(h.html(), /class="nv on" data-action="tab" data-page="plan"/);
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
  assert.match(h.html(), /2026-09-01<\/span> · Dr\. A/);
  h.click("chaseok", {part: "c2", obs: "0"});
  assert.equal(h.saved().obs.c2[0].status, "approved");
  assert.doesNotMatch(h.html(), /pending 14\+ days/);
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
  assert.match(h.html(), /<div class="fin-note">16 logged in the last 8 weeks<\/div>/);
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

test("the dial lights up only the first time Week is drawn", () => {
  const h = load({today: "2026-09-24"});
  assert.match(h.html(), /<svg class="dial intro"/);
  h.click("tab", {page: "plan"});
  h.click("tab", {page: "week"});
  assert.doesNotMatch(h.html(), /<svg class="dial intro"/);
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
