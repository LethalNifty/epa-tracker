"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, obs, state, many, dateExpr} = require("./harness");

const plan = (h, iso) => h.val(`coachPlan(Store.state.obs, ${dateExpr(iso)})`);

test("empty history at the start of Year 1 follows the July plan exactly", () => {
  const h = load({today: "2026-07-02"});
  const cp = plan(h, "2026-07-02");
  assert.deepEqual(cp.block, {num: 1, name: "Consults HSC", week: 1});
  assert.deepEqual(cp.parts.d1, {logged: 0, inCur: 0, inWeek: 0, planned: {1: 2, 2: 2}, carried: {}});
  assert.deepEqual(cp.parts.c8a.planned, {7: 2, 8: 8, 10: 5, 11: 4, 12: 6});
});

test("a missed part moves to the next block of a rotation type that suits it", () => {
  const h = load({today: "2026-10-22"});
  assert.deepEqual(plan(h, "2026-10-22").parts.d1.carried, {5: 4});   // Block 5 is consults
  assert.deepEqual(plan(h, "2026-11-19").parts.d1.carried, {7: 4});   // Block 6 is radiology, so Block 7
});

test("with no suitable block left, a missed part is overdue now", () => {
  const h = load({today: "2027-03-11"});
  const cp = plan(h, "2027-03-11");
  assert.equal(cp.block.num, 10);
  assert.deepEqual(cp.parts.f3b.carried, {10: 3});                     // F3-B only suits radiology and pathology
});

test("logging early empties the latest blocks first", () => {
  const h = load({today: "2026-09-25", state: state({c8a: many(2, "2026-09-25")})});
  assert.deepEqual(plan(h, "2026-09-25").parts.c8a.planned, {7: 2, 8: 8, 10: 5, 11: 4, 12: 4});
});

test("logs in the current block use up that block's share first", () => {
  const h = load({today: "2026-09-25", state: state({c5: [obs("2026-09-24")]})});
  const s = plan(h, "2026-09-25").parts.c5;
  assert.deepEqual([s.inCur, s.inWeek, s.planned, s.carried], [1, 1, {4: 1}, {}]);
});

test("over-logging a part leaves nothing planned for it", () => {
  const h = load({today: "2026-09-25", state: state({c2: many(20, "2026-09-01")})});
  const s = plan(h, "2026-09-25").parts.c2;
  assert.deepEqual([s.logged, s.planned, s.carried], [20, {}, {}]);
});

test("asOf ignores observations dated after it", () => {
  const h = load({today: "2026-09-25", state: state({c5: [obs("2026-09-24"), obs("2026-10-02")]})});
  assert.equal(h.val(`coachPlan(Store.state.obs, ${dateExpr("2026-09-25")}, {asOf: ${dateExpr("2026-09-25")}}).parts.c5.logged`), 1);
});

test("remaining need is always covered exactly, all year, for several histories", () => {
  const histories = {
    empty: `{}`,
    onPlanToBlock4: `(() => { const o = {}; for (let b = 1; b < 4; b++) for (const pid in PLAN[b])
      for (let k = 0; k < PLAN[b][pid]; k++) (o[pid] ||= []).push({d: fmtDate(blockStart(b)), status: "approved"}); return o; })()`,
    everythingEarly: `(() => { const o = {}; for (const P of PARTS)
      o[P.id] = Array.from({length: P.required}, () => ({d: "2026-07-10", status: "pending"})); return o; })()`,
    overLogged: `({c2: Array.from({length: 20}, () => ({d: "2026-08-01", status: "approved"}))})`,
  };
  const h = load({today: "2026-07-02"});
  for (const [name, expr] of Object.entries(histories)) {
    const bad = h.val(`(() => { const obsByPart = ${expr}, bad = [];
      for (let t = 0; t < 13 * 28; t += 3) {
        const cp = coachPlan(obsByPart, new Date(2026, 6, 2 + t, 12));
        for (const P of PARTS) {
          const s = cp.parts[P.id];
          const sum = Object.values(s.planned).concat(Object.values(s.carried)).reduce((a, b) => a + b, 0);
          if (s.logged + sum !== Math.max(P.required, s.logged)) bad.push(t + " " + P.id);
        }
      }
      return bad; })()`);
    assert.deepEqual(bad, [], name);
  }
});

test("carried parts land only where they can happen, unless nothing suitable is left", () => {
  const h = load({today: "2026-07-02"});
  const bad = h.val(`(() => { const bad = [];
    for (let t = 0; t < 13 * 28; t += 7) {
      const cp = coachPlan({}, new Date(2026, 6, 2 + t, 12)), cur = cp.block.num;
      for (const P of PARTS) for (const b in cp.parts[P.id].carried) {
        const fams = feasibleFamilies(P.id);
        const anyLeft = Object.keys(BLOCK_FAMILY).some(n => +n >= cur && fams.includes(BLOCK_FAMILY[n]));
        if (!fams.includes(BLOCK_FAMILY[b]) && (anyLeft || +b !== cur)) bad.push(t + " " + P.id + " to " + b);
      }
    }
    return bad; })()`);
  assert.deepEqual(bad, []);
});

test("coachPlan is null outside Year 1", () => {
  const h = load({today: "2026-07-02"});
  assert.equal(h.val(`coachPlan({}, ${dateExpr("2026-06-30")})`), null);
  assert.equal(h.val(`coachPlan({}, ${dateExpr("2027-07-01")})`), null);
});
