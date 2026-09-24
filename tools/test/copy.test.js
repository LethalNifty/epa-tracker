"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {ROOT} = require("./harness");

const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
// Everything we wrote: the page minus the verbatim Royal College EPA_DATA, plus coach.js.
const ownText = () => read("index.html").replace(/\/\*EPA_DATA_START\*\/[\s\S]*?\/\*EPA_DATA_END\*\//, "") + "\n" + read("coach.js");

test("no em-dashes in anything we wrote", () => {
  assert.deepEqual(ownText().split("\n").filter(l => l.includes("\u2014")).map(l => l.trim().slice(0, 80)), []);
});

test("no emoji or check glyphs in the interface", () => {
  assert.deepEqual(ownText().split("\n").filter(l => /[\u{1F300}-\u{1FAFF}\u23F3\u2705\u2713]/u.test(l)).map(l => l.trim().slice(0, 80)), []);
});

test("the app never says Elentra", () => {
  assert.doesNotMatch(ownText(), /elentra/i);
});

test("the service worker caches coach.js under a new cache name", () => {
  const sw = read("sw.js");
  assert.match(sw, /const CACHE = "epa-v6";/);
  assert.match(sw, /"coach\.js"/);
});
