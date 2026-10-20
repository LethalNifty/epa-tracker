"use strict";
// The Study tab, the Tonight card on Week, the study sheets, and study in the backup.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, state} = require("./harness");

const withStudy = (log = {}, extra = {}) => state({}, {study: {log, q: {}, pauses: [], ...extra}});
const study = (today, st) => { const h = load({today, state: st}); h.click("tab", {page: "study"}); return h; };

test("Study renders tonight's pages on the first reading night", () => {
  const h = study("2026-09-30");
  const html = h.html();
  assert.match(html, /<h1 class="title">Study<\/h1>/);
  assert.match(html, /Tonight · Wed 30 Sep/);
  assert.match(html, /<b>35–38<\/b>/);
  assert.match(html, /Esophageal Motility/);
  assert.match(html, /data-action="studydone"/);
  assert.equal((html.match(/class="ng /g) || []).length, 35);
  // The book and the question scores are on Plan.
  assert.doesNotMatch(html, /class="qrow"/);
  h.click("studytab", {tab: "p"});
  const plan = h.html();
  assert.equal((plan.match(/<i class="(lit|tn|)"/g) || []).length, 460);
  assert.equal((plan.match(/class="qrow"/g) || []).length, 7);
  assert.doesNotMatch(plan, /data-action="studydone"/);
});

test("the nights grid starts on Monday: rows named for their Monday, the days outside the block faint", () => {
  const html = study("2026-10-20").html();
  assert.match(html, /<div class="ng-days mono"><span><\/span><span>Mon<\/span><span>Tue<\/span><span>Wed<\/span><span>Thu<\/span><span>Fri<\/span><span>Sat<\/span><span>Sun<\/span><\/div>/);
  assert.deepEqual([...html.matchAll(/<span class="ng-wk mono">([^<]*)<\/span>/g)].map(m => m[1]), ["Sep 21", "Sep 28", "Oct 5", "Oct 12", "Oct 19"]);
  // This week's row stands out.
  assert.deepEqual([...html.matchAll(/<div class="ng-row cur"><span class="ng-wk mono">([^<]*)</g)].map(m => m[1]), ["Oct 19"]);
  // Mon 21 to Wed 23 Sep belong to Block 3, Thu 22 to Sun 25 Oct to Block 5: faint,
  // with a line just inside the block where it turns over.
  const cells = [...html.matchAll(/<div class="(ng [^"]*)"/g)].map(m => m[1]);
  assert.equal(cells.length, 35);
  const where = re => cells.map((c, i) => re.test(c) ? i : -1).filter(i => i >= 0);
  assert.deepEqual(where(/ out\b/), [0, 1, 2, 31, 32, 33, 34]);
  assert.deepEqual(where(/ edge-a\b/), [3]);    // Thu 24 Sep, the block's first day
  assert.deepEqual(where(/ edge-z\b/), [30]);   // Wed 21 Oct, its last
  assert.match(cells[29], /s-today/);
});

test("Study opens on Tonight from Week and from a reminder, whichever view was last", () => {
  const h = study("2026-09-30");
  assert.match(h.html(), /<div class="segtabs" role="group" aria-label="Study views"><button class="on" data-action="studytab" data-tab="t" aria-current="page">Tonight<\/button><button class="" data-action="studytab" data-tab="p">Plan<\/button><\/div>/);
  h.click("studytab", {tab: "p"});
  h.click("tab", {page: "week"});
  assert.match(h.html(), /<button class="card studycard[^"]*" data-action="studyopen">/);
  h.click("studyopen");
  assert.equal(h.val("route.page"), "study");
  assert.equal(h.val("studyTab"), "t");
  h.click("studytab", {tab: "p"});
  h.run(`appOpenFromLink("study")`);
  assert.equal(h.val("studyTab"), "t");
});

test("before the plan starts, Study previews the first night", () => {
  const html = study("2026-09-29").html();
  assert.match(html, /Starts Wed 30 Sep/);
  assert.match(html, /First night · Wed 30 Sep/);
  assert.match(html, /I read pp\. 35–38/);
});

test("Done moves the bookmark to the end of tonight, with undo", () => {
  const h = study("2026-09-30");
  h.click("studydone");
  assert.deepEqual(h.saved().study.log, {"2026-09-30": 4});
  assert.match(h.html(), /Done for tonight/);
  assert.match(h.html(), /Done · through Mayo p\. 38/);   // the toast
  h.click("undo");
  assert.deepEqual(h.saved().study.log, {});
});

test("Stopped somewhere else: pick a chapter and the last page read", () => {
  const h = study("2026-10-05", withStudy({"2026-10-02": 6}));
  h.click("studystop");
  assert.match(h.html(), /Where did you stop\?/);
  h.click("studyitem", {id: "c7"});
  assert.match(h.html(), /data-action="studypick" data-i="40">83</);
  h.click("studypick", {i: "44"});   // p. 87 is run index 43, so through it is 44
  assert.match(h.html(), /Through p\. 87 · Ch 7/);
  h.click("studysave");
  assert.equal(h.saved().study.log["2026-10-05"], 44);
});

test("an off night says why and offers the next pages", () => {
  const html = study("2026-10-01", withStudy({"2026-09-30": 3})).html();
  assert.match(html, /Thursday: soccer night\./);
  assert.match(html, /I read pp\. 38–41/);
  assert.match(html, /Next reading night · Fri 2 Oct/);
});

test("while there are pages to read, Study says how to highlight; once tonight is done it stops", () => {
  const tip = /Highlight only what you didn't know: the number, the drug, the term\. For a whole table or figure, highlight its title\. Aim for 3 to 6 marks a page\./;
  const h = study("2026-09-30");
  assert.match(h.html(), tip);
  h.click("studydone");
  assert.doesNotMatch(h.html(), tip);
  // An off night still offers pages, so the tip stays.
  assert.match(study("2026-10-01", withStudy({"2026-09-30": 4})).html(), tip);
  // The whole plan read: nothing to highlight.
  assert.doesNotMatch(study("2027-05-20", withStudy({"2027-05-19": 460})).html(), tip);
});

test("a call night is a night off", () => {
  const h = load({today: "2026-10-07"});
  h.run(`CallStore.state.shifts = {a: {uid: "a", s: new Date(2026, 9, 7, 17).getTime(), e: new Date(2026, 9, 8, 8).getTime(),
    so: null, hsc: {att: "Attending A", res: null}, stb: {att: "Attending B", res: null}}};`);
  h.click("tab", {page: "study"});
  assert.match(h.html(), /You're on call tonight\./);
});

test("pause: the sheet saves a range and tonight becomes a night off", () => {
  const h = study("2026-10-05");
  h.click("studypause");
  h.click("studypausechip", {a: "2026-10-05", b: "2026-10-07"});
  h.click("studysave");
  assert.deepEqual(h.saved().study.pauses, [{a: "2026-10-05", b: "2026-10-07"}]);
  assert.match(h.html(), /Paused until Thu 8 Oct\./);
  h.click("studyunpause", {i: "0"});
  assert.deepEqual(h.saved().study.pauses, []);
});

test("a finished question set asks for a score, and the score is saved", () => {
  const q3end = load({today: "2026-11-02"}).val("studyItemEnd(STUDY_BY_ID.q3)");
  const h = study("2026-11-02", withStudy({"2026-11-01": q3end}));
  assert.match(h.html(), /Small Bowel and Nutrition questions done/);
  h.click("studyscore", {id: "q3"});
  assert.match(h.html(), /Out of/);
  h.click("studystep", {f: "r", k: "1"});
  h.click("studysave");
  assert.deepEqual([h.saved().study.q.q3.r, h.saved().study.q.q3.of], [7, 8]);
  assert.doesNotMatch(h.html(), /questions done/);
  h.click("studytab", {tab: "p"});
  assert.match(h.html(), /<span class="mono qs[^"]*">7\/8<\/span>/);
});

test("the whole book read shows the pass complete", () => {
  const html = study("2027-05-20", withStudy({"2027-05-19": 460})).html();
  assert.match(html, /Mayo, pass 1: read/);
  assert.doesNotMatch(html, /data-action="studydone"/);
});

test("Week shows the Tonight card, linking to Study", () => {
  const h = load({today: "2026-09-30"});
  const html = h.html();
  assert.match(html, /class="card studycard" data-action="studyopen"/);
  assert.match(html, /pp\. 35–38/);
  h.run(`Store.setStudyCursor(4, getToday()); render();`);
  assert.match(h.html(), /Reading done/);
});

test("study rides in the backup, and old backups load with an empty study", () => {
  const h = load({today: "2026-09-30", state: withStudy({"2026-09-30": 3})});
  assert.deepEqual(JSON.parse(h.val("Store.exportJSON()")).study.log, {"2026-09-30": 3});
  const old = JSON.stringify({v: 1, obs: {}, lines: {}, lastBackup: null});
  assert.equal(h.val(`Store.importJSON(${JSON.stringify(old)}).ok`), true);
  assert.deepEqual(h.saved().study, {log: {}, q: {}, pauses: [], qa: {}});
  const withIt = JSON.stringify({v: 1, obs: {}, lines: {}, study: {log: {"2026-10-02": 9}, q: {}, pauses: []}});
  h.val(`Store.importJSON(${JSON.stringify(withIt)}).ok`);
  assert.deepEqual(h.saved().study.log, {"2026-10-02": 9});
});

// Tonight's card leads with the stop you're on: its book and chapter, title,
// pages and PDF pages, and a bubble for each of tonight's pages there. A night
// across books lists every stop under it, read ones ticked.
const hero = html => html.slice(html.indexOf('class="monitor studymon'), html.indexOf('class="ov mono sm-foot"'));
const stops = html => [...hero(html).matchAll(/<li class="(done|cur|todo)">.*?<span class="st-l">([^<]*)<\/span><span class="st-t">([^<]*)<\/span><span class="st-p mono">([^<]*)<\/span><\/li>/g)].map(m => m.slice(1).join(" | "));
const tonightPits = html => (hero(html).match(/<i class="pit[^"]*"/g) || []).map(x => x.includes(" lit") ? "lit" : "tn");

test("a night across four readings leads with the stop still to read, and ticks the ones read", () => {
  // Read to p. 2473 by Mon 19 Oct, Tuesday paused: tonight runs from Yamada Ch 59
  // through two pieces of Ch 123 to the first pages of Mayo's Ch 7, still to read.
  const st = withStudy({"2026-10-16": 32, "2026-10-19": 39});
  st.study.pauses = [{a: "2026-10-20", b: "2026-10-20"}];
  const h = study("2026-10-19", st), html = h.html();
  assert.match(hero(html), /<div class="sm-ch mono">Stop 4 of 4 · Mayo 7<\/div><div class="sm-title">Gastrointestinal Motility Disorders<\/div>/);
  assert.match(hero(html), /<span class="mono">pp\.<\/span><b>83–85<\/b>/);
  assert.match(hero(html), /<div class="sm-sub">3 pages · Mayo PDF 98–100<\/div>/);
  assert.deepEqual(tonightPits(html), ["tn", "tn", "tn"]);
  assert.match(hero(html), /<li class="st-h mono"><span>Tonight<\/span><span>10 pages<\/span><\/li>/);
  assert.deepEqual(stops(html), ["done | Yamada 59 | Short Bowel Syndrome | 1180–1181", "done | Yamada 123 | PEG: Selection and Preparation | 2462–2463",
    "done | Yamada 123 | PEG: Complications | 2471–2473", "cur | Mayo 7 | Gastrointestinal Motility Disorders | 83–85"]);
  assert.doesNotMatch(hero(html), /Starts with|Ends with/);
  assert.match(html, /Done · through Mayo p\. 85<\/button>/);
  // Week's card says the same stop.
  h.click("tab", {page: "week"});
  assert.match(h.html(), /<b>pp\. 83–85<\/b><span class="sc-sub">Stop 4 of 4 · Mayo 7 · Gastrointestinal Motility Disorders<\/span>/);
});

test("a night across two books, nothing read yet: the first stop leads, the next waits below", () => {
  // 9 read by Mon 5 Oct: tonight is p. 44 (the end of Ch 3) and pp. 463-465 of Yamada.
  const html = study("2026-10-05", withStudy({"2026-10-02": 9})).html();
  assert.match(hero(html), /<div class="sm-ch mono">Stop 1 of 2 · Mayo 3<\/div><div class="sm-title">Esophageal Motility<\/div>/);
  assert.match(hero(html), /<span class="mono">p\.<\/span><b>44<\/b>/);
  assert.match(hero(html), /<div class="sm-sub">1 page · Mayo PDF 59<\/div>/);
  assert.deepEqual(stops(html), ["cur | Mayo 3 | Esophageal Motility | 44", "todo | Yamada 23 | Nutrition Support | 463–465"]);
  assert.match(hero(html), /<span>4 pages<\/span>/);
  assert.match(html, /Done · through Yamada p\. 465<\/button>/);
});

test("a Yamada night names the book and where to find the pages in its PDF", () => {
  // 13 read by Mon 5 Oct: Tuesday is pp. 466-469 of Yamada's Nutrition Support.
  const h = study("2026-10-06", withStudy({"2026-10-05": 13}));
  const html = h.html();
  assert.match(hero(html), /<div class="sm-ch mono">Yamada 23<\/div><div class="sm-title">Nutrition Support<\/div>/);
  assert.match(html, /<b>466–469<\/b>/);
  assert.match(html, /4 pages · Yamada PDF 543–546/);
  assert.match(html, /Yamada's PDF page numbers are shown with each night's pages\./);
  // One stop: no list of stops.
  assert.deepEqual(stops(html), []);
  assert.doesNotMatch(hero(html), /Stop 1 of 1|st-h/);
  h.click("tab", {page: "week"});
  assert.match(h.html(), /pp\. 466–469/);
  assert.match(h.html(), /Yamada 23 · Nutrition Support/);
});

test("halfway through a stop: its read pages are lit and the card says where you are", () => {
  // Ch 3 is pp. 35-44 (run 0 to 9): two of tonight's four pages read.
  const html = study("2026-09-30", withStudy({"2026-09-30": 2})).html();
  assert.match(hero(html), /<div class="sm-ch mono">Mayo 3<\/div>/);
  assert.deepEqual(tonightPits(html), ["lit", "lit", "tn", "tn"]);
  assert.match(hero(html), /4 pages · Mayo PDF 50–53 · <span class="flu">read to p\. 36<\/span>/);
});
