"use strict";
// Notes on the Agenda page: things in your own words (from Tell GI Hub, or the
// + box) that you can turn into an event or a to-do, or delete with Undo. Full
// app only. Placeholder names only.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, state} = require("./harness");

// The Agenda page at a local time with these notes (and events).
function notesPage(now, notes, items = []) {
  const h = load({today: now.slice(0, 10), state: state({}, {agenda: {items, notes}})});
  h.setNow(now);
  h.click("tab", {page: "agenda"});
  return h;
}

test("notes survive a reload and a restore, blanks and doubles dropped", () => {
  const h = notesPage("2026-11-09T14:00", [{id: "n1", t: " The clinic parking moved to level 3 ", ts: "2026-11-09T19:00:00.000Z"},
    {id: "n2", t: "   "}, {id: "n1", t: "A second note with the same id"}, {id: "bad id", t: "Bring the badge"}, 5, null]);
  const notes = h.val("agState().notes");
  assert.deepEqual(notes.map(n => n.t), ["The clinic parking moved to level 3", "Bring the badge"]);
  assert.deepEqual([notes[0].id, notes[0].ts], ["n1", "2026-11-09T19:00:00.000Z"]);
  assert.match(notes[1].id, /^n[a-z0-9]{1,24}$/);
  assert.deepEqual([h.val("agBlank().notes"), h.val("agClean(undefined).notes")], [[], []]);
  // Adding: a new id, the same id again makes no second note, blank words make none.
  const id = h.val(`agAddNote(" Ask about the parking pass ")`);
  assert.match(id, /^n[a-z0-9]{1,24}$/);
  assert.equal(h.val(`agAddNote("Said again", ${JSON.stringify(id)})`), id);
  assert.equal(h.val(`agAddNote("From Claude", "nabc123defg")`), "nabc123defg");
  assert.equal(h.val(`agAddNote("   ")`), null);
  assert.deepEqual(h.saved().agenda.notes.map(n => n.t), ["The clinic parking moved to level 3", "Bring the badge", "Ask about the parking pass", "From Claude"]);
  // As long as anything said can be (Claude files what it can't place as a note in your words).
  assert.equal(h.val(`agAddNote("x".repeat(4100))`) && h.val("agState().notes").at(-1).t.length, 4000);
  // At most 100: the oldest go first.
  h.run(`for (let i = 0; i < 120; i++) agAddNote("Note " + i)`);
  assert.equal(h.val("agState().notes").length, 100);
  assert.equal(h.val("agState().notes").at(-1).t, "Note 119");
  // A reload, and a backup restored on another phone, keep them.
  const h2 = load({today: "2026-11-09", state: h.saved()});
  assert.equal(h2.val("agState().notes").length, 100);
  const backup = h.val("Store.exportJSON()"), h3 = load({today: "2026-11-09"});
  assert.equal(h3.val(`Store.importJSON(${JSON.stringify(backup)}).ok`), true);
  assert.deepEqual(h3.saved().agenda.notes.map(n => n.t), h.saved().agenda.notes.map(n => n.t));
});

test("a note becomes an event, and leaves Notes when it's saved", () => {
  const h = notesPage("2026-11-09T14:00", [{id: "n1", t: "Coffee with Brook Thursday", ts: ""}, {id: "n2", t: "The clinic parking moved to level 3", ts: ""}]);
  let html = h.html();
  const i = html.indexOf('<div class="card ag-notes">');
  assert.ok(i > 0 && i < html.indexOf('class="card ag-links"'), "above the links card");
  assert.match(html, /<h2>Notes<\/h2>/);
  assert.ok(html.indexOf("The clinic parking") < html.indexOf("Coffee with Brook"), "newest first");
  for (const a of ["agnoteev", "agnotetodo", "agnotedel"]) assert.match(html, new RegExp(`data-action="${a}" data-id="n1"`));
  h.click("agnoteev", {id: "n1"});
  html = h.html();
  assert.match(html, /aria-label="New event"/);
  assert.match(html, /value="Coffee with Brook Thursday" data-ag="t"/);
  // Closing the sheet keeps the note.
  h.click("agclose");
  assert.equal(h.val("agState().notes").length, 2);
  h.click("agnoteev", {id: "n1"});
  h.run(`agSheet.d = "2026-11-12"; agSheet.s = "10:00"; agSheet.e = "11:00"`);
  h.click("agsave");
  let a = h.saved().agenda;
  assert.deepEqual(a.items.map(x => [x.t, x.d, x.s, x.e]), [["Coffee with Brook Thursday", "2026-11-12", "10:00", "11:00"]]);
  assert.deepEqual(a.notes.map(n => n.id), ["n2"]);
  assert.match(h.html(), /<span>Coffee with Brook Thursday added<\/span><button class="textbtn" data-action="undo">Undo/);
  // Undo takes the event away and puts the note back.
  h.click("undo");
  a = h.saved().agenda;
  assert.deepEqual([a.items.length, a.notes.map(n => n.id)], [0, ["n1", "n2"]]);
  // A note longer than a title: What takes the start, Note keeps every word.
  const long = "Ask the program office about the parking pass, the call room key, the badge for the new site and the locker. ".repeat(2).trim();
  h.run(`agAddNote(${JSON.stringify(long)}, "n3")`);
  h.click("agnoteev", {id: "n3"});
  assert.ok(h.val("agSheet.t").length <= 120);
  assert.ok(long.startsWith(h.val("agSheet.t")));
  assert.equal(h.val("agSheet.n"), long);
});

test("a note longer than an event's Note stays on the list after it becomes one", () => {
  const long = "Ask the program office about the parking pass and the call room key. ".repeat(10).trim();
  const h = notesPage("2026-11-09T14:00", [{id: "n1", t: long, ts: ""}]);
  assert.ok(long.length > 500);
  h.click("agnoteev", {id: "n1"});
  h.click("agsave");
  const a = h.saved().agenda;
  assert.equal(a.items.length, 1);
  assert.deepEqual(a.notes.map(n => [n.id, n.t]), [["n1", long]], "every word still there");
});

test("a note becomes a to-do the same way", () => {
  const h = notesPage("2026-11-09T14:00", [{id: "n1", t: "Renew the parking pass", ts: ""}]);
  h.click("agnotetodo", {id: "n1"});
  const html = h.html();
  assert.match(html, /aria-label="New to-do"/);
  assert.match(html, /data-kind="todo" aria-pressed="true"/);
  assert.match(html, /value="Renew the parking pass" data-ag="t"/);
  h.run(`agSheet.s = "16:00"`);
  h.click("agsave");
  const a = h.saved().agenda;
  assert.deepEqual(a.items.map(x => [x.t, x.d, x.s, x.todo]), [["Renew the parking pass", "2026-11-09", "16:00", {q: "", tom: 0, done: null}]]);
  assert.deepEqual(a.notes, []);
  // A to-do keeps a note of its own, shown in its sheet.
  h.click("agopen", {id: a.items[0].id});
  assert.match(h.html(), /data-ag="n"/);
});

test("deleting a note can be undone", () => {
  const h = notesPage("2026-11-09T14:00", [{id: "n1", t: "The clinic parking moved to level 3", ts: ""}]);
  h.click("agnotedel", {id: "n1"});
  assert.deepEqual(h.saved().agenda.notes, []);
  assert.match(h.html(), /<span>Note deleted<\/span><button class="textbtn" data-action="undo">Undo<\/button>/);
  assert.doesNotMatch(h.html(), /<h2>Notes<\/h2>/);
  h.click("undo");
  assert.deepEqual(h.saved().agenda.notes.map(n => [n.id, n.t]), [["n1", "The clinic parking moved to level 3"]]);
  assert.equal(h.val(`agRemoveNote("nope")`), false);
});

test("no Notes section when there are none", () => {
  const h = notesPage("2026-11-09T14:00", []);
  assert.doesNotMatch(h.html(), /ag-notes|<h2>Notes<\/h2>/);
});
