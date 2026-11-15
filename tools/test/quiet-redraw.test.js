"use strict";
// Redraws nobody tapped for (the call clock, study questions landing, the
// fellows' codes check, an update) never happen under an open sheet or while a
// field has the keyboard: a redraw rebuilds the field, which drops the keyboard
// and stops dictation mid-sentence. What changed shows with the next redraw.
// A tapped reminder closes every sheet, and every sheet sinks the page.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, state, many} = require("./harness");

// Counts full redraws from here on.
const counting = h => h.run(`window.__draws = 0; { const r = render; render = function () { __draws++; return r.apply(this, arguments); }; }`);
const settle = () => new Promise(r => setTimeout(r, 40));

test("the call clock waits while the + sheet is up, and redraws once it's gone", () => {
  const h = load({today: "2026-10-12"});
  h.click("scopeopen");
  counting(h);
  h.run(`callKey = "stale"; callTick()`);
  assert.equal(h.val("__draws"), 0);
  h.click("scopeclose");
  h.run(`__draws = 0; callKey = "stale"; callTick()`);
  assert.equal(h.val("__draws"), 1);
});

test("nothing redraws from outside while a field has the keyboard, sheet or not", async () => {
  const h = load({today: "2026-10-12"});
  counting(h);
  h.run(`document.activeElement = {tagName: "TEXTAREA"}; callKey = "stale"; callTick()`);
  h.run(`StudyQ.status = "locked"`);
  await h.run("studyqInit()");
  assert.equal(h.val("__draws"), 0);
  h.run(`document.activeElement = {tagName: "INPUT"}; callTick()`);
  assert.equal(h.val("__draws"), 0);
  h.run(`document.activeElement = null; callTick()`);
  assert.equal(h.val("__draws"), 1);
});

test("study questions landing wait for an Agenda sheet to close", async () => {
  const h = load({today: "2026-10-12"});
  h.click("tab", {page: "agenda"});
  h.click("agnew");
  h.run(`route.page = "week"; StudyQ.status = "locked"`);
  counting(h);
  await h.run("studyqInit()");
  assert.equal(h.val("__draws"), 0);
  assert.equal(h.val("StudyQ.status"), "none");
  h.run(`agSheet = null; StudyQ.status = "locked"`);
  await h.run("studyqInit()");
  assert.equal(h.val("__draws"), 1);
});

test("the fellows' codes check redraws Settings when it's the only sheet, never under another", async () => {
  const h = load({today: "2026-10-16", state: state({d1: many(2, "2026-07-10")})});
  h.run(`globalThis.__n = 0;
    globalThis.fetch = async u => String(u).startsWith("https://gi-hub-fellows.pages.dev/")
      ? {status: 200, ok: true, json: async () => ({ok: true, store: true, total: 1, inUse: 1, tries: [],
          codes: [{id: "f01", code: "K7QM-4TZP", state: "in", dev: "iPhone", where: "Winnipeg, MB", seen: "2026-10-1" + (++__n % 10) + "T14:00:00.000Z", tries: 0}]})}
      : {status: 404, ok: false, text: async () => ""};`);
  h.store.set("gi-watch-v1", JSON.stringify({key: "qx7p-m4rt-9kwd-h3nb"}));
  h.click("open", {code: "F3"});
  h.click("sheet", {part: "f3a"});
  counting(h);
  h.run("watch = null; watchCheck()");
  await settle();
  assert.equal(h.val("__draws"), 0, "not under the EPA sheet");
  h.click("closesheet");
  h.click("setopen");
  h.run("__draws = 0; watchCheck()");
  await settle();
  assert.ok(h.val("__draws") >= 1, "Settings shows the new rows");
  assert.match(h.html(), /Last opened/);
});

test("a tapped reminder closes every sheet, the Agenda ones too", () => {
  const h = load({today: "2026-10-12"});
  h.click("tab", {page: "agenda"});
  h.click("agnew");
  assert.match(h.html(), /class="sheet agsheet/);
  h.run(`appMessage({go: "study"})`);
  assert.equal(h.val("anySheet()"), false);
  assert.doesNotMatch(h.html(), /class="sheet /);
  assert.equal(h.val("route.page"), "study");
});

test("an Agenda sheet sinks the page behind it, like the others", () => {
  const h = load({today: "2026-10-12"});
  h.click("tab", {page: "agenda"});
  assert.doesNotMatch(h.html(), /<main class="page[^"]*\bunder\b/);
  h.click("agnew");
  assert.match(h.html(), /<main class="page[^"]*\bunder\b/);
});
