"use strict";
// Tell GI Hub picks an event's colour from what was said: Work, Social or
// Travel; anything else, or unsure, stays Personal.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {load, ROOT} = require("./harness");

const mod = f => import(pathToFileURL(path.join(ROOT, "tools", "agenda", f)).href);
const item = {id: "iaaaaaaaaaa", text: "x", said: "2026-11-22T10:00:00-05:00", off: -300};

test("the sender keeps an event's colour when it's work, social or travel, and nothing else", async () => {
  const {resultClean} = await mod("tell.mjs");
  const c = x => resultClean({kind: "event", t: "GI rounds", d: "2026-11-26", s: "12:00", ...x}, item);
  assert.equal(c({c: "work"}).c, "work");
  assert.equal(c({c: "soc"}).c, "soc");
  assert.equal(c({c: "trav"}).c, "trav");
  assert.equal("c" in c({c: "pers"}), false);
  assert.equal("c" in c({c: "blue"}), false);
  assert.equal("c" in c({}), false);
  assert.equal("c" in resultClean({kind: "todo", t: "Reply", c: "work"}, item), false);
});

test("an event Claude filed keeps its colour on the phone", () => {
  const h = load({today: "2026-11-22"});
  h.run(`tellApply({id: "a1b2c3d4e5f", kind: "event", t: "GI rounds", d: "2026-11-26", s: "12:00", c: "work", line: "GI rounds"}, Date.now())`);
  assert.equal(h.val(`agState().items.find(x => x.id === "a1b2c3d4e5f").c`), "work");
});

test("the test set checks the colour when it wants one, and Personal means none", async () => {
  const {tellScore} = await mod("tell-tests.mjs");
  const at = "2026-11-22T10:00:00-05:00", tests = [
    {say: "GI rounds Thursday at noon", at, want: [{kind: "event", d: "2026-11-26", s: "12:00", c: "work", words: ["rounds"]}]},
    {say: "Dentist Friday at 9", at, want: [{kind: "event", d: "2026-11-27", s: "09:00", c: "pers", words: ["dentist"]}]},
  ];
  const rounds = {kind: "event", t: "GI rounds", d: "2026-11-26", s: "12:00"}, dentist = {kind: "event", t: "Dentist", d: "2026-11-27", s: "09:00"};
  assert.equal(tellScore(tests, {0: [{...rounds, c: "work"}]}).right, 1);
  assert.equal(tellScore(tests, {0: [rounds]}).right, 0, "rounds wanted as Work");
  assert.equal(tellScore(tests, {1: [dentist]}).right, 1);
  assert.equal(tellScore(tests, {1: [{...dentist, c: "soc"}]}).right, 0, "the dentist wanted as Personal");
});

test("Tell's rules teach the colours", () => {
  const md = fs.readFileSync(path.join(ROOT, "tools", "agenda", "TELL.md"), "utf8");
  assert.match(md, /^- `c`: /m);
  for (const k of ["work", "soc", "trav"]) assert.match(md, new RegExp(`"c": "${k}"`), k);
});

test("the test set has a sentence for each colour", async () => {
  const {TELL_TESTS} = await mod("tell-tests.mjs");
  const cs = TELL_TESTS.flatMap(t => t.want.map(w => w.c).filter(Boolean));
  for (const k of ["work", "pers", "soc", "trav"]) assert.ok(cs.includes(k), k);
});

test("a miss on colour says which colour was wanted and which came", () => {
  const h = load({today: "2026-11-22"});
  const words = m => h.val(`tellMissWords(${JSON.stringify(m)})`);
  assert.equal(words({say: "Dentist Friday at 9", want: [{kind: "event", d: "2026-11-13", s: "09:00", c: "pers", words: ["dentist"]}],
    got: [{kind: "event", t: "Dentist", d: "2026-11-13", s: "09:00", c: "soc"}]}), "Wanted event 2026-11-13 09:00 Personal; got event 2026-11-13 09:00 Social");
  assert.equal(words({say: "GI rounds", want: [{kind: "event", d: "2026-11-26", s: "12:00", c: "work"}], got: [{kind: "event", d: "2026-11-26", s: "12:00"}]}),
    "Wanted event 2026-11-26 12:00 Work; got event 2026-11-26 12:00 Personal");
  assert.equal(words({say: "Two things", want: [{kind: "event", d: "2026-11-26"}, {kind: "event", d: "2026-11-27"}], got: []}),
    "Wanted event 2026-11-26, event 2026-11-27; got nothing");
});
