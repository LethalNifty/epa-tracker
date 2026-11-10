"use strict";
// Tell GI Hub on the phone. What you say to the Back Tap shortcut waits in an
// inbox on the reminder sender (tools/agenda), and Claude's cloud task files it
// there. This picks up what it filed, puts it in GI Hub once, and confirms it
// with the next plan upload, so the sender stops reminding from its own copy.
// Kept under gi-tell-v1, apart from the app's data so it never goes in a
// backup: {on, keys: {shortcut, claude} | null, added: [entry], seen: [ids],
// ack: [ids], wait}. The sender keeps only the keys' fingerprints. Loaded
// after alerts.js; reads agenda.js, pearls.js and app.js when it runs.
// Full app only: the fellows' build leaves this file out.

const TELL_STORE = "gi-tell-v1";
const TELL_EVERY = 20000;             // at most one pickup every 20 seconds
const TELL_AHEAD = 90;                // a change looks for what it means from today to 90 days ahead
const TELL_SEEN_MAX = 500, TELL_ACK_MAX = 200, TELL_ADDED_MAX = 40, TELL_CHOICES = 4;
const TELL_ID = /^a[a-z0-9]{10}$/;
// Words that say nothing about which event a change means.
const TELL_SKIP = new Set(["the", "my", "with", "and", "for", "appointment", "appt"]);

// tellKept: what's kept. tellBusy: making keys, for Settings. tellLast: the
// last pickup. tellShow: a key shown whole, on a phone that can't copy.
// tellResult: the test set's score, once asked for.
let tellKept = null, tellBusy = false, tellLast = -Infinity, tellErr = null, tellShow = null, tellResult = null;
function tellLoad() {
  if (tellKept) return tellKept;
  let k = null;
  try { k = JSON.parse(localStorage.getItem(TELL_STORE) || "null"); } catch (e) {}
  const arr = v => Array.isArray(v) ? v : [], keys = k && k.keys;
  tellKept = {on: !!(k && k.on), keys: keys && typeof keys.shortcut === "string" && typeof keys.claude === "string" ? {shortcut: keys.shortcut, claude: keys.claude} : null,
    added: arr(k && k.added), seen: arr(k && k.seen), ack: arr(k && k.ack), wait: (k && k.wait) || null};
  return tellKept;
}
function tellSave() { try { localStorage.setItem(TELL_STORE, JSON.stringify(tellKept)); } catch (e) {} }
const tellOn = () => alertsOn() && !!(tellLoad().on && tellKept.keys);

// ---- The keys -------------------------------------------------------------------------------------
async function tellFp(key) {
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)));
  return Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
}
// Turn on, or New keys: two fresh keys, and only their fingerprints to the
// sender. The old keys stop working as soon as the new ones are in.
function tellNewKeys() {
  tellErr = null; tellBusy = true; tellShow = null;
  return alertsRun(async () => {
    const keys = {shortcut: alertsToken(), claude: alertsToken()};
    try {
      const r = await alertsAsk("PUT", "/tell", {shortcut: await tellFp(keys.shortcut), claude: await tellFp(keys.claude)});
      if (r.status === 200) { const k = tellLoad(); k.on = true; k.keys = keys; tellSave(); }
      else { tellErr = alertsNoGo(r.status); if (r.status === 401) alertsGone = true; }
    } finally { tellBusy = false; }
    if (setSheet) { route.keepScroll = true; render(); }
  });
}
const tellTurnOn = tellNewKeys;
// Turn off: neither key opens anything any more. With no signal it stays on.
function tellTurnOff() {
  tellErr = null; tellShow = null;
  return alertsRun(async () => {
    const r = await alertsAsk("DELETE", "/tell");
    if (r.status === 200 || r.status === 401) { const k = tellLoad(); k.on = false; k.keys = null; k.wait = null; tellSave(); showToast("Tell GI Hub off"); }
    else tellErr = alertsNoGo(r.status);
    if (setSheet) { route.keepScroll = true; render(); }
  });
}
// Copy: the whole key on the clipboard. A phone that can't copy shows it whole instead.
function tellCopy(which) {
  const k = tellLoad().keys, key = k && k[which];
  if (!key) return;
  const redraw = () => { route.keepScroll = true; render(); };
  try {
    navigator.clipboard.writeText(key).then(() => { showToast(which === "shortcut" ? "Shortcut key copied" : "Claude key copied"); redraw(); },
      () => { tellShow = which; redraw(); });
  } catch (e) { tellShow = which; }
}

// ---- Picking up -----------------------------------------------------------------------------------
// What Claude filed, at most once every 20 seconds (force: a push said there's
// something). Each result goes in once, then waits in ack to be confirmed by
// the next plan upload. Redraws only when something changed, nothing is open
// and no field has focus, so a pickup never pulls a sheet or the keyboard away.
function tellPick(force) {
  if (!tellOn() || alertsGone) return Promise.resolve();
  const now = callNow();
  if (!force && now - tellLast < TELL_EVERY) return Promise.resolve();
  tellLast = now;
  return alertsRun(async () => {
    const r = await alertsAsk("GET", "/results");
    if (r.status === 401) { alertsGone = true; return; }
    if (r.status !== 200 || !r.data || !Array.isArray(r.data.results)) return;
    const k = tellLoad(), seen = new Set(k.seen);
    let fresh = 0;
    for (const res of r.data.results) {
      if (!res || typeof res.id !== "string" || !TELL_ID.test(res.id)) continue;
      if (!seen.has(res.id)) {
        // A call schedule or swap comes with its pictures or not at all: without
        // them it waits for the next pickup, unconfirmed.
        const roster = res.kind === "call" || res.kind === "callswap";
        const e = !roster ? tellApply(res, callNow()) : typeof rosterTake === "function" ? await rosterTake(res, callNow()) : null;
        if (e === undefined) continue;
        seen.add(res.id); k.seen.push(res.id);
        if (e) { k.added.push(e); fresh++; }
      }
      if (!k.ack.includes(res.id)) k.ack.push(res.id);
    }
    const was = JSON.stringify(k.wait);
    k.seen = k.seen.slice(-TELL_SEEN_MAX); k.ack = k.ack.slice(-TELL_ACK_MAX); k.added = tellTrim(k.added);
    k.wait = r.data.wait || null;
    tellSave();
    const a = document.activeElement;
    if ((fresh || was !== JSON.stringify(k.wait)) && !anySheet() && !(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA"))) {
      route.keepScroll = true; render();
    }
    alertsSync();
  });
}
// Picked up and waiting to be confirmed by the next plan upload (alerts.js).
const tellAcks = () => tellLoad().ack.slice();
function tellAcked(ids) {
  const k = tellLoad(), done = new Set(ids);
  k.ack = k.ack.filter(id => !done.has(id));
  tellSave();
}

// ---- Putting it in GI Hub ----------------------------------------------------------------------------
const tellDay = iso => { const d = agDate(iso); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const tellWhen = (d, s) => tellDay(d) + (s ? ", " + s : "");
const tellHM = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
// One result into GI Hub, once: the entry for the Claude added card
// {id, kind, line, at, chk?, undo?, ask?, scope?}, or null when it's already
// here. Events and to-dos keep the result's id; a pearl and a note take it
// with their own first letter. An idea is the desktop's; a scope case waits
// on the card for you to check it in Endo.
function tellApply(r, now) {
  const e = {id: r.id, kind: r.kind, line: typeof r.line === "string" ? r.line : "", at: now}, a = agState(), ts = new Date(now).toISOString();
  if (r.chk) e.chk = true;
  if (r.kind === "event" || r.kind === "todo") {
    if (a.items.some(x => x.id === r.id)) return null;
    const it = agItemClean(r.kind === "todo" ? {id: r.id, t: r.t, d: r.d, s: r.s, ts, todo: {q: r.q || "", tom: 0, done: null}}
      : {id: r.id, t: r.t, d: r.d, d2: r.d2 || null, s: r.s || null, e: r.e || null, n: r.n || "", ts});
    if (!it || it.id !== r.id) return null;
    a.items.push(it); Store.save();
    return {...e, undo: {del: it.id}};
  }
  if (r.kind === "pearl") {
    const id = "p" + r.id.slice(1), list = Store.state.pearls;
    if (list.some(p => p.id === id)) return null;
    const p = pearlClean({id, d: r.d, t: r.t, topic: r.topic || "", who: r.who || "", sent: null, ts});
    if (!p) return null;
    list.push(p); Store.save();
    return {...e, undo: {pearl: id}};
  }
  if (r.kind === "note") {
    const id = "n" + r.id.slice(1);
    if (a.notes.some(x => x.id === id) || !agAddNote(r.t, id)) return null;
    return {...e, undo: {note: id}};
  }
  if (r.kind === "scope") return typeof r.text === "string" && r.text ? {...e, scope: {text: r.text, d: r.d}} : null;
  if (r.kind === "idea") return e;
  if (r.kind === "change") return tellChange(r, e, now);
  return null;
}
// The one-off events and to-dos not done, from today to 90 days ahead, whose
// titles hold every word of the change's (3 letters or more, not the,
// appointment and the like), soonest first. Repeating events are never changed this way.
function tellMatch(m, today) {
  const words = (String(m).toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length >= 3 && !TELL_SKIP.has(w));
  if (!words.length) return [];
  const end = agAddDays(today, TELL_AHEAD), key = x => x.d + (x.s || "");
  return agState().items.filter(it => !it.rep && !(it.todo && it.todo.done) && (it.d2 || it.d) >= today && it.d <= end &&
    words.every(w => it.t.toLowerCase().includes(w))).sort((x, y) => key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0);
}
function tellWhat(r) {
  if (r.cancel) return "cancel";
  const to = r.to || {};
  return to.d ? "move to " + tellWhen(to.d, to.s) : to.s ? "move to " + to.s : "end at " + to.e;
}
// A change: one match changes (cancel removes it; Undo puts back what it was);
// none becomes a note to do by hand; several wait on the card for you to pick.
function tellChange(r, e, now) {
  const found = tellMatch(r.m || "", fmtDate(new Date(now)));
  if (!found.length) {
    const id = "n" + r.id.slice(1);
    if (agState().notes.some(x => x.id === id)) return null;
    agAddNote(`Couldn't find "${r.m}" to ${tellWhat(r)}`, id);
    return {...e, line: `Not found: ${r.m}, added to Notes`, undo: {note: id}};
  }
  if (found.length > 1) {
    const what = tellWhat(r);
    return {...e, line: `Which ${r.m}? ${what[0].toUpperCase() + what.slice(1)}`,
      ask: {...(r.cancel ? {cancel: true} : {to: r.to || {}}), choices: found.slice(0, TELL_CHOICES).map(x => ({id: x.id, t: x.t, d: x.d, s: x.s}))}};
  }
  return {...e, ...tellDo(found[0], r)};
}
// Applies a change to one item: the line it says, and what it was before for Undo.
function tellDo(it, r) {
  const before = JSON.parse(JSON.stringify(it)), chk = r.chk ? " (check this)" : "";
  if (r.cancel) { agRemove(it.id); return {line: `Cancelled: ${it.t}, ${tellWhen(it.d, it.s)}` + chk, undo: {put: before}}; }
  agUpdate(it.id, tellMove(it, r.to || {}));
  const now = agState().items.find(x => x.id === it.id) || it, to = r.to || {};
  return {line: (to.d || to.s ? `Moved: ${now.t} to ${tellWhen(now.d, now.s)}` : `Changed: ${now.t} ends at ${now.e}`) + chk, undo: {put: before}};
}
// What a change sets: a new day moves it whole (its last day with it); a new
// start keeps its length, past midnight too; a new end is only that. A to-do
// moved asks again at its new time.
function tellMove(it, to) {
  const d = to.d || it.d, f = {d};
  if (it.todo) { if (to.s) f.s = to.s; f.todo = {...it.todo, tom: 0}; return f; }
  if (to.s && it.s && it.e && !to.e) {
    const len = agDiff(it.d, it.d2 || it.d) * 1440 + agMin(it.e) - agMin(it.s), end = agMin(to.s) + len;
    return {...f, s: to.s, e: tellHM(((end % 1440) + 1440) % 1440), d2: end >= 1440 ? agAddDays(d, Math.floor(end / 1440)) : null};
  }
  if (it.d2) f.d2 = agAddDays(it.d2, agDiff(it.d, d));
  if (to.s) f.s = to.s;
  if (to.e && (to.s || it.s)) f.e = to.e;
  return f;
}

// ---- The Claude added card ----------------------------------------------------------------------------
// At the top of Week: what Claude added in the last day, newest first (in the
// order it filed them within one pickup), each with Undo; a scope case with
// Check in Endo, a change that matched several with its choices. Under it,
// when Claude is slow or its last start failed: Waiting for Claude.
// A row that waits on you (a scope case to check, a question to answer) stays
// past the day until you deal with it, and the 40 rows kept never push it out.
const TELL_SHOW = 24 * 3600000;
const tellWaits = e => !!(e.scope || e.ask || (e.call && typeof RosterStore === "object" && RosterStore.state.pend[e.call]));
function tellTrim(list) {
  let drop = list.length - TELL_ADDED_MAX;
  return list.filter(e => { if (drop > 0 && !tellWaits(e)) { drop--; return false; } return true; });
}
function tellRowHTML(e) {
  if (e.call && typeof rosterRowHTML === "function") return rosterRowHTML(e);
  const id = esc(e.id), line = esc(e.line.replace(/ \(check this\)$/, ""));
  const open = (e.kind === "event" || e.kind === "todo") && agState().items.some(x => x.id === e.id);
  const what = open ? `<button class="tellopen" data-action="agopen" data-id="${id}"><b>${line}</b></button>` : `<b>${line}</b>`;
  const undo = `<button class="textbtn" data-action="telundo" data-id="${id}">Undo</button>`;
  const acts = e.ask ? "" : e.scope ? `<button class="pick ghost" data-action="telscope" data-id="${id}">Check in Endo</button>${undo}` : undo;
  const picks = e.ask ? `<div class="tellpicks">` + e.ask.choices.map(c =>
    `<button class="pick ghost" data-action="telpick" data-id="${id}" data-item="${esc(c.id)}">${esc(c.t)}, ${esc(tellWhen(c.d, c.s))}</button>`).join("") +
    `<button class="pick ghost" data-action="telpick" data-id="${id}" data-item="">Neither</button></div>` : "";
  return `<div class="tellrow"><div class="tellwhat">${what}${e.chk ? `<span class="tellchk mono">Check this</span>` : ""}</div>` +
    (acts ? `<div class="tella">${acts}</div>` : "") + picks + `</div>`;
}
function tellCardHTML() {
  const k = tellLoad(), now = callNow();
  const rows = k.added.map((e, i) => [e, i]).filter(([e]) => e.at > now - TELL_SHOW || tellWaits(e)).sort((x, y) => y[0].at - x[0].at || x[1] - y[1])
    .map(([e]) => tellRowHTML(e)).filter(Boolean);
  const w = tellOn() && k.wait;
  if (!rows.length && !w) return "";
  const why = w && w.err === "setup" ? ": the task isn't set up yet" : w && w.err ? `: it couldn't start (error ${esc(String(w.err))})` : "";
  return `<section class="sec tellsec">` + (rows.length ? `<div class="card tellcard"><p class="tellhead mono">Claude added</p>${rows.join("")}</div>` : "") +
    (w ? `<p class="tellwait mono">Waiting for Claude${why}</p>` : "") + `</section>`;
}
// Undo: an event or to-do goes; a change puts back what it was (a cancelled
// event comes back); a note goes; a pearl goes unless it was sent; an idea
// leaves the desktop's list. The row goes either way.
function tellUndo(id) {
  const k = tellLoad(), e = k.added.find(x => x.id === id);
  if (!e) return;
  const u = e.undo || {};
  let msg = "Undone";
  if (u.del) agRemove(u.del);
  else if (u.put) {
    const a = agState(), it = agItemClean(u.put), i = a.items.findIndex(x => x.id === u.put.id);
    if (it) { if (i >= 0) a.items[i] = it; else a.items.push(it); Store.save(); }
  } else if (u.note) agRemoveNote(u.note);
  else if (u.roster) { if (typeof rosterUndo === "function") rosterUndo(u.roster); }
  else if (u.pearl) {
    const p = Store.state.pearls.find(x => x.id === u.pearl);
    if (p && p.sent) msg = "Already sent, so it stays in Pearls";
    else if (p) { Store.state.pearls = Store.state.pearls.filter(x => x !== p); Store.save(); }
  }
  if (e.kind === "idea") alertsRun(() => alertsAsk("DELETE", "/idea/" + e.id));
  k.added = k.added.filter(x => x !== e); tellSave();
  showToast(msg);
}
// Which one a change meant: it applies to that one, and the row says what it
// did, with Undo, for a day from now. Neither: nothing changes and the question goes.
function tellChoose(id, item) {
  const k = tellLoad(), e = k.added.find(x => x.id === id && x.ask);
  if (!e) return;
  const it = item && agState().items.find(x => x.id === item);
  if (it) { Object.assign(e, tellDo(it, {cancel: e.ask.cancel, to: e.ask.to, chk: e.chk}), {at: callNow()}); delete e.ask; }
  else { k.added = k.added.filter(x => x !== e); if (item) showToast("That one's gone"); }
  tellSave();
}
// A scope case: the + sheet's Case box with its words, read as the day it was
// said. The case is the Case box's now (kept as a draft like anything typed
// there), so its row goes.
function tellScope(id) {
  const k = tellLoad(), e = k.added.find(x => x.id === id && x.scope);
  if (!e) return;
  scopeCap = {text: e.scope.text, cards: [], removed: 0, day: e.scope.d};
  scopeOpenCapture();
  scopeRead();
  k.added = k.added.filter(x => x !== e); tellSave();
}

// ---- Settings -------------------------------------------------------------------------------------
const TELL_WHAT = `<p class="rnote">Say it to the Back Tap shortcut. Claude files it in a few minutes: events, to-dos, pearls, scope cases and notes.</p>`;
function tellKeyHTML(which, label) {
  const key = tellKept.keys[which];
  return `<div class="rrow tellkey"><span class="mono">${label}</span><span>ending <b>${esc(key.slice(-4))}</b></span>` +
    `<button class="textbtn" data-action="telcopy" data-which="${which}">Copy</button></div>` +
    (tellShow === which ? `<input class="tellshow mono" type="text" readonly value="${esc(key)}" aria-label="${label}">` : "");
}
const tellBrief = x => [x.kind, ...[x.d, x.s].filter(Boolean).map(v => Array.isArray(v) ? v.join(" or ") : v)].join(" ");
// A miss in words: what was wanted and what came, or, for the made-up sheets, what was read wrong.
const tellMissWords = m => Array.isArray(m.words) ? m.words.join("; ") :
  `Wanted ${(m.want || []).map(tellBrief).join(", ")}; got ${m.got && m.got.length ? m.got.map(tellBrief).join(", ") : "nothing"}`;
function tellTestHTML() {
  const s = tellResult, miss = m => `<li><b>${esc(m.say)}</b><span class="mono">${esc(tellMissWords(m))}</span></li>`;
  return `<p class="rnote">The test set: 23 made-up things said and a pair of made-up call sheets, to see how Claude files them. Check it a few minutes after you run it.</p>` +
    `<div class="rbtns"><button class="btn" data-action="teltest">Run the test set</button><button class="btn" data-action="telscore">Check the test</button></div>` +
    (s ? `<p class="rnote"><b>${s.right} of ${s.n} right</b>${s.done < s.n ? `, ${s.done} filed so far` : ""}.</p>` +
      (s.misses && s.misses.length ? `<ul class="tellmiss">${s.misses.map(miss).join("")}</ul>` : "") : "");
}
// After Reminders: the keys to copy, New keys, Turn off and the test set; or
// turning it on; or, with reminders off, that they come first.
function tellGroupHTML() {
  const st = remindState();
  if (st === "none" || st === "install") return "";
  const ready = alertsOn() && !alertsGone, on = ready && tellOn();
  let body;
  if (!ready) body = `<p class="rnote">Tell GI Hub uses the reminder sender: turn reminders on first.</p>`;
  else if (tellBusy) body = `<p class="rnote">Making the keys…</p>`;
  else if (!on) body = TELL_WHAT + `<button class="btn primary" data-action="telon">Turn on Tell GI Hub</button>`;
  else body = TELL_WHAT + tellKeyHTML("shortcut", "Shortcut key") + tellKeyHTML("claude", "Claude key") +
    `<div class="rbtns"><button class="btn" data-action="telkeys">New keys</button><button class="btn danger" data-action="teloff">Turn off</button></div>` + tellTestHTML();
  return `<div class="setgrp"><div class="set-h mono"><span>Tell GI Hub</span><span${on ? ` class="ok"` : ""}>${on ? "On" : "Off"}</span></div>` +
    `<div class="card pad remind tell">${body}${tellErr ? `<div class="err" role="alert">${esc(tellErr)}</div>` : ""}</div></div>`;
}
// The test set into the inbox; then, a few minutes later, how Claude did.
function tellTestRun() {
  tellErr = null;
  return alertsRun(async () => {
    const r = await alertsAsk("POST", "/tell/test");
    if (r.status === 200) { tellResult = null; showToast("Test set sent. Check it in a few minutes."); }
    else tellErr = alertsNoGo(r.status);
    if (setSheet) { route.keepScroll = true; render(); }
  });
}
function tellTestScore() {
  tellErr = null;
  return alertsRun(async () => {
    const r = await alertsAsk("GET", "/tell/test");
    if (r.status === 200 && r.data && Number.isFinite(r.data.n)) tellResult = r.data;
    else tellErr = alertsNoGo(r.status);
    if (setSheet) { route.keepScroll = true; render(); }
  });
}

// ---- The + box -------------------------------------------------------------------------------------
// With Tell GI Hub on, the + has a fourth switch, Tell: a box for what you'd
// say to the shortcut, for when talking out loud won't do. It goes to the same
// inbox with the phone's token, said at the phone's clock and offset.
// tellSheet: {text, busy, err, focus} while the + flow has it (app.js plusOn "t").
let tellSheet = null;
function tellOpen() {
  if (!tellSheet) tellSheet = {text: "", busy: false, err: null, focus: true};
}
// The phone's clock with its offset: 2026-11-09T14:05:00-05:00.
function tellAt(ms) {
  const d = new Date(ms), off = -d.getTimezoneOffset(), p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
    (off < 0 ? "-" : "+") + p(Math.floor(Math.abs(off) / 60)) + ":" + p(Math.abs(off) % 60);
}
function tellSheetHTML() {
  const s = tellSheet;
  return `<div class="scrim" data-action="telclose"></div>` +
    `<div class="sheet tellsheet" role="dialog" aria-modal="true" aria-label="Tell GI Hub">` + plusHeadHTML("telclose") +
    `<p class="ssub">What you'd say to the shortcut. Claude files it in a few minutes. No patient names or numbers.</p>` +
    `<section class="monitor capmon" aria-label="Tell GI Hub"><div class="monitor-in">` +
    `<div class="ov mono"><span>${tellDay(fmtDate(getToday()))}</span><span>Tell</span></div>` +
    `<textarea id="tellbox" class="capbox" rows="4" maxlength="4000" data-tel="text" placeholder="Dentist Friday at 3" ` +
    `autocapitalize="sentences" aria-label="Say or type what to tell GI Hub">${esc(s.text)}</textarea>` +
    `<div class="cap-f"><span class="cap-hint">${ic("mic", "sm")}<span>Tap the mic on your keyboard and say it.</span></span></div></div></section>` +
    (s.err ? `<div class="err" role="alert">${esc(s.err)}</div>` : "") +
    `<div class="sactions"><button class="btn primary" data-action="telsay"${s.busy ? " disabled" : ""}>${s.busy ? "Sending…" : "Send to Claude"}</button></div></div>`;
}
// Typing keeps the words; nothing redraws.
function tellField(t) {
  if (!tellSheet || !t.dataset || t.dataset.tel !== "text") return false;
  tellSheet.text = t.value;
  return true;
}
// Switching to Tell brings the keyboard up on its box, one tap from the mic.
function tellAfterRender() {
  if (!tellSheet || !tellSheet.focus || plusOn !== "t") return;
  tellSheet.focus = false;
  const box = document.getElementById("tellbox");
  if (box && box.focus) try { box.focus({preventScroll: true}); } catch (e) {}
}
// Sent: the + closes and says so. Not sent: the box keeps the words and says
// why (a toast does, if the box was closed meanwhile).
function tellSay() {
  const s = tellSheet;
  if (!s || s.busy) return;
  const text = s.text.trim();
  if (!text) { s.err = "Type or say something first."; return; }
  s.busy = true; s.err = null;
  alertsRun(async () => {
    const r = await alertsAsk("POST", "/inbox", {text, at: tellAt(callNow())});
    if (r.status === 401) alertsGone = true;
    const err = r.status === 200 ? null : r.status === 0 ? "Not sent. Try again when you have signal." : "Not sent. " + alertsNoGo(r.status);
    s.busy = false;
    if (tellSheet === s) { if (err) s.err = err; else tellSheet = null; }
    if (!err) showToast("Sent to Claude. It files it in a few minutes.");
    else if (tellSheet !== s) showToast(err);
    // Not over someone typing on another part of the +.
    const a = document.activeElement;
    if (plusOn === "t" || !(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA"))) { route.keepScroll = true; render(); }
  });
}

// ---- Taps -------------------------------------------------------------------------------------------
// Every tel* action. Returns false when it redraws by itself.
function tellDispatch(act, d) {
  if (act === "telon") tellTurnOn();
  else if (act === "telkeys") { if (confirm("Make new keys? The shortcut and Claude's task stop working until you paste the new ones in.")) tellNewKeys(); }
  else if (act === "teloff") tellTurnOff();
  else if (act === "telcopy") tellCopy(d.which);
  else if (act === "teltest") tellTestRun();
  else if (act === "telscore") tellTestScore();
  else if (act === "telundo") tellUndo(d.id);
  else if (act === "telpick") tellChoose(d.id, d.item);
  else if (act === "telscope") tellScope(d.id);
  else if (act === "telsay") tellSay();
  else if (act === "telclose") tellSheet = null;
  return true;
}
