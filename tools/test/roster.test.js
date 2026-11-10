"use strict";
// The call roster on the phone: the whole block as read from the shared call
// sheets, your shifts from it into Call, swaps, what changed, Worth a look and
// tidying. Placeholder names only, on Block 6's dates (Thu 19 Nov to Wed 16 Dec
// 2026) and just after.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load} = require("./harness");

const H1 = "ihscsheet01", S1 = "istbsheet01", SAID = "2026-11-12T08:40:00-05:00";
// Local wall-clock time as epoch ms (the phone is in Winnipeg).
const at = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
// One site's day and night teams: the day attending is att, the night one natt (the same unless given).
const team = (fellows, night, {att = "Ames", natt = att, res = ["Resident G"], nres = ["Resident K"], tpn} = {}) =>
  ({day: {fellows, res, att, ...(tpn ? {tpn} : {})}, night: {fellow: night, res: nres, att: natt}});
const day = (d, hsc, stb) => ({d, ...(hsc ? {hsc} : {}), ...(stb ? {stb} : {})});
// A call result as the phone gets it: both sheets over the days given unless sheets says otherwise.
function call(days, o = {}) {
  const ds = days.map(x => x.d).sort(), from = o.from || ds[0], to = o.to || ds[ds.length - 1];
  return {id: o.id || "acall000001", item: H1, kind: "call",
    sheets: o.sheets || [{site: "hsc", from, to, file: H1}, {site: "stb", from, to, file: S1}],
    days, notes: o.notes || [], people: o.people || [], rules: o.rules || [], look: o.look || [], said: SAID, off: -300, line: "Call schedule"};
}
const swapOf = (slots, id = "aswap000001") => ({id, item: "ik3m9x2p4qa", kind: "callswap", slots, said: SAID, off: -300, line: "Call swap"});
// A phone on that day and time that knows which fellow is you.
function phone(now = "2026-11-12T09:00", me = "Casey") {
  const h = load({today: now.slice(0, 10)});
  h.setNow(now);
  h.run(`RosterStore.state.me = ${JSON.stringify(me)}`);
  return h;
}
const put = (h, v) => h.run(`window.__r = ${JSON.stringify(v)};`);
const add = (h, r) => { put(h, r); return h.val(`rosterAddCall(__r.id, __r, callNow())`); };
const swap = (h, r) => { put(h, r); return h.val(`rosterSwap(__r.id, __r, callNow())`); };
const shifts = h => h.val(`CallStore.list().map(x => x.uid)`);
// What a promise in the app comes to, as plain data.
const got = async (h, expr) => JSON.parse(JSON.stringify(await h.run(expr)));

test("a night is 17:00 to 08:00 with both sites' night team and the sign-out", () => {
  const h = phone();
  const r = add(h, call([day("2026-11-20", team(["Brook"], "Casey", {nres: ["Resident K", "Resident M"]}),
    team(["Rowan"], "Casey", {att: "Ellis", nres: []}))]));
  assert.deepEqual(r, {n: 1});
  assert.deepEqual(h.val(`CallStore.list()`), [{uid: "gi-roster-2026-11-20-n", s: at(2026, 11, 20, 17), e: at(2026, 11, 21, 8),
    hsc: {att: "Ames", res: "Resident K, Resident M"}, stb: {att: "Ellis", res: ""}, so: "Brook (HSC) + Rowan (St B)"}]);
  assert.deepEqual(h.val(`[CallStore.state.last.file, CallStore.state.last.n]`), ["Shared sheets", 1]);
  // Its card reads like an imported shift's.
  const card = h.run(`callSegHTML(CallStore.list()[0])`);
  assert.match(card, /<span class="mono">Sign-out<\/span><span class="v"><span class="so">Brook<i class="mono">HSC<\/i><\/span><span class="so">Rowan<i class="mono">St B<\/i>/);
  assert.match(card, /<span class="res">No resident<\/span>/);
});

test("a night with a 17:00 attending change says so on the shift card", () => {
  const h = phone();
  add(h, call([day("2026-12-01", team(["Brook"], "Casey", {natt: "Birch"}), team(["Rowan"], "Casey", {att: "Ellis"}))]));
  const x = h.val(`CallStore.list()[0]`);
  assert.deepEqual(x.hsc, {att: "Birch", res: "Resident K", day: "Ames"});
  assert.deepEqual(x.stb, {att: "Ellis", res: "Resident K"});
  const card = h.run(`callSegHTML(CallStore.list()[0])`);
  assert.match(card, /<span>Birch from 17:00 \(Ames until then\)<\/span>/);
  assert.match(card, /<span>Ellis<\/span>/);
});

test("a roster without pictures keeps the pictures already there", () => {
  const h = phone();
  const days = [day("2026-11-20", team(["Brook"], "Casey"), team(["Rowan"], "Casey"))];
  add(h, call(days));
  // The same block again from a file made in chat, which has no pictures.
  add(h, call(days, {id: "fchatfile01", sheets: [{site: "hsc", from: "2026-11-20", to: "2026-11-20"}, {site: "stb", from: "2026-11-20", to: "2026-11-20"}]}));
  assert.deepEqual(h.val(`RosterStore.state.sheets.map(x => [x.site, x.pic])`), [["hsc", H1], ["stb", S1]]);
});

test("weekend and stat day slots are yours, weekday ones aren't", () => {
  const h = phone();
  add(h, call([
    day("2026-11-21", team(["Casey"], "Brook"), team(["Rowan"], "Brook")),   // a Saturday
    day("2026-11-25", team(["Casey"], "Brook"), team(["Rowan"], "Brook")),   // a Wednesday
    day("2026-11-28", team(["Quill"], "Brook"), team(["Rowan"], "Brook", {tpn: ["Casey"]})),   // TPN consults never count
    day("2026-12-25", team(["Quill"], "Brook"), team(["Casey"], "Brook", {att: "Ellis"})),   // Christmas, a Friday
  ]));
  assert.deepEqual(shifts(h), ["gi-roster-2026-11-21-d", "gi-roster-2026-12-25-d"]);
  const [sat, xmas] = h.val(`CallStore.list()`);
  assert.deepEqual([sat.s, sat.e, sat.so], [at(2026, 11, 21, 8), at(2026, 11, 21, 17), ""]);
  assert.deepEqual([sat.hsc, sat.stb], [{att: "Ames", res: "Resident G"}, {att: "Ames", res: "Resident G"}]);
  assert.deepEqual([xmas.s, xmas.e, xmas.stb.att], [at(2026, 12, 25, 8), at(2026, 12, 25, 17), "Ellis"]);
});

test("a no call note keeps that fellow off the sign-out, and you're never on your own", () => {
  const h = phone();
  const notes = [{d: "2026-12-07", site: "hsc", who: "Brook", t: "No call 1200-1700"},
    {d: "2026-12-07", site: "hsc", who: "Quill", t: "No call 0800-1200"},
    {d: "2026-12-07", site: "stb", who: "Rowan", t: "No call"}];
  add(h, call([day("2026-12-07", team(["Brook", "Quill"], "Casey"), team(["Rowan", "Sage"], "Casey")),
    day("2026-12-12", team(["Casey"], "Casey"), team(["Tamsin"], "Casey"))], {notes}));
  assert.deepEqual(h.val(`CallStore.list().map(x => [x.uid, x.so])`), [["gi-roster-2026-12-07-n", "Quill (HSC) + Sage (St B)"],
    ["gi-roster-2026-12-12-d", ""], ["gi-roster-2026-12-12-n", "Tamsin (St B)"]]);
});

test("adding a block replaces every shift in its dates, even an .ics one, and leaves the rest", () => {
  for (const me of ["Casey", "Tamsin"]) {
    const h = phone("2026-11-12T09:00", me);
    // Shifts from an .ics file: the night before the block, its first day, its last night and the day after it.
    const ics = [["ics-before", at(2026, 11, 18, 17), at(2026, 11, 19, 8)], ["ics-first", at(2026, 11, 19, 8), at(2026, 11, 19, 17)],
      ["ics-last", at(2026, 12, 16, 17), at(2026, 12, 17, 8)], ["ics-after", at(2026, 12, 17, 8), at(2026, 12, 17, 17)]]
      .map(([uid, s, e]) => [uid, {uid, s, e, so: null, hsc: {att: "Cole", res: null}, stb: {att: "Frost", res: null}}]);
    h.run(`CallStore.state.shifts = ${JSON.stringify(Object.fromEntries(ics))}`);
    const r = add(h, call([day("2026-11-20", team(["Brook"], "Casey"), team(["Rowan"], "Casey"))], {from: "2026-11-19", to: "2026-12-16"}));
    assert.deepEqual(shifts(h), me === "Casey" ? ["ics-before", "gi-roster-2026-11-20-n", "ics-after"] : ["ics-before", "ics-after"], me);
    assert.deepEqual(r, {n: me === "Casey" ? 1 : 0});
    assert.equal(h.store.get("gi-call-v1").includes("gi-roster-2026-11-20-n"), me === "Casey", "saved");
  }
});

test("before it knows which fellow is you, adding keeps the roster and leaves Call's shifts alone", () => {
  const h = phone("2026-11-12T09:00", "");
  h.run(`CallStore.state.shifts = {"ics-first": {uid: "ics-first", s: ${at(2026, 11, 19, 8)}, e: ${at(2026, 11, 19, 17)}, so: null, ` +
    `hsc: {att: "Cole", res: null}, stb: {att: "Frost", res: null}}}`);
  assert.deepEqual(add(h, call([day("2026-11-20", team(["Brook"], "Casey"), team(["Rowan"], "Casey"))], {from: "2026-11-19", to: "2026-12-16"})), {n: 0});
  assert.deepEqual(shifts(h), ["ics-first"]);
  assert.ok(h.val(`RosterStore.state.days["2026-11-20"].hsc`));
});

test("a sheet for one site leaves the other site alone", () => {
  const h = phone();
  const days = ["2026-11-20", "2026-11-21"].map(d => day(d, team(["Brook"], "Casey"), team(["Rowan"], "Casey", {att: "Ellis"})));
  add(h, call(days, {notes: [{d: "2026-11-21", site: "stb", who: "Rowan", t: "No call 0800-1200"}],
    rules: [{site: "stb", t: "No fellow overnight: the junior resident takes inside calls"}], people: [{n: "Ellis", full: "Avery Ellis"}]}));
  // A revised HSC sheet alone: a new attending on the 20th.
  add(h, call([day("2026-11-20", team(["Brook"], "Casey", {att: "Cole"})), day("2026-11-21", team(["Brook"], "Casey"))],
    {id: "acall000002", sheets: [{site: "hsc", from: "2026-11-20", to: "2026-11-21", file: "ihscsheet02"}]}));
  const st = h.val(`RosterStore.state`);
  assert.deepEqual([st.days["2026-11-20"].hsc.day.att, st.days["2026-11-20"].stb.day.att], ["Cole", "Ellis"]);
  assert.deepEqual(st.sheets.map(x => [x.site, x.pic]), [["hsc", "ihscsheet02"], ["stb", S1]]);
  assert.deepEqual([st.notes.length, st.rules.length, st.people.length], [1, 1, 1]);
  // Your night still has both sites' teams.
  const x = h.val(`CallStore.list().find(x => x.uid === "gi-roster-2026-11-20-n")`);
  assert.deepEqual([x.hsc.att, x.stb.att], ["Cole", "Ellis"]);
  assert.equal(shifts(h).length, 2);
});

test("a swap moves the night and your shift with it, and Undo puts both back", () => {
  const h = phone();
  add(h, call([day("2026-11-30", team(["Brook"], "Casey"), team(["Rowan"], "Casey")),
    day("2026-12-03", team(["Brook"], "Rowan"), team(["Sage"], "Rowan"))], {from: "2026-11-30", to: "2026-12-03"}));
  assert.deepEqual(shifts(h), ["gi-roster-2026-11-30-n"]);
  const r = swap(h, swapOf([{d: "2026-11-30", site: "both", slot: "night", from: "me", to: "Rowan"},
    {d: "2026-12-03", site: "both", slot: "night", from: "Rowan", to: "me"}]));
  assert.deepEqual(r, {n: 2});
  assert.deepEqual(h.val(`["2026-11-30", "2026-12-03"].map(d => [RosterStore.state.days[d].hsc.night.fellow, RosterStore.state.days[d].stb.night.fellow])`),
    [["Rowan", "Rowan"], ["Casey", "Casey"]]);
  assert.deepEqual(shifts(h), ["gi-roster-2026-12-03-n"]);
  assert.deepEqual(h.val(`RosterStore.state.swaps.map(x => [x.d, x.site, x.slot])`), [["2026-11-30", "both", "night"], ["2026-12-03", "both", "night"]]);
  assert.equal(h.val(`rosterUndo("aswap000001")`), true);
  assert.deepEqual(shifts(h), ["gi-roster-2026-11-30-n"]);
  assert.equal(h.val(`RosterStore.state.days["2026-11-30"].hsc.night.fellow`), "Casey");
  assert.deepEqual(h.val(`RosterStore.state.swaps`), []);
  assert.equal(h.val(`rosterUndo("aswap000001")`), false);
});

test("Undo keeps the paging numbers typed since, and ends the Undo of every change after it", () => {
  const h = phone();
  add(h, call([day("2026-11-30", team(["Brook"], "Casey"), team(["Rowan"], "Casey"))]));
  h.run(`CallStore.setNum("hsc", "204-555-0100")`);
  swap(h, swapOf([{d: "2026-11-30", site: "both", slot: "night", from: "me", to: "Sage"}]));
  assert.deepEqual(h.val(`Object.keys(RosterStore.state.undo)`), ["acall000001", "aswap000001"]);
  assert.equal(h.val(`rosterUndo("acall000001")`), true);
  assert.deepEqual(shifts(h), []);
  assert.deepEqual(h.val(`RosterStore.state.days`), {});
  assert.equal(h.val(`CallStore.state.nums.hsc`), "204-555-0100");
  // The swap was made on top of the block: its Undo would bring the block back.
  assert.deepEqual(h.val(`RosterStore.state.undo`), {});
  assert.equal(h.val(`rosterUndo("aswap000001")`), false);
  assert.deepEqual(shifts(h), []);
});

test("a day swap changes only the site where that person has the day", () => {
  const h = phone();
  add(h, call([day("2026-12-05", team(["Casey"], "Brook"), team(["Rowan"], "Brook"))]));
  assert.deepEqual(shifts(h), ["gi-roster-2026-12-05-d"]);
  swap(h, swapOf([{d: "2026-12-05", site: "both", slot: "day", from: "me", to: "Quill"}]));
  assert.deepEqual(h.val(`["hsc", "stb"].map(k => RosterStore.state.days["2026-12-05"][k].day.fellows)`), [["Quill"], ["Rowan"]]);
  assert.deepEqual(shifts(h), []);
});

test("Worth a look names a blank night, a 17:00 attending change, a Thursday and a day off", () => {
  const h = phone();
  h.run(`agState().off = ["2026-11-28"]`);
  put(h, call([
    day("2026-11-20", team(["Brook"], "Casey"), team(["Rowan"], "")),   // no night fellow at St. Boniface
    day("2026-11-26", team(["Brook"], "Casey"), team(["Rowan"], "Casey")),   // a Thursday
    day("2026-11-28", team(["Casey"], "Brook"), team(["Rowan"], "Brook")),   // a Saturday's day, on a day off
    day("2026-12-01", team(["Brook"], "Casey", {natt: "Birch"}), team(["Rowan"], "Casey")),   // the attending changes at 17:00
    day("2026-12-02", team(["Brook"], "Quill"), team(["Rowan"], "Sage")),   // two night fellows, neither you
  ], {look: ["Fri 20 Nov: the St. Boniface sheet has no night fellow, HSC has Casey", "Sat 28 Nov: the St. Boniface resident is hard to read"]}));
  assert.deepEqual(h.val(`rosterLook(__r, callNow())`), [
    "Fri 20 Nov: no night fellow at St. Boniface, Casey at HSC",
    "Thu 26 Nov: your night is on a Thursday",
    "Sat 28 Nov: you're on call on a day off",
    "HSC attending changes from Ames to Birch at 17:00 on Tue 1 Dec",
    "Wed 2 Dec: the night fellow is Quill at HSC but Sage at St. Boniface",
    "Sat 28 Nov: the St. Boniface resident is hard to read"]);
});

test("Worth a look says when you're not on the sheets, and when a swap doesn't match the roster", () => {
  const h = phone("2026-11-12T09:00", "Tamsin");
  put(h, call([day("2026-11-20", team(["Brook"], "Casey"), team(["Rowan"], "Casey"))]));
  assert.deepEqual(h.val(`rosterLook(__r, callNow())`), ["You're not on these sheets"]);
  h.run(`RosterStore.state.me = "Casey"`);
  add(h, call([day("2026-11-30", team(["Brook"], "Casey"), team(["Rowan"], "Casey")),
    day("2026-12-03", team(["Brook"], "Rowan"), team(["Sage"], "Rowan"))], {from: "2026-11-30", to: "2026-12-03"}));
  put(h, swapOf([{d: "2026-12-03", site: "both", slot: "night", from: "Brook", to: "me"},
    {d: "2026-12-20", site: "both", slot: "night", from: "me", to: "Sage"}]));
  assert.deepEqual(h.val(`rosterLook(__r, callNow())`), [
    "Thu 3 Dec: the roster has Rowan that night, not Brook",
    "Sun 20 Dec: no call schedule for that day yet"]);
});

test("the diff lists nights now yours, no longer yours and other changes", () => {
  const h = phone();
  add(h, call([day("2026-11-30", team(["Brook"], "Casey"), team(["Rowan"], "Casey")),
    day("2026-12-01", team(["Brook"], "Sage"), team(["Rowan"], "Sage")),
    day("2026-12-03", team(["Brook"], "Rowan"), team(["Sage"], "Rowan"))], {from: "2026-11-30", to: "2026-12-03"}));
  put(h, call([day("2026-11-30", team(["Brook"], "Rowan"), team(["Rowan"], "Rowan")),
    day("2026-12-01", team(["Quill"], "Sage"), team(["Rowan"], "Sage")),
    day("2026-12-03", team(["Brook"], "Casey", {natt: "Cole"}), team(["Sage"], "Casey"))], {id: "acall000002", from: "2026-11-30", to: "2026-12-03"}));
  assert.deepEqual(h.val(`rosterDiff(__r)`), {
    now: [{d: "2026-12-03", slot: "night"}],
    gone: [{d: "2026-11-30", slot: "night"}],
    other: [{d: "2026-12-01", site: "hsc", slot: "day", role: "fellows", was: "Brook", now: "Quill"},
      {d: "2026-12-03", site: "hsc", slot: "night", role: "att", was: "Ames", now: "Cole"}]});
  // A swap's, against the same roster: yours, and two others trading.
  put(h, swapOf([{d: "2026-12-01", site: "both", slot: "night", from: "Sage", to: "me"}]));
  assert.deepEqual(h.val(`rosterDiff(__r)`), {now: [{d: "2026-12-01", slot: "night"}], gone: [], other: []});
  put(h, swapOf([{d: "2026-12-03", site: "both", slot: "night", from: "Rowan", to: "Brook"}]));
  assert.deepEqual(h.val(`rosterDiff(__r)`), {now: [], gone: [], other: [
    {d: "2026-12-03", site: "hsc", slot: "night", role: "fellow", was: "Rowan", now: "Brook"},
    {d: "2026-12-03", site: "stb", slot: "night", role: "fellow", was: "Rowan", now: "Brook"}]});
});

test("the slot on now: before 08:00 it's last night", () => {
  const h = phone();
  const now = (y, m, d, hh, mm) => h.val(`rosterNow(${at(y, m, d, hh, mm)})`);
  assert.deepEqual(now(2026, 11, 21, 7, 59), {d: "2026-11-20", slot: "night"});
  assert.deepEqual(now(2026, 11, 21, 8, 0), {d: "2026-11-21", slot: "day"});
  assert.deepEqual(now(2026, 11, 21, 16, 59), {d: "2026-11-21", slot: "day"});
  assert.deepEqual(now(2026, 11, 21, 17, 0), {d: "2026-11-21", slot: "night"});
});

test("tidy drops a picture after the last night and the roster 4 weeks later", async () => {
  const h = phone();
  add(h, call([day("2026-12-16", team(["Brook"], "Casey"), team(["Rowan"], "Casey"))], {from: "2026-11-19", to: "2026-12-16",
    notes: [{d: "2026-12-16", site: "hsc", who: "Brook", t: "No call 1200-1700"}]}));
  // A check still waiting holds its own picture.
  h.run(`RosterStore.state.pend.acall000009 = {r: {kind: "call", sheets: [{site: "hsc", from: "2026-12-17", to: "2027-01-13", file: "iwaiting001"}], days: []}, at: callNow()}`);
  await h.run(`Promise.all(["${H1}", "${S1}", "iwaiting001", "iorphan0001"].map(id => rosterPics.put(id, {type: "image/png", bytes: new ArrayBuffer(4)})))`);
  h.run(`RosterStore.state.types = {iorphan0001: "image/png", iwaiting001: "application/pdf"}`);
  const keys = async () => (await got(h, `rosterPics.keys()`)).sort();
  await h.run(`rosterTidy(${at(2026, 12, 17, 7, 59)})`);
  assert.deepEqual(await keys(), ["ihscsheet01", "istbsheet01", "iwaiting001"], "only the picture nothing points to goes");
  assert.deepEqual(h.val(`RosterStore.state.types`), {iwaiting001: "application/pdf"}, "and what kind of file it was");
  await h.run(`rosterTidy(${at(2026, 12, 17, 8, 0)})`);
  assert.deepEqual(await keys(), ["iwaiting001"]);
  assert.deepEqual(h.val(`RosterStore.state.sheets.map(x => x.pic)`), ["", ""]);
  await h.run(`rosterTidy(${at(2027, 1, 13, 12)})`);
  assert.ok(h.val(`RosterStore.state.days["2026-12-16"]`), "28 days on, still kept");
  await h.run(`rosterTidy(${at(2027, 1, 14, 12)})`);
  assert.deepEqual(h.val(`[Object.keys(RosterStore.state.days), RosterStore.state.notes, RosterStore.state.sheets]`), [[], [], []]);
  assert.deepEqual(JSON.parse(h.store.get("gi-roster-v1")).sheets, []);
});

test("a picture an Undo would bring back stays through tidying until its last night is over", async () => {
  const h = phone();
  const days = [day("2026-11-20", team(["Brook"], "Casey"), team(["Rowan"], "Casey"))];
  add(h, call(days, {from: "2026-11-19", to: "2026-12-16"}));
  // A revised HSC sheet with its own picture: its Undo puts the first one back.
  add(h, call(days, {id: "acall000002", sheets: [{site: "hsc", from: "2026-11-19", to: "2026-12-16", file: "ihscsheet02"}]}));
  await h.run(`Promise.all(["${H1}", "${S1}", "ihscsheet02"].map(id => rosterPics.put(id, {type: "image/png", bytes: new ArrayBuffer(4)})))`);
  h.run(`RosterStore.state.types = {${H1}: "image/png"}`);
  const keys = async () => (await got(h, `rosterPics.keys()`)).sort();
  // The next morning the app starts and tidies.
  await h.run(`rosterTidy(${at(2026, 11, 13, 7, 30)})`);
  assert.deepEqual(await keys(), [H1, "ihscsheet02", S1]);
  assert.deepEqual(h.val(`RosterStore.state.types`), {[H1]: "image/png"});
  h.run(`rosterUndo("acall000002")`);
  assert.deepEqual(h.val(`RosterStore.state.sheets.map(x => x.pic)`), [H1, S1]);
  assert.ok(await got(h, `rosterPics.get("${H1}")`), "its picture is still there");
  // After the block's last night, nothing keeps any of them.
  await h.run(`rosterTidy(${at(2026, 12, 17, 8, 0)})`);
  assert.deepEqual(await keys(), []);
});

test("the roster isn't in the backup and goes with Clear call data", () => {
  const h = phone();
  add(h, call([day("2026-11-20", team(["Brook"], "Casey"), team(["Rowan"], "Casey"))], {people: [{n: "Ames", full: "Morgan Ames"}]}));
  assert.ok(h.store.get("gi-roster-v1").includes("Morgan Ames"));
  assert.doesNotMatch(h.run(`Store.exportJSON()`), /Casey|Ames|Brook|Rowan/);
  assert.doesNotMatch(h.store.get("epa-state-v1") || "", /Casey|Ames|Brook|Rowan/);
  // The same phone opening the app again still has it.
  const again = load({store: h.store, today: "2026-11-12"});
  assert.equal(again.val(`RosterStore.state.days["2026-11-20"].hsc.night.fellow`), "Casey");
  h.click("callopen");
  h.click("callclear");
  assert.equal(h.store.has("gi-roster-v1"), false);
  assert.equal(h.store.has("gi-call-v1"), false);
  assert.deepEqual(h.val(`[RosterStore.state.me, RosterStore.state.days]`), ["", {}]);
  h.click("undo");
  assert.deepEqual(h.val(`[RosterStore.state.me, Object.keys(RosterStore.state.days)]`), ["Casey", ["2026-11-20"]]);
  assert.ok(h.store.has("gi-roster-v1"));
  assert.deepEqual(shifts(h), ["gi-roster-2026-11-20-n"]);
});

test("the phone's own check keeps a call and a swap as the sender does, and refuses half a swap", () => {
  const h = phone();
  put(h, {...call([day("2026-11-20", team([" Brook ", ""], "Casey", {tpn: ["Sage"]}), team(["Rowan"], "Casey"))]),
    look: ["x".repeat(300)], people: [{n: "Ames", full: "Morgan Ames"}, {n: "Ames", full: "Again"}]});
  const r = h.val(`rosterClean(__r)`);
  assert.deepEqual(r.days[0].hsc.day, {fellows: ["Brook"], res: ["Resident G"], att: "Ames", tpn: ["Sage"]});
  assert.deepEqual([r.kind, r.sheets.length, r.look[0].length, r.people.length], ["call", 2, 200, 1]);
  put(h, call([day("2026-11-20", team(["Brook"], "Casey"))], {sheets: [{site: "stb", from: "2026-11-20", to: "2026-11-20"}]}));
  assert.equal(h.val(`rosterClean(__r)`), null, "a day no sheet of its site covers is no day");
  put(h, swapOf([{d: "2026-11-30", slot: "night", from: "me", to: "Rowan"}, {d: "2026-12-03", slot: "night", from: "Rowan"}]));
  assert.equal(h.val(`rosterClean(__r)`), null);
  put(h, swapOf([{d: "2026-11-30", slot: "night", from: "me", to: "Rowan"}]));
  assert.deepEqual(h.val(`rosterClean(__r)`), {kind: "callswap", slots: [{d: "2026-11-30", site: "both", slot: "night", from: "me", to: "Rowan"}]});
});
