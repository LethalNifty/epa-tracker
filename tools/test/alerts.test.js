"use strict";
// Agenda alerts and the reminder sender, on the phone: each event's alerts,
// the reminders the phone asks the sender for (alerts.js), what the new
// notifications say, and joining the sender. Full app only. Placeholder names only.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, state} = require("./harness");

const ev = (id, t, d, s, e, x = {}) => ({id, t, d, s, e, ...x});
function agenda(today, items = [], opts = {}) {
  const h = load({today, state: state({}, {agenda: {items}}), ...opts});
  h.click("tab", {page: "agenda"});
  return h;
}

// ---- Each event's alerts ------------------------------------------------------------------

test("a new event alerts the evening before and 30 minutes before, and the sheet can turn either off", () => {
  const h = agenda("2026-11-09");
  h.click("agnew");
  assert.match(h.html(), /<div class="lbl mono">Alerts<\/div><div class="pickrow"><button class="pick ghost on" data-action="agalert" data-al="eve" aria-pressed="true">Evening before<\/button><button class="pick ghost on" data-action="agalert" data-al="30" aria-pressed="true">30 min before<\/button><\/div>/);
  h.run(`agSheet.t = "Dentist"`);
  h.click("agsave");
  const id = h.saved().agenda.items[0].id;
  assert.equal(h.saved().agenda.items[0].al, null, "the usual alerts are kept as no choice made");
  assert.deepEqual(h.val(`agAlerts(agState().items[0])`), ["eve", "30"]);
  h.click("agopen", {id});
  h.click("agalert", {al: "eve"});
  assert.match(h.html(), /data-al="eve" aria-pressed="false">Evening before/);
  h.click("agsave");
  assert.deepEqual(h.saved().agenda.items[0].al, ["30"]);
  h.click("agopen", {id});
  h.click("agalert", {al: "30"});
  h.click("agsave");
  assert.deepEqual(h.saved().agenda.items[0].al, []);
  assert.deepEqual(h.val(`agAlerts(agState().items[0])`), []);
});

test("an all-day event offers only the evening before", () => {
  const h = agenda("2026-11-09");
  h.click("agnew");
  h.click("agallday");
  assert.match(h.html(), /data-al="eve" aria-pressed="true">Evening before<\/button><\/div>/);
  assert.doesNotMatch(h.html(), /data-al="30"/);
  h.run(`agSheet.t = "Conference"`);
  h.click("agsave");
  assert.deepEqual(h.val(`agAlerts(agState().items[0])`), ["eve"]);
  // A timed event made all day keeps only what still applies.
  assert.deepEqual(h.val(`agAlerts({s: null, al: ["eve", "30"]})`), ["eve"]);
  assert.deepEqual(h.val(`agAlerts({s: null, al: ["30"]})`), []);
});

test("alerts survive a save and a restore, and anything else in them is dropped", () => {
  const h = agenda("2026-11-09", [ev("a1", "Dentist", "2026-11-12", "15:30", "16:30", {al: ["30", "loud", "30"]}),
    ev("a2", "Clinic", "2026-11-13", "08:00", "12:00", {al: "eve"})]);
  assert.deepEqual(h.val(`agState().items.map(x => x.al)`), [["30"], null]);
  h.run(`agUpdate("a1", {t: "Dentist, cleaning"})`);
  assert.deepEqual(h.saved().agenda.items[0].al, ["30"]);
  h.run(`window.__snap = agSnapshot(); agRemove("a1"); agRestore(window.__snap)`);
  assert.deepEqual(h.saved().agenda.items.map(x => x.al), [["30"], null]);
});
