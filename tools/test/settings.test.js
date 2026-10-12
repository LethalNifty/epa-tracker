"use strict";
// Settings: one sheet from the gear on Week holding the version (and whether
// this phone is up to date), backup and reminders. EPAs ends with its checklist.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, state} = require("./harness");

const phone = (st = state({}, {lastBackup: "2026-10-04T12:00:00.000Z"})) => load({today: "2026-10-12", state: st});
// The live app answers with this sw.js; null means no signal.
function live(h, version) {
  h.ctx.fetch = async (url, o) => {
    h.ctx.__asked = {url, o};
    if (!version) throw new TypeError("Failed to fetch");
    return {ok: true, text: async () => `importScripts("notify.js");\nconst CACHE = "${version}";\n`};
  };
}
const settle = () => new Promise(r => setTimeout(r, 5));
const sheetOf = h => { const s = h.html(); const i = s.indexOf('class="sheet setsheet'); return i < 0 ? "" : s.slice(i); };

test("the gear on Week opens Settings: version, backup, and the backup date in words", async () => {
  const h = phone();
  live(h, h.val("APP_VERSION"));
  assert.match(h.html(), /<button class="iconbtn phgear" data-action="setopen" aria-label="Settings">/);
  h.click("setopen");
  await settle();
  const s = sheetOf(h);
  assert.match(s, /<b>Settings<\/b>/);
  assert.match(s, new RegExp(`GI Hub <b>${h.val("APP_VERSION")}</b>`));
  assert.match(s, /<span>Backup<\/span><span>Last: Sun 4 Oct<\/span>/);
  assert.match(s, /data-action="export"[\s\S]*?data-action="importpick"[\s\S]*?id="importfile"/);
  // It asked the live app, past every cache.
  assert.deepEqual(h.val("__asked"), {url: "sw.js", o: {cache: "no-store"}});
  assert.match(s, /class="svpill ok"[^>]*>[\s\S]*?Up to date/);
  h.click("setclose");
  assert.equal(sheetOf(h), "");
});

test("EPAs ends with its checklist: backup, reminders and the version moved to Settings", () => {
  const h = phone();
  h.click("tab", {page: "epas"});
  assert.doesNotMatch(h.html(), /Export backup|appver|<h2>Reminders<\/h2>/);
});

test("a phone behind the live app says so and offers to update", async () => {
  const h = phone();
  live(h, "epa-v999");
  let updated = 0;
  h.ctx.navigator.serviceWorker = {getRegistration: async () => ({update: async () => { updated++; }})};
  h.click("setopen");
  await settle();
  let s = sheetOf(h);
  assert.match(s, /epa-v999 is out/);
  assert.match(s, new RegExp(`This phone is on ${h.val("APP_VERSION")}`));
  assert.match(s, /data-action="setpull"[^>]*>[\s\S]*?Update now/);
  h.click("setpull");
  await settle();
  assert.equal(updated, 1);
  assert.match(sheetOf(h), /Downloading epa-v999/);
  // The new version takes over while Settings is open: it waits for a tap.
  h.run(`updateReady = true; render()`);
  s = sheetOf(h);
  assert.match(s, /Update ready/);
  assert.match(s, /data-action="setrestart"[^>]*>[\s\S]*?Restart to update/);
});

test("no signal: the version row says it will check later", async () => {
  const h = phone();
  live(h, null);
  h.click("setopen");
  await settle();
  assert.match(sheetOf(h), /Offline[\s\S]*?Checks when you have signal[\s\S]*?data-action="setcheck"/);
});

test("an older live copy (a cache still catching up) never reads as an update", async () => {
  const h = phone();
  live(h, "epa-v1");
  h.click("setopen");
  await settle();
  assert.match(sheetOf(h), /Up to date/);
});

test("closing Settings by dragging finds its close button, not another button in the header", () => {
  const src = require("node:fs").readFileSync(require("node:path").join(require("./harness").ROOT, "app.js"), "utf8");
  assert.match(src, /querySelector\("\.shead \.iconbtn\[data-action\]"\)/);
});
