"use strict";
// A sheet up holds the page still behind it, and letting go puts the page back
// where it was: on iPhone a drag that runs past the end of a sheet, or starts
// on one too short to scroll, would otherwise scroll the page underneath.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, state, many} = require("./harness");

// The bits of the page the hold touches, so a test can watch them.
function withPage(h, y) {
  h.run(`
    globalThis.__cls = new Set();
    document.documentElement = {classList: {add: c => __cls.add(c), remove: c => __cls.delete(c), contains: c => __cls.has(c), toggle() {}},
      style: {setProperty() {}}, dataset: {}};
    document.body.style = {};
    window.scrollY = ${y};
    globalThis.__to = [];
    window.scrollTo = (x, y) => { __to.push(y); window.scrollY = y; };`);
}

test("opening a sheet holds the page where it is; closing it lets go and scrolls back there", () => {
  const h = load({today: "2026-10-16", state: state({c2: many(1, "2026-10-01")})});
  withPage(h, 420);
  h.click("sheet", {part: "c2"});
  assert.equal(h.val("__cls.has('held')"), true);
  assert.equal(h.val("document.body.style.top"), "-420px");
  // Redraws while it's up (typing, ticking) keep holding the same place.
  h.click("sheettick", {name: "Assessor"});
  assert.equal(h.val("document.body.style.top"), "-420px");
  h.click("closesheet");
  assert.equal(h.val("__cls.has('held')"), false);
  assert.equal(h.val("document.body.style.top"), "");
  assert.deepEqual(h.val("__to"), [420]);
});

test("every kind of sheet holds the page: settings, the + flow switching between its sheets", () => {
  const h = load({today: "2026-10-16", state: state({})});
  withPage(h, 150);
  h.click("setopen");
  assert.equal(h.val("__cls.has('held')"), true);
  h.click("setclose");
  assert.equal(h.val("__cls.has('held')"), false);
  h.click("plusto", {to: "e"});
  assert.equal(h.val("__cls.has('held')"), true);
  h.click("plusto", {to: "c"});
  assert.equal(h.val("__cls.has('held')"), true);
  assert.equal(h.val("document.body.style.top"), "-150px");
});
