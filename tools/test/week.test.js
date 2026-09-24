"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, obs, state, many, dateExpr} = require("./harness");

const ALL = `(() => { const o = {}; for (const P of PARTS)
  o[P.id] = Array.from({length: P.required}, () => ({d: "2026-09-01", status: "approved"})); return o; })()`;
const rowsOn = (h, iso) => Object.fromEntries(
  h.val(`weekList(coachPlan(Store.state.obs, ${dateExpr(iso)}))`).map(r => [r.pid, r]));

test("week 1 of Block 4 with nothing logged", () => {
  const h = load({today: "2026-09-24"});
  const list = h.val(`weekList(coachPlan({}, ${dateExpr("2026-09-24")}))`);
  const by = Object.fromEntries(list.map(r => [r.pid, r]));
  assert.deepEqual(by.c5, {pid: "c5", label: "C5", short: "Complex nutrition", outstanding: 1, carried: false});
  assert.deepEqual(by.f1b, {pid: "f1b", label: "F1-B", short: "Assessment and plan", outstanding: 10, carried: true});
  assert.equal(by.d1, undefined);   // D1 is carried to Block 5, not this motility block
  assert.deepEqual(list.map(r => r.pid), ["f1b", "c2", "f2", "c4", "c5"]);
});

test("a miss in week 1 shows as carried in week 2", () => {
  const h = load({today: "2026-10-01"});
  assert.equal(rowsOn(h, "2026-09-24").c5.carried, false);
  assert.equal(rowsOn(h, "2026-10-01").c5.carried, true);
  const done = load({today: "2026-10-01", state: state({c5: [obs("2026-09-25")]})});
  assert.equal(rowsOn(done, "2026-10-01").c5, undefined);
});

test("a part finished this week stays listed as done", () => {
  const h = load({today: "2026-09-26", state: state({c5: [obs("2026-09-25")]})});
  assert.deepEqual(rowsOn(h, "2026-09-26").c5, {pid: "c5", label: "C5", short: "Complex nutrition", outstanding: 0, carried: false});
});

test("recap: what was logged last week and what slipped", () => {
  const h = load({today: "2026-09-24", state: state({c2: many(2, "2026-09-20")})});
  const rc = h.val(`recapFor(Store.state.obs, ${dateExpr("2026-09-24")})`);
  assert.equal(rc.key, "4-1");
  assert.deepEqual(rc.got, [{pid: "c2", label: "C2", n: 2}]);
  assert.ok(rc.slipped.some(s => s.pid === "c3" && s.n === 2));
  assert.deepEqual(rc.slipped.find(s => s.pid === "c2"), {pid: "c2", label: "C2", n: 1});
});

test("recap: none in Block 1 week 1; week 1 looks back at the previous block's week 4", () => {
  const h = load({today: "2026-10-22", state: state({c7: [obs("2026-10-14"), obs("2026-10-15")]})});
  assert.equal(h.val(`recapFor({}, ${dateExpr("2026-07-02")})`), null);
  const rc = h.val(`recapFor(Store.state.obs, ${dateExpr("2026-10-22")})`);
  assert.equal(rc.key, "5-1");
  assert.deepEqual(rc.got, [{pid: "c7", label: "C7", n: 1}]);
});

test("pace estimate uses the last 8 weeks", () => {
  const h = load({today: "2026-09-24", state: state({c8a: many(16, "2026-09-01")})});
  assert.deepEqual(h.val(`(() => { const r = paceFinish(Store.state.obs, ${dateExpr("2026-09-24")});
    return [fmtDate(r.date), r.onTrack]; })()`), ["2027-11-29", false]);
});

test("pace estimate needs something logged in the window", () => {
  const h = load({today: "2026-09-24", state: state({c8a: many(5, "2026-07-20")})});
  assert.deepEqual(h.val(`paceFinish(Store.state.obs, ${dateExpr("2026-09-24")})`), {date: null});
});

test("pace estimate: all done says done; one left is on track", () => {
  const h = load({today: "2026-09-24"});
  assert.deepEqual(h.val(`paceFinish(${ALL}, ${dateExpr("2026-09-24")})`), {done: true});
  assert.equal(h.val(`(() => { const o = ${ALL}; o.c2.pop(); return paceFinish(o, ${dateExpr("2026-09-24")}).onTrack; })()`), true);
});

test("plan finish is the end of the last block with anything left", () => {
  const h = load({today: "2026-09-24"});
  const pf = expr => h.val(`(() => { const r = planFinish(coachPlan(${expr}, ${dateExpr("2026-09-24")}));
    return r.done ? "done" : fmtDate(r.date) + " " + r.onTrack; })()`);
  assert.equal(pf(`{}`), "2027-06-30 true");
  assert.equal(pf(`(() => { const o = ${ALL}; o.c3.pop(); return o; })()`), "2026-11-18 true");
  assert.equal(pf(ALL), "done");
});

test("chase list: pending more than 14 days, oldest first", () => {
  const h = load({today: "2026-09-24", state: state({
    c2: [obs("2026-09-09", {status: "pending", a: "Dr. A"}), obs("2026-09-10", {status: "pending"})],
    c3: [obs("2026-08-01", {status: "pending"}), obs("2026-08-01")],
  })});
  assert.deepEqual(h.val(`chaseList(Store.state.obs, ${dateExpr("2026-09-24")})`), [
    {pid: "c3", i: 0, label: "C3", date: "2026-08-01", a: "", age: 54},
    {pid: "c2", i: 0, label: "C2", date: "2026-09-09", a: "Dr. A", age: 15},
  ]);
});

test("look for: case lines only, numbered series grouped, at most 3", () => {
  const h = load({today: "2026-09-24"});
  const lf = (rows, done) => h.val(`lookFor(${JSON.stringify(rows)}, id => (${JSON.stringify(done || {})})[id] || 0)`);
  assert.deepEqual(lf([{pid: "c2", label: "C2", outstanding: 1}]).map(x => x.name), [
    "Chronic liver disease and / or liver transplant recipients", "Chronic pancreatobiliary disease", "Inflammatory bowel disease"]);
  assert.equal(lf([{pid: "c2", label: "C2", outstanding: 1}], {"c2-6": 2})[0].name, "Chronic pancreatobiliary disease");
  assert.deepEqual(lf([{pid: "c8a", label: "C8-A", outstanding: 2}]), [
    {pid: "c8a", part: "C8-A", name: "variceal hemostasis", left: 3},
    {pid: "c8a", part: "C8-A", name: "non-variceal hemostasis", left: 8},
    {pid: "c8a", part: "C8-A", name: "dilations", left: 2}]);
  assert.deepEqual(lf([{pid: "f2", label: "F2", outstanding: 1}]), []);   // assessor lines only
  assert.deepEqual(lf([{pid: "c2", label: "C2", outstanding: 0}]), []);   // nothing outstanding
});

test("block targets: past blocks show what was logged, later blocks what is left", () => {
  const h = load({today: "2026-09-25", state: state({c8a: many(2, "2026-09-25"), c2: many(3, "2026-08-27")})});
  const bt = n => h.val(`blockTargets(${n}, Store.state.obs, coachPlan(Store.state.obs, ${dateExpr("2026-09-25")}), 4)`);
  assert.deepEqual(bt(12).find(x => x.pid === "c8a"), {pid: "c8a", label: "C8-A", code: "C8", n: 4, carried: false, past: false});
  assert.deepEqual(bt(3).find(x => x.pid === "c2"), {pid: "c2", label: "C2", code: "C2", n: 3, carried: false, past: true});
  assert.equal(h.val(`blockTargets(1, {}, null, 0).find(x => x.pid === "d1").n`), 2);   // before Year 1: the July plan
  assert.deepEqual(h.val(`blockFocus(coachPlan({}, ${dateExpr("2026-09-24")}))`), ["F1", "F2", "C2", "C4", "C5"]);
});
