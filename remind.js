"use strict";
// GI Hub reminders on this phone: whether push notifications can work here,
// what Week and Settings show about them, and the brief the service worker
// reads to write each notification: this week's EPAs, the shifts to come and
// who's on, the events with an alert. The brief stays on the phone, in Cache
// Storage. Joining the reminder sender (tools/agenda) and the plan it is given
// (alertsConnect, alertPlan) are the full app's own, loaded after this file; the
// fellows' build has neither, so reminders never show there.
// Loaded after notify.js and before app.js; the views use app.js helpers when
// they run.

const REMIND_KEY = "gi-remind-v1";
const REMIND_CACHE = "gi-brief";
let remindSub = null, remindLast = null, remindErr = null, remindReady = false, remindBriefKey = "";
// When GI Hub was last on screen: the icon badge counts only forms that passed 14 days since.
let remindSeenAt = 0;

const RemindStore = {
  state: {dismissed: false},
  load() { try { const s = JSON.parse(localStorage.getItem(REMIND_KEY)); if (s) this.state = {dismissed: !!s.dismissed}; } catch (e) {} },
  save() { try { localStorage.setItem(REMIND_KEY, JSON.stringify(this.state)); } catch (e) {} },
};

// "ok"; "install" in Safari outside the home-screen app, where iPhone offers
// no push; "none" where the browser can't, and in the fellows' edition.
function remindSupport() {
  if (FELLOWS || typeof alertsConnect !== "function") return "none";
  const n = typeof navigator === "undefined" ? {} : navigator;
  if (!("serviceWorker" in n) || typeof PushManager === "undefined" || typeof Notification === "undefined")
    return n.standalone === false ? "install" : "none";
  return "ok";
}
// off: not on; move: this phone still has the old sender's subscription, from
// before the sender moved to Cloudflare; on: connected; reconnect: connected
// once, but the subscription is gone or the sender says it no longer reaches it.
function remindState() {
  const s = remindSupport();
  if (s !== "ok") return s;
  if (Notification.permission === "denied") return "denied";
  const on = alertsOn();
  if (!remindSub) return on ? "reconnect" : "off";
  if (!on) return "move";
  return alertsGone ? "reconnect" : "on";
}
function remindB64(s) {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
async function remindRead(name) {
  try { const r = await (await caches.open(REMIND_CACHE)).match(name); return r ? await r.json() : null; } catch (e) { return null; }
}
// Checks the subscription, the last reminder and, on a connected phone, what
// the sender still has; then redraws if that changes the screen.
async function remindInit() {
  RemindStore.load();
  if (remindSupport() !== "ok") { remindReady = true; return; }
  const before = remindReady ? remindState() : null;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    remindSub = sub ? sub.toJSON() : null;
  } catch (e) {}
  remindLast = await remindRead("__gi-push.json");
  if (remindSub) await alertsCheck();
  remindReady = true;
  if (remindState() !== before && ((route.page === "week" && !anySheet()) || setSheet)) { route.keepScroll = true; render(); }
}

// ---- The brief the service worker reads -----------------------------------------
// This block week and the two after it, as the coach sees them now, plus the
// shifts to come. Rewritten whenever it changes, only on a subscribed phone.
function remindBrief(now) {
  const d = new Date(now), thu = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() + 3) % 7), weeks = [];
  for (let k = 0; k < 3; k++) {
    const start = new Date(thu.getFullYear(), thu.getMonth(), thu.getDate() + 7 * k);
    const noon = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12), blk = blockFor(noon);
    if (!blk) continue;
    weeks.push({start: start.getTime(), block: blk.num, week: blk.week,
      rows: weekRows(Store.state.obs, noon).filter(r => r.outstanding > 0).map(r => ({label: r.label, n: r.outstanding}))});
  }
  const call = callStretches(CallStore.list()).filter(st => st.e > now).slice(0, 16)
    .map(st => ({s: st.s, e: st.e, segs: st.segs.map(x => ({s: x.s, e: x.e, hsc: x.hsc, stb: x.stb, so: x.so}))}));
  const str = callStretches(CallStore.list()), day = new Date(now);
  const nights = studyBriefNights(day, Store.state.study, str).map(n => {
    const qn = n.to > n.from && typeof studyqFor === "function" ? studyqFor(n.from, n.to).length : 0;
    return qn ? {...n, qn} : n;
  });
  const study = {nights, weeks: studyReadWeeks(day, Store.state.study, str)};
  // How many pearls wait to be sent: never their words or who said them.
  const pearls = {unsent: Store.state.pearls.filter(p => !p.sent).length};
  // Events with an alert, for their notifications (alertOccurrences, full app only).
  const agenda = typeof alertOccurrences === "function" ? alertOccurrences(now) : [];
  // When each form worth chasing passes 14 days, for the icon badge: dates only.
  return {v: 1, at: now, weeks, call, study, pearls, agenda, chase: chaseDue(Store.state.obs), seen: remindSeenAt};
}
// GI Hub opened or put away: clear the icon badge, and count everything up to
// now as seen so a later reminder badges only what's new.
function remindOpened() {
  remindSeenAt = callNow();
  try { if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {}); } catch (e) {}
  remindAfterRender();
}
// After each redraw: a changed plan goes to the sender (alertsSync), and a
// changed brief is saved for the service worker.
function remindAfterRender() {
  if (typeof alertsSync === "function") alertsSync();
  if (!remindSub || typeof caches === "undefined") return;
  let brief;
  try { brief = remindBrief(callNow()); } catch (e) { return; }
  const key = JSON.stringify({...brief, at: 0});
  if (key === remindBriefKey) return;
  remindBriefKey = key;
  caches.open(REMIND_CACHE).then(c => c.put("__gi-brief.json",
    new Response(JSON.stringify(brief), {headers: {"content-type": "application/json"}}))).catch(() => { remindBriefKey = ""; });
}
// The next reminder this phone expects: the first still to come in the plan
// it gives the sender (alertPlan).
function remindNext(now) {
  const msg = alertPlan(now).find(a => a.t > now);
  return {msg, notice: noticeFor(msg, remindBrief(msg.t), msg.t)};
}

// ---- Views -------------------------------------------------------------------------
const REMIND_WHAT = `<ul class="rlist"><li><span class="mono">Mon 08:00</span><span>The week's EPAs, and any call coming up</span></li>` +
  `<li><span class="mono">Wed 08:00</span><span>What's still due, so you can ask today</span></li>` +
  `<li><span class="mono">1 h before call</span><span>Who's on at HSC and St. Boniface</span></li>` +
  `<li><span class="mono">20:00</span><span>Tonight's Mayo pages, on reading nights</span></li>` +
  `<li><span class="mono">Sun 17:00</span><span>Pearls to send, before Sunday's cards</span></li>` +
  `<li><span class="mono">Events</span><span>19:00 the evening before, and 30 minutes before</span></li></ul>`;
// Week: a row that opens Settings while reminders are off ("Not now" hides it
// for good), and always while they need moving or have stopped reaching this phone.
const REMIND_ROWS = {off: ["Reminders are off", "EPAs, call, reading nights and events, on this phone", "Set up"],
  move: ["Move your reminders", "One tap, and Agenda events remind you too", "Move"],
  reconnect: ["Reminders stopped", "They aren't reaching this phone", "Fix"]};
function remindRowHTML() {
  if (!remindReady) return "";
  const st = remindState(), row = REMIND_ROWS[st];
  if (!row || (st === "off" && RemindStore.state.dismissed)) return "";
  return `<div class="card setnudge"><button class="sn-main" data-action="setopen">${ic("bell")}` +
    `<span class="sn-tx"><b>${row[0]}</b><span>${row[1]}</span></span><span class="sn-go">${row[2]}</span></button>` +
    (st === "off" ? `<button class="iconbtn" data-action="reminddismiss" aria-label="Not now">${ic("x")}</button>` : "") + `</div>`;
}
// Settings: status and controls.
function remindGroupHTML() {
  const st = remindState();
  if (st === "none") return "";
  const label = {install: "Home screen only", denied: "Blocked", off: "Off", move: "Move needed", on: "On", reconnect: "Stopped"}[st];
  const turnOn = text => `<button class="btn primary" data-action="remindon">${ic("bell")}${text}</button>`;
  const turnOff = `<button class="textbtn" data-action="remindoff">Turn off</button>`;
  let body;
  if (st === "install") body = `<p class="rnote">Open GI Hub from your home screen to turn on reminders. iPhone only allows them there.</p>`;
  else if (st === "denied") body = `<p class="rnote">Notifications are blocked for GI Hub. Turn them on in iPhone Settings, Notifications, GI Hub, then come back.</p>`;
  else if (!remindReady) body = `<p class="rnote">Checking this phone…</p>`;
  else if (alertsBusy) body = `<p class="rnote">Connecting this phone to GI Hub's sender…</p>`;
  else if (st === "off") body = REMIND_WHAT + turnOn("Turn on reminders");
  else if (st === "move") body = `<p class="rnote">GI Hub's reminders have a new sender, and it reminds you about Agenda events too. ` +
    `Move them with one tap, then a test reminder arrives.</p>` + REMIND_WHAT + turnOn("Move reminders") + turnOff;
  else if (st === "reconnect") body = `<p class="rnote">Reminders stopped reaching this phone. Turn them on again to reconnect it.</p>` +
    turnOn("Turn on again") + turnOff;
  else {
    const nx = remindNext(callNow()), when = t => `${DAYS[new Date(t).getDay()]} ${new Date(t).getDate()} ${MONTHS[new Date(t).getMonth()]}, ${callHM(t)}`;
    body = REMIND_WHAT + `<div class="rrow"><span class="mono">Next</span><span><b>${when(nx.msg.t)}</b> · ${esc(nx.notice.title)}</span></div>` +
      (remindLast ? `<div class="rrow"><span class="mono">Last</span><span>${when(remindLast.at)}</span></div>` : "") +
      `<div class="rbtns"><button class="btn" data-action="remindtest">Send a test</button>` +
      `<button class="btn danger" data-action="remindoff">Turn off</button></div>`;
  }
  return `<div class="setgrp"><div class="set-h mono"><span>Reminders</span><span${st === "on" ? ` class="ok"` : ""}>${label}</span></div>` +
    `<div class="card pad remind">${body}${remindErr ? `<div class="err" role="alert">${esc(remindErr)}</div>` : ""}</div></div>`;
}
