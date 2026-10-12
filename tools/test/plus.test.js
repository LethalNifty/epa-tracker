"use strict";
// The + : one sheet with Case | EPA | Pearl across its top. It always opens on
// Case; the switch keeps what was typed in each until the + flow ends.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load} = require("./harness");

const phone = () => load({today: "2026-10-12"});
const switchOf = html => (/<div class="segtabs three plusseg"[\s\S]*?<\/div>/.exec(html) || [""])[0];
const on = html => (/<button class="on" data-action="plusto" data-to="(\w)"/.exec(switchOf(html)) || [])[1];

test("the + opens on Case, with the switch where the title was", () => {
  const h = phone();
  h.click("scopeopen");
  const html = h.html();
  assert.equal(on(html), "c");
  assert.match(switchOf(html), /Case<\/button>[\s\S]*?EPA<\/button>[\s\S]*?Pearl<\/button>/);
  assert.match(html, /<div class="shead plushead">/);
  assert.doesNotMatch(html, /<b>Log a case<\/b>|class="altrow"/);
  assert.match(html, /aria-label="Log a case"/);
});

test("the switch moves between the three, showing one sheet at a time", () => {
  const h = phone();
  h.click("scopeopen");
  h.click("plusto", {to: "e"});
  let html = h.html();
  assert.equal(on(html), "e");
  assert.match(html, /aria-label="Log observation"/);
  assert.doesNotMatch(html, /role="dialog" aria-modal="true" aria-label="Log a case"/);
  assert.match(html, /This week's EPAs|All EPAs/);
  h.click("plusto", {to: "p"});
  html = h.html();
  assert.equal(on(html), "p");
  assert.match(html, /aria-label="Catch a pearl"/);
  assert.doesNotMatch(html, /aria-label="Log observation"/);
  // Only one sheet's scrim at a time.
  assert.equal((html.match(/class="scrim/g) || []).length, 1);
});

test("what was typed stays while you switch, and goes once the + flow ends", () => {
  const h = phone();
  h.click("scopeopen");
  h.click("plusto", {to: "p"});
  h.run(`pearlSheet.t = "Albumin after large-volume paracentesis"`);
  h.click("plusto", {to: "e"});
  h.run(`sheet.n = "Upper GI bleed"`);
  h.click("plusto", {to: "p"});
  assert.equal(h.val("pearlSheet.t"), "Albumin after large-volume paracentesis");
  h.click("plusto", {to: "e"});
  assert.equal(h.val("sheet.n"), "Upper GI bleed");
  h.click("closesheet");
  assert.deepEqual(h.val("[plusOn, sheet, pearlSheet, scopeSheet]"), [null, null, null, null]);
  assert.doesNotMatch(h.html(), /class="sheet/);
});

test("saving one entry ends the + flow", () => {
  const h = phone();
  h.click("scopeopen");
  h.click("plusto", {to: "p"});
  h.run(`pearlSheet.t = "Ceftriaxone for a variceal bleed"`);
  h.click("pearlsave");
  assert.equal(h.saved().pearls.length, 1);
  assert.deepEqual(h.val("[plusOn, sheet, pearlSheet, scopeSheet]"), [null, null, null, null]);
});

test("sheets opened elsewhere keep their own titles and no switch", () => {
  const h = phone();
  h.click("pearlnew");
  assert.match(h.html(), /<div class="shead"><b>Catch a pearl<\/b>/);
  assert.equal(switchOf(h.html()), "");
  h.click("pearlclose");
  h.click("open", {code: "F3"});
  h.click("sheet", {part: "f3a"});
  assert.match(h.html(), /<div class="shead"><b>Log observation<\/b>/);
  assert.equal(switchOf(h.html()), "");
});
