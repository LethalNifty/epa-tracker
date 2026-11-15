"use strict";
// Smaller fixes from the November review: no reading reminder on a paused
// night; the Approved pill says what it did, with Undo; a restore that can't
// be taken in changes nothing, and one that can be undone.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, state, obs, many} = require("./harness");

test("no 20:00 reading reminder on a paused night or a Not tonight", () => {
  const studyDays = pauses => {
    const h = load({today: "2026-10-26", state: state({}, {study: {log: {}, q: {}, pauses}})});
    h.setNow("2026-10-26T07:00");
    return h.val(`alertPlan(callNow()).filter(a => a.kind === "study").map(a => fmtDate(new Date(a.t)))`).filter(d => d <= "2026-11-06");
  };
  const plain = studyDays([]), off = ["2026-10-27", "2026-10-28", "2026-11-02"];
  assert.ok(off.every(d => plain.includes(d)), "those are reading nights to begin with");
  assert.deepEqual(studyDays([{a: "2026-10-27", b: "2026-10-28"}, {a: "2026-11-02", b: "2026-11-02", skip: true}]), plain.filter(d => !off.includes(d)));
});

test("the Approved pill says what it did, with Undo; a mistaken flip keeps the approval day", () => {
  const h = load({today: "2026-10-20", state: state({c2: [obs("2026-10-01", {a: "Brook", ok: "2026-10-05"})]})});
  h.click("open", {code: "C2"});
  const form = () => h.val("[Store.state.obs.c2[0].status, Store.state.obs.c2[0].ok]");
  h.click("togglestatus", {part: "c2", obs: 0});
  assert.deepEqual(form(), ["pending", null]);
  assert.match(h.html(), /Back to pending<\/span><button class="textbtn" data-action="undo">Undo/);
  h.click("undo");
  assert.deepEqual(form(), ["approved", "2026-10-05"]);
  // Two taps by mistake: back to pending, then approved again the same day.
  h.click("togglestatus", {part: "c2", obs: 0});
  h.click("togglestatus", {part: "c2", obs: 0});
  assert.deepEqual(form(), ["approved", "2026-10-05"]);
  assert.match(h.html(), /Marked approved/);
  assert.equal(h.val("Store.state.obs.c2[0].okWas"), undefined);
  // Put back to pending and approved on a later day: that day it is.
  h.click("togglestatus", {part: "c2", obs: 0});
  h.setToday("2026-10-22");
  h.click("togglestatus", {part: "c2", obs: 0});
  assert.deepEqual(form(), ["approved", "2026-10-22"]);
});

test("a backup that can't be taken in changes nothing; one taken in can be undone", () => {
  const h = load({today: "2026-10-20", state: state({c2: many(2, "2026-10-01")})});
  const saved = h.store.get("epa-state-v1");
  // Looks like a backup, but breaks while being taken in.
  const r = h.val(`Store.importJSON(${JSON.stringify(JSON.stringify({v: 1, obs: {c2: 5}, lines: {}}))})`);
  assert.deepEqual(r, {ok: false, error: "Could not read that file."});
  assert.equal(h.val("Store.state.obs.c2.length"), 2);
  assert.equal(h.store.get("epa-state-v1"), saved);
  h.click("tab", {page: "epas"});
  assert.doesNotMatch(h.html(), /crash|went wrong/i);
  // A good one, then Undo.
  h.run(`window.__r = Store.importJSON(${JSON.stringify(JSON.stringify(state({d1: many(1, "2026-09-01")})))})`);
  assert.equal(h.val("__r.ok"), true);
  assert.deepEqual(h.val("Object.keys(Store.state.obs)"), ["d1"]);
  h.run("Store.undoImport(__r.before)");
  assert.equal(h.saved().obs.c2.length, 2);
  assert.equal(h.saved().obs.d1, undefined);
});
