"use strict";
// Not achieved: a form that came back below the entrustment mark (3/5 or
// lower) doesn't count. It moves out of the observation list into its own
// (state.missed), so no count, pace, chase or stage unlock ever sees it, and it
// keeps the day it came back for its assessor's turnaround. Full app only.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, obs, state} = require("./harness");

const TODAY = "2026-10-19";
const pending = (d, a, extra) => obs(d, {status: "pending", a, ...extra});
const done = (d, a, ok) => obs(d, {status: "approved", a, ok});
const pendingRow = html => html.slice(html.indexOf('class="card chase"'), html.indexOf("</details>", html.indexOf('class="card chase"')));

test("the pending list: Not achieved takes the form out of every count, keeps the day it came back, and Undo puts it back", () => {
  const h = load({today: TODAY, state: state({c2: [done("2026-08-01", "Brook"), pending("2026-09-01", "Casey", {n: "Clinic"}), pending("2026-09-20", "Drew")]})});
  assert.equal(h.val("Store.partDone('c2')"), 3);
  const row = pendingRow(h.html());
  assert.match(row, /<button class="pillbtn miss" data-action="chasemiss" data-part="c2" data-obs="1">Not achieved<\/button>/);
  assert.match(row, /data-action="chaseok" data-part="c2" data-obs="1">Approved</);
  h.click("chasemiss", {part: "c2", obs: "1"});
  assert.deepEqual(h.saved().obs.c2.map(o => o.a), ["Brook", "Drew"]);
  assert.deepEqual(h.saved().missed.c2, [{d: "2026-09-01", status: "missed", a: "Casey", n: "Clinic", ts: "2026-09-01T18:00:00.000Z", ok: TODAY}]);
  assert.equal(h.val("Store.partDone('c2')"), 2);
  assert.equal(h.val("Store.partPending('c2')"), 1);
  assert.equal(h.val("chaseList(Store.state.obs, getToday()).length"), 1);
  assert.match(h.html(), /C2 marked not achieved\. It won't count toward C2\./);
  h.click("undo");
  assert.deepEqual(h.saved().obs.c2.map(o => [o.a, o.status, o.ok]), [["Brook", "approved", undefined], ["Casey", "pending", undefined], ["Drew", "pending", undefined]]);
  assert.deepEqual(h.saved().missed.c2, []);
});

test("the sheet: a third status, Not achieved, for a new form or an edited one", () => {
  const h = load({today: TODAY, state: state({c2: [pending("2026-10-01", "Brook")]})});
  h.click("sheet", {part: "c2", obs: "0"});
  assert.match(h.html(), /data-action="sheetstatus" data-status="missed">.*Not achieved<\/button>/);
  h.click("sheetstatus", {status: "missed"});
  h.click("sheetsave");
  assert.deepEqual(h.saved().obs.c2, []);
  assert.equal(h.saved().missed.c2[0].ok, TODAY);
  // Logged straight as not achieved: no turnaround to tell.
  h.click("sheet", {part: "c3"});
  h.run(`sheet.a = "Casey"; sheet.d = "2026-10-15";`);
  h.click("sheetstatus", {status: "missed"});
  assert.match(h.html(), /Save as not achieved/);
  h.click("sheetsave");
  assert.deepEqual(h.saved().obs.c3, []);
  assert.deepEqual([h.saved().missed.c3[0].a, h.saved().missed.c3[0].status, h.saved().missed.c3[0].ok], ["Casey", "missed", undefined]);
  assert.match(h.html(), /C3 logged as not achieved/);
  h.click("undo");
  assert.deepEqual(h.saved().missed.c3, []);
  assert.deepEqual(h.saved().obs.c3, []);
});

test("checklist lines ticked with a form go back when it's not achieved, and return if it's moved back", () => {
  const h = load({today: TODAY, state: state({})});
  const g = h.val("checklistGroups('c8a', id => 0)[0]");
  h.click("sheet", {part: "c8a"});
  h.click("sheettick", {name: g.name});
  h.click("sheetsave");
  const line = h.saved().obs.c8a[0].tk[0];
  assert.equal(h.val(`Store.lineVal(${JSON.stringify(line)})`), 1);
  h.click("sheet", {part: "c8a", obs: "0"});
  h.click("sheetstatus", {status: "missed"});
  h.click("sheetsave");
  assert.equal(h.val(`Store.lineVal(${JSON.stringify(line)})`), 0);
  h.click("sheet", {part: "c8a", missed: "0"});
  h.click("sheetstatus", {status: "pending"});
  h.click("sheetsave");
  assert.equal(h.val(`Store.lineVal(${JSON.stringify(line)})`), 1);
  assert.equal(h.saved().obs.c8a.length, 1);
});

test("the EPA page lists not-achieved forms apart, greyed, out of the count; each opens to change or delete it", () => {
  const h = load({today: TODAY, state: state({c2: [done("2026-08-01", "Brook")]}, {missed: {c2: [obs("2026-09-01", {status: "missed", a: "Casey", ok: "2026-09-30"})]}})});
  h.click("open", {code: "C2"});
  const html = h.html();
  assert.match(html, /<div class="part-count">1<span>\/\d+<\/span><\/div>/);
  assert.match(html, /<div class="misslist"><span class="mono">Not achieved · doesn't count<\/span>/);
  assert.match(html, /<button class="omiss" data-action="sheet" data-part="c2" data-missed="0">/);
  assert.match(html, /Casey/);
  h.click("sheet", {part: "c2", missed: "0"});
  assert.match(h.html(), /Edit observation/);
  assert.match(h.html(), /class="missed on" data-action="sheetstatus" data-status="missed"/);
  // Delete, with Undo.
  h.click("sheetdelete");
  assert.deepEqual(h.saved().missed.c2, []);
  h.click("undo");
  assert.equal(h.saved().missed.c2[0].a, "Casey");
  // Moved back to approved: it counts again and keeps its day.
  h.click("sheet", {part: "c2", missed: "0"});
  h.click("sheetstatus", {status: "approved"});
  h.click("sheetsave");
  assert.deepEqual(h.saved().missed.c2, []);
  assert.deepEqual(h.saved().obs.c2.map(o => [o.a, o.status, o.ok]), [["Brook", "approved", undefined], ["Casey", "approved", "2026-09-30"]]);
});

test("a not-achieved form still counts toward its assessor's usual turnaround, and its name is still suggested", () => {
  const h = load({today: TODAY, state: state({c2: [done("2026-09-01", "Casey", "2026-09-29"), pending("2026-10-01", "Brook")]},
    {missed: {c3: [obs("2026-09-05", {status: "missed", a: "Casey", ok: "2026-09-25"})]}})});
  assert.deepEqual(h.val("assessorSpeed()"), {casey: {days: 24, n: 2}});
  assert.ok(h.val("assessorNames()").includes("Casey"));
});

test("the backup keeps not-achieved forms; a bad entry is dropped on load", () => {
  const h = load({today: TODAY, state: state({}, {missed: {c2: [obs("2026-09-01", {status: "missed", a: "Casey"})], c3: "junk", zz: [obs("2026-09-01")]}})});
  assert.deepEqual(Object.keys(h.val("Store.state.missed")), ["c2"]);
  const backup = h.val("Store.exportJSON()");
  h.run(`Store.state.missed = {}; Store.importJSON(${JSON.stringify(backup)});`);
  assert.equal(h.val("Store.state.missed.c2[0].a"), "Casey");
});

test("the fellows' edition has no Not achieved", () => {
  const h = load({today: TODAY, edition: "fellows", state: state({c2: [pending("2026-09-01", "Casey")]}, {setup: {d: "2026-09-01"}})});
  assert.doesNotMatch(h.html(), /chasemiss|Not achieved/);
  h.click("sheet", {part: "c2", obs: "0"});
  assert.doesNotMatch(h.html(), /data-status="missed"|Not achieved/);
});
