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
