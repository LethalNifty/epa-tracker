"use strict";
// The Agenda tab: the bar with the + in the middle, Days and Month, the event
// sheet, your usual week, Add from file, and Week's Next line. Full app only.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {load, state, ROOT} = require("./harness");

const sample = fs.readFileSync(path.join(ROOT, "tools", "test", "fixtures", "call-sample.ics"), "utf8");
const ev = (id, t, d, s, e, x = {}) => ({id, t, d, s, e, ...x});
function agenda(today, items = [], opts = {}) {
  const h = load({today, state: state({}, {agenda: {items}})});
  if (opts.call) { h.ctx.__src = sample; h.run(`callImport(__src, "call-sample.ics"); toast = null`); }
  if (opts.now) h.setNow(opts.now);
  h.click("tab", {page: "agenda"});
  return h;
}
const tabs = html => [...html.slice(html.indexOf('<nav class="bnav"')).matchAll(/data-action="tab" data-page="(\w+)"/g)].map(m => m[1]);

// ---- The bar --------------------------------------------------------------------------------
test("the full app's bar: three tabs, the + in the middle, three tabs", () => {
  const h = load({today: "2026-10-27"});
  const html = h.html();
  assert.deepEqual(tabs(html), ["week", "agenda", "epas", "study", "endo", "guides"]);
  const nav = html.slice(html.indexOf('<nav class="bnav"')), plus = nav.indexOf('<button class="fab mid" data-action="scopeopen" aria-label="Log a case">');
  assert.ok(nav.indexOf('data-page="epas"') < plus && plus < nav.indexOf('data-page="study"'));
  assert.doesNotMatch(html, /fab float/);
  assert.match(html, /data-page="week"[^>]*><svg class="ic" aria-hidden="true"><use href="#i-dial"\/><\/svg><span>Week<\/span>/);
  assert.match(html, /data-page="agenda"[^>]*><svg class="ic" aria-hidden="true"><use href="#i-week"\/><\/svg><span>Agenda<\/span>/);
});

test("the fellows' bar doesn't change, and Agenda isn't theirs to open", () => {
  const h = load({today: "2026-10-27", edition: "fellows", state: state({}, {setup: {d: "2026-10-01"}})});
  const html = h.html();
  assert.deepEqual(tabs(html), ["week", "epas", "endo", "guides"]);
  assert.match(html, /fab float/);
  assert.doesNotMatch(html, /fab mid|data-page="agenda"/);
  h.run(`go({page: "agenda"})`);
  assert.equal(h.val("route.page"), "week");
});

test("Agenda opens from the bar", () => {
  const h = agenda("2026-10-27");
  assert.equal(h.val("route.page"), "agenda");
  assert.match(h.html(), /<h1 class="title">Agenda<\/h1>/);
  assert.match(h.html(), /data-page="agenda" aria-current="page"/);
});

// ---- The page -------------------------------------------------------------------------------
const strip = html => [...html.matchAll(/<button class="ws([^"]*)" data-action="agday" data-day="([\d-]+)"/g)].map(m => [m[2], m[1].trim()]);
const cells = html => [...html.matchAll(/<button class="mc([^"]*)" data-action="agday" data-day="([\d-]+)"/g)].map(m => [m[2], m[1].trim()]);

test("Days: this week from Monday, today and the chosen day marked, the day's rows, then the rest of the week", () => {
  const h = agenda("2026-10-27", [ev("a1", "Dentist", "2026-10-29", "16:30", "17:30")], {call: true});
  let html = h.html();
  assert.match(html, /<button class="on" data-action="agview" data-view="d"[^>]*>Days<\/button><button class="" data-action="agview" data-view="m"[^>]*>Month<\/button>/);
  assert.deepEqual(strip(html), [["2026-10-26", ""], ["2026-10-27", "today sel"], ["2026-10-28", ""], ["2026-10-29", ""],
    ["2026-10-30", ""], ["2026-10-31", ""], ["2026-11-01", ""]]);
  assert.match(html, /<h2>Today · Tue 27 Oct<\/h2>/);
  assert.match(html, /<span class="ct mono">08:00<\/span><i class="cdot"><\/i><span class="cm"><b>Consults SBH<\/b><span>until 18:00<\/span>/);
  // The rest of the week: your events and call, by day, without the daily work rows.
  const later = html.slice(html.indexOf("<h2>Later this week</h2>"));
  assert.match(later, /Wed 28 Oct[^]*?On call[^]*?Thu 29 Oct[^]*?Dentist/);
  assert.doesNotMatch(later, /Consults SBH/);
  h.click("agday", {day: "2026-10-29"});
  html = h.html();
  assert.match(html, /<h2>Thu 29 Oct<\/h2>/);
  assert.deepEqual(strip(html)[3], ["2026-10-29", "sel"]);
  h.click("agweek", {step: "1"});
  assert.deepEqual(strip(h.html())[0], ["2026-11-02", ""]);
  assert.equal(h.val("agSel"), "2026-11-05");
});

test("Month: a Monday-first grid with call, reading and your marks, and the chosen day's rows under it", () => {
  const h = agenda("2026-10-27", [ev("a1", "Dentist", "2026-10-29", "16:30", "17:30")], {call: true});
  h.click("agview", {view: "m"});
  let html = h.html();
  assert.match(html, /<b>October 2026<\/b>/);
  const c = cells(html);
  assert.equal(c.length, 35);
  assert.deepEqual([c[0][0], c[34][0]], ["2026-09-28", "2026-11-01"]);
  assert.deepEqual(c.find(x => x[0] === "2026-10-27")[1], "today sel");
  assert.equal(c[0][1], "out past");
  const cell = iso => (html.match(new RegExp(`data-day="${iso}">[^]*?</button>`)) || [""])[0];
  assert.match(cell("2026-10-28"), /m-call/);
  assert.match(cell("2026-10-29"), /m-ev/);
  assert.match(cell("2026-10-12"), /m-hol/);
  h.click("agday", {day: "2026-10-29"});
  assert.match(h.html(), /<h2>Thu 29 Oct<\/h2>[^]*?Dentist/);
  h.click("agmonth", {step: "1"});
  html = h.html();
  assert.match(html, /<b>November 2026<\/b>/);
  assert.equal(cells(html)[0][0], "2026-10-26");
});

test("a call row goes to Call and back; a reading row goes to Study", () => {
  const h = agenda("2026-10-28", [], {call: true});
  assert.match(h.html(), /<button class="ag-row k-call" data-action="agcall">/);
  h.click("agcall");
  assert.equal(h.val("route.page"), "call");
  assert.match(h.html(), /data-page="agenda" aria-current="page"/);
  assert.match(h.html(), /<button class="back" data-action="back">[^]*?Agenda<\/button>/);
  const g = agenda("2026-10-27");
  assert.match(g.html(), /<button class="ag-row k-read" data-action="agstudy">/);
  g.click("agstudy");
  assert.equal(g.val("route.page"), "study");
});
