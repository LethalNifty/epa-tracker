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
