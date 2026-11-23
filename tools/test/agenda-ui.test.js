"use strict";
// The Agenda tab: the bar with the + in the middle, Day, Week and Month, the event
// sheet, your usual week, Add from file, and Week's Next line. Full app only.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {load, state, ROOT} = require("./harness");

const sample = fs.readFileSync(path.join(ROOT, "tools", "test", "fixtures", "call-sample.ics"), "utf8");
const ev = (id, t, d, s, e, x = {}) => ({id, t, d, s, e, ...x});
function agenda(today, items = [], opts = {}) {
  const h = load({today, state: state({}, {agenda: {items}})});
  if (opts.call) { h.ctx.__src = sample; h.run(`callImport(__src, "call-sample.ics"); toast = null`); }
  if (opts.now) h.setNow(opts.now);
  h.click("tab", {page: "agenda"});
  return h;
}
const tabs = html => [...html.slice(html.indexOf('<nav class="bnav"')).matchAll(/data-action="tab" data-page="(\w+)"/g)].map(m => m[1]);

// ---- The bar --------------------------------------------------------------------------------
test("the full app's bar: three tabs, the + in the middle, three tabs", () => {
  const h = load({today: "2026-10-27"});
  const html = h.html();
  assert.deepEqual(tabs(html), ["week", "agenda", "epas", "study", "endo", "guides"]);
  const nav = html.slice(html.indexOf('<nav class="bnav"')), plus = nav.indexOf('<button class="fab mid" data-action="scopeopen" aria-label="Log a case">');
  assert.ok(nav.indexOf('data-page="epas"') < plus && plus < nav.indexOf('data-page="study"'));
  assert.doesNotMatch(html, /fab float/);
  assert.match(html, /data-page="week"[^>]*><svg class="ic" aria-hidden="true"><use href="#i-dial"\/><\/svg><span>Week<\/span>/);
  assert.match(html, /data-page="agenda"[^>]*><svg class="ic" aria-hidden="true"><use href="#i-week"\/><\/svg><span>Agenda<\/span>/);
});

test("the fellows' bar doesn't change, and Agenda isn't theirs to open", () => {
  const h = load({today: "2026-10-27", edition: "fellows", state: state({}, {setup: {d: "2026-10-01"}})});
  const html = h.html();
  assert.deepEqual(tabs(html), ["week", "epas", "endo", "guides"]);
  assert.match(html, /fab float/);
  assert.doesNotMatch(html, /fab mid|data-page="agenda"/);
  h.run(`go({page: "agenda"})`);
  assert.equal(h.val("route.page"), "week");
});

test("Agenda opens from the bar", () => {
  const h = agenda("2026-10-27");
  assert.equal(h.val("route.page"), "agenda");
  assert.match(h.html(), /<h1 class="title">Agenda<\/h1>/);
  assert.match(h.html(), /data-page="agenda" aria-current="page"/);
});

// ---- The page -------------------------------------------------------------------------------
const strip = html => [...html.matchAll(/<button class="ws([^"]*)" data-action="agday" data-day="([\d-]+)"/g)].map(m => [m[2], m[1].trim()]);
const heads = html => [...html.matchAll(/<button class="kal-head([^"]*)" data-action="agview" data-view="d" data-day="([\d-]+)"/g)].map(m => [m[2], m[1].trim()]);
const cells = html => [...html.matchAll(/<button class="kal-mc([^"]*)" data-action="agday" data-day="([\d-]+)"/g)].map(m => [m[2], m[1].trim()]);
const title = html => (html.match(/<b class="kal-title">([^<]*)<\/b>/) || [])[1];

test("Day, Week and Month, opening on Day", () => {
  const h = agenda("2026-10-27");
  assert.match(h.html(), /<div class="segtabs three ag-seg" role="group" aria-label="Agenda views"><button class="on" data-action="agview" data-view="d" aria-current="page">Day<\/button><button class="" data-action="agview" data-view="w">Week<\/button><button class="" data-action="agview" data-view="m">Month<\/button><\/div>/);
});

test("Day: the week strip, then the day's hours to scale: work as a band, your events as long as they last", () => {
  const h = agenda("2026-10-27", [ev("a1", "Dentist", "2026-10-29", "16:30", "17:30")], {call: true});
  let html = h.html();
  assert.equal(title(html), "Today · Tue 27 Oct");
  assert.deepEqual(strip(html), [["2026-10-26", ""], ["2026-10-27", "today sel"], ["2026-10-28", ""], ["2026-10-29", ""],
    ["2026-10-30", ""], ["2026-10-31", ""], ["2026-11-01", ""]]);
  // 07:00 to 22:00, 54px an hour: work from 08:00 to 18:00.
  assert.match(html, /<div class="kal-body" style="height:810px">/);
  assert.match(html, /<div class="kal-band work" style="top:54px;height:540px"><span class="mono">Consults SBH<\/span><\/div>/);
  assert.match(html, /<button class="kal-slot" data-action="agslot" data-day="2026-10-27" data-at="07:00"/);
  // Call: a band with its words, to Call.
  h.click("agday", {day: "2026-10-28"});
  assert.match(h.html(), /<div class="kal-band call" style="[^"]*"><button class="kal-calllbl mono" data-action="agcall">On call/);
  h.click("agstep", {step: "1"});
  html = h.html();
  assert.equal(h.val("agSel"), "2026-10-29");
  assert.equal(title(html), "Thu 29 Oct");
  assert.match(html, /<button class="kal-ev k-ev" data-action="agopen" data-id="a1" style="top:514px;height:52px;[^"]*"><b>Dentist<\/b><span class="mono">16:30–17:30<\/span><i class="kal-bell" aria-label="2 alerts">/);
  h.click("agstep", {step: "-4"});
  assert.deepEqual(strip(h.html())[0], ["2026-10-19", ""]);
  h.click("agtoday");
  assert.equal(h.val("agSel"), "2026-10-27");
});

test("Day: an empty hour opens a new event at that hour, for an hour", () => {
  const h = agenda("2026-10-27");
  h.click("agslot", {day: "2026-10-28", at: "15:00"});
  assert.match(h.html(), /aria-label="New event"/);
  assert.deepEqual(h.val("[agSheet.d, agSheet.s, agSheet.e, agSheet.allDay]"), ["2026-10-28", "15:00", "16:00", false]);
});

test("Day: events that overlap sit side by side, or one over the other when it starts later", () => {
  const h = agenda("2026-11-23", [ev("a1", "Clinic", "2026-11-23", "13:00", "17:00"), ev("a2", "Call the lab", "2026-11-23", "13:15", "13:45"),
    ev("a3", "Meeting", "2026-11-23", "15:00", "16:00")]);
  const html = h.html(), block = id => (html.match(new RegExp(`<button class="kal-ev[^"]*" data-action="agopen" data-id="${id}" style="([^"]*)"`)) || [])[1];
  assert.match(block("a1"), /left:calc\(0px \+ 0 \* \(100% - 0px - 3px\) \/ 2 \+ 2px\);width:calc\(\(100% - 0px - 3px\) \/ 2 - 2px\)/);
  assert.match(block("a2"), /left:calc\(0px \+ 1 \* \(100% - 0px - 3px\) \/ 2 \+ 2px\)/);
  assert.match(block("a3"), /left:calc\(28px \+ 0 \* \(100% - 28px - 3px\) \/ 1 \+ 2px\)/);
  assert.match(html, /<button class="kal-ev k-ev over" data-action="agopen" data-id="a3"/);
});

test("Day: the hours widen for an early event, and an all-day event sits above them", () => {
  const h = agenda("2026-11-23", [ev("a1", "Flight", "2026-11-23", "05:30", "07:00"), ev("a2", "Away", "2026-11-23", null, null, {d2: "2026-11-25"})]);
  const html = h.html();
  assert.match(html, /<div class="kal-gut mono"><span style="top:0px">05:00<\/span>/);
  assert.match(html, /<div class="kal-allday" style="--n:1"><span class="mono">all day<\/span><div class="kal-lanes"><button class="kal-bar k-all" data-action="agopen" data-id="a2" style="grid-column:1 \/ span 1;grid-row:1">Away<\/button>/);
});

test("Week: 7 days from Monday, or 3 from the chosen day; a day's head opens it", () => {
  const h = agenda("2026-10-27", [ev("a1", "Dentist", "2026-10-29", "16:30", "17:30")], {call: true});
  h.click("agview", {view: "w"});
  let html = h.html();
  assert.equal(title(html), "26 Oct – 1 Nov");
  assert.deepEqual(heads(html), [["2026-10-26", ""], ["2026-10-27", "today sel"], ["2026-10-28", ""], ["2026-10-29", ""],
    ["2026-10-30", ""], ["2026-10-31", ""], ["2026-11-01", ""]]);
  assert.match(html, /<button class="pick ghost on" data-action="agwd" data-n="7" aria-pressed="true">7 days<\/button><button class="pick ghost" data-action="agwd" data-n="3" aria-pressed="false">3 days<\/button>/);
  assert.match(html, /<div class="card kal-grid multi narrow" lang="en" style="--n:7;--h:34px">/);
  assert.match(html, /data-action="agopen" data-id="a1"/);
  h.click("agwd", {n: "3"});
  html = h.html();
  assert.equal(title(html), "27 – 29 October");
  assert.deepEqual(heads(html).map(x => x[0]), ["2026-10-27", "2026-10-28", "2026-10-29"]);
  assert.match(html, /<div class="card kal-grid multi" lang="en" style="--n:3;--h:46px">/);
  h.click("agstep", {step: "1"});
  assert.equal(title(h.html()), "30 Oct – 1 Nov");
  h.click("agview", {view: "d", day: "2026-10-31"});
  assert.deepEqual([h.val("agView"), h.val("agSel"), title(h.html())], ["d", "2026-10-31", "Sat 31 Oct"]);
});

test("Month: each day with what's on it by name, the chosen day's rows under it, and the colours' key", () => {
  const h = agenda("2026-10-27", [ev("a1", "Dentist", "2026-10-29", "16:30", "17:30")], {call: true});
  h.click("agview", {view: "m"});
  let html = h.html();
  assert.equal(title(html), "October 2026");
  const c = cells(html);
  assert.equal(c.length, 35);
  assert.deepEqual([c[0][0], c[34][0]], ["2026-09-28", "2026-11-01"]);
  assert.equal(c.find(x => x[0] === "2026-10-27")[1], "today sel");
  assert.equal(c[0][1], "out past");
  assert.match(html, /<span class="kal-chip k-ev">Dentist<\/span>/);
  assert.match(html, /<span class="kal-chip k-call">Call<\/span>/);
  assert.match(html, /<span class="kal-chip k-hol">[^<]+<\/span>/);
  assert.match(html, /<span><i class="kal-sw c-work"><\/i>Work<\/span><span><i class="kal-sw c-pers"><\/i>Personal<\/span><span><i class="kal-sw c-soc"><\/i>Social<\/span><span><i class="kal-sw c-trav"><\/i>Travel<\/span>/);
  assert.match(html, /<h2>Today · Tue 27 Oct<\/h2><button class="textbtn sm" data-action="agview" data-view="d" data-day="2026-10-27">Open the day<\/button>/);
  h.click("agday", {day: "2026-10-29"});
  assert.match(h.html(), /<h2>Thu 29 Oct<\/h2>[^]*?Dentist/);
  assert.equal(title(h.html()), "October 2026");
  h.click("agstep", {step: "1"});
  html = h.html();
  assert.equal(title(html), "November 2026");
  assert.equal(cells(html)[0][0], "2026-10-26");
  assert.equal(h.val("agSel"), "2026-11-01");
});

test("call goes to Call and back; reading goes to Study", () => {
  const h = agenda("2026-10-28", [], {call: true});
  assert.match(h.html(), /<button class="kal-calllbl mono" data-action="agcall">On call/);
  h.click("agcall");
  assert.equal(h.val("route.page"), "call");
  assert.match(h.html(), /data-page="agenda" aria-current="page"/);
  assert.match(h.html(), /<button class="back" data-action="back">[^]*?Agenda<\/button>/);
  const g = agenda("2026-10-27");
  assert.match(g.html(), /<button class="kal-ev k-read" data-action="agstudy"/);
  g.click("agstudy");
  assert.equal(g.val("route.page"), "study");
});

// ---- The event sheet --------------------------------------------------------------------------
test("Add: a sheet on the chosen day, 9 to 10; it needs a name and an end after its start; Undo takes it back", () => {
  const h = agenda("2026-10-27");
  h.click("agday", {day: "2026-10-29"});
  h.click("agnew");
  assert.match(h.html(), /role="dialog" aria-modal="true" aria-label="New event"/);
  assert.deepEqual(h.val("[agSheet.d, agSheet.s, agSheet.e, agSheet.allDay, agSheet.rep]"), ["2026-10-29", "09:00", "10:00", false, null]);
  h.click("agsave");
  assert.match(h.html(), /Give it a name first\./);
  h.fire("input", {dataset: {ag: "t"}, value: "Dentist"});
  h.run(`agSheet.s = "15:00"; agSheet.e = "14:00"`);
  h.click("agsave");
  assert.match(h.html(), /It ends before it starts\./);
  h.run(`agSheet.e = "16:00"`);
  h.click("agsave");
  assert.equal(h.val("agSheet"), null);
  assert.deepEqual(h.saved().agenda.items.map(x => [x.t, x.d, x.s, x.e]), [["Dentist", "2026-10-29", "15:00", "16:00"]]);
  assert.match(h.html(), /Dentist added/);
  h.click("undo");
  assert.deepEqual(h.saved().agenda.items, []);
});

test("All day hides the times, Ends another day asks for the last day, Repeats picks how often", () => {
  const h = agenda("2026-10-27");
  h.click("agnew");
  h.run(`agSheet.t = "Florida"; agSheet.d = "2026-11-13"`);
  h.click("agallday");
  assert.doesNotMatch(h.html(), /data-ag="s"/);
  h.click("agmulti");
  assert.equal(h.val("agSheet.d2"), "2026-11-14");
  assert.match(h.html(), /<label class="lbl mono">Last day<input type="date" value="2026-11-14" data-ag="d2">/);
  h.run(`agSheet.d2 = "2026-11-12"`);
  h.click("agsave");
  assert.match(h.html(), /The last day is before the first\./);
  h.run(`agSheet.d2 = "2026-11-17"`);
  h.click("agrep", {rep: "y"});
  assert.match(h.html(), /data-action="agrep" data-rep="y" aria-pressed="true">Yearly/);
  h.click("agsave");
  assert.deepEqual(h.saved().agenda.items.map(x => [x.t, x.d, x.d2, x.s, x.rep]), [["Florida", "2026-11-13", "2026-11-17", null, "y"]]);
});

test("Edit and delete with Undo; an event from a file says so", () => {
  const h = agenda("2026-10-27", [ev("a1", "Dentist", "2026-10-29", "16:30", "17:30", {uid: "x1"})]);
  h.click("agopen", {id: "a1"});
  assert.match(h.html(), /aria-label="Edit event"/);
  assert.match(h.html(), /From a calendar file\. Adding that file again updates it\./);
  h.run(`agSheet.t = "Dentist cleaning"`);
  h.click("agsave");
  assert.equal(h.saved().agenda.items[0].t, "Dentist cleaning");
  assert.match(h.html(), /Changes saved/);
  h.click("agopen", {id: "a1"});
  h.click("agdelete");
  assert.deepEqual(h.saved().agenda.items, []);
  assert.match(h.html(), /Event deleted/);
  h.click("undo");
  assert.equal(h.saved().agenda.items[0].t, "Dentist cleaning");
});

// ---- Your usual week and Add from file ------------------------------------------------------
test("your usual week: change Thursday's half day, add and remove a block, refuse one that ends before it starts", () => {
  const h = agenda("2026-10-27");
  h.click("agusual");
  let html = h.html();
  assert.match(html, /aria-label="Your usual week"/);
  assert.match(html, /<b>Thursday<\/b>[^]*?value="Work"[^]*?value="08:00"[^]*?value="12:00"[^]*?value="Half day"[^]*?value="12:00"[^]*?value="17:00"/);
  h.fire("input", {dataset: {agu: "b", day: "4", i: "1"}, value: "16:00"});
  h.click("agblockadd", {day: "6"});
  assert.deepEqual(h.val("agUsual.days[6]"), [{a: "08:00", b: "17:00", t: "Work"}]);
  h.click("agblockdel", {day: "6", i: "0"});
  assert.deepEqual(h.val("agUsual.days[6]"), []);
  h.click("agusualsave");
  assert.equal(h.val("agUsual"), null);
  assert.equal(h.saved().agenda.usual.days["4"][1].b, "16:00");
  assert.match(h.html(), /Usual week saved/);
  assert.deepEqual(h.val(`agDay("2026-10-29").filter(r => r.k === "work").map(r => r.to)`), ["12:00", "16:00"]);
  h.click("agusual");
  h.fire("input", {dataset: {agu: "b", day: "1", i: "0"}, value: "07:00"});
  h.click("agusualsave");
  assert.match(h.html(), /Each block needs to end after it starts\./);
  assert.notEqual(h.val("agUsual"), null);
});

test("Add from file: on the page, a file's events land with Undo, a call file goes to Call, a bad file says why", () => {
  const h = agenda("2026-10-27");
  assert.match(h.html(), /data-action="agfilepick"/);
  assert.match(h.html(), /<input type="file" id="agfile" hidden>/);
  h.ctx.__src = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:x1", "SUMMARY:Journal club", "DTSTART:20261104T120000", "DTEND:20261104T130000",
    "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  h.run(`agImportText(__src, "invite.ics"); render()`);
  assert.match(h.html(), /Added 1 event/);
  assert.equal(h.saved().agenda.items[0].t, "Journal club");
  h.click("undo");
  assert.deepEqual(h.saved().agenda.items, []);
  h.ctx.__src = sample;
  h.run(`agImportText(__src, "GI-Call-Block5.ics"); render()`);
  assert.match(h.html(), /Imported \d+ call shifts/);
  h.ctx.__src = "hello";
  h.run(`agImportText(__src, "notes.txt"); render()`);
  assert.match(h.html(), /<div class="err" role="alert">That file isn't a calendar\. Pick an \.ics file\.<\/div>/);
});

// ---- Week's Next line ------------------------------------------------------------------------
test("Week's Next line: your next event this week, opening Agenda on its day; none, no line; never for fellows", () => {
  const items = [ev("a1", "Dentist", "2026-10-29", "16:30", "17:30")];
  const h = load({today: "2026-10-27", state: state({}, {agenda: {items}})});
  assert.match(h.html(), /<button class="card agnext" data-action="agshow" data-day="2026-10-29"><span class="mono">Next<\/span><b>Dentist<\/b><span class="mono">Thu 29 Oct · 16:30<\/span>/);
  h.click("agshow", {day: "2026-10-29"});
  assert.deepEqual(h.val("[route.page, agSel, agView]"), ["agenda", "2026-10-29", "d"]);
  const soon = load({today: "2026-10-28", state: state({}, {agenda: {items}})});
  assert.match(soon.html(), /<span class="mono">Tomorrow · 16:30<\/span>/);
  assert.doesNotMatch(load({today: "2026-10-27"}).html(), /agnext/);
  const fel = load({today: "2026-10-27", edition: "fellows", state: state({}, {setup: {d: "2026-10-01"}, agenda: {items}})});
  assert.doesNotMatch(fel.html(), /agnext/);
});
