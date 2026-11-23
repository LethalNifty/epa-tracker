"use strict";
// Each of your own events has a colour: Work, Personal (the default, not
// stored), Social or Travel. To-dos have none. Full app only.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, state} = require("./harness");

const ev = (id, t, d, s, e, x = {}) => ({id, t, d, s, e, n: "", ...x});
function agenda(today, items = []) {
  const h = load({today, state: state({}, {agenda: {items}})});
  h.click("tab", {page: "agenda"});
  return h;
}

test("an event keeps work, social or travel; personal and anything else isn't stored; a to-do has none", () => {
  const h = load({today: "2026-11-23"});
  const clean = x => h.val(`agItemClean(${JSON.stringify(x)})`);
  assert.equal(clean({t: "GI rounds", d: "2026-11-24", c: "work"}).c, "work");
  assert.equal(clean({t: "Dinner", d: "2026-11-24", c: "soc"}).c, "soc");
  assert.equal(clean({t: "Flight", d: "2026-11-24", c: "trav"}).c, "trav");
  assert.equal("c" in clean({t: "Run", d: "2026-11-24", c: "pers"}), false);
  assert.equal("c" in clean({t: "Run", d: "2026-11-24", c: "red"}), false);
  assert.equal("c" in clean({t: "Reply", d: "2026-11-24", s: "08:00", c: "work", todo: {q: "", tom: 0, done: null}}), false);
});

test("a colour survives the app opening again, and a day's rows carry it", () => {
  const h = load({today: "2026-11-23", state: state({}, {agenda: {items: [ev("a1", "Flight home", "2026-11-24", "07:00", "09:00", {c: "trav"})]}})});
  assert.equal(h.val("agState().items[0].c"), "trav");
  assert.equal(h.val(`agEventRows("2026-11-24")[0].c`), "trav");
});

test("the event sheet: a Colour row above Alerts, Personal unless you pick another", () => {
  const h = agenda("2026-11-23");
  h.click("agnew");
  let html = h.html();
  assert.match(html, /<div class="lbl mono">Colour<\/div><div class="pickrow kal-cats">(<button class="pick ghost kal-cat c-\w+( on)?" data-action="agcolour" data-c="\w+" aria-pressed="\w+"><i class="kal-sw"><\/i>\w+<\/button>){4}<\/div><div class="lbl mono">Alerts<\/div>/);
  assert.deepEqual([...html.matchAll(/data-action="agcolour" data-c="(\w+)" aria-pressed="(\w+)"><i class="kal-sw"><\/i>(\w+)</g)].map(m => [m[1], m[2], m[3]]),
    [["work", "false", "Work"], ["pers", "true", "Personal"], ["soc", "false", "Social"], ["trav", "false", "Travel"]]);
  h.fire("input", {dataset: {ag: "t"}, value: "GI rounds"});
  h.click("agcolour", {c: "work"});
  assert.match(h.html(), /class="pick ghost kal-cat c-work on" data-action="agcolour" data-c="work" aria-pressed="true"/);
  h.click("agsave");
  const it = h.saved().agenda.items[0];
  assert.deepEqual([it.t, it.c], ["GI rounds", "work"]);
  // Open again: Work is on; back to Personal saves no colour.
  h.click("agopen", {id: it.id});
  assert.match(h.html(), /class="pick ghost kal-cat c-work on"/);
  h.click("agcolour", {c: "pers"});
  h.click("agsave");
  assert.equal("c" in h.saved().agenda.items[0], false);
  // Nothing that isn't a colour.
  h.click("agnew");
  h.click("agcolour", {c: "red"});
  assert.equal(h.val("agSheet.c"), "pers");
});

test("a to-do's sheet has no Colour row", () => {
  const h = agenda("2026-11-23");
  h.click("agnew");
  h.click("agkind", {kind: "todo"});
  assert.doesNotMatch(h.html(), /Colour|agcolour/);
});

test("a new event's colour is kept with its unsent words", () => {
  const h = agenda("2026-11-23");
  h.click("agnew");
  h.fire("input", {dataset: {ag: "t"}, value: "Dinner with friends"});
  h.click("agcolour", {c: "soc"});
  assert.equal(h.val("DRAFT_OF.ag(agSheet)").c, "soc");
});

test("the day's list marks each of your events with its colour", () => {
  const h = agenda("2026-11-23", [ev("a1", "GI rounds", "2026-11-23", "12:00", "13:00", {c: "work"}), ev("a2", "Soccer", "2026-11-23", "20:00", "21:00")]);
  h.click("agview", {view: "m"});
  const html = h.html();
  assert.match(html, /<button class="ag-row k-ev c-work" data-action="agopen" data-id="a1">/);
  assert.match(html, /<button class="ag-row k-ev" data-action="agopen" data-id="a2">/);
});
