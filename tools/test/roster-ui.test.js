"use strict";
// The call roster's screens: the check before Call changes (a new block, a
// revised sheet, a swap), the row on Week's Claude added card, and a sheet's
// picture full screen. Placeholder names only, on Block 6's dates (Thu 19 Nov
// to Wed 16 Dec 2026).
const test = require("node:test");
const assert = require("node:assert/strict");
const {load} = require("./harness");

const H1 = "ihscsheet01", S1 = "istbsheet01", SAID = "2026-11-12T08:40:00-05:00";
const B6 = "2026-11-19", B6END = "2026-12-16";
const plus = (iso, n) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n)).toISOString().slice(0, 10);
const wd = iso => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))).getUTCDay();
// Casey's five nights in Block 6, one of them a Thursday.
const CASEY = ["2026-11-24", "2026-11-30", "2026-12-03", "2026-12-08", "2026-12-14"];
const ROT = ["Quill", "Sage", "Rowan", "Brook"];
// A weekend fellow works Friday night to Monday 08:00: these by their Friday.
const WKND = {"2026-11-20": "Brook", "2026-11-27": "Rowan", "2026-12-04": "Quill", "2026-12-11": "Sage"};
// Both sites' days, from..to. o.nights and o.natt change a night's fellow or
// HSC night attending. Fri 27 Nov has no night fellow at St. Boniface; on
// Tue 8 Dec the HSC attending changes to Birch at 17:00.
function block(o = {}) {
  const days = [], nights = o.nights || {}, natt = o.natt || {};
  let k = 0;
  for (let d = o.from || B6; d <= (o.to || B6END); d = plus(d, 1)) {
    const back = {5: 0, 6: 1, 0: 2}[wd(d)], fri = back === undefined ? null : plus(d, -back);
    const usual = fri ? WKND[fri] : CASEY.includes(d) ? "Casey" : ROT[k++ % 4], night = d in nights ? nights[d] : usual;
    days.push({d,
      hsc: {day: {fellows: fri ? [night] : ["Brook", "Rowan"], res: ["Resident G"], att: "Ames"},
        night: {fellow: night, res: ["Resident K"], att: natt[d] || (d === "2026-12-08" ? "Birch" : "Ames")}},
      stb: {day: {fellows: fri ? [night] : ["Quill"], res: ["Resident M"], att: "Ellis"},
        night: {fellow: d === "2026-11-27" ? "" : night, res: [], att: "Ellis"}}});
  }
  return days;
}
// A call result as the phone gets it: both sheets over the days given.
function call(days, o = {}) {
  const from = days[0].d, to = days[days.length - 1].d;
  return {id: o.id || "acall000001", item: o.h || H1, kind: "call",
    sheets: [{site: "hsc", from, to, file: o.h || H1}, {site: "stb", from, to, file: o.s || S1}],
    days, notes: [], people: [], rules: [], look: [], said: SAID, off: -300, line: "Call schedule, check it in Call"};
}
const swapOf = (slots, id = "aswap000001") => ({id, item: "ik3m9x2p4qa", kind: "callswap", slots, said: SAID, off: -300, line: "Call swap, check it in Call"});
// A phone on that day and time that knows which fellow is you ("" for not yet).
function phone(now = "2026-11-12T09:00", me = "Casey") {
  const h = load({today: now.slice(0, 10)});
  h.setNow(now);
  h.run(`RosterStore.state.me = ${JSON.stringify(me)}`);
  return h;
}
const put = (h, v) => h.run(`window.__r = ${JSON.stringify(v)};`);
const got = async (h, expr) => JSON.parse(JSON.stringify(await h.run(expr)) ?? "null");
// A block already in, the way a check's Add puts it in.
const added = (h, r) => { put(h, r); return h.val(`rosterAddCall(__r.id, rosterClean(__r, callNow()), callNow())`); };
// Picked up as tellPick does it: the pictures are on the phone, the result
// waits for its check, and its row goes on the Claude added card.
function take(h, res) {
  put(h, res);
  return got(h, `(async () => {
    for (const sh of __r.sheets || []) await rosterPics.put(sh.file, {type: "image/jpeg", bytes: new Uint8Array([255, 216, 255]).buffer});
    const e = await rosterTake(__r, callNow());
    if (e) { tellLoad().added.push(e); tellSave(); }
    return e;
  })()`);
}
const shifts = h => h.val(`CallStore.list().map(x => x.uid)`);
const toast = h => h.val(`toast && toast.msg`);
const week = h => { h.run(`go({page: "week"})`); return h.html(); };
const cardOf = html => { const i = html.indexOf('<div class="card tellcard">'); return i < 0 ? "" : html.slice(i, html.indexOf("</section>", i)); };
const main = html => html.slice(0, html.indexOf("</main>"));
// A section of the page by its heading, to the section's end.
const section = (html, h2) => { const i = html.indexOf(`<h2>${h2}</h2>`); return i < 0 ? "" : html.slice(i, html.indexOf("</section>", i)); };
// What the screen says: the words, without the markup.
const text = html => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const lines = html => [...html.matchAll(/<p>(.*?)<\/p>/g)].map(m => text(m[1]));
const count = (html, s) => html.split(s).length - 1;

test("Check opens the new block with your shifts, Worth a look and every night", async () => {
  const h = phone();
  const e = await take(h, call(block()));
  assert.equal(e.call, "acall000001");
  const card = cardOf(week(h));
  assert.match(text(card), /Call schedule, Thu 19 Nov to Wed 16 Dec 5 nights for you Check/);
  assert.match(card, /data-action="rostcheck" data-id="acall000001">Check</);
  h.click("rostcheck", {id: "acall000001"});
  assert.deepEqual(h.val("[route.page, route.from, route.rost]"), ["call", "week", "acall000001"]);
  const page = main(h.html());
  assert.match(text(page), /^This week Read from the HSC and St\. Boniface sheets Check the new block 5 nights for you · 28 days at both sites/);
  // Your shifts, each as Call shows it: the sign-out, and a 17:00 attending change.
  const yours = section(page, "Your shifts");
  assert.equal(count(yours, '<article class="cst'), 5);
  const at = ["Tue 24 Nov", "Mon 30 Nov", "Thu 3 Dec", "Tue 8 Dec", "Mon 14 Dec"].map(d => yours.indexOf(d));
  assert.ok(at.every((x, i) => x > 0 && (i === 0 || x > at[i - 1])), "every night, in order");
  assert.match(yours, /Birch from 17:00 \(Ames until then\)/);
  assert.match(yours, /<span class="so">Brook<i class="mono">HSC<\/i><\/span><span class="so">Rowan<i class="mono">HSC<\/i><\/span><span class="so">Quill<i class="mono">St B<\/i><\/span>/);
  assert.deepEqual(lines(section(page, "Worth a look")), ["Fri 27 Nov: no night fellow at St. Boniface, Rowan at HSC",
    "Thu 3 Dec: your night is on a Thursday", "HSC attending changes from Ames to Birch at 17:00 on Tue 8 Dec"]);
  // Every night: the first week, then all 28 with yours marked.
  const every = section(page, "Every night");
  assert.equal(count(every, 'class="rost-d"'), 7);
  assert.match(every, /data-action="rostall">Show all 28</);
  h.click("rostall");
  const all = section(main(h.html()), "Every night");
  assert.equal(count(all, 'class="rost-d"'), 28);
  assert.equal(count(all, ">You<"), 5);
  assert.match(text(all), /Fri 27 Rowan St B: none Ames Ellis/);
  assert.match(all, /data-action="rostall">Show fewer</);
  // The sheets, then the two answers.
  const sheets = section(page, "The sheets");
  assert.match(sheets, new RegExp(`data-action="rostpic" data-id="${H1}"`));
  assert.match(sheets, new RegExp(`data-action="rostpic" data-id="${S1}"`));
  assert.match(text(sheets), /HSC Thu 19 Nov to Wed 16 Dec St\. Boniface Thu 19 Nov to Wed 16 Dec/);
  assert.match(page, /data-action="rostadd" data-id="acall000001">(<svg[^]*?<\/svg>)?Add to Call</);
  assert.match(page, /data-action="rostnot" data-id="acall000001">Not right</);
  // Call's own screen isn't under it, and nothing has changed yet.
  assert.doesNotMatch(page, /Paging numbers/);
  assert.deepEqual(shifts(h), []);
  assert.deepEqual(h.val("Object.keys(RosterStore.state.days)"), []);
});

test("the first check asks which fellow is you and remembers it", async () => {
  const h = phone(undefined, "");
  // A block that came in before you'd said: Who's on has it, Call doesn't yet.
  added(h, call(block({from: "2026-11-16", to: "2026-11-18", nights: {"2026-11-16": "Casey"}}), {id: "acall000000", h: "ihscsheet00", s: "istbsheet00"}));
  assert.deepEqual(shifts(h), []);
  await take(h, call(block()));
  assert.match(text(cardOf(week(h))), /Call schedule, Thu 19 Nov to Wed 16 Dec Check/);
  h.click("rostcheck", {id: "acall000001"});
  let page = main(h.html());
  assert.match(text(page), /Check the new block 28 days at both sites/);
  assert.doesNotMatch(text(page), /nights for you/);
  const ask = section(page, "Which one is you?");
  assert.deepEqual([...ask.matchAll(/data-action="rostme" data-name="([^"]+)"/g)].map(m => m[1]), ["Brook", "Casey", "Quill", "Rowan", "Sage"]);
  h.click("rostme", {name: "Casey"});
  page = main(h.html());
  assert.match(text(page), /Check the new block 5 nights for you · 28 days at both sites/);
  assert.doesNotMatch(page, /Which one is you/);
  assert.equal(count(section(page, "Your shifts"), '<article class="cst'), 5);
  // The earlier block's night is in Call now; this block waits for Add.
  assert.deepEqual(shifts(h), ["gi-roster-2026-11-16-n"]);
  // The phone remembers.
  assert.equal(load({today: "2026-11-12", store: h.store}).val("RosterStore.state.me"), "Casey");
});

test("not on these sheets: no shifts, it says so, and Add still keeps Who's on", async () => {
  const h = phone(undefined, "Tamsin");
  await take(h, call(block()));
  assert.match(text(cardOf(week(h))), /Call schedule, Thu 19 Nov to Wed 16 Dec No nights for you Check/);
  h.click("rostcheck", {id: "acall000001"});
  const page = main(h.html()), yours = section(page, "Your shifts");
  assert.match(text(page), /Check the new block No nights for you · 28 days at both sites/);
  assert.match(text(yours), /No shifts for you on these sheets/);
  // Picked the wrong name last time: it can ask again.
  assert.match(yours, /data-action="rostme" data-name="">Not Tamsin\?</);
  assert.equal(lines(section(page, "Worth a look"))[0], "You're not on these sheets");
  h.click("rostadd", {id: "acall000001"});
  assert.equal(toast(h), "Call schedule added, no shifts for you");
  assert.deepEqual(shifts(h), []);
  assert.equal(h.val("Object.keys(RosterStore.state.days).length"), 28);
  assert.deepEqual(h.val("RosterStore.state.pend"), {});
});

test("Add to Call fills Call and the row turns into Undo, and Undo empties it again", async () => {
  const h = phone();
  const e = await take(h, call(block()));
  h.click("rostcheck", {id: "acall000001"});
  h.click("rostadd", {id: "acall000001"});
  assert.equal(toast(h), "Call: 5 nights added");
  assert.deepEqual(shifts(h), CASEY.map(d => `gi-roster-${d}-n`));
  // On to Call, which has them.
  assert.deepEqual(h.val("[route.page, route.from, 'rost' in route]"), ["call", "week", false]);
  assert.match(main(h.html()), /<h2>Upcoming<\/h2><span class="mono">5 shifts<\/span>/);
  const card = cardOf(week(h));
  assert.match(text(card), /Call: 5 nights added Undo/);
  assert.match(card, new RegExp(`data-action="telundo" data-id="${e.id}">Undo<`));
  assert.doesNotMatch(card, /rostcheck/);
  h.click("telundo", {id: e.id});
  assert.deepEqual(shifts(h), []);
  assert.deepEqual(h.val("RosterStore.state.days"), {});
  assert.equal(h.val("RosterStore.state.me"), "Casey");
  assert.equal(cardOf(week(h)), "");
});

test("Not right throws the reading away and keeps the pictures", async () => {
  const h = phone();
  await take(h, call(block()));
  h.click("rostcheck", {id: "acall000001"});
  h.click("rostnot", {id: "acall000001"});
  assert.equal(toast(h), "Thrown away. Send the sheets to Claude in chat.");
  assert.equal(h.val("route.page"), "week");
  assert.equal(cardOf(h.html()), "");
  assert.deepEqual(h.val("RosterStore.state.pend"), {});
  assert.deepEqual(h.val("RosterStore.state.days"), {});
  assert.deepEqual(shifts(h), []);
  assert.deepEqual(h.val("RosterStore.state.sheets.map(x => [x.site, x.from, x.to, x.pic, x.unread])"),
    [["hsc", B6, B6END, H1, true], ["stb", B6, B6END, S1, true]]);
  assert.deepEqual(JSON.parse(h.store.get("gi-roster-v1")).pend, {});
  // Tidying keeps them: they're on Call until the block is over.
  await h.run("rosterTidy(callNow())");
  assert.deepEqual((await got(h, "rosterPics.keys()")).sort(), [H1, S1].sort());
});

test("a revised sheet opens Check what changed and Update Call applies it", async () => {
  const h = phone();
  added(h, call(block()));
  // Casey's Tuesday night moves to Wednesday, and Thursday's HSC night attending is Cole.
  const rev = call(block({nights: {"2026-11-24": "Rowan", "2026-11-25": "Casey"}, natt: {"2026-11-26": "Cole"}}),
    {id: "acall000002", h: "ihscsheet02", s: "istbsheet02"});
  const e = await take(h, rev);
  assert.match(text(cardOf(week(h))), /Revised call schedule, Thu 19 Nov to Wed 16 Dec 2 changes for you Check/);
  h.click("rostcheck", {id: "acall000002"});
  const page = main(h.html());
  assert.match(text(page), /Read from the revised HSC and St\. Boniface sheets Check what changed 2 changes for you · 1 other/);
  const mine = section(page, "Changes for you");
  assert.match(text(mine), /Wed 25 Nov 15 h Wednesday night Now yours/);
  assert.match(text(mine), /Tue 24 Nov was yours Tuesday night No longer yours Now Rowan/);
  assert.match(text(section(page, "Other changes")), /Thu 26 Nov HSC night attending: Cole, was Ames/);
  assert.doesNotMatch(page, /<h2>Every night<\/h2>/);
  assert.match(section(page, "The sheets"), /data-action="rostpic" data-id="ihscsheet02"/);
  assert.match(page, /data-action="rostadd" data-id="acall000002">(<svg[^]*?<\/svg>)?Update Call</);
  assert.match(page, /data-action="rostnot" data-id="acall000002">Not right</);
  h.click("rostadd", {id: "acall000002"});
  assert.equal(toast(h), "Call updated");
  assert.deepEqual(shifts(h), ["2026-11-25", ...CASEY.slice(1)].map(d => `gi-roster-${d}-n`));
  assert.deepEqual(h.val("RosterStore.state.sheets.map(x => x.pic)"), ["ihscsheet02", "istbsheet02"]);
  const card = cardOf(week(h));
  assert.match(text(card), /Call updated Undo/);
  assert.match(card, new RegExp(`data-action="telundo" data-id="${e.id}">Undo<`));
});

test("a swap opens Check what changed", async () => {
  const h = phone();
  added(h, call(block()));
  await take(h, swapOf([{d: "2026-12-03", site: "both", slot: "night", from: "me", to: "Sage"}]));
  assert.match(text(cardOf(week(h))), /Call swap on Thu 3 Dec 1 change for you Check/);
  h.click("rostcheck", {id: "aswap000001"});
  const page = main(h.html());
  assert.match(text(page), /Call swap Check what changed 1 change for you/);
  assert.match(text(section(page, "Changes for you")), /Thu 3 Dec was yours Thursday night No longer yours Now Sage/);
  assert.doesNotMatch(page, /<h2>Every night<\/h2>|<h2>The sheets<\/h2>/);
  assert.match(page, /data-action="rostadd" data-id="aswap000001">(<svg[^]*?<\/svg>)?Update Call</);
  h.click("rostadd", {id: "aswap000001"});
  assert.equal(toast(h), "Call updated");
  assert.deepEqual(shifts(h), CASEY.filter(d => d !== "2026-12-03").map(d => `gi-roster-${d}-n`));
  assert.match(text(cardOf(week(h))), /Call updated Undo/);
});

test("undoing a block ends the Undo of a swap made after it", async () => {
  const h = phone();
  const b = await take(h, call(block()));
  h.click("rostcheck", {id: b.call});
  h.click("rostadd", {id: b.call});
  const s = await take(h, swapOf([{d: "2026-12-03", site: "both", slot: "night", from: "me", to: "Sage"}]));
  h.click("rostcheck", {id: s.call});
  h.click("rostadd", {id: s.call});
  assert.equal(count(cardOf(week(h)), 'data-action="telundo"'), 2);
  h.click("telundo", {id: b.id});
  assert.deepEqual(shifts(h), []);
  assert.equal(cardOf(week(h)), "");
});

test("a swap the roster doesn't match changes nothing and says so", async () => {
  const h = phone();
  added(h, call(block()));
  await take(h, swapOf([{d: "2026-12-03", site: "both", slot: "night", from: "Brook", to: "Sage"}]));
  h.click("rostcheck", {id: "aswap000001"});
  const page = main(h.html());
  assert.match(text(page), /Check what changed Nothing changes/);
  assert.deepEqual(lines(section(page, "Worth a look")), ["Thu 3 Dec: the roster has Casey that night, not Brook", "Thu 3 Dec: your night is on a Thursday"]);
  h.click("rostadd", {id: "aswap000001"});
  assert.equal(toast(h), "Nothing in Call changed");
  assert.deepEqual(shifts(h), CASEY.map(d => `gi-roster-${d}-n`));
});

test("a sheet's picture opens full screen over the page, and closes", async () => {
  const h = phone();
  await take(h, call(block()));
  h.click("rostcheck", {id: "acall000001"});
  h.click("rostpic", {id: H1});
  const html = h.html(), i = html.indexOf('<div class="rostview"');
  assert.ok(i > html.indexOf("</main>"), "over the page, not inside it");
  const view = html.slice(i);
  assert.match(view, /role="dialog" aria-label="HSC sheet, Thu 19 Nov to Wed 16 Dec"/);
  assert.match(view, new RegExp(`<img class="rostview-pic" data-rostimg="${H1}" alt="HSC sheet, Thu 19 Nov to Wed 16 Dec">`));
  assert.match(view, /data-action="rostpicx">Close</);
  // Nothing redraws under it while it's open.
  assert.equal(h.val("anySheet()"), true);
  h.click("rostpicx");
  assert.doesNotMatch(h.html(), /rostview/);
  assert.equal(h.val("anySheet()"), false);
  // A PDF shows as a document.
  h.run(`RosterStore.state.types[${JSON.stringify(H1)}] = "application/pdf"`);
  h.click("rostpic", {id: H1});
  assert.match(h.html(), new RegExp(`<iframe class="rostview-pic" data-rostimg="${H1}" title="HSC sheet, Thu 19 Nov to Wed 16 Dec">`));
});

test("pictures come from the phone as object URLs, given back once they're off the screen", async () => {
  const h = phone();
  await take(h, call(block()));
  const made = [], gone = [];
  h.ctx.URL.createObjectURL = () => { made.push("blob:" + (made.length + 1)); return made[made.length - 1]; };
  h.ctx.URL.revokeObjectURL = u => gone.push(u);
  let els = [{dataset: {rostimg: H1}, src: ""}, {dataset: {rostimg: S1}, src: ""}];
  h.ctx.document.querySelectorAll = sel => sel === "[data-rostimg]" ? els : [];
  h.run("rosterAfterRender()");
  await got(h, "rosterPics.keys()");
  await new Promise(r => setImmediate(r));
  assert.deepEqual(els.map(x => x.src), ["blob:1", "blob:2"]);
  // Drawn again, the same picture keeps its URL; one off the screen gives its URL back.
  els = [{dataset: {rostimg: S1}, src: ""}];
  h.run("rosterAfterRender()");
  await new Promise(r => setImmediate(r));
  assert.deepEqual(els.map(x => x.src), ["blob:2"]);
  assert.deepEqual(gone, ["blob:1"]);
  assert.equal(made.length, 2);
});

// ---- Who's on, Find someone and the sheets on Call ---------------------------------------------------
const callPage = h => { h.run(`go({page: "call", from: "week"})`); return main(h.html()); };
const cards = html => [...html.matchAll(/<article class="cst[^"]*">[^]*?<\/article>/g)].map(m => m[0]);

test("Who's on shows both sites' day and night teams, with Now and You", () => {
  const h = phone("2026-11-24T20:00");
  added(h, call(block()));
  h.run(`CallStore.setNum("hsc", "204-555-0100")`);
  const page = callPage(h), at = page.indexOf("<h2>Who's on</h2>");
  assert.ok(at > page.indexOf('<section class="callnow"') && at < page.indexOf("<h2>By week</h2>"), "under the live card");
  const who = section(page, "Who's on");
  assert.match(who, /<span class="mono">To Wed 16 Dec<\/span>/);
  assert.match(who, /data-action="rostday" data-d="2026-11-24" aria-pressed="true">Today</);
  assert.match(who, /data-action="rostday" data-d="2026-11-25" aria-pressed="false">Wed 25</);
  const [hsc, stb] = cards(who);
  assert.equal(text(hsc), "HSC Tue 24 Nov Day · 08:00 → 17:00 Fellows Brook, Rowan Resident Resident G Attending Ames " +
    "Night · 17:00 → 08:00 Now Fellow You Resident Resident K Attending Ames Call HSC");
  assert.match(hsc, /href="tel:2045550100"/);
  assert.equal(text(stb), "St. Boniface Tue 24 Nov Day · 08:00 → 17:00 Fellow Quill Resident Resident M Attending Ellis " +
    "Night · 17:00 → 08:00 Now Fellow You Resident None listed Attending Ellis");
  // Another day: no Now, and You only where you are.
  h.click("rostday", {d: "2026-11-25"});
  const wed = section(main(h.html()), "Who's on");
  assert.match(wed, /data-d="2026-11-25" aria-pressed="true">Wed 25</);
  assert.doesNotMatch(wed, />Now<|>You</);
});

test("before 08:00 Who's on opens on last night with Now on it", () => {
  const h = phone("2026-11-25T06:30");
  added(h, call(block()));
  const who = section(callPage(h), "Who's on");
  assert.match(who, /data-d="2026-11-24" aria-pressed="true">Last night</);
  assert.match(who, /data-d="2026-11-25" aria-pressed="false">Today</);
  const hsc = text(cards(who)[0]);
  assert.match(hsc, /^HSC Tue 24 Nov Day · 08:00 → 17:00 Fellows/);
  assert.match(hsc, /Night · 17:00 → 08:00 Now Fellow You/);
  assert.doesNotMatch(hsc, /17:00 Now Fellows/);
});

test("at 17:00 Now moves to the night while Call is open", () => {
  const h = phone("2026-11-26T16:59", "Tamsin");
  added(h, call(block()));
  assert.match(text(cards(section(callPage(h), "Who's on"))[0]), /Day · 08:00 → 17:00 Now/);
  h.setNow("2026-11-26T17:00");
  h.run("callTick()");
  const hsc = text(cards(section(main(h.html()), "Who's on"))[0]);
  assert.match(hsc, /Night · 17:00 → 08:00 Now/);
  assert.doesNotMatch(hsc, /Day · 08:00 → 17:00 Now/);
});

test("a night with no fellow at a site shows the footer rule", () => {
  const h = phone("2026-11-24T09:00");
  const r = call(block());
  r.rules = [{site: "stb", t: "No fellow listed overnight: page the St. Boniface attending."}, {site: "hsc", t: "No fellow listed overnight: page the HSC attending."}];
  added(h, r);
  callPage(h);
  h.click("rostday", {d: "2026-11-27"});
  const [hsc, stb] = cards(section(main(h.html()), "Who's on"));
  assert.match(text(stb), /Night · 17:00 → 08:00 Fellow None listed No fellow listed overnight: page the St\. Boniface attending\. Resident None listed Attending Ellis/);
  assert.doesNotMatch(hsc, /rost-rule/);
  h.click("rostday", {d: "2026-11-26"});
  assert.doesNotMatch(section(main(h.html()), "Who's on"), /rost-rule/);
});

test("Find someone lists when a person is on", () => {
  const h = phone("2026-11-24T09:00");
  const r = call(block());
  r.people = [{n: "Ames", full: "Avery Ames"}];
  added(h, r);
  const page = callPage(h);
  assert.match(page, /<input id="rostfind" type="search"/);
  h.els.rostfound = {innerHTML: "", hidden: true};
  const find = v => { h.fire("input", {id: "rostfind", value: v}); return h.els.rostfound; };
  const hits = box => [...box.innerHTML.matchAll(/<p class="rost-hit">(.*?)<\/p>/g)].map(m => text(m[1]));
  assert.equal(find("q").hidden, true);
  let box = find("quill");
  assert.equal(box.hidden, false);
  assert.equal(hits(box).length, 20);
  assert.deepEqual(hits(box).slice(0, 3), ["Tue 24 Nov · St. Boniface day · fellow", "Wed 25 Nov · St. Boniface day · fellow", "Thu 26 Nov · St. Boniface day · fellow"]);
  assert.ok(hits(box).includes("Tue 1 Dec · HSC night · fellow"));
  assert.match(text(box.innerHTML), /and \d+ more$/);
  // A full name from the sheets' footers finds its person; several people name each one.
  assert.equal(hits(find("AVERY"))[0], "Tue 24 Nov · HSC day · attending");
  assert.equal(hits(find("resident"))[0], "Tue 24 Nov · HSC day · resident · Resident G");
  assert.match(text(find("nobody").innerHTML), /^No one by that name from today on\.$/);
  // Drawn again, the words and what they found are still there.
  find("quill");
  h.run("route.keepScroll = true; render()");
  const again = main(h.html());
  assert.match(again, /<input id="rostfind" type="search" autocomplete="off"[^>]* value="quill">/);
  assert.match(again, /<div id="rostfound" class="card pad rost-found"><p class="rost-hit">Tue 24 Nov · St\. Boniface day · fellow<\/p>/);
});

test("the sheets sit at the bottom of Call and say which nights changed since", async () => {
  const h = phone("2026-11-12T09:00");
  await take(h, call(block()));
  h.click("rostcheck", {id: "acall000001"});
  h.click("rostadd", {id: "acall000001"});
  h.setNow("2026-11-20T10:00");
  put(h, swapOf([{d: "2026-12-03", site: "both", slot: "night", from: "me", to: "Sage"}]));
  h.val(`rosterSwap(__r.id, rosterClean(__r, callNow()), callNow())`);
  // Block 7's HSC sheet, its reading thrown away.
  const b7 = call(block({from: "2026-12-17", to: "2027-01-13"}), {id: "acall000007", h: "ihscsheet07"});
  b7.sheets = b7.sheets.slice(0, 1);
  await take(h, b7);
  h.run(`rosterThrow("acall000007", callNow())`);
  const page = callPage(h), at = page.indexOf("<h2>Shared sheets</h2>");
  assert.ok(at > page.indexOf("<h2>Upcoming</h2>") && at < page.indexOf("<h2>Paging numbers</h2>"), "above Paging numbers");
  const tiles = [...section(page, "Shared sheets").matchAll(/<button class="rost-sheet" data-action="rostpic" data-id="([^"]+)">([^]*?)<\/button>/g)];
  assert.deepEqual(tiles.map(m => [m[1], text(m[2])]), [
    [H1, "HSC Thu 19 Nov to Wed 16 Dec Changed since this sheet: Thu 3 Dec"],
    [S1, "St. Boniface Thu 19 Nov to Wed 16 Dec Changed since this sheet: Thu 3 Dec"],
    ["ihscsheet07", "HSC Thu 17 Dec to Wed 13 Jan Its reading was thrown away. Send it to Claude in chat."]]);
  h.click("rostpic", {id: S1});
  assert.match(h.html(), /<div class="rostview" role="dialog" aria-label="St\. Boniface sheet, Thu 19 Nov to Wed 16 Dec">/);
  h.click("rostpicx");
  assert.deepEqual(h.val("[route.page, 'rostPic' in route]"), ["call", false]);
});

test("Call with no roster says to share the sheets", () => {
  const page = callPage(phone());
  assert.equal(text(section(page, "Who's on")), "Who's on Share the call schedule to GI Hub to see who's on.");
  assert.doesNotMatch(page, /Shared sheets|rostfind/);
});

test("with a roster and none of your shifts, Call and Week say so, and Clear call data clears the roster", () => {
  const h = phone(undefined, "Tamsin");
  added(h, call(block()));
  const page = callPage(h);
  assert.equal(cards(section(page, "Who's on")).length, 2);
  assert.match(text(page), /No call shifts for you in the sheets you shared\./);
  assert.match(text(week(h)), /No call shifts for you in the sheets you shared\./);
  callPage(h);
  assert.match(main(h.html()), /data-action="callclear"/);
  h.click("callclear");
  assert.equal(toast(h), "Call data cleared");
  assert.deepEqual(h.val("RosterStore.state.days"), {});
  assert.match(text(section(main(h.html()), "Who's on")), /Share the call schedule to GI Hub/);
});

// ---- A roster file from chat ---------------------------------------------------------------------
// Call's Import with a file, as the file picker hands it over.
async function pick(h, name, data) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  h.fire("change", {id: "callfile", dataset: {}, value: name, files: [{name, arrayBuffer: async () => bytes.slice().buffer}]});
  for (let i = 0; i < 3; i++) await new Promise(r => setImmediate(r));
}
// The file Claude makes in chat: the same reading, with no pictures.
const chat = days => {
  const {id, item, line, ...r} = call(days);
  return {...r, sheets: r.sheets.map(({file, ...x}) => x)};
};
const ERR = /<div class="err" role="alert">That file isn't a call schedule GI Hub can read\.<\/div>/;

test("a roster file opens the same check", async () => {
  const h = phone();
  // The sender's reading was thrown away; its pictures stay on Call.
  await take(h, call(block()));
  h.click("rostcheck", {id: "acall000001"});
  h.click("rostnot", {id: "acall000001"});
  h.run(`go({page: "call", from: "week"})`);
  await pick(h, "GI-Call-Block6.json", JSON.stringify(chat(block())));
  const id = h.val("route.rost");
  assert.match(id, /^f[a-z0-9]{10}$/);
  assert.deepEqual(h.val("[route.page, route.from]"), ["call", "week"]);
  const page = main(h.html());
  assert.match(text(page), /^This week Read from the HSC and St\. Boniface sheets Check the new block 5 nights for you · 28 days at both sites/);
  assert.equal(count(section(page, "Your shifts"), '<article class="cst'), 5);
  // The pictures kept from the reading thrown away, to read beside it.
  assert.deepEqual([...section(page, "The sheets").matchAll(/data-action="rostpic" data-id="([^"]+)"/g)].map(m => m[1]), [H1, S1]);
  assert.match(page, new RegExp(`data-action="rostadd" data-id="${id}">(<svg[^]*?</svg>)?Add to Call<`));
  // Left for later, it waits on Week like any other.
  assert.match(text(cardOf(week(h))), /Call schedule, Thu 19 Nov to Wed 16 Dec 5 nights for you Check/);
  h.click("rostcheck", {id});
  h.click("rostadd", {id});
  assert.equal(toast(h), "Call: 5 nights added");
  assert.deepEqual(shifts(h), CASEY.map(d => `gi-roster-${d}-n`));
  // Read now, with the pictures kept; Call names the file.
  assert.deepEqual(h.val("RosterStore.state.sheets.map(x => [x.site, x.pic, !!x.unread])"), [["hsc", H1, false], ["stb", S1, false]]);
  assert.match(main(h.html()), /Last file: <b>GI-Call-Block6\.json<\/b>/);
  assert.match(text(cardOf(week(h))), /Call: 5 nights added Undo/);
});

test("an .ics file still imports as before", async () => {
  const h = phone();
  h.run(`go({page: "call", from: "week"})`);
  await pick(h, "call-sample.ics", require("node:fs").readFileSync(require("node:path").join(__dirname, "fixtures", "call-sample.ics")));
  assert.match(toast(h), /^Imported \d+ call shifts$/);
  assert.ok(h.val("CallStore.list().length") > 0);
  assert.deepEqual(h.val("[route.page, 'rost' in route]"), ["call", false]);
  assert.deepEqual(h.val("RosterStore.state.pend"), {});
  assert.doesNotMatch(main(h.html()), /role="alert"/);
});

test("a JSON file that isn't a roster says so", async () => {
  const h = phone();
  h.run(`go({page: "call", from: "week"})`);
  const empty = {...chat(block()), days: []};
  for (const [name, src] of [["pearl.json", JSON.stringify({kind: "pearl", t: "x"})], ["block6.json", JSON.stringify(empty)],
    ["block6.json", "{ not json"], ["list.json", "[1, 2]"]]) {
    h.run("callError = null");
    await pick(h, name, src);
    assert.match(main(h.html()), ERR, name + ": " + src);
    assert.deepEqual(h.val("[route.page, 'rost' in route]"), ["call", false]);
    assert.deepEqual(h.val("RosterStore.state.pend"), {});
  }
  // A good file after a bad one clears what was said.
  await pick(h, "GI-Call-Block6.json", JSON.stringify(chat(block())));
  assert.equal(h.val("callError"), null);
  assert.match(h.val("route.rost"), /^f[a-z0-9]{10}$/);
});

test("a swap file from chat opens the swap's check", async () => {
  const h = phone("2026-11-20T10:00");
  added(h, call(block()));
  h.run(`go({page: "call", from: "week"})`);
  const {id, item, line, ...sw} = swapOf([{d: "2026-12-03", site: "both", slot: "night", from: "me", to: "Sage"}]);
  await pick(h, "swap.json", JSON.stringify(sw));
  assert.match(h.val("route.rost"), /^f[a-z0-9]{10}$/);
  assert.match(text(main(h.html())), /Call swap Check what changed 1 change for you/);
});
