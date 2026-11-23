"use strict";
// Core EPAs matched to Entrada's requirements as of October 2026 (the user's
// screenshots of C1 to C4 and C6 to C9): counts, lines added and lines gone.
// C6's DOPS lines and C9 Part B came back in November 2026 (epa-2026-11.test.js).
// Forms logged under a part the app no longer has move out of every count.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, obs, state} = require("./harness");

const app = load({today: "2026-10-28"});
const v = app.val;
const lines = pid => v(`PART_BY_ID.${pid}.items.filter(x => x.id).map(x => [x.label, x.target])`);

test("C1: the case mix adds social barriers and cultural, social or religious barriers", () => {
  const l = lines("c1").map(x => x[0]);
  assert.equal(l.length, 18);
  assert.ok(l.includes("Social barriers to health care"));
  assert.ok(l.includes("Cultural, social and/or religious barriers to communication and/or care"));
  assert.equal(v("PART_BY_ID.c1.required"), 5);
});

test("C2: nine diagnoses at 2 each, with no direct observation lines", () => {
  const l = lines("c2");
  assert.deepEqual(l.filter(x => x[1] === 2).map(x => x[0]).slice(6), ["Hereditary disorder such as familial adenomatous polyposis or Lynch syndrome",
    "Post-bariatric surgery", "Motility disorders"]);
  assert.equal(l.filter(x => x[1] === 2).length, 9);
  assert.ok(!l.some(x => /direct observation/.test(x[0])));
  assert.deepEqual(l.filter(x => /Assessor/.test(x[0])).length, 3);
  assert.equal(v("PART_BY_ID.c2.required"), 14);
});

test("C4: the referral types read as Entrada has them", () => {
  assert.deepEqual(lines("c4").map(x => x[0]), ["1 Assessor", "2 Assessor", "1 Elective", "1 Advanced endoscopic care referral", "1 Other service referral"]);
});

test("C8: assessors on both parts (3 for Part A, 2 for Part B)", () => {
  assert.deepEqual(lines("c8a").slice(0, 3).map(x => x[0]), ["1 Assessor", "2 Assessor", "3 Assessor"]);
  assert.equal(lines("c8a").length, 37);
  assert.deepEqual(lines("c8b").map(x => x[0]), ["1 Assessor", "2 Assessor"]);
  assert.deepEqual([v("PART_BY_ID.c8a.required"), v("PART_BY_ID.c8b.required")], [25, 4]);
  // The scope log's C8 counts still find their lines.
  assert.equal(v(`scopeTherapy([], PART_BY_ID.c8a.items, () => 1).find(r => r.stem === "polypectomy").observed`), 10);
});

test("forms logged under a part the app no longer has move out of every count, kept in the backup", () => {
  const h = load({today: "2026-10-28", state: state({c9a: [obs("2026-10-01")], x1: [obs("2026-10-02"), obs("2026-10-03", {status: "pending"})]})});
  assert.equal(h.val("Store.state.obs.x1"), undefined);
  assert.equal(h.val("Store.overallPending()"), 0);
  assert.equal(h.val("Store.state.retired.x1.length"), 2);
  assert.match(h.html(), /of 139 logged/);
  const backup = h.val("Store.exportJSON()");
  const h2 = load({today: "2026-10-28"});
  assert.equal(h2.val(`Store.importJSON(${JSON.stringify(backup)}).ok`), true);
  assert.equal(h2.val("Store.state.retired.x1.length"), 2);
});
