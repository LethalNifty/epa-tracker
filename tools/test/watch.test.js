"use strict";
// The owner's controls for the fellows' invite codes (watch.js): the admin key
// kept apart from the app's data, the address worked out from it the same way
// the fellows' site does, an alert on Week for tries from other phones, and
// the codes with their buttons in Settings.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {load, state, many, ROOT} = require("./harness");

const KEY = "qx7p-m4rt-9kwd-h3nb";
const SUMMARY = {ok: true, store: true, total: 4, inUse: 2, codes: [
  {id: "f01", code: "K7QM-4TZP", state: "in", dev: "iPhone", where: "Winnipeg, MB", since: "2026-10-14T23:00:00.000Z", seen: "2026-10-15T14:00:00.000Z", tries: 0},
  {id: "f02", code: "WX3N-8HRB", state: "in", dev: "iPhone", where: "Winnipeg, MB", since: "2026-10-15T01:00:00.000Z", seen: "2026-10-15T13:00:00.000Z", tries: 2},
  {id: "f03", code: "PQ7R-3MZD", state: "new", dev: "", where: "", since: "", seen: "", tries: 0},
  {id: "f04", code: "HT4K-9WXB", state: "off", dev: "", where: "", since: "", seen: "", tries: 0}],
  tries: [{id: "f02", at: "2026-10-16T01:30:00.000Z", dev: "Android", where: "Toronto, ON"},
    {id: "f02", at: "2026-10-15T20:00:00.000Z", dev: "iPhone", where: "Toronto, ON"}]};
const settle = () => new Promise(r => setTimeout(r, 40));
// The owner's phone; the fellows' site answers with `reply` (a summary, or a status).
function owner(reply = SUMMARY) {
  const h = load({today: "2026-10-16", state: state({d1: many(2, "2026-07-10")})});
  h.run(`globalThis.__asked = []; globalThis.__reply = ${JSON.stringify(reply)};
    globalThis.fetch = async (u, o) => {
      if (!String(u).startsWith("https://gi-hub-fellows.pages.dev/")) return {status: 404, ok: false, text: async () => ""};
      __asked.push({u, auth: o.headers.Authorization, method: o.method || "GET", body: o.body ? JSON.parse(o.body) : null});
      if (typeof __reply === "number") return {status: __reply, ok: false};
      return {status: 200, ok: true, json: async () => __reply};
    };`);
  return h;
}
const withKey = h => { h.store.set("gi-watch-v1", JSON.stringify({key: KEY})); h.run("watch = null; watchCheck();"); return settle(); };

test("no key: nothing on Week; the key from Settings stays out of backups and finds the site's address", async () => {
  const h = owner();
  assert.doesNotMatch(h.html(), /tried on another phone/);
  h.click("setopen");
  assert.match(h.html(), /Fellows' codes/);
  h.fire("input", {dataset: {watch: "key"}, value: " " + KEY + " "});
  h.click("watchkey");
  await settle();
  const {ownerPath} = await import(pathToFileURL(path.join(ROOT, "tools", "fellows", "access.mjs")).href);
  assert.deepEqual(h.val("__asked"), [{u: "https://gi-hub-fellows.pages.dev" + await ownerPath(KEY), auth: "Bearer " + KEY, method: "GET", body: null}]);
  assert.equal(JSON.parse(h.store.get("gi-watch-v1")).key, KEY);
  assert.doesNotMatch(h.store.get("epa-state-v1"), /qx7p/i);
  const html = h.html();
  assert.match(html, /<span>2 of 4 in use<\/span>/);
  assert.match(html, /<b>f01<\/b><div><span>iPhone · Winnipeg, MB<br>Last opened/);
  assert.match(html, /watchrow hot"><b>f02<\/b>.*Tried on another phone 2 times/);
  assert.match(html, /<b>f03<\/b><div><span>Not used yet · <span class="code">PQ7R-3MZD<\/span>/);
  assert.match(html, /<b>f04<\/b><div><span>Turned off/);
  assert.match(html, /data-act="off" data-id="f01"/);
  assert.match(html, /data-act="on" data-id="f04"/);
  assert.doesNotMatch(html, /__admin/);
});

test("the buttons: free, turn off, add a code; each asks the site and shows its answer", async () => {
  const h = owner();
  await withKey(h);
  h.click("setopen");
  h.click("watchact", {act: "free", id: "f02"});
  await settle();
  assert.deepEqual(h.val("__asked.at(-1)").body, {act: "free", id: "f02"});
  assert.equal(h.val("__asked.at(-1)").method, "POST");
  h.run(`__reply = ${JSON.stringify({...SUMMARY, added: {id: "f05", code: "ZB6N-2PKQ"}})}`);
  h.click("watchact", {act: "add"});
  await settle();
  assert.match(h.html(), /New code <b>f05<\/b>: <span class="code">ZB6N-2PKQ<\/span>/);
  h.click("watchfreshok");
  assert.doesNotMatch(h.html(), /New code/);
  // Cancelled at the question: nothing is sent.
  const n = h.val("__asked.length");
  h.run("confirm = () => false;");
  h.click("watchact", {act: "off", id: "f01"});
  await settle();
  assert.equal(h.val("__asked.length"), n);
  // No signal: says so.
  h.run(`confirm = () => true; fetch = async () => { throw new Error("offline"); };`);
  h.click("watchact", {act: "off", id: "f01"});
  await settle();
  assert.match(h.html(), /No connection/);
});

test("tries from other phones show on Week until dismissed; new ones bring it back", async () => {
  const h = owner();
  await withKey(h);
  let html = h.html();
  assert.match(html, /2 tries on other phones \(<b>f02<\/b>\)\. Newest: Android · Toronto, ON · /);
  assert.match(html, /data-action="setopen">Codes<\/button>/);
  h.click("watchseen");
  assert.doesNotMatch(h.html(), /tries on other phones|tried on another phone/);
  assert.equal(JSON.parse(h.store.get("gi-watch-v1")).seenAt, "2026-10-16T01:30:00.000Z");
  h.run(`__reply = ${JSON.stringify({...SUMMARY, tries: [{id: "f03", at: "2026-10-17T02:00:00.000Z", dev: "iPhone", where: "Calgary, AB"}, ...SUMMARY.tries]})}; watchCheck();`);
  await settle();
  assert.match(h.html(), /<b>f03<\/b> was tried on another phone: iPhone · Calgary, AB · /);
});

test("a key that stops working says so; forgetting it clears everything; no signal changes nothing", async () => {
  const h = owner(401);
  await withKey(h);
  assert.match(h.html(), /The fellows' admin key stopped working/);
  h.click("setopen");
  await settle();
  assert.match(h.html(), /This key doesn't work any more/);
  h.click("watchforget");
  assert.equal(h.store.get("gi-watch-v1"), "{}");
  assert.match(h.html(), /data-watch="key"/);
  h.run("watch = {key: 'K'}; fetch = async () => { throw new Error('offline'); }; watchCheck();");
  await settle();
  assert.equal(h.val("watch.bad"), undefined);
});

test("the fellows' edition never shows or asks for it", () => {
  const h = load({today: "2026-10-16", edition: "fellows", state: state({}, {setup: {d: "2026-10-01"}})});
  h.store.set("gi-watch-v1", JSON.stringify({key: KEY, last: SUMMARY}));
  h.run("watch = null; render();");
  assert.doesNotMatch(h.html(), /tried on another phone|tries on other phones/);
  h.click("setopen");
  assert.doesNotMatch(h.html(), /Fellows' codes|data-watch/);
});
