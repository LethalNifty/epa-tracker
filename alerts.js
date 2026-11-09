"use strict";
// GI Hub's reminders, sent by the reminder sender (tools/agenda/worker.mjs):
// every reminder this phone wants over the next five weeks, as kinds and times
// only, and joining the sender. The words stay on the phone, in the brief
// remind.js saves, so no titles, names or notes leave it. Loaded after
// remind.js; reads agenda.js, call.js, study.js and app.js when it runs.
// Full app only: the fellows' build leaves this file out.

const ALERT_DAYS = 35;                // how far ahead the sender is told: five weeks
const ALERT_EVE = 19;                 // 19:00 the evening before an event
const ALERT_SOON = 30 * 60000;        // and 30 minutes before it starts

const alertDay = (d0, k, h = 0) => new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + k, h);
const alertMidnight = now => { const d = new Date(now); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };

// Each time an event starts in the plan's days (and the day after, whose
// evening reminder falls inside them) with an alert on: its id with the day,
// the day, the start ("HH:MM", null all day), title, note, and which alerts.
// A to-do still to ask (not done, fewer than two Tomorrows) is there on its
// day with todo and its question instead. The service worker writes the
// notification from this.
function alertOccurrences(now) {
  const d0 = alertMidnight(now), out = [];
  for (let k = 0; k <= ALERT_DAYS; k++) {
    const iso = fmtDate(alertDay(d0, k));
    for (const it of agState().items) {
      if (!agStartsOn(it, iso)) continue;
      if (it.todo) {
        if (!it.todo.done && it.todo.tom < 2) out.push({id: it.id + "@" + iso, d: iso, s: it.s, t: it.t, n: it.n, todo: true, q: it.todo.q});
        continue;
      }
      const al = agAlerts(it);
      if (al.length) out.push({id: it.id + "@" + iso, d: iso, s: it.s, t: it.t, n: it.n, eve: al.includes("eve"), soon: al.includes("30")});
    }
  }
  return out;
}

// Every reminder from local midnight today for ALERT_DAYS days, soonest
// first: Monday and Wednesday at 08:00, Sunday at 17:00, 20:00 on reading
// nights to the plan's last day, an hour before each call, each event's, and
// each to-do's one ask at its time.
// The same all day, so redrawing the app never sends it again.
const alertAt = (day, hm) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), +hm.slice(0, 2), +hm.slice(3)).getTime();
function alertPlan(now) {
  const d0 = alertMidnight(now), from = d0.getTime(), to = alertDay(d0, ALERT_DAYS).getTime(), out = [];
  const str = callStretches(CallStore.list());
  for (let k = 0; k < ALERT_DAYS; k++) {
    const day = alertDay(d0, k), wd = day.getDay();
    if (wd === 1) out.push({t: alertDay(d0, k, 8).getTime(), kind: "week"});
    if (wd === 3) out.push({t: alertDay(d0, k, 8).getTime(), kind: "ask"});
    if (wd === 0) out.push({t: alertDay(d0, k, 17).getTime(), kind: "pearls"});
    if (fmtDate(day) <= fmtDate(STUDY_END) && studyNightKind(day, str, []) === "read") out.push({t: studyEveningMs(day), kind: "study"});
  }
  for (const st of str) out.push({t: st.s - HOUR_MS, kind: "call", s: st.s});
  const eves = new Set();
  for (const o of alertOccurrences(now)) {
    const day = agDate(o.d);
    if (o.todo) { out.push({t: alertAt(day, o.s), kind: "todo", id: o.id}); continue; }
    if (o.soon) {
      const s = alertAt(day, o.s);
      out.push({t: s - ALERT_SOON, kind: "ev", s, id: o.id});
    }
    // One evening reminder for a day, however many events it has.
    if (o.eve && !eves.has(o.d)) { eves.add(o.d); out.push({t: alertDay(day, -1, ALERT_EVE).getTime(), kind: "eve", d: o.d}); }
  }
  return out.filter(a => a.t >= from && a.t < to).sort((a, b) => a.t - b.t);
}

// ---- Joining the sender ----------------------------------------------------------------------------
// The sender's address (tools/agenda/wrangler.toml). The phone keeps
// {tok, key, sent} under gi-alerts-v1, apart from the app's data so it never
// goes in a backup: the token that shows the sender it's this phone (made here
// at random; the sender keeps only its fingerprint, and the first phone to
// connect holds it), the sender's public key this phone subscribed with, and
// the last plan the sender took.
const ALERTS_URL = "https://gi-hub-agenda.lethalnifty.workers.dev", ALERTS_STORE = "gi-alerts-v1";
const ALERTS_RETRY = 60000;           // after a failed upload, a minute before the next try

// alertsKept: what's kept. alertsGone: the sender said it no longer reaches
// this phone. alertsBusy: turning on, for Settings. alertsWork: the sender
// work in flight, one piece at a time, in order (tests wait on it).
let alertsKept = null, alertsGone = false, alertsBusy = false, alertsWork = null, alertsSyncing = false, alertsWait = 0;
function alertsLoad() {
  if (alertsKept) return alertsKept;
  try { alertsKept = JSON.parse(localStorage.getItem(ALERTS_STORE) || "null"); } catch (e) {}
  if (!alertsKept || typeof alertsKept !== "object") alertsKept = {};
  return alertsKept;
}
function alertsSave() {
  try { if (alertsKept.tok) localStorage.setItem(ALERTS_STORE, JSON.stringify(alertsKept)); else localStorage.removeItem(ALERTS_STORE); } catch (e) {}
}
const alertsOn = () => !FELLOWS && !!(alertsLoad().tok && alertsKept.key);
// 32 random bytes in base64url: the 43 characters the sender expects.
function alertsToken() {
  let s = "";
  for (const b of crypto.getRandomValues(new Uint8Array(32))) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const alertsNoGo = st => st === 0 ? "Couldn't reach GI Hub's sender. Try again when you have signal." :
  st === 401 ? "GI Hub's sender is connected to another phone. Ask Claude to free it." : `GI Hub's sender answered with error ${st}. Try again later.`;

// One request: {status, data}; status 0 with no connection, or no answer in 30 seconds.
async function alertsAsk(method, p, body, tok = alertsLoad().tok) {
  if (typeof fetch !== "function") return {status: 0, data: null};
  const ctl = typeof AbortController === "function" ? new AbortController() : null, t = ctl && setTimeout(() => ctl.abort(), 30000);
  try {
    const headers = {};
    if (tok) headers.Authorization = "Bearer " + tok;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(ALERTS_URL + p, {method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctl ? ctl.signal : undefined});
    let data = null;
    try { data = JSON.parse(await res.text()); } catch (e) {}
    return {status: res.status, data};
  } catch (e) { return {status: 0, data: null}; }
  finally { clearTimeout(t); }
}
function alertsRun(fn) {
  alertsWork = (alertsWork || Promise.resolve()).then(fn).catch(() => {});
  return alertsWork;
}

// The plan to the sender, unless it's what the sender already has. A failure
// waits a minute; a refused token means the sender no longer knows this phone.
async function alertsSend() {
  const list = alertPlan(callNow()), text = JSON.stringify(list);
  if (text === alertsKept.sent) return;
  const r = await alertsAsk("PUT", "/alerts", {list});
  if (r.status === 200) { alertsKept.sent = text; alertsSave(); alertsWait = 0; return; }
  alertsWait = callNow() + ALERTS_RETRY;
  if (r.status === 401) alertsGone = true;
}
// After each redraw: a changed plan goes to the sender. One upload at a time,
// a change saved while one is on its way goes straight after it, and after a
// failure nothing for a minute (and again whenever GI Hub opens).
// The plan only changes with what's saved or at midnight, so redraws cost nothing.
function alertsSync() {
  if (alertsSyncing || alertsBusy || alertsGone || !alertsOn() || callNow() < alertsWait) return;
  if (JSON.stringify(alertPlan(callNow())) === alertsKept.sent) return;
  alertsSyncing = true;
  alertsRun(async () => {
    try { await alertsSend(); } finally { alertsSyncing = false; }
    if (alertsGone && ((route.page === "week" && !anySheet()) || setSheet)) { route.keepScroll = true; render(); }
    else alertsSync();
  });
}
// GI Hub opened on a connected phone: does the sender still reach it, with the
// key it subscribed with, and does it still have the plan?
function alertsCheck() {
  if (!alertsOn()) return Promise.resolve();
  return alertsRun(async () => {
    const r = await alertsAsk("GET", "/status");
    if (r.status === 401) alertsGone = true;
    else if (r.status === 200 && r.data) {
      alertsGone = !r.data.sub || r.data.key !== alertsKept.key;
      if (!r.data.kept && alertsKept.sent) { alertsKept.sent = null; alertsSave(); }
    }
    alertsWait = 0;
  });
}

// Turn on, Move reminders, or Turn on again: permission, the sender's key, a
// fresh subscription made with it, this phone to the sender, the plan, a test.
function alertsConnect() {
  remindErr = null; alertsBusy = true;
  // Asked in the tap itself: iPhone shows the question only to a tap, not to
  // anything that waited first.
  const asked = new Promise(ok => { const p = Notification.requestPermission(ok); if (p && p.then) p.then(ok); });
  route.keepScroll = true; render();
  return alertsRun(async () => {
    try { remindErr = await alertsJoin(await asked); }
    catch (e) { remindErr = "Couldn't turn on reminders. Open GI Hub from the home screen and try again."; }
    alertsBusy = false;
    route.keepScroll = true; render();
  });
}
// The steps in order, after the permission answer: the message to show when one fails, or null.
async function alertsJoin(perm) {
  if (perm !== "granted") return perm === "denied" ? null : "Reminders need permission to show notifications. Tap the button again.";
  const v = await alertsAsk("GET", "/vapid");
  if (v.status !== 200 || !v.data || typeof v.data.key !== "string") return alertsNoGo(v.status);
  const reg = await navigator.serviceWorker.ready;
  // One subscription per app, tied to one sender's key: the one there goes first.
  const old = await reg.pushManager.getSubscription();
  if (old) await old.unsubscribe();
  remindSub = null;
  const sub = await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: remindB64(v.data.key)});
  const tok = alertsLoad().tok || alertsToken();
  const r = await alertsAsk("PUT", "/sub", {sub: sub.toJSON(), key: v.data.key}, tok);
  if (r.status !== 200) {
    try { await sub.unsubscribe(); } catch (e) {}
    return alertsNoGo(r.status);
  }
  alertsKept = {tok, key: v.data.key, sent: null}; alertsSave();
  remindSub = sub.toJSON(); alertsGone = false; alertsWait = 0;
  await alertsSend();
  await alertsAsk("POST", "/test");
  showToast("Reminders on. A test reminder is on its way.");
  return null;
}
// Send a test: one test reminder now.
function alertsTest() {
  remindErr = null;
  return alertsRun(async () => {
    const r = await alertsAsk("POST", "/test"), push = r.data && r.data.status;
    if (r.status === 200 && push >= 200 && push < 300) showToast("Test reminder sent");
    else if (r.status === 401 || r.status === 404 || push === 404 || push === 410) alertsGone = true;
    else remindErr = r.status === 200 ? `The push service turned the test away (error ${push}). Try again later.` : alertsNoGo(r.status);
    route.keepScroll = true; render();
  });
}
// Turn off: the sender forgets this phone (its subscription, plan and token),
// and the subscription goes. With no signal the token stays, so this phone can
// take the sender back later.
function alertsDisconnect() {
  remindErr = null;
  return alertsRun(async () => {
    const r = alertsOn() ? await alertsAsk("DELETE", "/sub") : {status: 204};
    try { const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch (e) {}
    try { await (await caches.open(REMIND_CACHE)).delete("__gi-push.json"); } catch (e) {}
    alertsKept = r.status === 204 || !alertsLoad().tok ? {} : {tok: alertsKept.tok};
    alertsSave();
    remindSub = null; remindLast = null; alertsGone = false;
    showToast("Reminders off on this phone");
    route.keepScroll = true; render();
  });
}
