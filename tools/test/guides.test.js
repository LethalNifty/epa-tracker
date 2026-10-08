"use strict";
// Guides: the guideline library (guides.json, built outside this repository),
// search, this block's topics, what's new, and the tab itself.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {load, state, ROOT} = require("./harness");

const FILE = path.join(ROOT, "guides.json");
const LIB = JSON.parse(fs.readFileSync(FILE, "utf8"));
// A phone with the library loaded, on the Guides tab unless told otherwise.
function phone(today = "2026-10-08", st, page = "guides") {
  const h = load({today, state: st});
  h.run(`guidesAccept(${JSON.stringify(LIB)}); guidesRedraw();`);
  if (page) h.click("tab", {page});
  return h;
}
const ids = (h, expr) => h.val(`${expr}.map(t => t.id)`);

// ---- The file -----------------------------------------------------------------------------
test("the library file: shape, links and years", () => {
  assert.equal(LIB.v, 1);
  assert.match(LIB.checked, /^\d{4}-\d{2}-\d{2}$/);
  const secs = new Set(LIB.sections.map(s => s.id));
  assert.equal(secs.size, LIB.sections.length);
  const seen = new Set();
  for (const t of LIB.topics) {
    assert.ok(!seen.has(t.id), "duplicate id " + t.id); seen.add(t.id);
    assert.ok(secs.has(t.s), t.id + " section");
    assert.ok(t.n && t.k !== undefined, t.id);
    if (t.id !== "biopsy") assert.ok(t.p.length >= 1, t.id + " has no lead guideline");
    const keys = new Set();
    for (const d of t.p.concat(t.a)) {
      assert.match(d.u, /^https:\/\//, t.id + " " + d.t);
      assert.ok(d.y >= 1985 && d.y <= 2027, t.id + " year " + d.y);
      assert.ok(d.w && d.t, t.id);
      assert.ok(!keys.has(d.k), t.id + " lists " + d.t + " twice"); keys.add(d.k);
    }
    for (const c of t.c) assert.match(c.u, /^https:\/\//, t.id + " " + c.t);
  }
  assert.equal(LIB.topics.length, 113);
  assert.ok(fs.statSync(FILE).size < 150 * 1024, "guides.json stays small");
});

test("every title is written out: no cut-off titles, em-dashes or Elentra", () => {
  const text = LIB.topics.flatMap(t => [t.n, t.note, ...t.p.concat(t.a).map(d => d.t), ...t.c.map(c => c.t)]);
  assert.deepEqual(text.filter(s => /[…—]|elentra/i.test(s)), []);
});

test("European society guidelines are held back; none leads a topic", () => {
  const eu = /^(ECCO|EASL|ESGE|ESPEN|BSG|UEG|ESNM)\b/;
  assert.deepEqual(LIB.topics.flatMap(t => t.p.concat(t.a)).filter(d => eu.test(d.w)).map(d => d.w + " " + d.t), []);
});

test("Canadian guidance leads where it is current", () => {
  const lead = id => LIB.topics.find(t => t.id === id).p[0];
  for (const id of ["eoe", "dyspepsia", "h-pylori", "ibs", "chronic-diarrhea", "upper-gi-bleeding", "antithrombotics", "masld", "hbv", "hcv", "lynch", "crc-screening", "crc-family-history"])
    assert.ok(lead(id).ca, id + " should lead with Canadian guidance");
  assert.equal(lead("diverticulitis").w, "ACG");
  assert.equal(lead("diverticulitis").y, 2026);
});

test("chapters, rotations and biopsy links all point at real things", () => {
  const h = load({today: "2026-10-08"});
  const chapters = new Set(Object.keys(h.val("STUDY_CH")).map(Number));
  const fams = new Set(Object.values(h.val("BLOCK_FAMILY")));
  const biopsy = new Set(h.val("BIOPSY_DATA.map(d => d.title)"));
  for (const t of LIB.topics) {
    for (const c of t.ch) assert.ok(chapters.has(c), t.id + " chapter " + c);
    for (const f of t.fam) assert.ok(fams.has(f), t.id + " rotation " + f);
    for (const b of t.bx) assert.ok(biopsy.has(b), t.id + " biopsy " + b);
  }
});

// ---- Search ----------------------------------------------------------------------------------
test("search: names first, then aliases, societies and titles", () => {
  const h = phone();
  const first = q => ids(h, `guidesSearch(Guides.data.topics, ${JSON.stringify(q)})`)[0];
  assert.equal(first("diverticulitis"), "diverticulitis");
  assert.equal(first("c diff"), "c-difficile");
  assert.equal(first("H. pylori"), "h-pylori");
  assert.equal(first("pylori"), "h-pylori");
  assert.equal(first("SBP"), "ascites");
  assert.equal(first("fidaxomicin"), "c-difficile");
  const crohn = ids(h, `guidesSearch(Guides.data.topics, "Crohn's")`);
  assert.equal(crohn[0], "crohns");
  assert.ok(crohn.includes("perianal-crohns") && crohn.includes("postop-crohns"));
  const baveno = ids(h, `guidesSearch(Guides.data.topics, "baveno")`);
  assert.ok(baveno.includes("variceal-bleeding") && baveno.includes("varices-prophylaxis"));
  const acg = ids(h, `guidesSearch(Guides.data.topics, "ACG 2026")`);
  assert.ok(acg.includes("diverticulitis") && acg.includes("hepatic-encephalopathy"));
  assert.deepEqual(ids(h, `guidesSearch(Guides.data.topics, "zzzz")`), []);
});

// ---- This block -------------------------------------------------------------------------------
test("this block: the reading's topics first, then the rotation's", () => {
  const h = phone();
  const b4 = ids(h, "guidesForBlock(Guides.data.topics, 4)");
  for (const id of ["achalasia", "esophageal-testing", "gastroparesis", "nutrition-support", "short-bowel", "peg"]) assert.ok(b4.includes(id), "block 4 " + id);
  assert.ok(b4.indexOf("achalasia") < b4.indexOf("ibs"), "reading before rotation");
  const b5 = ids(h, "guidesForBlock(Guides.data.topics, 5)");
  for (const id of ["celiac", "uc", "c-difficile", "diverticulitis"]) assert.ok(b5.includes(id), "block 5 " + id);
});

// ---- New ------------------------------------------------------------------------------------------
test("new: published online in the last 30 days, newest first", () => {
  const h = phone("2026-10-08");
  const news = h.val("guidesNews(Guides.data.topics, getToday()).map(n => [n.d, n.k])");
  const keys = news.map(n => n[1]);
  assert.ok(keys.includes("42831646"), "ACG cirrhosis preventive care, Oct 5");
  assert.ok(keys.includes("42814045"), "serrated polyposis, Sep 30");
  assert.ok(news.every(n => n[0] >= "2026-09-08" && n[0] <= "2026-10-08"));
  assert.deepEqual(news.map(n => n[0]), news.map(n => n[0]).slice().sort().reverse());
  assert.equal(new Set(keys).size, keys.length);
});

// ---- The tab ------------------------------------------------------------------------------------
test("before the library loads, the tab says so and Biopsy still works", () => {
  const h = load({today: "2026-10-08"});
  h.click("tab", {page: "guides"});
  assert.match(h.html(), /<h1 class="title">Guides<\/h1>/);
  assert.match(h.html(), /Loading the guideline library|downloads the first time/);
  h.click("guidestab", {tab: "b"});
  assert.match(h.html(), /Open the full Manitoba guideline/);
});

test("the tab: white-light monitor, new, search, chips and every topic", () => {
  const h = phone();
  const html = h.html();
  assert.match(html, /113 topics · Canadian first/);
  assert.match(html, /class="monitor guidemon"/);
  assert.match(html, /Checked Oct 8/);
  assert.match(html, /New · last 30 days/);
  assert.match(html, /id="guidesq"/);
  assert.match(html, /data-chip="block">.*Block 4 · Motility/);
  assert.equal((html.match(/class="gt"/g) || []).length, 113);
  assert.match(html, /class="nv on" data-action="tab" data-page="guides"/);
});

test("a topic opens to its links, chapter and note; links open the publisher's page", () => {
  const h = phone();
  h.click("guidestoggle", {id: "diverticulitis"});
  const art = h.html().slice(h.html().indexOf('id="g-diverticulitis"'));
  const body = art.slice(0, art.indexOf("</article>"));
  assert.match(body, /class="glink" href="https:\/\/doi\.org\/[^"]+" target="_blank" rel="noopener"><span class="who mono">ACG<span class="yr">2026<\/span>/);
  assert.match(body, /Also/);
  assert.match(body, /ASCRS<span class="yr">2026/);
  assert.match(body, /Mayo ch\. 18 · Intestinal Infections · pp\. 207–220 · Block 5/);
  h.click("guidestoggle", {id: "diverticulitis"});
  assert.doesNotMatch(h.html(), /aria-expanded="true"/);
});

test("a topic's row shows its lead guideline's own society and year", () => {
  const h = phone();
  assert.match(h.html(), /id="g-barretts"><button[^>]*>.*?<span class="gt-lead mono">ACG 2022<span class="more">\+1<\/span><\/span>/);
  assert.match(h.html(), /id="g-diverticulitis"><button[^>]*>.*?<span class="gt-lead mono">ACG 2026<\/span>/);
});

test("Canadian leads are marked CA; old leads warn", () => {
  const h = phone();
  h.click("guidestoggle", {id: "h-pylori"});
  h.click("guidestoggle", {id: "foreign-body"});
  const html = h.html();
  assert.match(html, /<span class="catag mono">CA<\/span>/);
  assert.match(html, /The lead guideline is 10 or more years old/);
});

test("chips: a section, this block, then all", () => {
  const h = phone();
  h.click("guideschip", {chip: "liver"});
  assert.equal((h.html().match(/class="gt"/g) || []).length, LIB.topics.filter(t => t.s === "liver").length);
  assert.doesNotMatch(h.html(), /New · last 30 days/);
  h.click("guideschip", {chip: "block"});
  assert.match(h.html(), /This block's reading/);
  assert.match(h.html(), /On Motility\/Nutrition/);
  h.click("guideschip", {chip: "all"});
  assert.equal((h.html().match(/class="gt"/g) || []).length, 113);
});

test("search from the box ranks the list flat, with each topic's section", () => {
  const h = phone();
  h.run(`guidesTerm = "diverticulitis"; render();`);
  assert.match(h.html(), /id="g-diverticulitis"><button class="gt-head"[^>]*aria-expanded="true"/);
  h.run(`guidesTerm = "baveno"; render();`);
  assert.match(h.html(), /of 113 topics/);
  assert.match(h.html(), /<span class="gt-sec mono">Bleeding<\/span>/);
  h.click("guidesclear");
  assert.equal(h.val("guidesTerm"), "");
});

test("pins: saved, shown first as a chip, kept in the backup", () => {
  const h = phone();
  h.click("guidespin", {id: "ascites"});
  assert.deepEqual(h.saved().guides.pins, ["ascites"]);
  assert.match(h.html(), /data-chip="pins">.*Pinned 1/);
  h.click("guideschip", {chip: "pins"});
  assert.equal((h.html().match(/class="gt( open)?"/g) || []).length, 1);
  const backup = h.run("Store.exportJSON()");
  const h2 = phone();
  assert.equal(h2.run(`Store.importJSON(${JSON.stringify(backup)}).ok`), true);
  assert.deepEqual(h2.saved().guides.pins, ["ascites"]);
  h.click("guidespin", {id: "ascites"});
  assert.deepEqual(h.saved().guides.pins, []);
});

test("an old backup without Guides still imports", () => {
  const h = phone("2026-10-08", state(), null);
  assert.deepEqual(h.val("Store.state.guides"), {pins: [], seen: []});
  assert.equal(h.run(`Store.importJSON(JSON.stringify({v: 1, obs: {}, lines: {}}))`).ok, true);
  assert.deepEqual(h.val("Store.state.guides"), {pins: [], seen: []});
});

test("the bar's dot shows new guidelines until Guides is opened; the list keeps its dots for that visit", () => {
  const h = phone("2026-10-08", undefined, "week");
  assert.match(h.html(), /data-page="guides">.*class="nvdot"/);
  h.click("tab", {page: "guides"});
  assert.ok(h.saved().guides.seen.includes("42831646"));
  assert.match(h.html(), /class="gdot"/);
  h.click("guidestoggle", {id: "cirrhosis-care"});
  assert.match(h.html(), /class="gdot"/);
  h.click("tab", {page: "week"});
  assert.doesNotMatch(h.html(), /class="nvdot"/);
  h.click("tab", {page: "guides"});
  assert.doesNotMatch(h.html(), /class="gdot"/);
});

test("a new guideline opens its topic; a biopsy link opens the protocol", () => {
  const h = phone();
  h.click("guidesopen", {id: "polyposis"});
  assert.match(h.html(), /id="g-polyposis"><button class="gt-head" data-action="guidestoggle" data-id="polyposis" aria-expanded="true"/);
  h.click("guidestoggle", {id: "celiac"});
  assert.match(h.html(), /data-action="guidesbx" data-q="Celiac disease"/);
  h.click("guidesbx", {q: "Celiac disease"});
  assert.match(h.html(), /id="biopsyq"[^>]*value="Celiac disease"/);
  assert.match(h.html(), /1 of 16 shown/);
});

test("the old Biopsy link lands on Guides' Biopsy view", () => {
  const h = phone("2026-10-08", undefined, null);
  h.click("tab", {page: "biopsy"});
  assert.match(h.html(), /<h1 class="title">Guides<\/h1>/);
  assert.match(h.html(), /Open the full Manitoba guideline/);
});

test("Study links tonight's reading to its guidelines", () => {
  const h = phone("2026-10-07", undefined, "study");
  assert.equal(h.val("studyState().t.kind"), "read");
  assert.match(h.html(), /Guidelines for this reading/);
  const id = h.html().match(/data-action="guidesopen" data-id="([^"]+)"/)[1];
  h.click("guidesopen", {id});
  assert.match(h.html(), /<h1 class="title">Guides<\/h1>/);
  assert.match(h.html(), new RegExp(`id="g-${id}"><button class="gt-head"[^>]*aria-expanded="true"`));
});
