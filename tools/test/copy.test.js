"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {ROOT} = require("./harness");

const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
// Everything we wrote: the page minus the verbatim Royal College EPA_DATA, plus the scripts and styles.
const ownText = () => read("index.html").replace(/\/\*EPA_DATA_START\*\/[\s\S]*?\/\*EPA_DATA_END\*\//, "") +
  ["search.js", "coach.js", "call.js", "study.js", "studyq.js", "guides.js", "guides-view.js", "trials.js", "trials-view.js", "pearls.js", "pearls-view.js", "agenda.js", "agenda-view.js", "notify.js", "remind.js", "settings.js", "watch.js", "study-view.js", "fellows.js", "app.js", "app.css", "sw.js", "guides.json", "tools/fellows/access.mjs"].map(f => "\n" + read(f)).join("");

test("no em-dashes in anything we wrote", () => {
  assert.deepEqual(ownText().split("\n").filter(l => l.includes("\u2014")).map(l => l.trim().slice(0, 80)), []);
});

test("no emoji or check glyphs in the interface", () => {
  assert.deepEqual(ownText().split("\n").filter(l => /[\u{1F300}-\u{1FAFF}\u23F3\u2705\u2713]/u.test(l)).map(l => l.trim().slice(0, 80)), []);
});

test("the app never says Elentra", () => {
  assert.doesNotMatch(ownText(), /elentra/i);
});

test("the power-on leaves nothing clipped: the typed overlay drops its clip when done, and the bloom stays inside the monitor", () => {
  const css = read("app.css");
  // Held only before it starts, so a stepped animation stopping one step short can't crop the last letter.
  assert.match(css, /\.monitor\.boot \.ov > span \{ animation: typeOn [^}]*\) backwards; \}/);
  // The bloom grows past the monitor's edges; clipped there, it can't widen the page.
  assert.match(css, /\.monitor-in, \.callnow-in \{[^}]*overflow: hidden;/);
});

test("off-label has its own colour, apart from every drug class", () => {
  const css = read("app.css");
  const off = css.match(/--offlabel: (#[0-9a-f]{6});/)[1];
  const classes = css.match(/\.c-asa \{[^\n]*\n[^\n]*/)[0];
  // The ring and its note use the off-label colour, never a class colour.
  assert.match(css, /\.dr-off \{[^}]*var\(--offlabel\)/);
  assert.match(css, /\.dr-offnote \{[^}]*var\(--offlabel-wash\)/);
  assert.doesNotMatch(classes, /--offlabel/);
  for (const [, tok] of classes.matchAll(/var\(--([a-z-]+)\)/g)) {
    const v = (css.match(new RegExp(`--${tok}: (#[0-9a-f]{6});`)) || [])[1];
    assert.notEqual(v, off, tok);
  }
});

test("the + sheet's save bar stays at the sheet's foot: only the Endo page's save bar rises to clear the +", () => {
  const css = read("app.css");
  assert.match(css, /:root:has\(\.fab\.mid\) \.page \.savebar \{ bottom: calc\(var\(--nav-h\) \+ env\(safe-area-inset-bottom\) \+ 26px\); \}/);
  // The rise outranks the sheet's own rules, so it must never reach a save bar in a sheet.
  for (const [rule] of css.matchAll(/[^{}\n]*:has\(\.fab\.mid\)[^{}\n]*\.savebar \{/g)) assert.match(rule, /\.page \.savebar/, rule);
  // A sticky bar counts from inside the sheet's padding, which already clears the home bar,
  // or the keyboard's toolbar with the keys up; adding the toolbar again floated it mid-sheet.
  assert.match(css, /\.scopesheet \.savebar \{ bottom: 0; \}/);
  assert.doesNotMatch(css, /\.savebar \{ bottom: var\(--kbbar\)/);
});

test("a page shorter than the phone still fills the screen in the installed app, so the tab bar sits on the bottom edge", () => {
  const css = read("app.css");
  assert.match(css, /@media \(display-mode: standalone\) \{ html \{ min-height: min\(100lvh, calc\(100% \+ env\(safe-area-inset-top\)\)\); \} \}/);
});

test("the look loads nothing from other sites: Outfit is served from the app", () => {
  const css = read("app.css");
  assert.doesNotMatch(css, /@import|googleapis|gstatic/);
  assert.match(css, /@font-face \{ font-family: "Outfit";[^}]*url\("fonts\/outfit-var\.woff2"\)/);
});

test("an update saves fresh files, never the browser's cached copies of the last version", () => {
  assert.match(read("sw.js"), /c\.addAll\(ASSETS\.map\(u => new Request\(u, \{cache: "reload"\}\)\)\)/);
});

test("the service worker caches every file the app needs, under a new cache name", () => {
  const sw = read("sw.js");
  assert.match(sw, /const CACHE = "epa-v71";/);
  // The page shows the same version the service worker caches.
  assert.match(read("app.js"), /const APP_VERSION = "epa-v71";/);
  for (const f of ["index.html", "app.css", "search.js", "coach.js", "call.js", "study.js", "scope.js", "notify.js", "remind.js", "settings.js", "watch.js", "study-view.js", "scope-chart.js",
    "scope-view.js", "scope-report.js", "review.js", "guides.js", "guides-view.js", "guides.json", "ibd.js", "ibd-view.js", "trials.js", "trials-view.js", "pearls.js", "pearls-view.js", "agenda.js", "agenda-view.js", "fellows.js", "app.js", "icon.svg", "fonts/outfit-var.woff2"]) {
    assert.ok(sw.includes(`"${f}"`), f);
    assert.ok(fs.existsSync(path.join(ROOT, f)), "missing file " + f);
  }
});

test("the page loads the stylesheet, the coach, the call card and the app, in order", () => {
  const html = read("index.html");
  assert.ok(html.indexOf('href="app.css"') > 0);
  assert.ok(html.indexOf('src="coach.js"') < html.indexOf('src="call.js"'));
  assert.ok(html.indexOf('src="call.js"') < html.indexOf('src="notify.js"'));
  assert.ok(html.indexOf('src="notify.js"') < html.indexOf('src="remind.js"'));
  assert.ok(html.indexOf('src="call.js"') < html.indexOf('src="study.js"'));
  assert.ok(html.indexOf('src="study.js"') < html.indexOf('src="notify.js"'));
  assert.ok(html.indexOf('src="remind.js"') < html.indexOf('src="study-view.js"'));
  assert.ok(html.indexOf('src="study-view.js"') < html.indexOf('src="app.js"'));
  assert.ok(html.indexOf('src="study.js"') < html.indexOf('src="scope.js"'));
  assert.ok(html.indexOf('src="scope.js"') < html.indexOf('src="scope-chart.js"'));
  assert.ok(html.indexOf('src="scope-chart.js"') < html.indexOf('src="scope-view.js"'));
  assert.ok(html.indexOf('src="scope-view.js"') < html.indexOf('src="scope-report.js"'));
  assert.ok(html.indexOf('src="scope-report.js"') < html.indexOf('src="app.js"'));
  assert.ok(html.indexOf('src="scope-report.js"') < html.indexOf('src="review.js"'));
  assert.ok(html.indexOf('src="review.js"') < html.indexOf('src="app.js"'));
  // The edition switch is read at the top of app.js.
  assert.ok(html.indexOf('src="fellows.js"') < html.indexOf('src="app.js"'));
  assert.doesNotMatch(html, /<style>/);
});

test("real call files can't be committed: only the placeholder fixture", () => {
  assert.match(read(".gitignore"), /^GI-Call\*\.ics$/m);
  const ics = [];
  const walk = d => { for (const f of fs.readdirSync(path.join(ROOT, d), {withFileTypes: true})) {
    if (f.name === ".git" || f.name === "node_modules") continue;
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p); else if (f.name.endsWith(".ics")) ics.push(p.split(path.sep).join("/"));
  } };
  walk(".");
  assert.deepEqual(ics, ["tools/test/fixtures/call-sample.ics"]);
});

test("real case files with staff names can't be committed", () => {
  assert.match(read(".gitignore"), /^GI-Scopes\*\.json$/m);
  const found = [];
  const walk = d => { for (const f of fs.readdirSync(path.join(ROOT, d), {withFileTypes: true})) {
    if (f.name === ".git" || f.name === "node_modules") continue;
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p); else if (/^GI-Scopes/i.test(f.name)) found.push(p);
  } };
  walk(".");
  assert.deepEqual(found, []);
});
