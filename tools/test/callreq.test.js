"use strict";
// Call requests: Agenda builds the next block's request from fixed rules. No
// call on Thursday evenings, one weekend settled with the co-fellow, none that
// a Friday or Monday stat stretches to three days on, and days off, some
// pulled in from all-day events. Full app only.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, state} = require("./harness");

function agenda(today, items = [], extra = {}) {
  const h = load({today, state: state({}, {agenda: {items, ...extra}})});
  h.click("tab", {page: "agenda"});
  return h;
}
const sheet = html => html.slice(html.indexOf('aria-label="Call requests"'));
const weekends = html => [...sheet(html).matchAll(/<div class="rq (ok|bad)"><svg[^>]*><use href="#i-(check|x)"\/><\/svg><b>([^<]+)<\/b><span>([^<]+)<\/span><\/div>/g)]
  .map(m => [m[3], m[4]]);
const thursdays = html => [...sheet(html).matchAll(/<span class="rq-chip">([^<]+)<\/span>/g)].map(m => m[1]);
const paste = html => (sheet(html).match(/<p class="rq-txt">([^<]*)<\/p>/) || [])[1];
const addDay = (h, iso) => h.fire("change", {dataset: {agreq: "add"}, value: iso});

test("Agenda links to the next block's call requests", () => {
  const h = agenda("2026-11-03");
  assert.match(h.html(), /<button class="ag-link" data-action="agreq"><svg[^>]*><use href="#i-phone"\/><\/svg><span><b>Call requests<\/b><span>Block 6, ready to paste<\/span>/);
  h.click("agreq");
  const html = h.html();
  assert.match(html, /<div class="sheet agreq[^"]*" role="dialog" aria-modal="true" aria-label="Call requests">/);
  assert.match(html, /<p class="rq-sub mono">Block 6 · Radiology · Nov 19 to Dec 16<\/p>/);
  assert.match(html, /<button class="on" data-action="agreqblock" data-num="6" aria-pressed="true">Block 6<\/button><button class="" data-action="agreqblock" data-num="7" aria-pressed="false">Block 7<\/button>/);
  h.click("agreqclose");
  assert.doesNotMatch(h.html(), /aria-label="Call requests"/);
});

test("Block 7: Christmas and New Year's Fridays make three days on, so the clear weekends are offered", () => {
  const h = agenda("2026-11-03");
  h.click("agreq"); h.click("agreqblock", {num: "7"});
  const html = h.html();
  assert.match(html, /<p class="rq-sub mono">Block 7 · Consults SBH · Dec 17 to Jan 13<\/p>/);
  assert.deepEqual(weekends(html), [["Dec 18 to 21", "Clear"], ["Dec 25 to 28", "Christmas Friday · 3 days on"],
    ["Jan 1 to 4", "New Year's Friday · 3 days on"], ["Jan 8 to 11", "Clear"]]);
  assert.match(html, /<div class="rq bad"><svg[^>]*><use href="#i-x"\/><\/svg><b>Dec 25 to 28<\/b>/);
  assert.deepEqual(thursdays(html), ["Dec 17", "Dec 24", "Dec 31", "Jan 7"]);
  assert.equal(paste(html), "Block 7 (Dec 17 to Jan 13) call requests:\n" +
    "- No call Thursday evenings: Dec 17, Dec 24, Dec 31, Jan 7.\n" +
    "- Weekend: Dec 18 to 21 or Jan 8 to 11, confirming with my co-fellow.\n" +
    "- No days off this block.");
});

test("a Monday stat stretches its weekend too, and Good Friday is named once", () => {
  const h = agenda("2027-01-20");
  h.click("agreq");
  assert.deepEqual(weekends(h.html())[0], ["Feb 12 to 15", "Louis Riel Day Monday · 3 days on"]);
  h.click("agreqblock", {num: "10"});
  assert.deepEqual(weekends(h.html())[2], ["Mar 26 to 29", "Good Friday · 3 days on"]);
});

test("the call schedule's stats: Boxing Day and Terry Fox Day count as well", () => {
  const h = agenda("2026-07-10");
  assert.deepEqual(h.val("SCOPE_STAT_DAYS.filter(d => !agStat(d))"), []);
  assert.deepEqual(["2026-12-26", "2026-08-03", "2026-12-25", "2026-08-10", "2026-12-27"].map(d => h.val(`agStat("${d}")`)),
    ["Boxing Day", "Terry Fox Day", "Christmas Day", null, null]);
  h.click("agreq");
  assert.deepEqual(weekends(h.html())[0], ["Jul 31 to Aug 3", "Terry Fox Day Monday · 3 days on"]);
});

test("a day off goes in the request, and a weekend it touches comes off the list", () => {
  const h = agenda("2026-11-03");
  h.click("agreq");
  assert.deepEqual(weekends(h.html()).map(w => w[1]), ["Clear", "Clear", "Clear", "Clear"]);
  addDay(h, "2026-11-25");
  assert.match(paste(h.html()), /\n- Day off: Wed Nov 25\.$/);
  addDay(h, "2026-11-27");
  let html = h.html();
  assert.deepEqual(weekends(html)[1], ["Nov 27 to 30", "Day off"]);
  assert.match(paste(html), /\n- Weekend: Nov 20 to 23, Dec 4 to 7 or Dec 11 to 14, confirming with my co-fellow\.\n- Days off: Wed Nov 25, Fri Nov 27\.$/);
  assert.match(sheet(html), /<button class="rq-chip on" data-action="agreqoff" data-day="2026-11-27" aria-label="Remove Fri Nov 27">Fri Nov 27<svg/);
  assert.deepEqual(h.val("Store.state.agenda.off"), ["2026-11-25", "2026-11-27"]);
  h.click("agreqoff", {day: "2026-11-27"});
  assert.deepEqual(weekends(h.html())[1], ["Nov 27 to 30", "Clear"]);
  addDay(h, "2026-12-17");
  addDay(h, "not a day");
  assert.deepEqual(h.val("Store.state.agenda.off"), ["2026-11-25"], "only days inside the block");
});

test("the Monday after a weekend can be off: weekend call ends that morning", () => {
  const h = agenda("2026-11-03");
  h.click("agreq");
  addDay(h, "2026-11-23");
  assert.deepEqual(weekends(h.html())[0], ["Nov 20 to 23", "Clear"]);
});

test("an all-day event in Agenda is offered as days away; repeating and timed ones aren't", () => {
  const h = agenda("2026-11-03", [{id: "a1", t: "Conference", d: "2026-12-03", d2: "2026-12-05"},
    {id: "a2", t: "Birthday", d: "2026-11-30", rep: "y"}, {id: "a3", t: "Dentist", d: "2026-12-01", s: "16:30", e: "17:30"}]);
  h.click("agreq");
  let html = sheet(h.html());
  assert.match(html, /<button class="rq-chip add" data-action="agreqaway" data-id="a1">\+ Conference · Dec 3 to 5<\/button>/);
  assert.doesNotMatch(html, /Birthday|Dentist|Away in Agenda: none/);
  h.click("agreqaway", {id: "a1"});
  html = h.html();
  assert.deepEqual(h.val("Store.state.agenda.off"), ["2026-12-03", "2026-12-04", "2026-12-05"]);
  assert.match(sheet(html), /data-action="agreqoff" data-day="2026-12-03" aria-label="Remove Dec 3 to 5">Dec 3 to 5<svg/);
  assert.doesNotMatch(sheet(html), /agreqaway/);
  assert.deepEqual(weekends(html)[2], ["Dec 4 to 7", "Days off"]);
  assert.match(paste(html), /\n- Days off: Dec 3 to 5\.$/);
  h.click("agreqoff", {day: "2026-12-03"});
  assert.deepEqual(h.val("Store.state.agenda.off"), [], "the whole run goes");
});

test("with nothing all day in Agenda, the sheet says so, and + Add a day picks within the block", () => {
  const h = agenda("2026-11-03");
  h.click("agreq");
  const html = sheet(h.html());
  assert.match(html, /<span class="rq-chip none">Away in Agenda: none<\/span>/);
  assert.match(html, /<label class="rq-chip add">\+ Add a day<input type="date" data-agreq="add" min="2026-11-19" max="2026-12-16" aria-label="Add a day off"><\/label>/);
});

test("Copy request puts the request on the clipboard", async () => {
  const h = agenda("2026-11-03");
  h.click("agreq");
  h.click("agreqcopy");
  assert.match(h.html(), /Copy isn't available here/);
  h.run(`navigator.clipboard = {writeText: t => { window.__copied = t; return Promise.resolve(); }}`);
  h.click("agreqcopy");
  await new Promise(r => setImmediate(r));
  assert.equal(h.val("window.__copied"), "Block 6 (Nov 19 to Dec 16) call requests:\n" +
    "- No call Thursday evenings: Nov 19, Nov 26, Dec 3, Dec 10.\n" +
    "- Weekend: Nov 20 to 23, Nov 27 to 30, Dec 4 to 7 or Dec 11 to 14, confirming with my co-fellow.\n" +
    "- No days off this block.");
  assert.match(h.html(), /Request copied/);
  assert.match(h.html(), /aria-label="Call requests"/, "the sheet stays open");
});

test("the days off are kept with the agenda, made whole when read back", () => {
  const h = agenda("2026-11-03", [], {off: ["2026-11-27", "nope", "2026-11-25", "2026-11-27", 5]});
  assert.deepEqual(h.val("Store.state.agenda.off"), ["2026-11-25", "2026-11-27"]);
  assert.deepEqual(agenda("2026-11-03").val("Store.state.agenda.off"), []);
});

test("only blocks still to come: the last block offers no next, and fellows never get it", () => {
  const near = agenda("2027-05-10");
  near.click("agreq");
  assert.match(near.html(), /<p class="rq-sub mono">Block 13 · Consults HSC · Jun 3 to Jun 30<\/p>/);
  assert.doesNotMatch(near.html(), /data-action="agreqblock"/, "one block left, nothing to switch");
  assert.doesNotMatch(agenda("2027-06-10").html(), /data-action="agreq"/);
  const f = load({today: "2026-11-03", edition: "fellows", state: state({}, {setup: {d: "2026-10-01"}})});
  assert.equal(f.val("agReqLinkHTML()"), "");
});
