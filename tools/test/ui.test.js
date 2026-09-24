"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, obs, state, many} = require("./harness");

test("EPAs tab: stage groups, done EPAs folded, pending shown as text", () => {
  const h = load({today: "2026-09-24", state: state({d1: many(4, "2026-07-10"), c2: [obs("2026-09-01", {status: "pending"})]})});
  h.click("tab", {page: "epas"});
  const html = h.html();
  assert.match(html, /<h1 class="htitle">EPAs<\/h1>/);
  assert.match(html, /<details class="donegrp"><summary>Done \(1\)<\/summary><button class="row" data-action="open" data-code="D1">/);
  assert.match(html, /<span class="tag warn">1 pending<\/span>/);
  assert.doesNotMatch(html, /[\u23F3\u{1F680}\u{1F3C5}\u{1F512}\u{1F389}]/u);
});

test("bottom bar: tabs plus the log button, current tab highlighted", () => {
  const h = load({today: "2026-09-24"});
  h.click("tab", {page: "plan"});
  assert.match(h.html(), /<nav class="bnav">/);
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
  assert.match(h.html(), /<div class="hsub">Block 4 · Motility\/Nutrition<\/div><h1 class="htitle">Week 1 of 4<\/h1>/);
  assert.match(h.html(), /class="nv on" data-action="tab" data-page="week"/);
});

test("This week lists what's due, carried first", () => {
  const h = load({today: "2026-09-24"});
  const html = h.html();
  assert.match(html, /data-part="f1b"><span class="tick"><\/span><span class="cc">F1-B<\/span><span class="wname">Assessment and plan<\/span><span class="tag warn">carried<\/span><span class="wn">×10<\/span>/);
  assert.match(html, /data-part="c5">.*?<span class="wn">×1<\/span>/);
  assert.doesNotMatch(html, /data-part="d1"/);
});

test("recap shows once per block week", () => {
  const h = load({today: "2026-09-24", state: state({c2: many(2, "2026-09-20")})});
  assert.match(h.html(), /Your week, Jared/);
  assert.match(h.html(), /Last week: C2 ×2\./);
  h.click("dismissrecap", {key: "4-1"});
  assert.doesNotMatch(h.html(), /Your week, Jared/);
  assert.doesNotMatch(load({today: "2026-09-24", state: h.saved()}).html(), /Your week, Jared/);
  assert.match(load({today: "2026-10-01", state: h.saved()}).html(), /Your week, Jared/);
});

test("chase list approves in place", () => {
  const h = load({today: "2026-09-24", state: state({c2: [obs("2026-09-01", {status: "pending", a: "Dr. A"})]})});
  assert.match(h.html(), /1 form pending 14\+ days/);
  assert.match(h.html(), /2026-09-01 · Dr\. A/);
  h.click("chaseok", {part: "c2", obs: "0"});
  assert.equal(h.saved().obs.c2[0].status, "approved");
  assert.doesNotMatch(h.html(), /pending 14\+ days/);
});

test("estimated completion shows both dates", () => {
  const h = load({today: "2026-09-24", state: state({c8a: many(16, "2026-09-01")})});
  assert.match(h.html(), /At your current pace<\/div><div class="sval warn">Nov 2027<\/div>/);
  assert.match(h.html(), /If you hit the plan<\/div><div class="sval ok">Jun 30, 2027<\/div>/);
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
  const h = load({today: "2026-09-24"});
  assert.match(h.html(), /Carried onto this week: [^<]*F1-B ×9/);
  assert.match(h.html(), /Moved to a later block: [^<]*C3 ×2/);
  assert.doesNotMatch(h.html(), /Carried onto this week: [^<]*C3/);
});

test("pace estimate says what it is based on", () => {
  const h = load({today: "2026-09-24", state: state({c8a: many(16, "2026-09-01")})});
  assert.match(h.html(), /<div class="ssub">16 logged in the last 8 weeks<\/div>/);
});
