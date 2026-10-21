"use strict";
// Checklist ticks that belong to a form: a line ticked with a pending form
// shows as pending and counts once the form is approved; editing a form can
// attach its context afterwards (taking over a tick made by hand for it) or
// take it off. The fellows' edition works the same way.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, obs, state} = require("./harness");

const TODAY = "2026-10-21";
const pending = (d, a, extra) => obs(d, {status: "pending", a, ...extra});
const lineOf = (html, id) => (html.match(new RegExp(`<div class="line[^"]*" data-action="cycleline" data-line="${id}"[^]*?</div>`)) || [""])[0];

test("a tick from a pending form shows pending, and counts once the form is approved", () => {
  const h = load({today: TODAY, state: state({})});
  h.click("sheet", {part: "f1b"});
  h.click("sheettick", {name: "Upper GI tract disease"});
  h.click("sheetsave");
  assert.deepEqual(h.val(`["f1b-1"].map(id => [Store.lineVal(id), Store.linePend(id), Store.lineOk(id)])`), [[1, 1, 0]]);
  h.click("open", {code: "F1"});
  let line = lineOf(h.html(), "f1b-1");
  assert.match(line, /^<div class="line lpend"/);
  assert.match(line, /<span class="lbox pend"><svg class="ic" aria-hidden="true"><use href="#i-clock"\/><\/svg><\/span>/);
  assert.match(line, /<span class="llab">1 Upper GI tract disease<span class="lpn mono">Pending<\/span><\/span>/);
  // Approved: an ordinary tick.
  h.click("togglestatus", {part: "f1b", obs: "0"});
  line = lineOf(h.html(), "f1b-1");
  assert.match(line, /^<div class="line ldone"/);
  assert.match(line, /#i-check/);
  assert.doesNotMatch(line, /Pending/);
  // Back to pending, then Not achieved: the tick comes off.
  h.click("togglestatus", {part: "f1b", obs: "0"});
  assert.match(lineOf(h.html(), "f1b-1"), /lpend/);
  h.click("sheet", {part: "f1b", obs: "0"});
  h.click("sheetstatus", {status: "missed"});
  h.click("sheetsave");
  assert.equal(h.saved().lines["f1b-1"], undefined);
});

test("a two-tick line with one pending reads pending until both count", () => {
  const h = load({today: TODAY, state: state({c2: [pending("2026-10-01", "Brook", {tk: ["c2-8"]})]}, {lines: {"c2-8": {v: 2}}})});
  h.click("open", {code: "C2"});
  const line = lineOf(h.html(), "c2-8");
  assert.match(line, /^<div class="line lpend"/);
  assert.match(line, /<span class="lbox pend">2\/2<\/span>/);
  h.click("togglestatus", {part: "c2", obs: "0"});
  assert.match(lineOf(h.html(), "c2-8"), /^<div class="line ldone"/);
});

test("Endo's observed count waits for the form to be approved", () => {
  const h = load({today: TODAY, state: state({c8a: [pending("2026-10-01", "Brook", {tk: ["c8a-1"]})]}, {lines: {"c8a-1": {v: 1}}})});
  const label = h.val(`PART_BY_ID.c8a.items.find(x => x.id === "c8a-1").label.replace(/^\\d+\\s+/, "")`);
  const row = () => h.val(`scopeTherapy([], PART_BY_ID.c8a.items, scopeReportOpts().lineVal).find(r => r.stem === ${JSON.stringify(label)})`);
  assert.equal(row().observed, 0);
  h.run(`Store.setObsStatus("c8a", 0, "approved")`);
  assert.equal(row().observed, 1);
});

test("editing a form attaches its context: it takes over a tick made by hand, else ticks the next line", () => {
  // Upper GI ticked by hand on the EPA page for this pending form.
  const h = load({today: TODAY, state: state({f1b: [pending("2026-10-10", "Brook")]}, {lines: {"f1b-1": {v: 1}}})});
  h.click("sheet", {part: "f1b", obs: "0"});
  assert.deepEqual(h.val("sheet.tick"), []);
  assert.match(h.html(), /<div class="lbl mono">Checklist lines for this form<\/div>/);
  assert.match(h.html(), /data-action="sheettick" data-name="Upper GI tract disease" aria-pressed="false">/);
  h.click("sheettick", {name: "Upper GI tract disease"});
  h.click("sheetsave");
  let s = h.saved();
  assert.deepEqual(s.obs.f1b[0].tk, ["f1b-1"]);
  assert.equal(s.lines["f1b-1"].v, 1);    // the same tick, not a second one
  h.click("open", {code: "F1"});
  assert.match(lineOf(h.html(), "f1b-1"), /lpend/);
  // Its chips show what it holds; another adds the next open line.
  h.click("sheet", {part: "f1b", obs: "0"});
  assert.deepEqual(h.val("sheet.tick"), ["Upper GI tract disease"]);
  h.click("sheettick", {name: "Liver disease"});
  h.click("sheetsave");
  s = h.saved();
  assert.deepEqual(s.obs.f1b[0].tk, ["f1b-1", "f1b-3"]);
  assert.equal(s.lines["f1b-3"].v, 1);
  // Taking a chip off unticks its line.
  h.click("sheet", {part: "f1b", obs: "0"});
  h.click("sheettick", {name: "Upper GI tract disease"});
  h.click("sheetsave");
  s = h.saved();
  assert.deepEqual(s.obs.f1b[0].tk, ["f1b-3"]);
  assert.equal(s.lines["f1b-1"], undefined);
  // Deleting the form takes the rest back.
  h.click("sheet", {part: "f1b", obs: "0"});
  h.click("sheetdelete");
  assert.equal(h.saved().lines["f1b-3"], undefined);
});

test("a line another form holds isn't offered, and Not achieved from the edit sheet ignores chip changes", () => {
  const h = load({today: TODAY, state: state({f1b: [pending("2026-10-10", "Brook", {tk: ["f1b-1"]}), pending("2026-10-12", "Casey")]},
    {lines: {"f1b-1": {v: 1}}})});
  h.click("sheet", {part: "f1b", obs: "1"});
  assert.doesNotMatch(h.html(), /data-name="Upper GI tract disease"/);
  h.click("closesheet");
  h.click("sheet", {part: "f1b", obs: "0"});
  h.click("sheettick", {name: "Liver disease"});
  h.click("sheetstatus", {status: "missed"});
  h.click("sheetsave");
  const s = h.saved();
  assert.equal(s.lines["f1b-1"], undefined);
  assert.equal(s.lines["f1b-3"], undefined);
  assert.deepEqual(s.missed.f1b[0].tk, ["f1b-1"]);
});

test("the fellows' edition: ticks with a form, pending until approved, and its edit sheet re-links them", () => {
  const h = load({today: TODAY, edition: "fellows", state: state({f1b: [pending("2026-10-10", "Brook")]}, {setup: {d: "2026-10-01"}})});
  h.click("sheet", {part: "f1b"});
  h.click("sheettick", {name: "Upper GI tract disease"});
  h.click("sheetsave");
  assert.deepEqual(h.saved().obs.f1b[1].tk, ["f1b-1"]);
  h.run(`go({page: "epa", code: "F1", from: "epas"})`);
  assert.match(lineOf(h.html(), "f1b-1"), /^<div class="line lpend"/);
  // The older form takes on Liver disease from its edit sheet.
  h.click("sheet", {part: "f1b", obs: "0"});
  assert.match(h.html(), /Checklist lines for this form/);
  h.click("sheettick", {name: "Liver disease"});
  h.click("sheetsave");
  assert.deepEqual(h.saved().obs.f1b[0].tk, ["f1b-3"]);
  // Deleted: its line comes off.
  h.click("sheet", {part: "f1b", obs: "0"});
  h.click("sheetdelete");
  assert.equal(h.saved().lines["f1b-3"], undefined);
});
