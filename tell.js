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
        seen.add(res.id); k.seen.push(res.id);
        const e = tellApply(res, callNow());
        if (e) { k.added.push(e); fresh++; }
      }
      if (!k.ack.includes(res.id)) k.ack.push(res.id);
    }
    const was = JSON.stringify(k.wait);
    k.seen = k.seen.slice(-TELL_SEEN_MAX); k.ack = k.ack.slice(-TELL_ACK_MAX); k.added = k.added.slice(-TELL_ADDED_MAX);
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
  if (found.length > 1)
    return {...e, ask: {...(r.cancel ? {cancel: true} : {to: r.to || {}}), choices: found.slice(0, TELL_CHOICES).map(x => ({id: x.id, t: x.t, d: x.d, s: x.s}))}};
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

// ---- Settings -------------------------------------------------------------------------------------
const TELL_WHAT = `<p class="rnote">Say it to the Back Tap shortcut. Claude files it in a few minutes: events, to-dos, pearls, scope cases and notes.</p>`;
function tellKeyHTML(which, label) {
  const key = tellKept.keys[which];
  return `<div class="rrow tellkey"><span class="mono">${label}</span><span>ending <b>${esc(key.slice(-4))}</b></span>` +
    `<button class="textbtn" data-action="telcopy" data-which="${which}">Copy</button></div>` +
    (tellShow === which ? `<input class="tellshow mono" type="text" readonly value="${esc(key)}" aria-label="${label}">` : "");
}
const tellBrief = x => [x.kind, ...[x.d, x.s].filter(Boolean).map(v => Array.isArray(v) ? v.join(" or ") : v)].join(" ");
const tellMissWords = m => `Wanted ${tellBrief(m.want || {})}; got ${m.got && m.got.length ? m.got.map(tellBrief).join(", ") : "nothing"}`;
function tellTestHTML() {
  const s = tellResult, miss = m => `<li><b>${esc(m.say)}</b><span class="mono">${esc(tellMissWords(m))}</span></li>`;
  return `<p class="rnote">The test set: 20 made-up things said, to see how Claude files them. Check it a few minutes after you run it.</p>` +
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

// ---- Taps -------------------------------------------------------------------------------------------
// Every tel* action. Returns false when it redraws by itself.
function tellDispatch(act, d) {
  if (act === "telon") tellTurnOn();
  else if (act === "telkeys") { if (confirm("Make new keys? The shortcut and Claude's task stop working until you paste the new ones in.")) tellNewKeys(); }
  else if (act === "teloff") tellTurnOff();
  else if (act === "telcopy") tellCopy(d.which);
  else if (act === "teltest") tellTestRun();
  else if (act === "telscore") tellTestScore();
  return true;
}
