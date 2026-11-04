"use strict";
// Words being said into a new case, observation or pearl are kept on the
// phone as they're typed, so when iOS closes the app before they're saved they
// come back the next time it opens, marked as not saved yet.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load} = require("./harness");

const KEY = "gi-drafts-v1";
const typeIn = (h, dataset, value) => h.fire("input", {dataset, value});
// The same phone opening the app again after iOS closed it: its storage, a new page.
const reopen = (h, today = "2026-11-03", extra = {}) => load({today, store: h.store, ...extra});

test("a case being said comes back where it was said, marked not saved yet", () => {
  const h = load({today: "2026-11-03"});
  h.setNow("2026-11-03T14:12");
  h.click("scopeopen");
  typeIn(h, {scopefield: "text"}, "EGD with Brook for dysphagia");
  const h2 = reopen(h);
  assert.equal(h2.val("scopeCap.text"), "EGD with Brook for dysphagia");
  assert.equal(h2.val("scopeSheet && scopeSheet.kind"), "capture");
  assert.match(h2.html(), /Restored from 14:12, not saved yet/);
});

test("a new observation's words come back, for the EPA it was for", () => {
  const h = load({today: "2026-11-03"});
  h.setNow("2026-11-03T09:05");
  h.click("sheet", {part: "f3a"});
  typeIn(h, {sheet: "a"}, "Brook");
  typeIn(h, {sheet: "n"}, "EGD, dysphagia");
  const h2 = reopen(h), s = h2.val("sheet");
  assert.deepEqual([s.mode, s.pid, s.a, s.n], ["new", "f3a", "Brook", "EGD, dysphagia"]);
  assert.match(h2.html(), /Restored from 09:05, not saved yet/);
});

test("a new pearl comes back", () => {
  const h = load({today: "2026-11-03"});
  h.setNow("2026-11-03T16:40");
  h.click("pearlnew");
  typeIn(h, {pearl: "t"}, "A teaching point");
  const h2 = reopen(h);
  assert.equal(h2.val("pearlSheet && pearlSheet.t"), "A teaching point");
  assert.match(h2.html(), /Restored from 16:40, not saved yet/);
});

test("saving, Clear or closing the sheet lets the words go", () => {
  const p = load({today: "2026-11-03"});
  p.click("pearlnew"); typeIn(p, {pearl: "t"}, "A teaching point");
  assert.equal(reopen(p).val("pearlSheet.t"), "A teaching point", "kept until then");
  p.click("pearlsave");
  assert.equal(reopen(p).val("pearlSheet"), null);
  const e = load({today: "2026-11-03"});
  e.click("sheet", {part: "f3a"}); typeIn(e, {sheet: "n"}, "EGD");
  assert.equal(reopen(e).val("sheet.n"), "EGD", "kept until then");
  e.click("closesheet");
  assert.equal(reopen(e).val("sheet"), null);
  const c = load({today: "2026-11-03"});
  c.click("scopeopen"); typeIn(c, {scopefield: "text"}, "EGD with Brook");
  const c2 = reopen(c);
  assert.equal(c2.val("scopeCap.text"), "EGD with Brook", "kept until then");
  c2.click("draftclear", {k: "scope"});
  assert.equal(c2.val("scopeCap.text"), "");
  assert.doesNotMatch(c2.html(), /Restored from/);
  assert.equal(reopen(c2).val("scopeCap.text"), "");
});

test("a case said yesterday keeps its day when it's read today", () => {
  const h = load({today: "2026-11-02"});
  h.setNow("2026-11-02T14:12");
  h.click("scopeopen");
  typeIn(h, {scopefield: "text"}, "EGD with Brook for dysphagia");
  const h2 = reopen(h, "2026-11-03");
  assert.match(h2.html(), /Restored from Mon 2 Nov, 14:12, not saved yet/);
  h2.click("scoperead");
  assert.equal(h2.val("scopeCap.cards[0].d"), "2026-11-02");
});

test("after a week the words are let go", () => {
  const said = at => { const h = load({today: at.slice(0, 10)}); h.setNow(at); h.click("scopeopen");
    typeIn(h, {scopefield: "text"}, "EGD with Brook"); return reopen(h, "2026-11-03"); };
  assert.equal(said("2026-10-28T10:00").val("scopeCap.text"), "EGD with Brook", "six days on, still kept");
  const h = said("2026-10-27T10:00");
  assert.equal(h.val("scopeCap.text"), "");
  assert.equal(h.val("scopeSheet"), null);
});

test("only the newest opens; a case's words wait in the box", () => {
  const h = load({today: "2026-11-03"});
  h.setNow("2026-11-03T10:00");
  h.click("scopeopen"); typeIn(h, {scopefield: "text"}, "EGD with Brook");
  h.setNow("2026-11-03T10:05");
  h.click("plusto", {to: "p"}); typeIn(h, {pearl: "t"}, "A teaching point");
  const h2 = reopen(h);
  assert.equal(h2.val("pearlSheet && pearlSheet.t"), "A teaching point");
  assert.equal(h2.val("scopeSheet"), null);
  assert.equal(h2.val("scopeCap.text"), "EGD with Brook");
});

test("it opens by itself once: closed, the words stay in the box without popping up again", () => {
  const h = load({today: "2026-11-03"});
  h.click("scopeopen"); typeIn(h, {scopefield: "text"}, "EGD with Brook");
  const h2 = reopen(h);
  h2.click("scopeclose");
  const h3 = reopen(h2);
  assert.equal(h3.val("scopeSheet"), null);
  assert.equal(h3.val("scopeCap.text"), "EGD with Brook");
});

test("opened from a reminder, its page shows; the words wait for their own EPA", () => {
  const h = load({today: "2026-11-03"});
  h.click("sheet", {part: "f3a"}); typeIn(h, {sheet: "n"}, "EGD, dysphagia");
  const h2 = reopen(h, "2026-11-03", {location: {hash: "#study", pathname: "/", search: ""}});
  assert.equal(h2.val("route.page"), "study");
  assert.equal(h2.val("sheet"), null);
  h2.click("sheet", {part: "c2"});
  assert.equal(h2.val("sheet.n"), "", "another EPA starts empty");
  h2.click("closesheet");
  h2.click("sheet", {part: "f3a"});
  assert.equal(h2.val("sheet.n"), "EGD, dysphagia");
});

test("the fellows' edition keeps nothing", () => {
  const h = load({today: "2026-11-03", edition: "fellows"});
  h.click("sheet", {part: "f3a"});
  typeIn(h, {sheet: "n"}, "EGD");
  assert.equal(h.store.has(KEY), false);
});
