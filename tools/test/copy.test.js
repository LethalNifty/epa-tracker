"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {ROOT} = require("./harness");

const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
// Everything we wrote: the page minus the verbatim Royal College EPA_DATA, plus the scripts and styles.
const ownText = () => read("index.html").replace(/\/\*EPA_DATA_START\*\/[\s\S]*?\/\*EPA_DATA_END\*\//, "") +
  ["coach.js", "app.js", "app.css"].map(f => "\n" + read(f)).join("");

test("no em-dashes in anything we wrote", () => {
  assert.deepEqual(ownText().split("\n").filter(l => l.includes("\u2014")).map(l => l.trim().slice(0, 80)), []);
});

test("no emoji or check glyphs in the interface", () => {
  assert.deepEqual(ownText().split("\n").filter(l => /[\u{1F300}-\u{1FAFF}\u23F3\u2705\u2713]/u.test(l)).map(l => l.trim().slice(0, 80)), []);
});

test("the app never says Elentra", () => {
  assert.doesNotMatch(ownText(), /elentra/i);
});

test("the service worker caches every file the app needs, under a new cache name", () => {
  const sw = read("sw.js");
  assert.match(sw, /const CACHE = "epa-v7";/);
  for (const f of ["index.html", "app.css", "coach.js", "app.js", "icon.svg", "fonts/plex-sans-var.woff2",
    "fonts/plex-mono-400.woff2", "fonts/plex-mono-500.woff2"]) {
    assert.ok(sw.includes(`"${f}"`), f);
    assert.ok(fs.existsSync(path.join(ROOT, f)), "missing file " + f);
  }
});

test("the page loads the stylesheet, the coach and the app, in order", () => {
  const html = read("index.html");
  assert.ok(html.indexOf('href="app.css"') > 0);
  assert.ok(html.indexOf('src="coach.js"') < html.indexOf('src="app.js"'));
  assert.doesNotMatch(html, /<style>/);
});
