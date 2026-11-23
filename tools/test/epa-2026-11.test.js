"use strict";
// C6's two DOPS lines and C9 Part B, back in November 2026: the user heard
// both are needed after all (the Royal College guide always had them; the
// October match to Entrada had dropped them). Part B forms set aside in
// October count again.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, obs, state} = require("./harness");

const app = load({today: "2026-11-22"});
const v = app.val;
const lines = pid => v(`PART_BY_ID.${pid}.items.filter(x => x.id).map(x => x.label)`);

test("C6: two DOPS lines among its 12 colonoscopies", () => {
  assert.deepEqual(lines("c6").filter(x => /DOPS/.test(x)), ["1 DOPS", "2 DOPS"]);
  assert.equal(lines("c6").length, 10);
  assert.equal(v("PART_BY_ID.c6.required"), 12);
});

test("C9 has Part B again: feedback from 6 observers, at least 2 other health care professionals", () => {
  assert.deepEqual(v(`EPA_DATA.find(e => e.code === "C9").parts.map(p => [p.id, p.name, p.required])`),
    [["c9a", "Part A: Patient Care", 4], ["c9b", "Part B: Interprofessional care", 6]]);
  assert.deepEqual(lines("c9b"), ["1 observer", "2 observer", "3 observer", "4 observer", "5 observer", "6 observer",
    "1 other health care professional", "2 other health care professional"]);
  const ref = v(`EPA_DATA.find(e => e.code === "C9").ref`);
  assert.deepEqual(ref.plan.map(p => p.part), ["Part A: Patient care", "Part B: Interprofessional care"]);
  assert.match(ref.plan[1].rule, /at least 6 observers/);
  assert.deepEqual(ref.milestones.map(m => m.part), ["Part A: Overall patient care", "Part B: Interprofessional care"]);
});

test("all EPAs: 139 required across 21 parts", () => {
  assert.equal(v("PARTS.length"), 21);
  assert.equal(v("PARTS.reduce((a, p) => a + p.required, 0)"), 139);
});

test("the coach knows Part B again: its short name, the ward ask and the two blocks that carry it", () => {
  assert.equal(v("PART_SHORT.c9b"), "Interprofessional care");
  assert.ok(v(`ASK.find(x => x.id === "ward").parts.includes("c9b")`));
  assert.deepEqual([v("PLAN[10].c9b"), v("PLAN[12].c9b")], [3, 3]);
});

test("Part B forms set aside in October count again", () => {
  const h = load({today: "2026-11-22", state: state({c9a: [obs("2026-10-01")]},
    {retired: {c9b: [obs("2026-10-02"), obs("2026-10-03", {status: "pending"})]}})});
  assert.equal(h.val("Store.state.obs.c9b.length"), 2);
  assert.equal(h.val("Store.state.retired"), undefined);
  assert.equal(h.val("Store.overallPending()"), 1);
  assert.match(h.html(), /of 139 logged/);
});

test("a backup saved with Part B set aside brings those forms back too", () => {
  const h = load({today: "2026-11-22"});
  const backup = JSON.stringify(state({}, {retired: {c9b: [obs("2026-10-02")]}}));
  assert.equal(h.val(`Store.importJSON(${JSON.stringify(backup)}).ok`), true);
  assert.equal(h.val("Store.state.obs.c9b.length"), 1);
  assert.equal(h.val("Store.state.retired"), undefined);
});
