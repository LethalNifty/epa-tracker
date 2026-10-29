"use strict";
// The October next pass: EPA chips that say what they are, Log another, the
// chase list without spare forms and the icon badge, Week following the day,
// the EPAs list in short names, and the pace under the dial. The fellows'
// edition gets the chips, Log another and the EPAs list (2026-10-17), not the rest.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {load, obs, state, many, ROOT} = require("./harness");

const TODAY = "2026-10-16";   // a Friday
const DAY = 86400000;
const at = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
const owner = (s = state({})) => load({today: TODAY, state: s});
const fellow = (s = state({}, {setup: {d: "2026-10-01"}})) => load({today: TODAY, edition: "fellows", state: s});
const posOf = (html, h2) => html.indexOf(`<h2>${h2}</h2>`);
// A section of the page, from its heading to its end.
const section = (html, h2) => { const s = html.slice(posOf(html, h2)); return s.slice(0, s.indexOf("</section>")); };
function withCalls(today, now) {
  const h = load({today});
  h.setNow(now);
  h.ctx.__src = fs.readFileSync(path.join(ROOT, "tools", "test", "fixtures", "call-sample.ics"), "utf8");
  h.run(`callImport(__src, "call-sample.ics"); toast = null; render();`);
  return h;
}

// ---- EPA chips that say what they are ----------------------------------------------------

test("log sheet: every EPA chip carries its short name, and the picked one shows its full title", () => {
  const h = owner();
  h.click("sheet");
  const chips = [...h.html().matchAll(/data-action="pickpart" data-part="(\w+)">([^]*?)<\/button>/g)];
  assert.ok(chips.length > 1);
  for (const [, pid, inner] of chips)
    assert.equal(inner, `<span class="pc">${h.val(`PART_BY_ID.${pid}.label`)}</span><span class="pn">${h.val(`PART_SHORT.${pid}`)}</span>`);
  assert.doesNotMatch(h.html(), /class="picked"/);
  h.click("pickpart", {part: "c2"});
  assert.match(h.html(), /<div class="picked"><b>C2<\/b> Providing ongoing management for patients with stable, chronic and\/or complex conditions<\/div>/);
  // A part names its EPA and then the part.
  h.click("pickall");
  assert.match(h.html(), /data-part="c8b"><span class="pc">C8-B<\/span><span class="pn">[^<]+<\/span><\/button>/);
  // C9 is one part now (Entrada has no Part B), so it reads as C9.
  assert.match(h.html(), /data-part="c9a"><span class="pc">C9<\/span><span class="pn">Inpatient lead<\/span><\/button>/);
  h.click("pickpart", {part: "f3b"});
  assert.match(h.html(), /<div class="picked"><b>F3-B<\/b> Performing esophagogastroduodenoscopy: Procedure note<\/div>/);
});

test("the fellows' edition gets the named chips and the full title too", () => {
  const h = fellow();
  h.click("sheet");
  assert.doesNotMatch(h.html(), /data-action="pickpart" data-part="\w+">[A-Z]\d(-[AB])?<\/button>/);
  assert.match(h.html(), /data-action="pickpart" data-part="f1b"><span class="pc">F1-B<\/span><span class="pn">Assessment and plan<\/span><\/button>/);
  h.click("pickpart", {part: "f1b"});
  assert.match(h.html(), /<div class="picked"><b>F1-B<\/b> Assessing and initiating management for uncomplicated patients: Clinical assessment and management<\/div>/);
});

// ---- Log another --------------------------------------------------------------------------

test("Log another: the save toast offers another with the same assessor and day", () => {
  const h = owner();
  h.click("sheet", {part: "c2"});
  h.run(`sheet.a = "Brook"; sheet.d = "2026-10-15";`);
  h.click("sheetsave");
  assert.match(h.html(), /<button class="toastnext" data-action="another">[^]*?Another with Brook<small>yesterday<\/small><\/button>/);
  h.click("another");
  assert.deepEqual(h.val(`[sheet.mode, sheet.pid, sheet.d, sheet.a, sheet.status]`), ["new", null, "2026-10-15", "Brook", "pending"]);
  assert.equal(h.val("toast"), null);
  assert.match(h.html(), /<b>Log observation<\/b>/);
  h.click("pickpart", {part: "c3"});
  h.click("sheetsave");
  assert.deepEqual(h.saved().obs.c3.map(o => [o.d, o.a]), [["2026-10-15", "Brook"]]);
  // The second toast's Undo takes back only the second one.
  h.click("undo");
  assert.equal((h.saved().obs.c3 || []).length, 0);
  assert.equal(h.saved().obs.c2.length, 1);
});

test("Log another: without an assessor it reads Log another; saving an edit offers none", () => {
  const h = owner();
  h.click("sheet", {part: "c2"});
  h.click("sheetsave");
  assert.match(h.html(), /data-action="another">[^]*?Log another<small>today<\/small>/);
  h.click("sheet", {part: "c2", obs: "0"});
  h.click("sheetsave");
  assert.doesNotMatch(h.html(), /data-action="another"/);
  h.run(`sheet = null; showToast("x"); openSheet("c2"); sheet.d = "2026-10-09"; saveSheet(); render();`);
  assert.match(h.html(), /Log another<small>Fri 9 Oct<\/small>/);
});

test("Log another from What to ask for keeps the setting: the next EPA starts with its line ticked", () => {
  const h = owner();
  h.click("askset", {set: "fu"});
  h.click("sheet", {part: "c2", ask: "fu"});
  h.click("sheetsave");
  h.click("another");
  h.click("pickpart", {part: "c3"});
  assert.deepEqual(h.val("sheet.tick"), ["outpatient"]);
  // C2 has no outpatient line.
  h.click("pickpart", {part: "c2"});
  assert.deepEqual(h.val("sheet.tick"), []);
});

test("the fellows' edition offers Log another too", () => {
  const h = fellow();
  h.click("sheet", {part: "c2"});
  h.run(`sheet.a = "Brook";`);
  h.click("sheetsave");
  assert.match(h.html(), /C2 logged as pending/);
  assert.match(h.html(), /data-action="another">[^]*?Another with Brook<small>today<\/small>/);
  h.click("another");
  assert.deepEqual(h.val(`[sheet.mode, sheet.pid, sheet.d, sheet.a]`), ["new", null, TODAY, "Brook"]);
});

// ---- Chase only what counts -----------------------------------------------------------------

const SPARE = () => state({
  // C5 needs 2: three pending, so the newest is a spare.
  c5: [obs("2026-09-20", {status: "pending"}), obs("2026-09-22", {status: "pending"}), obs("2026-09-25", {status: "pending"})],
  // C4 needs 3: two approved and one pending, so the pending one counts.
  c4: [obs("2026-09-01"), obs("2026-09-02"), obs("2026-09-10", {status: "pending"})],
});

test("chase list: pending forms past what an EPA still needs are spare, the newest first", () => {
  const h = owner(SPARE());
  assert.deepEqual(h.val(`chaseList(Store.state.obs, getToday()).map(c => [c.pid, c.date, c.spare])`),
    [["c4", "2026-09-10", false], ["c5", "2026-09-20", false], ["c5", "2026-09-22", false], ["c5", "2026-09-25", true]]);
  const html = h.html();
  assert.match(html, /<b>3 forms pending 14\+ days<\/b>/);
  assert.equal((html.match(/<div class="crow spare">/g) || []).length, 1);
  assert.match(html, /<div class="crow spare">[^]*?<span class="sparetag mono">Spare<\/span>/);
});

test("chase list: an EPA already approved to its count has only spares, and only spares shows no card", () => {
  const h = owner(state({c5: [obs("2026-09-01"), obs("2026-09-02"), obs("2026-09-20", {status: "pending"})]}));
  assert.deepEqual(h.val(`chaseList(Store.state.obs, getToday()).map(c => c.spare)`), [true]);
  assert.doesNotMatch(h.html(), /pending 14\+ days/);
});

test("the brief tells the service worker when each form to chase passes 14 days, and when GI Hub was last open", () => {
  const s = SPARE();
  s.obs.c3 = [obs("2026-10-12", {status: "pending"})];
  const h = owner(s);
  h.setNow("2026-10-16T09:00");
  h.run(`remindSeenAt = ${at(2026, 10, 16, 8, 30)}`);
  const b = h.val(`remindBrief(callNow())`);
  // Each passes 14 days on the 15th day after it, including C3's still to come; the spare never.
  assert.deepEqual(b.chase, [at(2026, 9, 25), at(2026, 10, 5), at(2026, 10, 7), at(2026, 10, 27)]);
  assert.equal(b.seen, at(2026, 10, 16, 8, 30));
});

test("badge count: forms that passed 14 days since GI Hub was last open", () => {
  const h = owner();
  assert.equal(h.val(`badgeCount({chase: [10, 20, 30], seen: 15}, 25)`), 1);
  assert.equal(h.val(`badgeCount({chase: [10, 20, 30]}, 25)`), 2);
  assert.equal(h.val(`badgeCount({}, 25)`), 0);
  assert.equal(h.val(`badgeCount(null, 25)`), 0);
});

test("opening GI Hub clears the icon badge and counts everything up to now as seen", () => {
  const h = owner();
  h.run(`globalThis.__badge = []; navigator.clearAppBadge = () => { __badge.push("clear"); return Promise.resolve(); };`);
  h.setNow("2026-10-16T10:30");
  h.run(`remindOpened()`);
  assert.deepEqual(h.val("__badge"), ["clear"]);
  assert.equal(h.val("remindSeenAt"), at(2026, 10, 16, 10, 30));
});

// sw.js with notify.js, as in remind.test.js, plus the badge.
function worker(brief) {
  const store = new Map(), badges = [], handlers = {};
  if (brief) store.set("__gi-brief.json", JSON.stringify(brief));
  const Response = class { constructor(b) { this.b = b; } async json() { return JSON.parse(this.b); } };
  const cache = {match: async k => (store.has(k) ? new Response(store.get(k)) : undefined), put: async (k, r) => { store.set(k, r.b); }};
  const ctx = {
    Response, URL, console, Date,
    caches: {open: async () => cache, keys: async () => [], match: async () => undefined},
    importScripts: f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx),
    self: {addEventListener: (t, fn) => { handlers[t] = fn; }, skipWaiting() {},
      navigator: {setAppBadge: async n => { badges.push(n); }},
      registration: {scope: "https://lethalnifty.github.io/epa-tracker/", showNotification: async () => {}},
      clients: {claim() {}, matchAll: async () => []}},
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "sw.js"), "utf8"), ctx);
  const fire = async (type, ev) => { let p; handlers[type]({...ev, waitUntil: x => { p = x; }}); await p; };
  return {fire, badges};
}

test("a reminder arriving puts the forms newly past 14 days on the icon, and nothing when there are none", async () => {
  const now = Date.now(), base = {v: 1, at: now, weeks: [], call: [], study: {nights: []}, pearls: {unsent: 0}};
  const w = worker({...base, chase: [now - 5 * DAY, now - 2 * DAY, now - DAY, now + DAY], seen: now - 3 * DAY});
  await w.fire("push", {data: {json: () => ({kind: "pearls"})}});
  assert.deepEqual(w.badges, [2]);
  const quiet = worker({...base, chase: [now - 5 * DAY], seen: now - DAY});
  await quiet.fire("push", {data: {json: () => ({kind: "pearls"})}});
  assert.deepEqual(quiet.badges, []);
});

// ---- Week follows your day ------------------------------------------------------------------

test("in the day, What to ask for leads Week, before This week", () => {
  const html = owner().html();
  assert.ok(posOf(html, "What to ask for") > 0);
  assert.ok(posOf(html, "What to ask for") < posOf(html, "This week"));
  assert.ok(posOf(html, "This week") < posOf(html, "Study"));
});

test("on a reading night from 17:00, tonight's pages lead until they're read", () => {
  const h = load({today: "2026-09-30"});
  h.setNow("2026-09-30T19:40");
  h.run("render()");
  let html = h.html();
  assert.ok(posOf(html, "Study") < posOf(html, "What to ask for"));
  assert.ok(posOf(html, "Study") < posOf(html, "This week"));
  h.setNow("2026-09-30T16:30");
  h.run("render()");
  html = h.html();
  assert.ok(posOf(html, "What to ask for") < posOf(html, "Study"));
  h.setNow("2026-09-30T19:40");
  h.run(`Store.setStudyCursor(4, getToday()); render();`);
  html = h.html();
  assert.ok(posOf(html, "What to ask for") < posOf(html, "Study"));
});

test("on a call day from noon, the Call card leads until the shift starts", () => {
  let html = withCalls("2026-10-28", "2026-10-28T13:00").html();
  assert.ok(posOf(html, "Call") > 0);
  assert.ok(posOf(html, "Call") < posOf(html, "What to ask for"));
  html = withCalls("2026-10-28", "2026-10-28T09:00").html();
  assert.ok(posOf(html, "What to ask for") < posOf(html, "Call"));
});

test("What to ask for remembers where you were by weekday", () => {
  const h = owner();
  h.click("askset", {set: "fu"});
  assert.deepEqual([h.saved().ask, h.saved().askOn, h.saved().askDays], ["fu", TODAY, {5: "fu"}]);
  assert.match(section(h.html(), "What to ask for"), /Where are you today\?/);
  // Thursday: nothing remembered.
  h.setToday("2026-10-22");
  h.run("render()");
  assert.doesNotMatch(h.html(), /class="arow"/);
  // The next Friday: Follow-ups, saying why.
  h.setToday("2026-10-23");
  h.run("render()");
  const sec = section(h.html(), "What to ask for");
  assert.match(sec, /class="pick ghost on" data-action="askset" data-set="fu"/);
  assert.match(sec, /Like last Friday/);
  assert.match(sec, /class="arow"/);
  // Tapping it off forgets Fridays.
  h.click("askset", {set: "fu"});
  assert.equal(h.saved().askDays[5], undefined);
  assert.doesNotMatch(h.html(), /class="arow"/);
  // A pick on another day doesn't touch the others.
  h.click("askset", {set: "scope"});
  h.setToday("2026-10-26");
  h.run("render()");
  h.click("askset", {set: "new"});
  assert.deepEqual(h.saved().askDays, {1: "new", 5: "scope"});
});

test("on call, What to ask for is Ward and call unless you picked something today", () => {
  const h = withCalls("2026-10-28", "2026-10-28T20:00");
  let sec = section(h.html(), "What to ask for");
  assert.match(sec, /class="pick ghost on" data-action="askset" data-set="ward"/);
  assert.match(sec, /On call now/);
  h.click("askset", {set: "fu"});
  sec = section(h.html(), "What to ask for");
  assert.match(sec, /class="pick ghost on" data-action="askset" data-set="fu"/);
  assert.doesNotMatch(sec, /On call now/);
});

test("an old saved setting with no day counts as today's pick", () => {
  const h = owner(state({}, {ask: "scope"}));
  assert.match(section(h.html(), "What to ask for"), /class="pick ghost on" data-action="askset" data-set="scope"/);
  assert.equal(h.val("Store.state.askOn"), TODAY);
});

test("Look for lives inside What to ask for: the cases you still need, until you pick where you are", () => {
  const h = owner();
  assert.doesNotMatch(h.html(), /<h2>Look for<\/h2>/);
  let sec = section(h.html(), "What to ask for");
  assert.match(sec, /Cases you still need/);
  assert.match(sec, /class="lrow"/);
  h.click("askset", {set: "fu"});
  sec = section(h.html(), "What to ask for");
  assert.doesNotMatch(sec, /class="lrow"/);
  assert.match(sec, /class="arow"/);
});

test("a backup keeps the remembered weekdays", () => {
  const h = owner();
  h.click("askset", {set: "fu"});
  assert.equal(h.val("Store.importJSON(Store.exportJSON()).ok"), true);
  assert.deepEqual([h.saved().askOn, h.saved().askDays], [TODAY, {5: "fu"}]);
});

// ---- EPAs in plain words ----------------------------------------------------------------------

test("EPAs list: short names, a ring and the count; the EPA's page keeps the Royal College title", () => {
  const h = owner(state({c2: many(2, "2026-10-01"), c3: [obs("2026-10-02", {status: "pending"})]}));
  h.click("tab", {page: "epas"});
  const html = h.html();
  assert.match(html, /<button class="eli st-core" data-action="open" data-code="C2" aria-label="C2: Providing ongoing management for patients with stable, chronic and\/or complex conditions"><svg class="ering"[^]*?<\/svg><span class="ecode">C2<\/span><span class="emid"><span class="ename">Chronic care<\/span>/);
  assert.match(html, /data-code="C2"[^]*?<span class="ecount">2\/14<\/span>/);
  assert.match(html, /data-code="C3"[^]*?<span class="tag warn">1 pending<\/span>[^]*?<span class="ecount">1\/10<\/span>/);
  for (const [code, name] of [["D1", "GI emergencies"], ["D2", "Pre-procedure assessment"], ["F1", "Uncomplicated patients"], ["F3", "EGD"],
    ["C8", "Therapeutic endoscopy"], ["C9", "Inpatient service"], ["P1", "Endoscopy list"]])
    assert.match(html, new RegExp(`<span class="ecode">${code}</span><span class="emid"><span class="ename">${name}</span>`));
  // Each stage is one list.
  assert.match(html, /<div class="card elist"><button class="eli st-core"/);
  assert.doesNotMatch(html, /class="epa-title"/);
  h.click("open", {code: "C2"});
  assert.match(h.html(), /Providing ongoing management for patients with stable, chronic and\/or complex conditions/);
});

test("the fellows' edition gets the short-name EPA list too", () => {
  const h = fellow(state({c3: [obs("2026-10-02", {status: "pending"})]}, {setup: {d: "2026-10-01"}}));
  h.click("tab", {page: "epas"});
  assert.doesNotMatch(h.html(), /class="epa-title"/);
  assert.match(h.html(), /<div class="card elist"><button class="eli st-/);
  assert.match(h.html(), /data-code="C3"[^]*?<span class="ename">Exacerbations<\/span><span class="etags"><span class="tag warn">1 pending<\/span>/);
});

// ---- Pace under the dial ----------------------------------------------------------------------

const paceOf = h => h.val(`(() => { const r = paceFinish(Store.state.obs, getToday()); return r.date ? [fmtDate(r.date), r.onTrack] : null; })()`);
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthOf = iso => LONG[+iso.slice(5, 7) - 1] + " " + iso.slice(0, 4);

test("the dial says when you're on pace to finish, in green", () => {
  const h = owner(state({f1b: many(10, "2026-10-01"), c2: many(14, "2026-09-25"), c3: many(10, "2026-10-05"),
    c6: many(12, "2026-10-08"), c7: many(8, "2026-09-30"), c8a: many(29, "2026-10-10")}));
  const [iso, ok] = paceOf(h);
  assert.equal(ok, true);
  assert.match(h.html(), new RegExp(`<div class="dial-pace ok">On pace for ${monthOf(iso)}</div>`));
});

test("behind pace, it says when this pace would finish against June 30, in peach", () => {
  const h = owner(state({f1b: many(1, "2026-10-10")}));
  const [iso, ok] = paceOf(h);
  assert.equal(ok, false);
  assert.match(h.html(), new RegExp(`<div class="dial-pace warn">At this pace: ${monthOf(iso)} · goal June 30</div>`));
});

test("no pace line with nothing recent, and none in the fellows' edition", () => {
  assert.doesNotMatch(owner().html(), /dial-pace/);
  assert.doesNotMatch(fellow(state({f1b: many(1, "2026-10-10")}, {setup: {d: "2026-10-01"}})).html(), /dial-pace/);
});

test("tapping an EPA row grows its small ring into the EPA's ring", () => {
  const h = owner();
  h.run(`liveLastTap = {isConnected: true, dataset: {action: "open"}, querySelector: sel => sel.split(", ").includes(".ering") ? "ring" : null};`);
  assert.equal(h.val(`liveHeroFrom("push")`), "ring");
});
