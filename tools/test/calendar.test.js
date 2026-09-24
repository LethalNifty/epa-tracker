"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, dateExpr} = require("./harness");

const h = load({today: "2026-09-24"});
const blockOn = iso => h.val(`blockFor(${dateExpr(iso)})`);

test("blocks run Thursday to Wednesday from 2026-07-02", () => {
  assert.deepEqual(blockOn("2026-07-01"), {num: 1, name: "Consults HSC", week: 1});
  assert.deepEqual(blockOn("2026-07-02"), {num: 1, name: "Consults HSC", week: 1});
  assert.deepEqual(blockOn("2026-09-23"), {num: 3, name: "Hepatology", week: 4});
  assert.deepEqual(blockOn("2026-09-24"), {num: 4, name: "Motility/Nutrition", week: 1});
  assert.deepEqual(blockOn("2026-10-22"), {num: 5, name: "Consults SBH", week: 1});
  assert.deepEqual(blockOn("2026-11-18"), {num: 5, name: "Consults SBH", week: 4});
  assert.deepEqual(blockOn("2027-06-30"), {num: 13, name: "Consults HSC", week: 4});
  assert.equal(blockOn("2027-07-01"), null);
  assert.equal(blockOn("2026-06-30"), null);
});

test("block math ignores clock time across the November time change", () => {
  assert.deepEqual(h.val(`blockFor(new Date(2026, 10, 19, 0, 0))`), {num: 6, name: "Radiology", week: 1});
  assert.deepEqual(h.val(`blockFor(new Date(2026, 10, 18, 23, 59))`), {num: 5, name: "Consults SBH", week: 4});
});

test("block and week boundaries", () => {
  assert.equal(h.val(`fmtDate(blockStart(5))`), "2026-10-22");
  assert.equal(h.val(`fmtDate(blockEnd(5))`), "2026-11-18");
  assert.equal(h.val(`fmtDate(blockEnd(13))`), "2027-06-30");
  assert.equal(h.val(`fmtDate(weekEnd(4, 1))`), "2026-09-30");
  assert.equal(h.val(`blockDates(5)`), "Oct 22 – Nov 18");
  assert.equal(h.val(`fmtDate(YEAR1_END)`), "2027-06-30");
});

test("an observation counts on its date, else the day it was logged", () => {
  assert.equal(h.val(`fmtDate(attrDate({d: "2026-10-22", ts: "2026-09-01T18:00:00Z"}))`), "2026-10-22");
  assert.equal(h.val(`fmtDate(attrDate({ts: "2026-09-01T18:00:00Z"}))`), "2026-09-01");
  assert.equal(h.val(`attrDate({d: "soon"})`), null);
  assert.equal(h.val(`attrDate({})`), null);
});

test("parts index: 21 parts with labels and short names", () => {
  assert.equal(h.val(`PARTS.length`), 21);
  assert.equal(h.val(`PART_BY_ID.c8a.label`), "C8-A");
  assert.equal(h.val(`PART_BY_ID.c2.label`), "C2");
  assert.equal(h.val(`Object.keys(PART_SHORT).length`), 21);
});
