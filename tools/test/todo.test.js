"use strict";
// To-dos in Agenda: one ask at its time (Done, Tomorrow or Drop it), Tomorrow
// asks once more, then it sits quietly on its day. No badges, no counts. Full
// app only. Placeholder names only.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, state} = require("./harness");

const at = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
const p2 = n => String(n).padStart(2, "0");
const wall = t => { const d = new Date(t); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const todo = (id, t, d, s, x = {}) => ({id, t, d, s, todo: {q: "", tom: 0, done: null, ...x}});
// A phone at a local time with these agenda items.
function phone(now, items = []) {
  const h = load({today: now.slice(0, 10), state: state({}, {agenda: {items}})});
  h.setNow(now);
  return h;
}

test("a to-do keeps its question, its Tomorrows and when it was done, and nothing an event has", () => {
  const h = phone("2026-11-09T14:00");
  const it = h.val(`agItemClean({id: "a1", t: "Reply to the email", d: "2026-11-10", todo: {q: " Did you reply? ", tom: 5, done: "nope"},
    e: "10:00", d2: "2026-11-12", rep: "w", al: ["30"]})`);
  assert.deepEqual([it.s, it.e, it.d2, it.rep, it.al, it.todo], ["08:00", null, null, null, null, {q: "Did you reply?", tom: 2, done: null}]);
  assert.equal(h.val(`agItemClean({id: "a2", t: "Dentist", d: "2026-11-10", s: "09:00"})`).todo, undefined, "an event has no to-do part");
  const done = h.val(`agItemClean({id: "a3", t: "Renew the pass", d: "2026-11-10", s: "16:00", todo: {done: "2026-11-10T21:05:00.000Z", tom: -1}})`);
  assert.deepEqual([done.s, done.todo], ["16:00", {q: "", tom: 0, done: "2026-11-10T21:05:00.000Z"}]);
  // Saved and restored, it stays a to-do.
  h.ctx.__items = [todo("a4", "Send the slides", "2026-11-11", "08:00", {tom: 1})];
  assert.deepEqual(h.val(`agClean({items: __items}).items[0].todo`), {q: "", tom: 1, done: null});
});

test("Done, Tomorrow and Drop it", () => {
  const h = phone("2026-11-10T08:05", [todo("a1", "Reply to the email", "2026-11-10", "08:00"), todo("a2", "Renew the parking pass", "2026-11-10", "08:00")]);
  const a1 = () => h.saved().agenda.items.find(x => x.id === "a1");
  h.click("agtodo", {id: "a1", how: "done"});
  assert.equal(a1().todo.done, new Date(at(2026, 11, 10, 8, 5)).toISOString());
  assert.match(h.html(), /<span>Marked done<\/span><button class="textbtn" data-action="undo">Undo<\/button>/);
  h.click("undo");
  assert.equal(a1().todo.done, null);
  h.click("agtodo", {id: "a1", how: "tomorrow"});
  assert.deepEqual([a1().d, a1().todo.tom], ["2026-11-11", 1]);
  assert.match(h.html(), /<span>Moved to tomorrow<\/span><button class="textbtn" data-action="undo">Undo/);
  h.click("agtodo", {id: "a2", how: "drop"});
  assert.equal(h.saved().agenda.items.some(x => x.id === "a2"), false);
  assert.match(h.html(), /<span>To-do dropped<\/span><button class="textbtn" data-action="undo">Undo/);
  h.click("undo");
  assert.equal(h.saved().agenda.items.some(x => x.id === "a2"), true);
  assert.equal(h.val(`agTodoAnswer("a1", "later", callNow())`), false);
  assert.equal(h.val(`agTodoAnswer("nope", "done", callNow())`), false);
});

test("a to-do asks once, once more after Tomorrow, then never", () => {
  const h = phone("2026-11-09T14:00", [todo("a1", "Reply to the email", "2026-11-10", "08:00", {q: "Did you reply?"}),
    todo("a2", "Renew the parking pass", "2026-11-10", "09:00")]);
  const asks = id => h.val(`alertPlan(callNow())`).filter(a => a.kind === "todo" && a.id.startsWith(id + "@")).map(a => [wall(a.t), a.id]);
  assert.deepEqual(asks("a1"), [["2026-11-10T08:00", "a1@2026-11-10"]]);
  assert.equal(h.val(`alertPlan(callNow())`).some(a => a.kind === "ev" || a.kind === "eve"), false, "no event alerts for a to-do");
  h.run(`agTodoAnswer("a1", "tomorrow", callNow())`);
  assert.deepEqual(asks("a1"), [["2026-11-11T08:00", "a1@2026-11-11"]]);
  h.run(`agTodoAnswer("a1", "tomorrow", callNow())`);
  assert.deepEqual(asks("a1"), [], "after a second Tomorrow it sits quietly on its day");
  assert.equal(h.saved().agenda.items.find(x => x.id === "a1").d, "2026-11-12");
  assert.deepEqual(asks("a2"), [["2026-11-10T09:00", "a2@2026-11-10"]]);
  h.run(`agTodoAnswer("a2", "done", callNow())`);
  assert.deepEqual(asks("a2"), []);
});

test("the ask says the question, or the to-do and Did you do it", () => {
  const h = phone("2026-11-10T07:00", [todo("a1", "Reply to the email", "2026-11-10", "08:00", {q: "Did you reply to the email?"}),
    todo("a2", "Renew the parking pass", "2026-11-10", "08:00")]);
  const t = at(2026, 11, 10, 8), say = (msg, b = `remindBrief(${t})`) => h.val(`noticeFor(${JSON.stringify(msg)}, ${b}, ${t})`);
  assert.deepEqual(say({kind: "todo", t, id: "a1@2026-11-10"}),
    {title: "Did you reply to the email?", body: "Tap for Done, Tomorrow or Drop it.", tag: "gi-todo-a1@2026-11-10", url: "./"});
  assert.deepEqual(say({kind: "todo", t, id: "a2@2026-11-10"}),
    {title: "Renew the parking pass", body: "Did you do it? Tap for Done, Tomorrow or Drop it.", tag: "gi-todo-a2@2026-11-10", url: "./"});
  // One GI Hub hasn't picked up yet: the sender's copy carries its words.
  assert.deepEqual(say({kind: "todo", t, id: "a9b8c7d6e5f@2026-11-10", w: "Call the bank", q: ""}, "null"),
    {title: "Call the bank", body: "Did you do it? Tap for Done, Tomorrow or Drop it.", tag: "gi-todo-a9b8c7d6e5f@2026-11-10", url: "./"});
  assert.deepEqual(say({kind: "todo", t, id: "a9b8c7d6e5f@2026-11-10", w: "Call the bank", q: "Did you call the bank?"}),
    {title: "Did you call the bank?", body: "Tap for Done, Tomorrow or Drop it.", tag: "gi-todo-a9b8c7d6e5f@2026-11-10", url: "./"});
});

test("Week shows today's due to-dos with three answers, and not tomorrow's or done ones", () => {
  const h = phone("2026-11-10T08:30", [
    todo("a1", "Reply to the email", "2026-11-10", "08:00", {q: "Did you reply?"}),
    todo("a2", "Renew the parking pass", "2026-11-10", "16:00"),
    todo("a3", "Send the slides", "2026-11-11", "08:00"),
    todo("a4", "Book the room", "2026-11-10", "07:00", {done: "2026-11-10T12:30:00.000Z"})]);
  h.click("tab", {page: "week"});
  const html = h.html(), i = html.indexOf('<div class="card agtodos">'), card = html.slice(i, html.indexOf("</section>", i));
  assert.ok(i > html.indexOf("</header>") && i < html.indexOf('class="card agnext"'), "under the header, before the Next line");
  assert.match(card, /<span class="mono">To-do · 08:00<\/span><b>Reply to the email<\/b><span>Did you reply\?<\/span>/);
  for (const how of ["done", "tomorrow", "drop"]) assert.match(card, new RegExp(`data-action="agtodo" data-id="a1" data-how="${how}"`));
  assert.doesNotMatch(card, /Renew the parking pass|Send the slides|Book the room/);
  h.click("agtodo", {id: "a1", how: "done"});
  assert.doesNotMatch(h.html(), /class="card agtodos"/);
});

test("the event sheet makes a to-do", () => {
  const h = phone("2026-11-09T14:00");
  h.click("tab", {page: "agenda"});
  h.click("agnew");
  assert.match(h.html(), /<button class="on" data-action="agkind" data-kind="event" aria-pressed="true">Event<\/button><button class="" data-action="agkind" data-kind="todo" aria-pressed="false">To-do<\/button>/);
  h.click("agkind", {kind: "todo"});
  const html = h.html();
  assert.match(html, /aria-label="New to-do"/);
  assert.doesNotMatch(html, /data-ag="e"|data-action="agrep"|data-action="agalert"|data-action="agallday"|data-action="agmulti"/);
  h.run(`agSheet.t = "Call the bank"; agSheet.s = "16:00"`);
  h.click("agsave");
  const it = h.saved().agenda.items[0];
  assert.deepEqual([it.t, it.d, it.s, it.e, it.todo], ["Call the bank", "2026-11-09", "16:00", null, {q: "", tom: 0, done: null}]);
  // Opened again: no switch, and Done, Tomorrow and Drop it beside Save.
  h.click("agopen", {id: it.id});
  const ed = h.html();
  assert.match(ed, /aria-label="Edit to-do"/);
  assert.doesNotMatch(ed, /data-action="agkind"/);
  for (const how of ["done", "tomorrow", "drop"]) assert.match(ed, new RegExp(`data-action="agtodo" data-id="${it.id}" data-how="${how}"`));
  h.click("agclose");
  // A day or time you set yourself asks again, even after two Tomorrows.
  h.run(`agTodoAnswer("${it.id}", "tomorrow", callNow()); agTodoAnswer("${it.id}", "tomorrow", callNow())`);
  h.click("agopen", {id: it.id});
  h.run(`agSheet.s = "17:00"`);
  h.click("agsave");
  assert.deepEqual([h.saved().agenda.items[0].s, h.saved().agenda.items[0].todo.tom], ["17:00", 0]);
  h.click("agnew");
  h.click("agkind", {kind: "todo"});
  h.click("agsave");
  assert.match(h.html(), /Give it a name first\./);
});

test("a to-do's row in Agenda opens it, and a done one is struck through", () => {
  const h = phone("2026-11-10T09:00", [todo("a1", "Reply to the email", "2026-11-10", "08:00"),
    todo("a2", "Book the room", "2026-11-10", "07:00", {done: "2026-11-10T12:30:00.000Z"}),
    todo("a3", "Send the slides", "2026-11-11", "08:00")]);
  h.click("tab", {page: "agenda"});
  const html = h.html();
  assert.match(html, /<button class="ag-row k-todo" data-action="agopen" data-id="a1">/);
  assert.match(html, /<button class="ag-row k-todo done" data-action="agopen" data-id="a2">/);
  assert.match(html, /<h2>Later this week<\/h2>[\s\S]*data-id="a3"/, "a to-do later this week shows with the rest");
  assert.equal(h.val(`agMarks("2026-11-10").ev`), 1, "a done to-do isn't marked");
  assert.equal(h.val(`agNext(callNow())`).id, "a3", "nor is it next");
  h.click("agopen", {id: "a1"});
  assert.match(h.html(), /aria-label="Edit to-do"/);
});
