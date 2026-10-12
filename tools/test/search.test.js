"use strict";
// One search for every list (search.js): how words are matched, ranked and lit.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load} = require("./harness");

test("words are matched without case, accents or punctuation", () => {
  const h = load({today: "2026-10-12"});
  assert.equal(h.val(`searchNorm("H. pylori, Crohn's & Sjögren")`), "h pylori crohns sjogren");
  assert.deepEqual(h.val(`searchWords("  C. diff  ")`), ["c", "diff"]);
});

test("every word must match; a word's start and a heavier field rank first; ties keep list order", () => {
  const h = load({today: "2026-10-12"});
  h.run(`__list = [{n: "Gastric varices", k: "portal"}, {n: "Variceal bleeding", k: "band"}, {n: "Portal vein", k: "thrombosis varices"}]`);
  const find = q => h.val(`searchFind(__list, ${JSON.stringify(q)}, x => [[searchHay(x.n), 6], [searchHay(x.k), 4]]).map(x => x.n)`);
  assert.deepEqual(find("portal"), ["Portal vein", "Gastric varices"]);
  assert.deepEqual(find("varic"), ["Gastric varices", "Variceal bleeding", "Portal vein"]);
  assert.deepEqual(find("portal varices"), ["Gastric varices", "Portal vein"]);
  assert.deepEqual(find("nothing here"), []);
  assert.deepEqual(find(""), ["Gastric varices", "Variceal bleeding", "Portal vein"]);
  // keep: matches stay in list order.
  assert.deepEqual(h.val(`searchFind(__list, "portal", x => [[searchHay(x.n), 6], [searchHay(x.k), 4]], {keep: true}).map(x => x.n)`),
    ["Gastric varices", "Portal vein"]);
});

test("search words light up in HTML, never inside a tag, and one-letter words stay dark", () => {
  const h = load({today: "2026-10-12"});
  assert.equal(h.val(`searchHi('<a href="/colitis">Ulcerative colitis</a>', "colitis")`), '<a href="/colitis">Ulcerative <mark>colitis</mark></a>');
  assert.equal(h.val(`searchHi("H. pylori gastritis", "h pylori")`), "H. <mark>pylori</mark> gastritis");
  assert.equal(h.val(`searchHi("Plain", "")`), "Plain");
});

test("biopsy search matches word by word, like every other search box", () => {
  const h = load({today: "2026-10-12"});
  // The words in either order, not only as one phrase.
  assert.ok(h.val(`biopsyFilter("biopsy duodenal", "all").map(d => d.title)`).includes("Celiac disease"));
  assert.ok(h.val(`biopsyFilter("pylori stomach", "all").length`) > 0);
  // Highlighting is per word too.
  h.click("tab", {page: "biopsy"});
  h.run(`biopsyTerm = "celiac biopsy"; render()`);
  assert.match(h.html(), /<mark>Celiac<\/mark> disease/);
});

test("search.js loads before every file that builds word lists with it", () => {
  const html = require("node:fs").readFileSync(require("node:path").join(require("./harness").ROOT, "index.html"), "utf8");
  for (const f of ["guides.js", "ibd.js", "trials.js", "pearls.js", "app.js"])
    assert.ok(html.indexOf('src="search.js"') < html.indexOf(`src="${f}"`), f);
});
