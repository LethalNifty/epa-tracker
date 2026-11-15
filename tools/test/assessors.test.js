"use strict";
// Different assessors, counted from the forms: an "N Assessor" checklist line
// is done once N different surnames sit on approved forms, pending when the
// pending ones would make it, and named. A form marked Not achieved or deleted
// drops out at once. The log sheet says whether the assessor typed is new
// here. Full app only. Placeholder names only.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, state, obs} = require("./harness");

// A part with at least three "N Assessor" lines.
const PID = load({today: "2026-10-20"}).val(`PARTS.find(P => P.items.filter(it => /^\\d+ Assessor$/.test(it.label)).length >= 3).id`);
// The part's assessor lines: [number, state, name shown].
const lines = h => {
  const out = [], part = h.html().split('<section class="part').find(s => s.includes(`data-part="${PID}"`)) || "";
  for (const chunk of part.split('<div class="line').slice(1)) {
    const m = /^( ldone| lpend)?"[\s\S]*?<span class="llab">(\d) Assessor(?:<span class="lwho"> · ([^<]*)<\/span>)?/.exec(chunk);
    if (m && !/<div class="line/.test(chunk.slice(0, m.index))) out.push([+m[2], (m[1] || "").trim() || "open", m[3] || ""]);
  }
  return out.slice(0, 3);
};
const page = st => {
  const h = load({today: "2026-10-20", state: st});
  h.run(`route = {page: "epa", code: PART_BY_ID[${JSON.stringify(PID)}].code || ${JSON.stringify(PID)}.toUpperCase()}; render();`);
  return h;
};

test("approved forms tick the assessor lines by surname; a pending one shows as pending", () => {
  const h = page(state({[PID]: [obs("2026-09-01", {a: "Brook"}), obs("2026-09-08", {a: "Dr. brook"}), obs("2026-09-15", {a: "Casey"}),
    obs("2026-10-01", {a: "Drew", status: "pending"})]}));
  assert.deepEqual(lines(h), [[1, "ldone", "Brook"], [2, "ldone", "Casey"], [3, "lpend", "Drew"]]);
});

test("a form marked Not achieved or deleted drops out of the count at once", () => {
  const h = page(state({[PID]: [obs("2026-09-01", {a: "Brook"}), obs("2026-09-15", {a: "Casey"})]}));
  assert.deepEqual(lines(h).map(x => x[1]), ["ldone", "ldone", "open"]);
  h.run(`Store.missObs(${JSON.stringify(PID)}, 1); render();`);
  assert.deepEqual(lines(h), [[1, "ldone", "Brook"], [2, "open", ""], [3, "open", ""]]);
  h.run(`Store.removeObs(${JSON.stringify(PID)}, 0); render();`);
  assert.deepEqual(lines(h).map(x => x[1]), ["open", "open", "open"]);
});

test("a tick made by hand still counts (forms from Entrada with no name)", () => {
  const st = state({[PID]: [obs("2026-09-01", {a: "Brook"})]});
  const h = page(st);
  const id = h.val(`PART_BY_ID[${JSON.stringify(PID)}].items.find(it => it.label === "2 Assessor").id`);
  h.click("cycleline", {line: id, target: 1});
  assert.deepEqual(lines(h).map(x => x[1]), ["ldone", "ldone", "open"]);
});

test("the log sheet says whether the assessor typed is new for this EPA", () => {
  const h = load({today: "2026-10-20", state: state({[PID]: [obs("2026-09-01", {a: "Brook"})]})});
  h.click("sheet", {part: PID});
  h.fire("input", {dataset: {sheet: "a"}, value: "brook"});
  assert.match(h.val("assessorHint(sheet.pid, sheet.a, sheet.mode)"), /^brook already counts here\. This EPA needs \d+ more different assessors?\.$/);
  h.fire("input", {dataset: {sheet: "a"}, value: "Ellis"});
  h.run("render()");
  assert.match(h.html(), /<p class="ahint" id="ahint" aria-live="polite">A new assessor here: 2 of \d different once it&#39;s approved\.<\/p>|<p class="ahint" id="ahint" aria-live="polite">A new assessor here: 2 of \d different once it's approved\.<\/p>/);
});

test("the fellows' edition shows no names or hints", () => {
  const h = load({today: "2026-10-20", edition: "fellows", state: state({[PID]: [obs("2026-09-01", {a: "Brook"})]}, {setup: {d: "2026-07-01"}})});
  h.run(`route = {page: "epa", code: PART_BY_ID[${JSON.stringify(PID)}].code || ${JSON.stringify(PID)}.toUpperCase()}; render();`);
  assert.doesNotMatch(h.html(), /class="lwho"/);
  assert.equal(h.val(`assessorHint(${JSON.stringify(PID)}, "Ellis", "new")`), "");
});
