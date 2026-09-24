"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {load} = require("./harness");

test("EPA data: 16 EPAs, 21 parts, 139 required", () => {
  const h = load({today: "2026-09-24"});
  assert.equal(h.val("EPA_DATA.length"), 16);
  assert.equal(h.val("EPA_DATA.flatMap(e => e.parts).length"), 21);
  assert.equal(h.val("EPA_DATA.flatMap(e => e.parts).reduce((a, p) => a + p.required, 0)"), 139);
});

test("PLAN column sums equal each part's required count", () => {
  const h = load({today: "2026-09-24"});
  const bad = h.val(`EPA_DATA.flatMap(e => e.parts).filter(p =>
    Object.values(PLAN).reduce((a, blk) => a + (blk[p.id] || 0), 0) !== p.required).map(p => p.id)`);
  assert.deepEqual(bad, []);
});

test("16 biopsy protocols", () => {
  const h = load({today: "2026-09-24"});
  assert.equal(h.val("BIOPSY_DATA.length"), 16);
});

test("logging an observation persists and reloads", () => {
  const h = load({today: "2026-09-24"});
  h.run(`Store.logObs("c2")`);
  const saved = h.saved();
  assert.equal(saved.obs.c2.length, 1);
  assert.equal(saved.obs.c2[0].status, "pending");
  const again = load({today: "2026-09-24", state: saved});
  assert.equal(again.val(`Store.partDone("c2")`), 1);
});

test("an old v1 backup without status imports as approved", () => {
  const h = load({today: "2026-09-24"});
  const text = JSON.stringify({v: 1, obs: {c2: [{d: "2026-08-01"}]}, lines: {}});
  assert.equal(h.val(`Store.importJSON(${JSON.stringify(text)}).ok`), true);
  assert.equal(h.val(`Store.state.obs.c2[0].status`), "approved");
});

test("every page renders without throwing", () => {
  const h = load({today: "2026-09-24"});
  for (const page of ["home", "plan", "biopsy", "stats"]) {
    h.run(`route = {page: ${JSON.stringify(page)}}; render();`);
    assert.ok(h.html().length > 200, page);
  }
  h.run(`route = {page: "epa", code: "C2", from: "home"}; render();`);
  assert.match(h.html(), /chronic/i);
});
