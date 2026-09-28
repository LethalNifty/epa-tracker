"use strict";
// The Call card: reading the block's .ics call file, merging imports, the
// weekend stretch, and what the card and screen show. Names in the fixture
// are placeholders; real call files never go in the repository.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {load, ROOT} = require("./harness");

const FIXTURE = path.join(ROOT, "tools", "test", "fixtures", "call-sample.ics");
const bytes = () => fs.readFileSync(FIXTURE);
const sample = () => fs.readFileSync(FIXTURE, "utf8");
// Local wall-clock time as epoch ms, the way the app reads TZID=America/Winnipeg.
const at = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
// A fresh app with the sample block imported (and any extra .ics text).
function withBlock(now, opts = {}) {
  const h = load({today: now.slice(0, 10), ...opts});
  h.setNow(now);
  h.ctx.__src = sample();
  h.run(`callImport(__src, "call-sample.ics")`);
  h.run(`toast = null`);
  return h;
}
const ics = (...events) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events.flat(), "END:VCALENDAR"].join("\r\n");
const ev = (uid, s, e, extra = []) => ["BEGIN:VEVENT", `UID:${uid}`, `DTSTART;TZID=America/Winnipeg:${s}`,
  `DTEND;TZID=America/Winnipeg:${e}`, "X-GI-CALL-HSC-ATTENDING:Attending A", "X-GI-CALL-HSC-RESIDENT:none",
  "X-GI-CALL-STB-ATTENDING:Attending B", "X-GI-CALL-STB-RESIDENT:Resident C", ...extra, "END:VEVENT"];

// ---- Reading the file ----------------------------------------------------------------

test("reads the sample block: folded lines joined, text unescaped, alarms kept apart", () => {
  const h = load();
  h.ctx.__src = sample();
  const cal = h.run(`parseICS(__src)`);
  assert.equal(cal.calendar, true);
  assert.equal(cal.events.length, 5);
  const d = h.run(`icsUnescape(parseICS(__src).events[0].DESCRIPTION.value)`);
  assert.ok(d.startsWith("GI call, HSC Attending A and St. Boniface Attending B; overnight from 17:00.\nHSC\n"), d);
  assert.ok(d.endsWith("Café note: page the fellow first, then the attending."), d);
  // The VALARM's own DESCRIPTION stays on the alarm.
  assert.doesNotMatch(d, /check sign-out/);
});

test("folds are joined on the bytes, so a split multi-byte character survives", () => {
  const h = load();
  const raw = Buffer.concat([Buffer.from("BEGIN:VCALENDAR\r\nSUMMARY:Caf"), Buffer.from([0xC3]), Buffer.from("\r\n "),
    Buffer.from([0xA9]), Buffer.from(" call\r\nEND:VCALENDAR\r\n")]);
  h.ctx.__b = new Uint8Array(raw);
  assert.equal(h.run(`icsText(__b)`), "BEGIN:VCALENDAR\r\nSUMMARY:Café call\r\nEND:VCALENDAR\r\n");
  h.ctx.__b = new Uint8Array(bytes());
  assert.equal(h.run(`icsShifts(icsText(__b)).shifts.length`), 5);
});

test("LF-only files, tab folds and a byte-order mark read the same", () => {
  const h = load();
  h.ctx.__src = "﻿" + ics(ev("u1", "20261028T170000", "20261029T080000", ["X-GI-CALL-SIGNOUT:Fellow E (H", "\tSC) + Fellow F (St B)"]))
    .replace(/\r\n/g, "\n");
  const r = h.val(`icsShifts(__src)`);
  assert.equal(r.ok, true);
  assert.equal(r.shifts[0].so, "Fellow E (HSC) + Fellow F (St B)");
});

test("property parameters: quoted values may hold ; and :", () => {
  const h = load();
  const p = h.val(`icsProp('DTSTART;X-NOTE="a;b:c";TZID=America/Winnipeg:20261028T170000')`);
  assert.deepEqual(p, {name: "DTSTART", params: {"X-NOTE": "a;b:c", TZID: "America/Winnipeg"}, value: "20261028T170000"});
  assert.equal(h.run(`icsProp("no colon here")`), null);
  assert.equal(h.run(`icsUnescape("a\\\\,b\\\\;c\\\\nd\\\\Ne\\\\\\\\f")`), "a,b;c\nd\ne\\f");
});

test("times: TZID=America/Winnipeg is the phone's local time, Z is UTC, a bare date is midnight", () => {
  const h = load();
  assert.equal(h.run(`icsTime({value: "20261028T170000", params: {TZID: "America/Winnipeg"}})`), at(2026, 10, 28, 17));
  assert.equal(h.run(`icsTime({value: "20261028T220000Z"})`), Date.UTC(2026, 9, 28, 22));
  assert.equal(h.run(`icsTime({value: "20261028"})`), at(2026, 10, 28));
  assert.equal(h.run(`icsTime({value: "garbage"})`), null);
  // No DTEND: DURATION instead, days on the clock across the DST change.
  assert.equal(h.run(`icsEnd(${at(2026, 10, 31, 8)}, "P1D")`), at(2026, 11, 1, 8));
  assert.equal(h.run(`icsEnd(${at(2026, 10, 28, 17)}, "PT15H")`), at(2026, 10, 29, 8));
});

test("each shift: both sites, 'none' means no resident, sign-out only when the file has one", () => {
  const h = load();
  h.ctx.__src = sample();
  const r = h.val(`icsShifts(__src)`);
  assert.equal(r.ok, true);
  assert.equal(r.shifts.length, 5);
  assert.deepEqual(r.shifts[0], {uid: "gi-call-20261028@gi-hub-tests", s: at(2026, 10, 28, 17), e: at(2026, 10, 29, 8),
    so: "Fellow E (HSC) + Fellow F (St B)", hsc: {att: "Attending A", res: null}, stb: {att: "Attending B", res: null}});
  assert.deepEqual(r.shifts[1].stb, {att: "Attending D", res: "Resident G"});
  assert.equal(r.shifts[2].so, null);
  assert.equal(r.shifts[4].hsc.res, "Resident H");
});

test("files that aren't a call schedule are turned away with a plain reason", () => {
  const h = load();
  assert.match(h.val(`icsShifts("hello")`).error, /isn't a calendar/);
  h.ctx.__src = ics(["BEGIN:VEVENT", "UID:x", "DTSTART:20261001T120000", "DTEND:20261001T130000", "SUMMARY:Thursday EPA reminder", "END:VEVENT"]);
  assert.match(h.val(`icsShifts(__src)`).error, /No GI call shifts/);
  h.ctx.__src = ics(ev("u1", "20261029T080000", "20261028T170000"));
  assert.match(h.val(`icsShifts(__src)`).error, /no readable times/);
});

// ---- Merging imports ---------------------------------------------------------------------

test("importing the same block again changes nothing and never doubles a shift", () => {
  const h = withBlock("2026-10-27T12:00");
  assert.equal(h.val(`CallStore.list().length`), 5);
  const r = h.val(`callImport(__src, "call-sample.ics")`);
  assert.deepEqual([r.added, r.changed, r.removed], [0, 0, 0]);
  assert.equal(h.val(`toast.msg`), "Call schedule already up to date");
  assert.equal(h.val(`CallStore.list().length`), 5);
});

test("a re-imported block updates by UID and drops a shift that was traded away", () => {
  const h = withBlock("2026-10-27T12:00");
  // The new file: the Oct 28 attending changed, Nov 3 was traded away, and a new Nov 5 shift.
  h.ctx.__src = sample().replace("X-GI-CALL-HSC-ATTENDING:Attending A\r\nX-GI-CALL-HSC-RESIDENT:none\r\nX-GI-CALL-STB-ATTENDING:Attending B\r\nX-GI-CALL-STB-RESIDENT:none\r\nX-GI-CALL-SIGNOUT",
    "X-GI-CALL-HSC-ATTENDING:Attending K\r\nX-GI-CALL-HSC-RESIDENT:none\r\nX-GI-CALL-STB-ATTENDING:Attending B\r\nX-GI-CALL-STB-RESIDENT:none\r\nX-GI-CALL-SIGNOUT")
    .replace("UID:gi-call-20261103@gi-hub-tests\r\nDTSTAMP:20260927T160000Z\r\nDTSTART;TZID=America/Winnipeg:20261103T170000\r\nDTEND;TZID=America/Winnipeg:20261104T080000",
      "UID:gi-call-20261105@gi-hub-tests\r\nDTSTAMP:20260927T160000Z\r\nDTSTART;TZID=America/Winnipeg:20261105T170000\r\nDTEND;TZID=America/Winnipeg:20261106T080000");
  const r = h.val(`callImport(__src, "call-sample.ics")`);
  assert.deepEqual([r.added, r.changed, r.removed], [1, 1, 1]);
  assert.equal(h.val(`toast.msg`), "Call schedule updated: 1 new, 1 changed, 1 removed");
  assert.equal(h.val(`CallStore.state.shifts["gi-call-20261028@gi-hub-tests"].hsc.att`), "Attending K");
  assert.equal(h.val(`CallStore.state.shifts["gi-call-20261103@gi-hub-tests"]`), undefined);
  // Undo puts the earlier schedule back.
  h.click("undo");
  assert.equal(h.val(`CallStore.state.shifts["gi-call-20261028@gi-hub-tests"].hsc.att`), "Attending A");
  assert.equal(h.val(`CallStore.list().length`), 5);
});

test("a file covering other dates adds to the schedule; a cancelled shift goes", () => {
  const h = withBlock("2026-10-27T12:00");
  h.ctx.__src = ics(ev("next-block-1", "20261126T170000", "20261127T080000"),
    ["BEGIN:VEVENT", "UID:gi-call-20261028@gi-hub-tests", "STATUS:CANCELLED", "DTSTART;TZID=America/Winnipeg:20261028T170000",
      "X-GI-CALL-HSC-ATTENDING:Attending A", "END:VEVENT"]);
  const r = h.val(`callImport(__src, "next.ics")`);
  assert.deepEqual([r.added, r.changed, r.removed], [1, 0, 1]);
  assert.equal(h.val(`CallStore.list().length`), 5);
});

// ---- Stretches and time -----------------------------------------------------------------------

test("the weekend's three shifts form one stretch, Fri 17:00 to Mon 08:00 (64 h across the clock change)", () => {
  const h = withBlock("2026-10-27T12:00");
  const st = h.val(`callStretches(CallStore.list())`);
  assert.equal(st.length, 3);
  assert.equal(st[1].s, at(2026, 10, 30, 17));
  assert.equal(st[1].e, at(2026, 11, 2, 8));
  assert.equal(st[1].segs.length, 3);
  assert.equal(h.run(`callHours(${st[1].s}, ${st[1].e})`), 64);
  assert.equal(h.run(`callTitle(callStretches(CallStore.list())[1])`), "Weekend");
  assert.equal(h.run(`callTitle(callStretches(CallStore.list())[0])`), "Wednesday night");
  assert.equal(h.run(`callRange(${st[1].s}, ${st[1].e})`), "17:00 → Mon 08:00");
  assert.equal(h.run(`callRange(${st[0].s}, ${st[0].e})`), "17:00 → 08:00");
});

test("status: past shifts drop out, the stretch under way is current, the shift on now is picked", () => {
  const h = withBlock("2026-10-31T20:00");
  const cs = h.val(`callStatus(CallStore.list(), callNow())`);
  assert.equal(cs.cur.s, at(2026, 10, 30, 17));
  assert.equal(cs.seg.uid, "gi-call-20261031@gi-hub-tests");
  assert.deepEqual(cs.up.map(x => x.s), [at(2026, 11, 3, 17)]);
  h.setNow("2026-11-04T08:00");
  assert.deepEqual(h.val(`callStatus(CallStore.list(), callNow())`), {cur: null, seg: null, next: null, up: [], has: true});
});

test("countdowns read in days and hours, then hours and minutes", () => {
  const h = load();
  assert.equal(h.run(`callSpan(${(29 * 60) * 60000})`), "1 d 5 h");
  assert.equal(h.run(`callSpan(${48 * 3600000})`), "2 d");
  assert.equal(h.run(`callSpan(${(5 * 60 + 20) * 60000})`), "5 h 20 min");
  assert.equal(h.run(`callSpan(${3 * 3600000})`), "3 h");
  assert.equal(h.run(`callSpan(${12 * 60000 + 5000})`), "13 min");
  assert.equal(h.run(`callSpan(0)`), "1 min");
});

test("tap-to-call numbers: digits, pauses and extensions dial; anything else doesn't", () => {
  const h = load();
  assert.equal(h.run(`callTel("(204) 555-0100")`), "tel:2045550100");
  assert.equal(h.run(`callTel("+1 204 555 0100, 123#")`), "tel:+12045550100,123%23");
  assert.equal(h.run(`callTel("ask switchboard")`), null);
  assert.equal(h.run(`callTel("")`), null);
});

// ---- What the card shows ---------------------------------------------------------------------

test("Week with no call file: an invitation to import, right after This week", () => {
  const h = load({today: "2026-10-27"});
  h.click("tab", {page: "week"});
  const html = h.html();
  assert.match(html, /class="card callinvite"[\s\S]*?data-action="callimport"[\s\S]*?Import call schedule/);
  assert.match(html, /<input type="file" id="callfile" hidden>/);
  assert.ok(html.indexOf("<h2>This week</h2>") < html.indexOf("callinvite"));
});

test("Week before a shift: the next one with a countdown, the week ahead, then what's after", () => {
  const h = withBlock("2026-10-27T12:00");
  h.click("tab", {page: "plan"}); h.click("tab", {page: "week"});
  const html = h.html();
  assert.doesNotMatch(html, /class="callnow"/);
  assert.match(html, /<h2>Call<\/h2><span class="mono">Next in <b data-until="\d+">1 d 5 h<\/b>/);
  assert.match(html, /<span>Wed 28 Oct · 17:00 → 08:00<\/span><span>15 h<\/span>/);
  assert.match(html, /<span class="cx-title">Wednesday night<\/span>/);
  assert.match(html, /<i>HSC<\/i>Attending A<\/span><span><i>St. B<\/i>Attending B/);
  // The weekend, one row, then Nov 3.
  assert.match(html, /<span class="xd mono">Fri 30 Oct<\/span><span class="xt">17:00 → Mon 08:00<\/span><span class="xh mono long">64 h<\/span>/);
  assert.match(html, /<span class="xd mono">Tue 3 Nov<\/span>/);
  // A week of hour ticks: 168, with the call hours standing tall.
  const svg = /<div class="tr-bar"[^>]*><svg[^>]*>([\s\S]*?)<\/svg>/.exec(html)[1];
  assert.equal((svg.match(/<line/g) || []).length, 168);
  assert.equal((svg.match(/class="on"/g) || []).length, 15 + 63);
});

test("Week on call: the panel leads the page with both sites, the off time and sign-out", () => {
  const h = withBlock("2026-10-30T18:30");
  h.click("tab", {page: "plan"}); h.click("tab", {page: "week"});
  const html = h.html();
  assert.ok(html.indexOf('class="callnow"') < html.indexOf('class="monitor"'), "panel before the dial");
  assert.match(html, /<span class="live-tag"><i><\/i>On call now<\/span><span>Off Mon 08:00<\/span>/);
  assert.match(html, /<b data-until="\d+">2 d 14 h<\/b>left/);
  assert.match(html, /<div class="site-h mono">HSC<\/div><div class="who"><span class="role mono">Attending<\/span><b>Attending C<\/b><\/div>/);
  assert.match(html, /<div class="site-h mono">St. Boniface<\/div>[\s\S]*?<b>Attending D<\/b>[\s\S]*?<b>Resident G<\/b>/);
  assert.match(html, /<span class="role mono">Resident<\/span><span class="none">No resident<\/span>/);
  assert.match(html, /Sign-out 17:00<\/span><span class="v"><span class="so">Fellow E<i class="mono">HSC<\/i><\/span><span class="so">Fellow F<i class="mono">St B<\/i>/);
  assert.match(html, /Then Sat 08:00<\/span>/);
  // No numbers saved yet: each site offers to add one.
  assert.equal((html.match(/data-action="callsetup"/g) || []).length, 2);
  // Only one Call section on the page.
  assert.doesNotMatch(html, /class="card callcard"/);
});

test("saved numbers become tap-to-call buttons; they stay out of the EPA backup", () => {
  const h = withBlock("2026-10-31T20:00");
  h.run(`callNumDone({dataset: {callnum: "hsc"}, value: " (204) 555-0100 "})`);
  assert.equal(h.val(`toast.msg`), "HSC number saved");
  h.run(`CallStore.setNum("stb", "204 555 0199")`);
  h.click("tab", {page: "plan"}); h.click("tab", {page: "week"});
  const html = h.html();
  assert.match(html, /<a class="btn callbtn" href="tel:2045550100">[\s\S]*?Call HSC<\/a>/);
  assert.match(html, /<a class="btn callbtn" href="tel:2045550199">[\s\S]*?Call St. B<\/a>/);
  // Saturday's shift has no sign-out; Sunday's team is next.
  assert.doesNotMatch(html, /Sign-out 08:00/);
  assert.match(html, /Then Sun 08:00<\/span><span class="v"><span class="so">Attending A<i class="mono">HSC<\/i>/);
  // Privacy: the call data sits under its own key and never in the EPA state or backup.
  assert.ok(h.store.get("gi-call-v1").includes("Attending C"));
  assert.ok(h.store.get("gi-call-v1").includes("204"));
  assert.doesNotMatch(h.run(`Store.exportJSON()`), /Attending|555/);
  assert.doesNotMatch(h.store.get("epa-state-v1") || "", /Attending|555/);
});

test("the Call screen: by-week trace, each shift of the weekend, numbers and schedule controls", () => {
  const h = withBlock("2026-10-27T12:00");
  h.click("callopen");
  assert.equal(h.val(`route.page`), "call");
  const html = h.html();
  assert.match(html, /<h1 class="title">Call<\/h1><div class="ph-meta mono"><b>3<\/b> shifts left · <b>94<\/b> hours<\/div>/);
  assert.match(html, /<h2>By week<\/h2>/);
  assert.equal((html.match(/class="wk-row/g) || []).length, 2);
  assert.match(html, /<article class="cst next">[\s\S]*?Wednesday night[\s\S]*?In <b data-until="\d+">1 d 5 h<\/b>/);
  assert.match(html, /Fri 17:00 → Sat 08:00[\s\S]*?Sat 08:00 → Sun 08:00[\s\S]*?Sun 08:00 → Mon 08:00/);
  assert.match(html, /<span class="res">No resident<\/span>/);
  assert.match(html, /data-callnum="hsc"/);
  assert.match(html, /data-callnum="stb"/);
  assert.match(html, /Last file: <b>call-sample.ics<\/b>/);
  assert.match(html, /data-action="callclear">Clear call data/);
  assert.match(html, /Names and numbers stay on this phone/);
  // The bottom bar keeps Week highlighted, and Back returns there.
  assert.match(html, /class="nv on" data-action="tab" data-page="week"/);
  h.click("back");
  assert.equal(h.val(`route.page`), "week");
});

test("Add number opens the Call screen at that site's field", () => {
  const h = withBlock("2026-10-31T20:00");
  h.click("callsetup", {site: "stb"});
  assert.equal(h.val(`route.page`), "call");
  assert.equal(h.val(`route.from`), "week");
});

test("a bad number is flagged under its field and gets no button", () => {
  const h = withBlock("2026-10-31T20:00");
  h.run(`CallStore.setNum("hsc", "ask switchboard")`);
  h.click("callopen");
  assert.match(h.html(), /aria-invalid="true"[\s\S]*?Not a phone number/);
  assert.doesNotMatch(h.html(), /href="tel:/);
});

test("Clear call data removes everything from the phone; Undo brings it back", () => {
  const h = withBlock("2026-10-27T12:00");
  h.run(`CallStore.setNum("hsc", "2045550100")`);
  h.click("callopen");
  h.click("callclear");
  assert.equal(h.store.has("gi-call-v1"), false);
  assert.equal(h.val(`toast.msg`), "Call data cleared");
  assert.match(h.html(), /class="card callinvite"[\s\S]*?Import your block's call file/);
  assert.doesNotMatch(h.html(), /Clear call data/);
  h.click("undo");
  assert.equal(h.val(`CallStore.list().length`), 5);
  assert.equal(h.val(`CallStore.state.nums.hsc`), "2045550100");
  assert.ok(h.store.has("gi-call-v1"));
});

test("a failed import says why on the card and leaves the schedule alone", () => {
  const h = withBlock("2026-10-27T12:00");
  h.ctx.__bad = "BEGIN:VCALENDAR\r\nEND:VCALENDAR";
  h.click("callopen");
  h.run(`callImport(__bad, "empty.ics"); render()`);
  assert.match(h.html(), /<div class="err" role="alert">No GI call shifts in that file/);
  assert.equal(h.val(`CallStore.list().length`), 5);
});

test("after the last shift the card asks for the next block", () => {
  const h = withBlock("2026-11-05T09:00");
  h.click("tab", {page: "plan"}); h.click("tab", {page: "week"});
  assert.match(h.html(), /No call left in the schedule you imported[\s\S]*?Import the next block/);
});

test("saved call data survives a reload", () => {
  const h = withBlock("2026-10-27T12:00");
  const again = load({today: "2026-10-27"});
  again.store.set("gi-call-v1", h.store.get("gi-call-v1"));
  again.run(`CallStore.load()`);
  assert.equal(again.val(`CallStore.list().length`), 5);
  again.store.set("gi-call-v1", "{not json");
  again.run(`CallStore.state = callBlank(); CallStore.load()`);
  assert.equal(again.val(`CallStore.list().length`), 0);
});

test("the fixture uses placeholder names only", () => {
  const names = sample().split(/\r\n/).filter(l => /^X-GI-CALL-/.test(l)).map(l => l.slice(l.indexOf(":") + 1));
  for (const v of names)
    assert.match(v, /^(none|(Attending|Resident) [A-Z]|Fellow [A-Z] \(HSC\) \+ Fellow [A-Z] \(St B\))$/, v);
});

test("every screen has exactly one call file picker, with no accept filter", () => {
  const count = h => (h.html().match(/id="callfile"/g) || []).length;
  const empty = load({today: "2026-10-27"});
  assert.equal(count(empty), 1);
  empty.click("callopen");
  assert.equal(count(empty), 1);
  const full = withBlock("2026-10-27T12:00");
  full.click("callopen");
  assert.equal(count(full), 1);
  full.setNow("2026-11-19T10:00"); full.run(`render()`);
  assert.equal(count(full), 1);
  assert.doesNotMatch(full.html(), /id="callfile"[^>]*accept/);
});
