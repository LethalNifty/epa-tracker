"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, obs, state, many, dateExpr} = require("./harness");

const plan = (h, iso) => h.val(`coachPlan(Store.state.obs, ${dateExpr(iso)})`);
const REQ = {
  f: {f1a: 2, f1b: 12, f2: 2, f3a: 6, f3b: 3, f4: 6},
  core: {c1: 5, c2: 14, c3: 10, c4: 3, c5: 2, c6: 12, c7: 8, c8a: 25, c8b: 4, c9a: 4, c9b: 6},
};
// Every observation of the given stages logged (pending) on 2026-09-01.
const full = (...stages) => Object.fromEntries(stages.flatMap(st =>
  Object.entries(REQ[st]).map(([pid, n]) => [pid, many(n, "2026-09-01", {status: "pending"})])));

test("Transition to Discipline is behind you: never planned", () => {
  const h = load({today: "2026-07-02"});
  for (const iso of ["2026-07-02", "2026-09-24", "2027-03-11"]) {
    const cp = plan(h, iso);
    for (const pid of ["d1", "d2a", "d2b"]) assert.deepEqual(cp.parts[pid].planned, {}, iso + " " + pid);
  }
});

test("Foundations first: everything left is due at the first block where it can happen", () => {
  const h = load({today: "2026-09-24"});
  const cp = plan(h, "2026-09-24");
  assert.equal(cp.active, "f");
  const p = pid => cp.parts[pid].planned;
  assert.deepEqual([p("f1a"), p("f1b"), p("f2"), p("f3a"), p("f3b"), p("f4")],
    [{5: 2}, {4: 12}, {4: 2}, {5: 6}, {5: 3}, {5: 6}]);
});

test("Core waits until the block after Foundations is due to finish; P1 comes last", () => {
  const h = load({today: "2026-09-24"});
  const early = h.val(`(() => { const cp = coachPlan({}, ${dateExpr("2026-09-24")});
    return PARTS.filter(P => P.stage === "core" && Object.keys(cp.parts[P.id].planned).some(b => +b < 6)).map(P => P.id); })()`);
  assert.deepEqual(early, []);
  const cp = plan(h, "2026-09-24");
  assert.deepEqual(cp.parts.c2.planned, {7: 1, 10: 1, 11: 7, 12: 4, 13: 1});
  assert.deepEqual(cp.parts.c5.planned, {6: 1, 7: 1});
  assert.deepEqual(cp.parts.p1.planned, {13: 5});
});

test("once every Foundations observation is logged (pending counts), Core is next", () => {
  const h = load({today: "2026-09-25", state: state(full("f"))});
  const cp = plan(h, "2026-09-25");
  assert.equal(cp.active, "core");
  assert.deepEqual([cp.parts.c2.planned, cp.parts.c5.planned, cp.parts.c1.planned], [{4: 14}, {4: 2}, {5: 5}]);
});

test("P1 opens only once Core is logged too", () => {
  const h = load({today: "2026-09-25", state: state(full("f", "core"))});
  const cp = plan(h, "2026-09-25");
  assert.equal(cp.active, "ttp");
  assert.deepEqual(cp.parts.p1.planned, {5: 5});
});

test("a procedure note can happen wherever its procedure happens", () => {
  const h = load({today: "2026-09-24"});
  assert.deepEqual(h.val(`feasibleFamilies("f3b").sort()`), ["consults", "endoscopy", "pathology", "radiology"]);
  assert.ok(h.val(`feasibleFamilies("c8b")`).includes("consults"));
});

test("logs in the current block count toward it", () => {
  const h = load({today: "2026-09-25", state: state({f1b: [obs("2026-09-24")]})});
  const s = plan(h, "2026-09-25").parts.f1b;
  assert.deepEqual([s.inCur, s.inWeek, s.planned], [1, 1, {4: 11}]);
});

test("over-logging a part leaves nothing planned for it", () => {
  const h = load({today: "2026-09-25", state: state({c2: many(20, "2026-09-01")})});
  const s = plan(h, "2026-09-25").parts.c2;
  assert.deepEqual([s.logged, s.planned], [20, {}]);
});

test("asOf ignores observations dated after it", () => {
  const h = load({today: "2026-09-25", state: state({c5: [obs("2026-09-24"), obs("2026-10-02")]})});
  assert.equal(h.val(`coachPlan(Store.state.obs, ${dateExpr("2026-09-25")}, {asOf: ${dateExpr("2026-09-25")}}).parts.c5.logged`), 1);
});

test("remaining need is always covered exactly, all year, for several histories", () => {
  const histories = {
    empty: `{}`,
    foundationsDone: JSON.stringify(full("f")),
    everythingDone: JSON.stringify(full("f", "core")),
    overLogged: `({c2: Array.from({length: 20}, () => ({d: "2026-08-01", status: "approved"}))})`,
  };
  const h = load({today: "2026-07-02"});
  for (const [name, expr] of Object.entries(histories)) {
    const bad = h.val(`(() => { const obsByPart = ${expr}, bad = [];
      for (let t = 0; t < 13 * 28; t += 3) {
        const cp = coachPlan(obsByPart, new Date(2026, 6, 2 + t, 12));
        for (const P of PARTS) {
          const s = cp.parts[P.id];
          const sum = Object.values(s.planned).reduce((a, b) => a + b, 0);
          const want = P.stage === "ttd" ? 0 : Math.max(0, P.required - s.logged);
          if (sum !== want) bad.push(t + " " + P.id);
        }
      }
      return bad; })()`);
    assert.deepEqual(bad, [], name);
  }
});

test("the stage you're on sits on a suitable rotation whenever one is left", () => {
  const h = load({today: "2026-07-02"});
  const bad = h.val(`(() => { const bad = [];
    for (let t = 0; t < 13 * 28; t += 7) {
      const cp = coachPlan({}, new Date(2026, 6, 2 + t, 12)), cur = cp.block.num;
      for (const P of PARTS) if (P.stage === cp.active) for (const b in cp.parts[P.id].planned) {
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
