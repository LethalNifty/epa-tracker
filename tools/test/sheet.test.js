"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, obs, state} = require("./harness");

test("the + button opens an empty log sheet; saving without an EPA asks for one", () => {
  const h = load({today: "2026-09-24"});
  h.click("sheet");
  assert.match(h.html(), /<b>Log observation<\/b>/);
  assert.match(h.html(), /This week's EPAs/);
  h.click("sheetsave");
  assert.match(h.html(), /Pick an EPA first\./);
  assert.equal(h.val("Object.keys(Store.state.obs).length"), 0);
});

test("a week row opens the sheet with that EPA picked; save logs it", () => {
  const h = load({today: "2026-09-24"});
  h.click("sheet", {part: "c5"});
  assert.match(h.html(), /class="pick st-core on" data-action="pickpart" data-part="c5"/);
  h.run(`sheet.a = "Dr. A"; sheet.n = "TPN review";`);
  h.click("sheetstatus", {status: "approved"});
  assert.match(h.html(), />Save as approved</);
  h.click("sheetsave");
  const o = h.saved().obs.c5[0];
  assert.deepEqual([o.d, o.a, o.n, o.status], ["2026-09-24", "Dr. A", "TPN review", "approved"]);
  assert.match(o.ts, /^\d{4}-/);
  assert.doesNotMatch(h.html(), /<b>Log observation<\/b>/);
});

test("editing and deleting an observation through the sheet", () => {
  const h = load({today: "2026-09-24", state: state({c5: [obs("2026-09-20", {a: "Dr. A", status: "pending"})]})});
  h.click("open", {code: "C5"});
  assert.match(h.html(), /data-action="sheet" data-part="c5" data-obs="0"/);
  h.click("sheet", {part: "c5", obs: "0"});
  assert.match(h.html(), /<b>Edit observation<\/b>/);
  assert.match(h.html(), /value="Dr\. A"/);
  h.run(`sheet.n = "second look";`);
  h.click("sheetsave");
  assert.equal(h.saved().obs.c5.length, 1);
  assert.equal(h.saved().obs.c5[0].n, "second look");
  h.click("sheet", {part: "c5", obs: "0"});
  h.click("sheetdelete");
  assert.equal(h.saved().obs.c5.length, 0);
});

test("assessor suggestions: most recent first, filtered as you type", () => {
  const h = load({today: "2026-09-24", state: state({c2: [
    {d: "2026-09-01", a: "Dr. A", status: "approved", ts: "2026-09-01T18:00:00Z"},
    {d: "2026-09-10", a: "Dr. B", status: "approved", ts: "2026-09-10T18:00:00Z"},
    {d: "2026-09-11", a: "dr. a", status: "approved", ts: "2026-09-11T18:00:00Z"}]})});
  assert.deepEqual(h.val(`assessorSuggestions("")`), ["dr. a", "Dr. B"]);
  assert.deepEqual(h.val(`assessorSuggestions("b")`), ["Dr. B"]);
  assert.deepEqual(h.val(`assessorSuggestions("dr. b")`), []);
  h.click("sheet", {part: "c2"});
  assert.match(h.html(), /data-action="pickassessor" data-name="dr\. a"/);
  h.click("pickassessor", {name: "Dr. B"});
  assert.equal(h.val("sheet.a"), "Dr. B");
});

test("All EPAs shows every part grouped by stage", () => {
  const h = load({today: "2026-09-24"});
  h.click("sheet");
  h.click("pickall");
  assert.match(h.html(), /<div class="pickgrp mono st-core"><i><\/i>Core<\/div>/);
  assert.equal((h.html().match(/data-action="pickpart"/g) || []).length, 21);
});

test("EPA detail: log button opens the sheet; no emoji or check glyphs left", () => {
  const h = load({today: "2026-09-24", state: state({c2: [obs("2026-09-01", {status: "pending"})]})});
  h.click("open", {code: "C2"});
  assert.match(h.html(), /<button class="logbtn" data-action="sheet" data-part="c2">/);
  assert.doesNotMatch(h.html(), /[\u23F3\u2713]/);
  h.click("sheet", {part: "c2"});
  h.click("closesheet");
  assert.doesNotMatch(h.html(), /class="sheet"/);
});

test("logging shows a toast that can undo it", () => {
  const h = load({today: "2026-09-24"});
  h.click("sheet", {part: "f2"});
  h.click("sheetsave");
  assert.match(h.html(), /F2 logged as pending/);
  assert.equal(h.saved().obs.f2.length, 1);
  h.click("undo");
  assert.equal(h.saved().obs.f2.length, 0);
  assert.doesNotMatch(h.html(), /id="toast"/);
});

test("a deleted observation can be brought back", () => {
  const h = load({today: "2026-09-24", state: state({f2: [obs("2026-09-20", {a: "Dr. A"}), obs("2026-09-21", {a: "Dr. B"})]})});
  h.click("sheet", {part: "f2", obs: "0"});
  h.click("sheetdelete");
  assert.deepEqual(h.saved().obs.f2.map(o => o.a), ["Dr. B"]);
  h.click("undo");
  assert.deepEqual(h.saved().obs.f2.map(o => o.a), ["Dr. A", "Dr. B"]);
});

test("approving from the chase list can be undone", () => {
  const h = load({today: "2026-09-24", state: state({c2: [obs("2026-09-01", {status: "pending"})]})});
  h.click("chaseok", {part: "c2", obs: "0"});
  assert.match(h.html(), /C2 marked approved/);
  h.click("undo");
  assert.equal(h.saved().obs.c2[0].status, "pending");
});

test("date shortcuts: Today is picked by default, Yesterday sets the day before", () => {
  const h = load({today: "2026-09-24"});
  h.click("sheet");
  assert.match(h.html(), /class="pick ghost on" data-action="sheetdate" data-date="2026-09-24">Today/);
  h.click("sheetdate", {date: "2026-09-23"});
  assert.equal(h.val("sheet.d"), "2026-09-23");
  assert.match(h.html(), /class="pick ghost on" data-action="sheetdate" data-date="2026-09-23">Yesterday/);
});

test("the sheet slides in when it opens, not again on every tap inside it", () => {
  const h = load({today: "2026-09-24"});
  h.click("sheet");
  assert.match(h.html(), /class="sheet fresh"/);
  h.click("pickpart", {part: "f2"});
  assert.doesNotMatch(h.html(), /class="sheet fresh"/);
  assert.match(h.html(), /class="sheet"/);
});
