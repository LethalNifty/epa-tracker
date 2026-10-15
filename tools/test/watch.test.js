"use strict";
// The owner's watch on the fellows' invite codes (watch.js): the admin key kept
// apart from the app's data, an alert on Week for tries from other phones, and
// the codes listed in Settings.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, state, many} = require("./harness");

const SUMMARY = {ok: true, store: true, total: 4, inUse: 2, codes: [
  {id: "f01", state: "in", dev: "iPhone", where: "Winnipeg, MB", since: "2026-10-14T23:00:00.000Z", seen: "2026-10-15T14:00:00.000Z", tries: 0},
  {id: "f02", state: "in", dev: "iPhone", where: "Winnipeg, MB", since: "2026-10-15T01:00:00.000Z", seen: "2026-10-15T13:00:00.000Z", tries: 2},
  {id: "f03", state: "new", dev: "", where: "", since: "", seen: "", tries: 0},
  {id: "f04", state: "off", dev: "", where: "", since: "", seen: "", tries: 0}],
  tries: [{id: "f02", at: "2026-10-16T01:30:00.000Z", dev: "Android", where: "Toronto, ON"},
    {id: "f02", at: "2026-10-15T20:00:00.000Z", dev: "iPhone", where: "Toronto, ON"}]};
const settle = h => h.run("new Promise(r => setTimeout(r, 5))");
function owner() {
  const h = load({today: "2026-10-16", state: state({d1: many(2, "2026-07-10")})});
  h.run(`globalThis.__asked = []; globalThis.fetch = async (u, o) => {
    if (!String(u).includes("/__admin/summary")) return {status: 404, ok: false, text: async () => ""};
    __asked.push([u, o.headers.Authorization]);
    return {status: 200, ok: true, json: async () => (${JSON.stringify(SUMMARY)})}; };`);
  return h;
}
const type = (h, v) => h.fire("input", {dataset: {watch: "key"}, value: v});

test("no key: nothing on Week; Settings asks for it, and it stays out of backups", async () => {
  const h = owner();
  assert.doesNotMatch(h.html(), /tried on another phone/);
  h.click("setopen");
  assert.match(h.html(), /Fellows' codes/);
  assert.match(h.html(), /data-watch="key"/);
  type(h, " qx7p-m4rt-9kwd-h3nb ");
  h.click("watchkey");
  await settle(h);
  assert.deepEqual(h.val("__asked"), [["https://gi-hub-fellows.pages.dev/__admin/summary", "Bearer qx7p-m4rt-9kwd-h3nb"]]);
  assert.equal(JSON.parse(h.store.get("gi-watch-v1")).key, "qx7p-m4rt-9kwd-h3nb");
  assert.doesNotMatch(h.store.get("epa-state-v1"), /qx7p/);
  // Settings lists codes in use, turned off or tried; the rest on one line.
  const html = h.html();
  assert.match(html, /<span>2 of 4 in use<\/span>/);
  assert.match(html, /<b>f01<\/b><span>iPhone · Winnipeg, MB<br>Last opened/);
  assert.match(html, /watchrow hot"><b>f02<\/b>.*Tried on another phone 2 times/);
  assert.match(html, /<b>f04<\/b><span>Turned off/);
  assert.match(html, /Not used yet: f03/);
});

test("tries from other phones show on Week until dismissed; new ones bring it back", async () => {
  const h = owner();
  h.store.set("gi-watch-v1", JSON.stringify({key: "K"}));
  h.run("watch = null; watchCheck();");
  await settle(h);
  let html = h.html();
  assert.match(html, /2 tries on other phones \(<b>f02<\/b>\)\. Newest: Android · Toronto, ON · /);
  assert.match(html, /href="https:\/\/gi-hub-fellows\.pages\.dev\/__admin"/);
  h.click("watchseen");
  assert.doesNotMatch(h.html(), /tries on other phones|tried on another phone/);
  assert.equal(JSON.parse(h.store.get("gi-watch-v1")).seenAt, "2026-10-16T01:30:00.000Z");
  // A new one later.
  const more = {...SUMMARY, tries: [{id: "f03", at: "2026-10-17T02:00:00.000Z", dev: "iPhone", where: "Calgary, AB"}, ...SUMMARY.tries]};
  h.run(`globalThis.fetch = async () => ({status: 200, ok: true, json: async () => (${JSON.stringify(more)})}); watchCheck();`);
  await settle(h);
  html = h.html();
  assert.match(html, /<b>f03<\/b> was tried on another phone: iPhone · Calgary, AB · /);
});

test("a key that stops working says so; forgetting it clears everything; no signal changes nothing", async () => {
  const h = owner();
  h.store.set("gi-watch-v1", JSON.stringify({key: "K"}));
  h.run("watch = null; globalThis.fetch = async () => ({status: 401, ok: false}); watchCheck();");
  await settle(h);
  assert.match(h.html(), /The fellows' admin key stopped working/);
  h.click("setopen");
  await settle(h);
  assert.match(h.html(), /This key doesn't work any more/);
  h.click("watchforget");
  assert.equal(h.store.get("gi-watch-v1"), "{}");
  assert.match(h.html(), /data-watch="key"/);
  h.run("watch = {key: 'K', last: null}; globalThis.fetch = async () => { throw new Error('offline'); }; watchCheck();");
  await settle(h);
  assert.equal(h.val("watch.bad"), undefined);
});

test("the fellows' edition never shows or asks for it", () => {
  const h = load({today: "2026-10-16", edition: "fellows", state: state({}, {setup: {d: "2026-10-01"}})});
  h.store.set("gi-watch-v1", JSON.stringify({key: "K", last: SUMMARY}));
  h.run("watch = null; render();");
  assert.doesNotMatch(h.html(), /tried on another phone|tries on other phones/);
  h.click("setopen");
  assert.doesNotMatch(h.html(), /Fellows' codes|data-watch/);
});
