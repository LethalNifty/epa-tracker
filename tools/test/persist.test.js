"use strict";
// iOS may clear a web app's storage when the phone runs short of space; the
// app asks once at start for it to be kept (granted to home-screen apps).
const test = require("node:test");
const assert = require("node:assert/strict");
const {load} = require("./harness");

const tick = () => new Promise(r => setImmediate(r));
function storage(already) {
  const asked = [];
  return {asked, storage: {persisted: async () => already, persist: async () => { asked.push("persist"); return true; }}};
}

test("the app asks iOS to keep its storage when it isn't kept yet", async () => {
  const s = storage(false);
  load({today: "2026-11-03", navigator: {storage: s.storage}});
  await tick();
  assert.deepEqual(s.asked, ["persist"]);
});

test("storage already kept: nothing is asked", async () => {
  const s = storage(true);
  load({today: "2026-11-03", navigator: {storage: s.storage}});
  await tick();
  assert.deepEqual(s.asked, []);
});

test("a browser without the storage call still starts", () => {
  const h = load({today: "2026-11-03", navigator: {}});
  assert.match(h.html(), /class="title"/);
});
