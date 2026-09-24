"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {load} = require("./harness");

const PDF = "https://healthproviders.sharedhealthmb.ca/files/clinical-guideline-gi-endoscopic-biopsy.pdf";

test("every Manitoba card cites a section and page; every other card names its source", () => {
  const h = load({today: "2026-09-24"});
  assert.deepEqual(h.val(`BIOPSY_DATA.filter(d => d.src === "mb" && !(d.sec && d.sec.length === 3)).map(d => d.title)`), []);
  assert.deepEqual(h.val(`BIOPSY_DATA.filter(d => d.src === "us" && !(d.ref && d.ref.short && d.ref.label)).map(d => d.title)`), []);
});

test("cards link to the right place", () => {
  const h = load({today: "2026-09-24"});
  h.click("tab", {page: "biopsy"});
  const html = h.html();
  assert.ok(html.includes(`<a class="srcrow" href="${PDF}" target="_blank" rel="noopener">`));
  assert.match(html, /Shared Health §2\.7 Duodenal biopsy · p\. 3/);
  assert.match(html, /href="https:\/\/doi\.org\/10\.1053\/j\.gastro\.2021\.06\.078"/);
  assert.match(html, /<span class="btag us">ECCO<\/span>/);
  assert.match(html, /Open the full Manitoba guideline/);
  assert.equal((html.match(/class="srcrow"/g) || []).length, 16);
});

test("search matches section titles and sources", () => {
  const h = load({today: "2026-09-24"});
  assert.deepEqual(h.val(`biopsyFilter("duodenal biopsy", "all").map(d => d.title)`), ["Celiac disease"]);
  assert.deepEqual(h.val(`biopsyFilter("ECCO", "all").map(d => d.title)`), ["IBD: initial diagnosis (mapping)"]);
});

test("gastric ulcer card carries the edge and base numbers", () => {
  const h = load({today: "2026-09-24"});
  assert.match(h.val(`BIOPSY_DATA.find(d => d.title === "Gastric ulcer").rows.map(r => r.join(" ")).join(" ")`),
    /≥4 from the edge \+ ≥1 from the base/);
});

test("biopsy Notes rows are not restyled by the backup note", () => {
  const html = require("node:fs").readFileSync(require("node:path").join(require("./harness").ROOT, "index.html"), "utf8");
  assert.doesNotMatch(html, /^\.note\{/m);
  const h = load({today: "2026-09-24"});
  h.click("tab", {page: "epas"});
  assert.match(h.html(), /<div class="bnote">Last backup: never<\/div>/);
});
