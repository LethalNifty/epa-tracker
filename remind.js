"use strict";
// GI Hub reminders on this phone: turning push notifications on, the code
// that connects the phone to the sender (tools/push), and the brief the
// service worker reads to write each notification: this week's EPAs, the
// shifts to come and who's on. The brief stays on the phone, in Cache Storage.
// Loaded after notify.js and before app.js; the views use app.js helpers when
// they run.

// The sender's public VAPID key. Public by design; the private half lives only
// in the repository's secrets. Empty until the sender is set up, which hides
// reminders entirely.
const REMIND_VAPID = "";
const REMIND_KEY = "gi-remind-v1";
const REMIND_CACHE = "gi-brief";
// Tests set window.__vapid to stand in for the key.
const remindKey = () => window.__vapid || REMIND_VAPID;
let remindSub = null, remindLast = null, remindErr = null, remindReady = false, remindCopied = false, remindBriefKey = "";

const RemindStore = {
  state: {dismissed: false},
  load() { try { const s = JSON.parse(localStorage.getItem(REMIND_KEY)); if (s) this.state = {dismissed: !!s.dismissed}; } catch (e) {} },
  save() { try { localStorage.setItem(REMIND_KEY, JSON.stringify(this.state)); } catch (e) {} },
};

// "ok"; "install" in Safari outside the home-screen app, where iPhone offers
// no push; "none" where the browser can't, or the sender isn't set up yet.
function remindSupport() {
  if (!remindKey()) return "none";
  const n = typeof navigator === "undefined" ? {} : navigator;
  if (!("serviceWorker" in n) || typeof PushManager === "undefined" || typeof Notification === "undefined")
    return n.standalone === false ? "install" : "none";
  return "ok";
}
// off: not asked yet; pending: this phone is subscribed but no reminder has
// arrived (the code hasn't reached the sender); on: a reminder has arrived.
function remindState() {
  const s = remindSupport();
  if (s !== "ok") return s;
  if (Notification.permission === "denied") return "denied";
  if (!remindSub) return "off";
  return remindLast ? "on" : "pending";
}
function remindB64(s) {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
async function remindRead(name) {
  try { const r = await (await caches.open(REMIND_CACHE)).match(name); return r ? await r.json() : null; } catch (e) { return null; }
}
// Checks the subscription and the last reminder, then redraws if that changes the screen.
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
  remindReady = true;
  if (remindState() !== before && (route.page === "week" || route.page === "epas") && !sheet) { route.keepScroll = true; render(); }
}
async function remindEnable() {
  remindErr = null;
  try {
    const perm = await new Promise(ok => { const p = Notification.requestPermission(ok); if (p && p.then) p.then(ok); });
    if (perm === "granted") {
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ||
        await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: remindB64(remindKey())});
      remindSub = sub.toJSON();
    } else if (perm !== "denied") remindErr = "Reminders need permission to show notifications. Tap Turn on reminders again.";
  } catch (e) { remindErr = "Couldn't turn on reminders. Open GI Hub from the home screen and try again."; }
  route.keepScroll = true; render();
}
async function remindOff() {
  try { const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch (e) {}
  try { await (await caches.open(REMIND_CACHE)).delete("__gi-push.json"); } catch (e) {}
  remindSub = null; remindLast = null;
  showToast("Reminders off on this phone");
  route.keepScroll = true; render();
}
// The connection code: this phone's push address and keys, nothing else.
const remindCode = () => JSON.stringify({endpoint: remindSub.endpoint, keys: remindSub.keys});
async function remindShare() {
  const text = "GI Hub reminders code:\n" + remindCode();
  try { if (navigator.share) { await navigator.share({text}); return; } } catch (e) { if (e && e.name === "AbortError") return; }
  remindCopy();
}
async function remindCopy() {
  try { await navigator.clipboard.writeText(remindCode()); remindCopied = true; showToast("Code copied"); }
  catch (e) { remindErr = "Couldn't copy. Use Share code instead."; }
  route.keepScroll = true; render();
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
  const study = {nights: studyBriefNights(day, Store.state.study, str), week: studyLastWeek(day, Store.state.study, str)};
  return {v: 1, at: now, weeks, call, study};
}
function remindAfterRender() {
  if (!remindSub || typeof caches === "undefined") return;
  let brief;
  try { brief = remindBrief(callNow()); } catch (e) { return; }
  const key = JSON.stringify({...brief, at: 0});
  if (key === remindBriefKey) return;
  remindBriefKey = key;
  caches.open(REMIND_CACHE).then(c => c.put("__gi-brief.json",
    new Response(JSON.stringify(brief), {headers: {"content-type": "application/json"}}))).catch(() => { remindBriefKey = ""; });
}
// The next reminder this phone expects: Thursday 08:00, or an hour before a call.
function remindNext(now) {
  const d = new Date(now);
  let t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (4 - d.getDay() + 7) % 7, 8).getTime();
  if (t <= now) t += 7 * DAY_MS;
  let msg = {kind: "week", t};
  const st = callStretches(CallStore.list()).find(x => x.s - HOUR_MS > now);
  if (st && st.s - HOUR_MS < t) msg = {kind: "call", t: st.s - HOUR_MS, s: st.s};
  // The next 20:00 on a reading night, if it comes first.
  const str = callStretches(CallStore.list());
  for (let k = 0; k < 8; k++) {
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() + k), ts = studyEveningMs(day);
    if (ts <= now || fmtDate(day) > fmtDate(STUDY_END)) continue;
    if (studyNightKind(day, str, []) === "read") { if (ts < msg.t) msg = {kind: "study", t: ts}; break; }
  }
  return {msg, notice: noticeFor(msg, remindBrief(msg.t), msg.t)};
}

// ---- Views -------------------------------------------------------------------------
const REMIND_WHAT = `<ul class="rlist"><li><span class="mono">Thu 08:00</span><span>The week's EPAs, and any call that week</span></li>` +
  `<li><span class="mono">1 h before call</span><span>Who's on at HSC and St. Boniface</span></li>` +
  `<li><span class="mono">20:00</span><span>Tonight's Mayo pages, on reading nights</span></li></ul>`;
function remindCodeHTML() {
  return `<div class="rcode mono" aria-label="Connection code">${esc(remindSub.endpoint.replace(/^https:\/\//, "").slice(0, 38))}…</div>` +
    `<div class="rbtns"><button class="btn primary" data-action="remindshare">${ic("share")}Share code</button>` +
    `<button class="btn" data-action="remindcopy">${remindCopied ? ic("check") + "Copied" : "Copy"}</button></div>`;
}
// Week: until reminders are on, a card that sets them up (dismissible).
function remindCardHTML() {
  if (!remindReady || RemindStore.state.dismissed) return "";
  const st = remindState();
  if (st !== "off" && st !== "pending") return "";
  const x = `<button class="iconbtn" data-action="reminddismiss" aria-label="Not now">${ic("x")}</button>`;
  return `<section class="card remindcard"><div class="rc-head">${ic("bell")}<b>${st === "off" ? "Reminders on this phone" : "One step left"}</b>${x}</div>` +
    (st === "off" ? `<p>GI Hub can remind you instead of your calendar:</p>${REMIND_WHAT}` +
      `<button class="btn primary" data-action="remindon">${ic("bell")}Turn on reminders</button>`
      : `<p>Send this code to Claude to connect your phone. Claude will send a test reminder.</p>${remindCodeHTML()}`) +
    (remindErr ? `<div class="err" role="alert">${esc(remindErr)}</div>` : "") + `</section>`;
}
// EPAs tab, under Backup: status and controls.
function remindSectionHTML() {
  const st = remindState();
  if (st === "none") return "";
  const label = {install: "Home screen only", denied: "Blocked", off: "Off", pending: "Not connected", on: "On"}[st];
  let body;
  if (st === "install") body = `<p class="rnote">Open GI Hub from your home screen to turn on reminders. iPhone only allows them there.</p>`;
  else if (st === "denied") body = `<p class="rnote">Notifications are blocked for GI Hub. Turn them on in iPhone Settings, Notifications, GI Hub, then come back.</p>`;
  else if (!remindReady) body = `<p class="rnote">Checking this phone…</p>`;
  else if (st === "off") body = REMIND_WHAT + `<button class="btn primary" data-action="remindon">${ic("bell")}Turn on reminders</button>`;
  else if (st === "pending") body = `<p class="rnote">Almost done: send this code to Claude to connect your phone. Nothing has arrived yet.</p>` + remindCodeHTML() +
    `<button class="textbtn" data-action="remindoff">Turn off</button>`;
  else {
    const nx = remindNext(callNow()), when = t => `${DAYS[new Date(t).getDay()]} ${new Date(t).getDate()} ${MONTHS[new Date(t).getMonth()]}, ${callHM(t)}`;
    body = REMIND_WHAT + `<div class="rrow"><span class="mono">Next</span><span><b>${when(nx.msg.t)}</b> · ${esc(nx.notice.title)}</span></div>` +
      `<div class="rrow"><span class="mono">Last</span><span>${when(remindLast.at)}</span></div>` +
      `<div class="rbtns"><button class="btn" data-action="remindshare">${ic("share")}Share code again</button>` +
      `<button class="btn danger" data-action="remindoff">Turn off</button></div>`;
  }
  return `<section class="sec"><div class="sec-head"><h2>Reminders</h2><span class="mono${st === "on" ? " ok" : ""}">${label}</span></div>` +
    `<div class="card pad remind">${body}${remindErr ? `<div class="err" role="alert">${esc(remindErr)}</div>` : ""}</div></section>`;
}
