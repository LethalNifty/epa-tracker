"use strict";
// Pearls: teaching points caught on the wards. Catching one from the +, the
// Pearls page off Study, a topic's pearls in Guides, the backup, and the file
// sent on to become Anki cards (format: docs/PEARLS.md).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {load, state, ROOT} = require("./harness");

const LIB = JSON.parse(fs.readFileSync(path.join(ROOT, "guides.json"), "utf8"));
// A phone with the guideline library loaded, on a page if one is named.
function phone(today = "2026-10-12", st, page) {
  const h = load({today, state: st});
  h.run(`guidesAccept(${JSON.stringify(LIB)})`);
  if (page) h.click("tab", {page});
  h.type = (f, v) => h.run(`pearlField({dataset: {pearl: ${JSON.stringify(f)}}, value: ${JSON.stringify(v)}})`);
  return h;
}
// A saved pearl.
const P = (id, d, t, extra = {}) => ({id, d, t, who: "", topic: "", sent: null, ts: d + "T15:00:00.000Z", ...extra});
const withPearls = list => state({}, {pearls: list});
const guess = (h, text) => h.val(`pearlTopicGuess(${JSON.stringify(text)}, Guides.data.topics).map(t => t.id)`);
const tick = () => new Promise(r => setTimeout(r, 5));

// ---- Topic guess -----------------------------------------------------------------------------
test("topic guess: the pearl's own words find its Guides topic first", () => {
  const h = phone();
  assert.equal(guess(h, "Biopsy the bulb as well as D2 in suspected celiac")[0], "celiac");
  assert.equal(guess(h, "Albumin 1.5 g/kg on day 1 and 1 g/kg on day 3 for SBP")[0], "ascites");
  assert.equal(guess(h, "Ceftriaxone for every cirrhotic with a variceal bleed")[0], "variceal-bleeding");
  assert.equal(guess(h, "Rifaximin is added after a second episode of HE")[0], "hepatic-encephalopathy");
  const uc = guess(h, "UC flare: check C diff before steroids");
  assert.ok(uc.includes("c-difficile") && uc.includes("uc"), uc.join(","));
  assert.ok(uc.length <= 3);
});

test("topic guess: nothing for a pearl with no GI words, and a lowercase 'he' is just a word", () => {
  const h = phone();
  assert.deepEqual(guess(h, "Always be kind to the nurses at night"), []);
  assert.ok(!guess(h, "He says to read the whole guideline once").includes("hepatic-encephalopathy"));
});

// ---- Search ---------------------------------------------------------------------------------
test("search: every word must match, across the pearl, who said it and the topic's name", () => {
  const h = phone();
  const list = [P("pa", "2026-10-10", "Biopsy the bulb in celiac", {topic: "celiac", who: "Alfa"}),
    P("pb", "2026-10-11", "Ceftriaxone for a variceal bleed", {topic: "variceal-bleeding", who: "Bravo"}),
    P("pc", "2026-10-12", "Check ferritin before iron")];
  const ids = q => h.val(`pearlsSearch(${JSON.stringify(list)}, ${JSON.stringify(q)}).map(p => p.id)`);
  assert.deepEqual(ids(""), ["pc", "pb", "pa"]);                 // newest first
  assert.deepEqual(ids("bulb"), ["pa"]);
  assert.deepEqual(ids("bravo"), ["pb"]);
  assert.deepEqual(ids("acute variceal"), ["pb"]);               // the topic's name: Acute variceal bleeding
  assert.deepEqual(ids("ceftriaxone celiac"), []);
  assert.deepEqual(ids("FERRITIN"), ["pc"]);
});

// ---- The file sent on --------------------------------------------------------------------------
test("the send text: oldest first, each with its id, date and topic; never who said it", () => {
  const h = phone();
  const list = [P("pb2", "2026-10-11", "Line one\n\n\nLine two  "),
    P("pa1", "2026-10-12", "Biopsy the bulb as well as D2 in suspected celiac.", {who: "Alfa", topic: "celiac"})];
  const text = h.run(`pearlsSendText(${JSON.stringify(list)}, new Date(2026, 9, 12, 12))`);
  assert.equal(text,
    "GI Hub pearls\n" +
    "Sent 2026-10-12 · 2 pearls\n" +
    "Format: [id] date · topic, then the pearl. Who said it stays on the phone.\n" +
    "\n" +
    "[pb2] 2026-10-11 · No topic\n" +
    "Line one\nLine two\n" +
    "\n" +
    "[pa1] 2026-10-12 · Celiac disease\n" +
    "Biopsy the bulb as well as D2 in suspected celiac.\n");
  assert.match(h.run(`pearlsSendText(${JSON.stringify(list.slice(1))}, new Date(2026, 9, 12, 12))`), /^Sent 2026-10-12 · 1 pearl$/m);
});

test("the patient-detail check: long numbers, ID words and Mr/Mrs names, never doses or counts", () => {
  const h = phone();
  const flagged = t => h.val(`pearlFlagged(${JSON.stringify(t)})`);
  assert.equal(flagged("Her PHN 123 456 789 was on the req"), true);
  assert.equal(flagged("MRN 4410087, the one with the stricture"), true);
  assert.equal(flagged("Mrs Delta taught us that ferritin can be falsely normal"), true);
  assert.equal(flagged("Albumin 1.5 g/kg on day 1, then 1 g/kg on day 3"), false);
  assert.equal(flagged("Platelets over 50 000 for a polypectomy"), false);
  assert.equal(flagged("Get an MRCP before any ERCP for a CBD stone"), false);
});

// ---- Catching one ----------------------------------------------------------------------------
test("the + sheet's switch offers a pearl above the case box", () => {
  const h = phone("2026-10-12", state(), "week");
  h.click("scopeopen");
  const sheet = h.html().slice(h.html().indexOf('class="sheet scopesheet'));
  assert.ok(sheet.indexOf('data-action="plusto" data-to="p"') > 0);
  assert.ok(sheet.indexOf('data-action="plusto" data-to="p"') < sheet.indexOf('id="scopebox-sheet"'));
  h.click("plusto", {to: "p"});
  const html = h.html();
  assert.doesNotMatch(html, /class="sheet scopesheet/);
  assert.match(html, /<div class="sheet pearlsheet" role="dialog" aria-modal="true" aria-label="Catch a pearl">/);
  assert.match(html, /<textarea id="pearlbox"/);
  assert.match(html, /Teaching point only\. No patient details\./);
  assert.match(html, /<input type="date" value="2026-10-12" data-pearl="d"/);
});

test("catching a pearl saves the text, topic, who and date; Undo takes it back", () => {
  const h = phone("2026-10-12", state(), "week");
  h.click("pearlnew");
  h.type("t", "  Ceftriaxone for every cirrhotic with a variceal bleed  ");
  h.click("pearltopic", {id: "variceal-bleeding"});
  h.type("who", " Alfa ");
  h.click("pearldate", {date: "2026-10-11"});
  h.click("pearlsave");
  const [p] = h.saved().pearls;
  assert.equal(p.t, "Ceftriaxone for every cirrhotic with a variceal bleed");
  assert.equal(p.topic, "variceal-bleeding");
  assert.equal(p.who, "Alfa");
  assert.equal(p.d, "2026-10-11");
  assert.equal(p.sent, null);
  assert.match(p.id, /^p[a-z0-9]+$/);
  assert.equal(h.val("pearlSheet"), null);
  assert.match(h.html(), /Pearl saved/);
  h.click("undo");
  assert.deepEqual(h.saved().pearls, []);
});

test("an empty pearl isn't saved", () => {
  const h = phone("2026-10-12", state(), "week");
  h.click("pearlnew");
  h.type("t", "   ");
  h.click("pearlsave");
  assert.equal(h.val("Store.state.pearls.length"), 0);
  assert.match(h.html(), /Say or type the pearl first\./);
});

test("the topic chips follow the words as they're typed; another topic can be searched for", () => {
  const h = phone("2026-10-12", state(), "week");
  h.click("pearlnew");
  h.type("t", "Ceftriaxone for every cirrhotic with a variceal bleed");
  assert.match(h.val("pearlTopicsHTML()"), /data-action="pearltopic" data-id="variceal-bleeding"/);
  h.click("pearltopicmore");
  h.type("tq", "wilson");
  assert.match(h.val("pearlTopicsHTML()"), /data-id="wilson"/);
  h.click("pearltopic", {id: "wilson"});
  assert.equal(h.val("pearlSheet.topic"), "wilson");
  // Tapping the chosen topic again clears it.
  h.click("pearltopic", {id: "wilson"});
  assert.equal(h.val("pearlSheet.topic"), "");
});

test("who said it: past names, then the Endo staff by surname, each person once", () => {
  const st = state({}, {pearls: [P("pa", "2026-10-01", "Old pearl", {who: "Bravo"})],
    scopes: {cases: [], staff: [{id: "sa", name: "Attending, Alfa"}, {id: "sb", name: "Bravo, Ben"}], learned: []}});
  const h = phone("2026-10-12", st, "week");
  h.click("pearlnew");
  assert.deepEqual([...h.val("pearlWhoHTML()").matchAll(/data-name="([^"]*)"/g)].map(m => m[1]), ["Bravo", "Attending"]);
  h.type("who", "att");
  assert.doesNotMatch(h.val("pearlWhoHTML()"), /Bravo/);
  h.click("pearlwho", {name: "Attending"});
  assert.equal(h.val("pearlSheet.who"), "Attending");
});

test("leaving the box keeps the chips in place, so the tap that left it still lands", () => {
  const h = phone("2026-10-12", state(), "week");
  h.click("pearlnew");
  h.type("t", "Ceftriaxone for every cirrhotic with a variceal bleed");
  // The browser's change event fires as the box loses focus to a tapped chip.
  h.els.pearltopics = {innerHTML: "the chip being tapped"};
  h.els.pearlwho = {innerHTML: "the name being tapped"};
  assert.equal(h.run(`pearlFieldChange({dataset: {pearl: "t"}, value: "Ceftriaxone for every cirrhotic with a variceal bleed!"})`), true);
  assert.equal(h.run(`pearlFieldChange({dataset: {pearl: "who"}, value: "Alf"})`), true);
  assert.equal(h.els.pearltopics.innerHTML, "the chip being tapped");
  assert.equal(h.els.pearlwho.innerHTML, "the name being tapped");
  assert.equal(h.val("pearlSheet.t"), "Ceftriaxone for every cirrhotic with a variceal bleed!");
  assert.equal(h.val("pearlSheet.who"), "Alf");
});

test("a pearl that looks like it holds a patient detail is flagged while it's typed", () => {
  const h = phone("2026-10-12", state(), "week");
  h.click("pearlnew");
  h.type("t", "Mrs Delta: ferritin is an acute phase reactant");
  assert.match(h.val("pearlWarnHTML()"), /may hold a patient detail/);
  h.type("t", "Ferritin is an acute phase reactant");
  assert.equal(h.val("pearlWarnHTML()"), "");
});

// ---- Keeping them ----------------------------------------------------------------------------
const three = () => withPearls([P("pa", "2026-10-09", "Biopsy the bulb in celiac", {topic: "celiac", sent: "2026-10-10"}),
  P("pb", "2026-10-11", "Ceftriaxone for a variceal bleed", {topic: "variceal-bleeding", who: "Alfa"}),
  P("pc", "2026-10-12", "Check ferritin before iron")]);

test("Study shows how many pearls wait to be sent; the card opens the Pearls page, and Back returns", () => {
  const h = phone("2026-10-12", three(), "study");
  assert.match(h.html(), /<h2>Pearls<\/h2><span class="mono"><b>2<\/b> to send<\/span>/);
  h.click("pearlsopen");
  assert.equal(h.val("route.page"), "pearls");
  const html = h.html();
  assert.match(html, /<h1 class="title">Pearls<\/h1>/);
  assert.match(html, /<b>3<\/b> pearls · <b>2<\/b> to send/);
  assert.match(html, /data-action="pearlssend">.*Send 2 pearls/);
  // Newest first.
  assert.ok(html.indexOf('data-id="pc"') < html.indexOf('data-id="pb"'));
  assert.ok(html.indexOf('data-id="pb"') < html.indexOf('data-id="pa"'));
  h.click("back");
  assert.equal(h.val("route.page"), "study");
});

test("with no pearls yet, Study says how to catch one", () => {
  const h = phone("2026-10-12", state(), "study");
  assert.match(h.html(), /Tap \+, then Catch a pearl/);
});

test("the Pearls page search narrows the list as it's typed", () => {
  const h = phone("2026-10-12", three(), "study");
  h.click("pearlsopen");
  h.run(`pearlField({id: "pearlsq", dataset: {}, value: "variceal"})`);
  const list = h.val("pearlsListHTML()");
  assert.match(list, /data-id="pb"/);
  assert.doesNotMatch(list, /data-id="pa"|data-id="pc"/);
});

test("editing a pearl: change it, send it again, or delete it with Undo", () => {
  const h = phone("2026-10-12", three(), "study");
  h.click("pearlsopen");
  h.click("pearledit", {id: "pa"});
  assert.match(h.html(), /aria-label="Edit pearl"/);
  assert.match(h.html(), /Sent Sat 10 Oct/);
  h.type("t", "Biopsy the bulb and D2 in celiac");
  h.click("pearlunsend");
  h.click("pearlsave");
  const pa = h.saved().pearls.find(p => p.id === "pa");
  assert.equal(pa.t, "Biopsy the bulb and D2 in celiac");
  assert.equal(pa.sent, null);
  h.click("pearledit", {id: "pb"});
  h.click("pearldelete");
  assert.deepEqual(h.saved().pearls.map(p => p.id).sort(), ["pa", "pc"]);
  assert.match(h.html(), /Pearl deleted/);
  h.click("undo");
  assert.deepEqual(h.saved().pearls.map(p => p.id).sort(), ["pa", "pb", "pc"]);
});

test("Guides: a topic's card lists its pearls, and a tap opens one", () => {
  const h = phone("2026-10-12", three(), "guides");
  h.click("guidestoggle", {id: "variceal-bleeding"});
  const html = h.html();
  const card = html.slice(html.indexOf('id="g-variceal-bleeding"'));
  assert.match(card, /Your pearls[\s\S]*Ceftriaxone for a variceal bleed/);
  h.click("pearledit", {id: "pb"});
  assert.match(h.html(), /aria-label="Edit pearl"/);
});

// ---- The backup --------------------------------------------------------------------------------
test("pearls go out with the backup and come back on import; an old backup without them still imports", () => {
  const h = phone("2026-10-12", three());
  const backup = h.run("Store.exportJSON()");
  const h2 = phone("2026-10-12", state());
  assert.equal(h2.run(`Store.importJSON(${JSON.stringify(backup)}).ok`), true);
  assert.deepEqual(h2.saved().pearls.map(p => [p.id, p.t, p.who, p.topic, p.sent]),
    [["pa", "Biopsy the bulb in celiac", "", "celiac", "2026-10-10"],
     ["pb", "Ceftriaxone for a variceal bleed", "Alfa", "variceal-bleeding", null],
     ["pc", "Check ferritin before iron", "", "", null]]);
  assert.equal(h2.run(`Store.importJSON(JSON.stringify({v: 1, obs: {}, lines: {}}))`).ok, true);
  assert.deepEqual(h2.val("Store.state.pearls"), []);
});

test("a damaged pearl list is cleaned on load: blanks dropped, missing fields filled, clashing ids made unique", () => {
  const h = phone("2026-10-12", withPearls([{t: "  "}, {id: "pa", t: "One", d: "2026-10-01"}, {id: "pa", t: "Two"}, null, {t: 5}]));
  const list = h.val("Store.state.pearls");
  assert.equal(list.length, 2);
  assert.deepEqual(list.map(p => p.t), ["One", "Two"]);
  assert.notEqual(list[0].id, list[1].id);
  assert.equal(list[1].d, "2026-10-12");
  assert.deepEqual(Object.keys(list[1]).sort(), ["d", "id", "sent", "t", "topic", "ts", "who"]);
});

test("pearls alone count as something to back up", () => {
  const h = phone("2026-10-12", withPearls([P("pa", "2026-10-01", "One")]));
  assert.equal(h.val("Store.hasData()"), true);
});

// ---- Sending -----------------------------------------------------------------------------------
function sharePhone(st, share) {
  const h = phone("2026-10-12", st, "study");
  const shared = [];
  h.ctx.navigator.canShare = () => true;
  h.ctx.navigator.share = share || (async d => { shared.push(d); });
  h.click("pearlsopen");
  return {h, shared};
}

test("Send shares a text file of the unsent pearls, marks them sent once the share completes, and Undo unmarks", async () => {
  const {h, shared} = sharePhone(three());
  h.click("pearlssend");
  await tick();
  assert.equal(shared.length, 1);
  const [file] = shared[0].files;
  assert.equal(file.name, "gi-pearls-2026-10-12-1200.txt");
  assert.equal(file.type, "text/plain");
  const text = file.parts[0];
  assert.match(text, /^Sent 2026-10-12 · 2 pearls$/m);
  assert.match(text, /\[pb\] 2026-10-11 · Acute variceal bleeding\nCeftriaxone for a variceal bleed\n/);
  assert.doesNotMatch(text, /\[pa\]|Alfa/);
  assert.deepEqual(h.saved().pearls.map(p => [p.id, p.sent]), [["pa", "2026-10-10"], ["pb", "2026-10-12"], ["pc", "2026-10-12"]]);
  assert.match(h.html(), /Sent 2 pearls/);
  assert.match(h.html(), /All sent/);
  h.click("undo");
  assert.deepEqual(h.saved().pearls.map(p => [p.id, p.sent]), [["pa", "2026-10-10"], ["pb", null], ["pc", null]]);
});

test("a cancelled share leaves the pearls unsent", async () => {
  const {h} = sharePhone(three(), async () => { const e = new Error("cancelled"); e.name = "AbortError"; throw e; });
  h.click("pearlssend");
  await tick();
  assert.deepEqual(h.saved().pearls.filter(p => !p.sent).map(p => p.id), ["pb", "pc"]);
  assert.doesNotMatch(h.html(), /Couldn't share/);
});

test("a pearl that looks like it holds a patient detail asks before anything is sent", async () => {
  const st = withPearls([P("pa", "2026-10-11", "MRN 4410087 had the classic picture")]);
  const {h, shared} = sharePhone(st);
  const asked = [];
  h.ctx.confirm = q => { asked.push(q); return false; };
  h.click("pearlssend");
  await tick();
  assert.equal(asked.length, 1);
  assert.match(asked[0], /may hold a patient detail/);
  assert.equal(shared.length, 0);
  assert.equal(h.saved().pearls[0].sent, null);
});

test("without a share sheet the file downloads and the pearls count as sent", async () => {
  const h = phone("2026-10-12", three(), "study");
  h.click("pearlsopen");
  h.click("pearlssend");
  await tick();
  assert.deepEqual(h.downloads, ["gi-pearls-2026-10-12-1200.txt"]);
  assert.equal(h.saved().pearls.filter(p => !p.sent).length, 0);
});
