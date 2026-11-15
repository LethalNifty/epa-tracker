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

test("the finish date's pace counts only the stages it finishes (no Transition to Discipline forms)", () => {
  const h = load({today: "2026-10-20", state: state({d1: many(4, "2026-10-10"), f3a: many(1, "2026-10-12")})});
  assert.equal(h.val("paceFinish(Store.state.obs, getToday()).n"), 1);
});

test("a drug's card cites its own Health Canada monograph, never another drug's", () => {
  const h = load({today: "2026-10-20"});
  const refs = h.val(`IBD_DRUGS.map(d => [d.id, ibdRefs(d), JSON.stringify([d.how, d.use, d.dose, d.warn, d.avoid, d.harm, d.preg, d.monitor, d.differ, d.before.extra])])`);
  assert.ok(refs.length >= 10);
  for (const [id, keys, own] of refs) for (const k of keys.filter(k => k.startsWith("hc"))) assert.ok(own.includes(k), `${id} cites ${k}`);
  const omvoh = refs.find(([, , own]) => own.includes("hcOmvoh"));
  assert.ok(omvoh && omvoh[1].includes("hcOmvoh"), "Omvoh's own card still cites it");
  // The shared work-up lines still rest on something.
  assert.ok(h.val(`IBD_DRUGS.every(d => ibdWorkup(d).every(x => x.line[1]))`));
});

test("since the last report: that day's cases logged before it aren't counted again", () => {
  const h = load({today: "2026-10-20"});
  const o = {from: "2026-10-15", to: "2026-10-20", after: "2026-10-15T20:00:00.000Z"};
  const inP = c => h.val(`scopeInPeriod(${JSON.stringify(c)}, ${JSON.stringify(o)})`);
  assert.equal(inP({d: "2026-10-15", ts: "2026-10-15T15:00:00.000Z"}), false);
  assert.equal(inP({d: "2026-10-15", ts: "2026-10-15T22:00:00.000Z"}), true);
  assert.equal(inP({d: "2026-10-16", ts: "2026-10-16T15:00:00.000Z"}), true);
  h.run("Store.markReport('2026-10-20')");
  assert.match(h.saved().scopes.lastReportAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(h.val(`scopeReportRange("since", [], "2026-10-15", getToday(), "2026-10-15T20:00:00.000Z")`),
    {from: "2026-10-15", to: "2026-10-20", label: "Since the last report", after: "2026-10-15T20:00:00.000Z"});
});

test("a holiday on a weekend is kept on the next free weekday; Remembrance Day isn't moved", () => {
  const h = load({today: "2026-10-20"});
  const stat = d => h.val(`agStat("${d}")`), hol = d => h.val(`agHoliday("${d}")`);
  assert.equal(stat("2026-12-26"), "Boxing Day");
  assert.equal(stat("2026-12-28"), "Boxing Day (observed)");
  assert.equal(stat("2026-12-27"), null);
  assert.equal(hol("2027-12-27"), "Christmas Day (observed)");
  assert.equal(stat("2027-12-28"), "Boxing Day (observed)");
  assert.equal(hol("2028-01-03"), "New Year's Day (observed)");
  assert.equal(hol("2029-11-12"), null, "Remembrance Day on a Sunday stays on the Sunday");
  assert.equal(h.val(`scopeIsStat(new Date(2026, 11, 28, 12))`), true);
});

test("coming back to the app doesn't unlock the same study questions again", async () => {
  const h = load({today: "2026-10-20"});
  h.run(`window.__n = 0; studyqDecrypt = async () => { __n++; return {q: [], made: "x"}; };`);
  const enc = {v: 1, ct: "abc", salt: "s", iv: "i", iter: 1};
  await h.run(`studyqOpen(${JSON.stringify(enc)}, "pw")`);
  await h.run(`studyqOpen(${JSON.stringify(enc)}, "pw")`);
  assert.equal(h.val("__n"), 1);
  await h.run(`studyqOpen(${JSON.stringify({...enc, ct: "new"})}, "pw")`);
  assert.equal(h.val("__n"), 2, "a new file is opened");
  await h.run(`studyqOpen(${JSON.stringify({...enc, ct: "new"})}, "other")`);
  assert.equal(h.val("__n"), 3, "so is another password");
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
