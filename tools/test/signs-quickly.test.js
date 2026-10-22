"use strict";
// Who signs quickly: the day a pending form is marked approved is kept with it
// (o.ok), and each assessor's usual turnaround shows in the log sheet's
// assessor suggestions and in the pending list. The fellows' edition has it
// too (2026-10-22).
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, obs, state} = require("./harness");

const TODAY = "2026-10-16";
const pending = (d, a) => obs(d, {status: "pending", a});
const done = (d, a, ok) => obs(d, {status: "approved", a, ok});

test("marking a pending form approved keeps the day; back to pending forgets it", () => {
  const h = load({today: TODAY, state: state({c2: [pending("2026-10-01", "Brook")], c3: [pending("2026-09-20", "Casey")]})});
  h.click("togglestatus", {part: "c2", obs: "0"});
  assert.deepEqual([h.saved().obs.c2[0].status, h.saved().obs.c2[0].ok], ["approved", TODAY]);
  h.click("togglestatus", {part: "c2", obs: "0"});
  assert.equal(h.saved().obs.c2[0].status, "pending");
  assert.equal(h.saved().obs.c2[0].ok, undefined);
  // The pending list's Approved button, and its Undo.
  h.click("chaseok", {part: "c3", obs: "0"});
  assert.equal(h.saved().obs.c3[0].ok, TODAY);
  h.click("undo");
  assert.equal(h.saved().obs.c3[0].ok, undefined);
  // Editing a pending form to approved in its sheet.
  h.click("sheet", {part: "c2", obs: "0"});
  h.click("sheetstatus", {status: "approved"});
  h.click("sheetsave");
  assert.equal(h.saved().obs.c2[0].ok, TODAY);
  // Saving an approved form again keeps its day.
  h.setToday("2026-10-20");
  h.click("sheet", {part: "c2", obs: "0"});
  h.run(`sheet.n = "note";`);
  h.click("sheetsave");
  assert.equal(h.saved().obs.c2[0].ok, TODAY);
});

test("a form logged as approved says nothing about turnaround", () => {
  const h = load({today: TODAY, state: state({})});
  h.click("sheet", {part: "c2"});
  h.run(`sheet.a = "Brook";`);
  h.click("sheetstatus", {status: "approved"});
  h.click("sheetsave");
  assert.equal(h.saved().obs.c2[0].status, "approved");
  assert.equal(h.saved().obs.c2[0].ok, undefined);
});

test("each assessor's usual turnaround: the median days, once there are two, one spelling", () => {
  const h = load({today: TODAY, state: state({
    c2: [done("2026-09-01", "Brook", "2026-09-04"), done("2026-09-10", "Dr. Brook", "2026-09-16"), done("2026-09-20", "brook", "2026-09-24")],
    c3: [done("2026-09-01", "Casey", "2026-09-22"), done("2026-09-05", "Casey", "2026-09-26"), done("2026-09-08", "Drew", "2026-09-09")],
    // Approved before the day was kept, or with no assessor: not counted.
    c4: [obs("2026-09-01", {a: "Drew"}), done("2026-09-02", "", "2026-09-03")],
  })});
  assert.deepEqual(h.val("assessorSpeed()"), {brook: {days: 4, n: 3}, casey: {days: 21, n: 2}});
  assert.deepEqual(["same", 1, 4, 13, 14, 21].map(d => h.val(`speedText({days: ${d === "same" ? 0 : d}})`)),
    ["usually the same day", "usually 1 day", "usually 4 days", "usually 13 days", "usually 2 weeks", "usually 3 weeks"]);
});

const SPEEDY = () => state({
  c2: [done("2026-09-01", "Brook", "2026-09-04"), done("2026-09-10", "Brook", "2026-09-14"), pending("2026-09-25", "Brook")],
  c3: [done("2026-09-01", "Casey", "2026-09-22"), done("2026-09-05", "Casey", "2026-09-26"), pending("2026-09-28", "Casey")],
});

test("the log sheet's assessor suggestions show each one's usual turnaround", () => {
  const h = load({today: TODAY, state: SPEEDY()});
  h.click("sheet", {part: "c4"});
  const sugg = h.html().slice(h.html().indexOf('id="sugg"'));
  assert.match(sugg, /data-action="pickassessor" data-name="Brook">Brook<span class="sp">4 d<\/span><\/button>/);
  assert.match(sugg, /data-action="pickassessor" data-name="Casey">Casey<span class="sp">3 wk<\/span><\/button>/);
  // Picking one still fills just the name.
  h.click("pickassessor", {name: "Brook"});
  assert.equal(h.val("sheet.a"), "Brook");
});

test("the pending list says how long each assessor usually takes", () => {
  const html = load({today: TODAY, state: SPEEDY()}).html();
  assert.match(html, /Brook<span class="usual"> · usually 4 days<\/span>/);
  assert.match(html, /Casey<span class="usual"> · usually 3 weeks<\/span>/);
});

test("the fellows' edition keeps the day and shows the turnaround too", () => {
  const h = load({today: TODAY, edition: "fellows", state: state({c2: [pending("2026-10-01", "Brook")]}, {setup: {d: "2026-10-01"}})});
  h.click("togglestatus", {part: "c2", obs: "0"});
  assert.equal(h.saved().obs.c2[0].ok, TODAY);
  h.run(`Store.state.obs.c2.push(${JSON.stringify(done("2026-09-01", "Brook", "2026-09-04"))}); Store.state.obs.c3 = [${JSON.stringify(pending("2026-09-20", "Brook"))}]; render();`);
  h.click("sheet", {part: "c4"});
  assert.match(h.html(), /data-name="Brook">Brook<span class="sp">/);
});
