"use strict";
// Managing the fellows' invite codes, in the full app only (the fellows' build
// leaves this file out, and the fellows' site has no admin page). With the
// admin key saved on this phone, GI Hub asks the fellows' site, on launch and
// when Settings opens, which phone each code is on and whether a code was
// tried on another phone. Week shows an alert for tries not seen yet; Settings
// lists the codes, with buttons to free one for a new phone, turn one off or
// add one. The site answers only at an address worked out from the key
// (tools/fellows/access.mjs), and the key is kept apart from the app's data,
// so it never goes into a backup.
// Loaded after settings.js and before app.js; uses app.js helpers when it runs.

const WATCH_SITE = "https://gi-hub-fellows.pages.dev", WATCH_STORE = "gi-watch-v1";
// watchBusy: a check is out (another waits behind it); watchActing: a button's request is.
let watch = null, watchTyped = "", watchBusy = false, watchAgain = false, watchActing = false, watchErr = null;
function watchLoad() {
  if (watch) return watch;
  try { watch = JSON.parse(localStorage.getItem(WATCH_STORE) || "null"); } catch (e) {}
  if (!watch || typeof watch !== "object") watch = {};
  return watch;
}
function watchSave() { try { localStorage.setItem(WATCH_STORE, JSON.stringify(watch)); } catch (e) {} }
// The address the fellows' site answers the owner at: from the key, the same way the site works it out.
async function watchPathFor(key) {
  const enc = new TextEncoder(), norm = String(key).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const k = await crypto.subtle.importKey("raw", enc.encode(norm), {name: "HMAC", hash: "SHA-256"}, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode("gi-owner")));
  return "/__" + [...sig].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}
const watchShape = w => JSON.stringify([w.bad, w.last && w.last.codes, w.last && w.last.tries]);
function watchTake(w, j) {
  w.bad = false;
  w.last = {at: new Date().toISOString(), total: j.total || 0, inUse: j.inUse || 0, store: j.store !== false, codes: j.codes || [], tries: j.tries || []};
}
// Asks the fellows' site; a body makes it an action. Redraws when anything changed.
async function watchAsk(body) {
  const w = watchLoad();
  if (!w.key || typeof fetch !== "function") return null;
  const before = watchShape(w);
  let j = null;
  try {
    if (!w.path) w.path = await watchPathFor(w.key);
    const r = await fetch(WATCH_SITE + w.path, body
      ? {method: "POST", headers: {Authorization: "Bearer " + w.key, "Content-Type": "application/json"}, body: JSON.stringify(body)}
      : {headers: {Authorization: "Bearer " + w.key}, cache: "no-store"});
    if (r.status === 401) w.bad = true;
    else if (r.ok) { j = await r.json(); watchTake(w, j); }
    else if (body) watchErr = "That didn't go through. Try again.";
    watchSave();
  } catch (e) { if (body) watchErr = "No connection. Try again once you have signal."; }
  if (body || watchShape(w) !== before) { route.keepScroll = true; render(); }
  return j;
}
async function watchCheck() {
  if (!watchLoad().key) return;
  if (watchBusy) { watchAgain = true; return; }
  watchBusy = true;
  await watchAsk(null);
  watchBusy = false;
  if (watchAgain) { watchAgain = false; watchCheck(); }
}
async function watchAct(act, id) {
  if (watchActing) return;
  watchActing = true; watchErr = null; route.keepScroll = true; render();
  const j = await watchAsk({act, id});
  watchActing = false;
  if (j && j.added) { watchLoad().fresh = j.added; watchSave(); }
  route.keepScroll = true; render();
}
// Tries on other phones since the alert was last dismissed, newest first.
function watchNew() {
  const w = watchLoad();
  return w.key && w.last ? (w.last.tries || []).filter(t => !w.seenAt || t.at > w.seenAt) : [];
}
function watchWhen(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : `${dayLabel(fmtDate(d))}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
const watchAbout = (...bits) => bits.filter(Boolean).map(esc).join(" · ");

// ---- Week --------------------------------------------------------------------------------------------
function watchWeekHTML() {
  const w = watchLoad();
  if (!w.key) return "";
  if (w.bad) return `<div class="card nudge">${ic("alert")}<span>The fellows' admin key stopped working. Check it in Settings.</span>` +
    `<button class="btn" data-action="setopen">Settings</button></div>`;
  const t = watchNew();
  if (!t.length) return "";
  const ids = [...new Set(t.map(x => x.id))];
  const msg = t.length === 1 ? `<b>${esc(t[0].id)}</b> was tried on another phone: ${watchAbout(t[0].dev, t[0].where, watchWhen(t[0].at))}.`
    : `${t.length} tries on other phones (${ids.map(id => `<b>${esc(id)}</b>`).join(", ")}). Newest: ${watchAbout(t[0].dev, t[0].where, watchWhen(t[0].at))}.`;
  return `<div class="card nudge watchalert" role="alert">${ic("alert")}<span>${msg}</span>` +
    `<button class="btn" data-action="setopen">Codes</button>` +
    `<button class="iconbtn" data-action="watchseen" aria-label="Dismiss">${ic("x")}</button></div>`;
}

// ---- Settings ----------------------------------------------------------------------------------------
function watchBtn(act, id, label, cls = "") {
  return `<button class="textbtn sm${cls}" data-action="watchact" data-act="${act}" data-id="${esc(id)}"${watchActing ? " disabled" : ""}>${label}</button>`;
}
function watchSetHTML() {
  const w = watchLoad(), L = w.key && !w.bad ? w.last : null;
  let h = `<div class="setgrp" id="watchset"><div class="set-h mono"><span>Fellows' codes</span>${L ? `<span>${L.inUse} of ${L.total} in use</span>` : ""}</div><div class="card pad watchset">`;
  if (!w.key) {
    return h + `<label class="lbl mono">Admin key<input type="text" data-watch="key" value="${esc(watchTyped)}" autocomplete="off" ` +
      `autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX"></label>` +
      `<button class="btn primary" data-action="watchkey">${ic("check")}Save key</button>` +
      `<p class="bnote mono">Stays on this phone; never in a backup</p>` + (watchErr ? `<div class="err">${esc(watchErr)}</div>` : "") + `</div></div>`;
  }
  if (w.fresh) h += `<div class="watchnew">New code <b>${esc(w.fresh.id)}</b>: <span class="code">${esc(w.fresh.code)}</span>` +
    `<span class="rnote">Send it privately, and add it to your codes file.</span><button class="textbtn sm" data-action="watchfreshok">Done</button></div>`;
  if (w.bad) h += `<div class="err">This key doesn't work any more. Forget it and paste the current one.</div>`;
  else if (!L) h += `<p class="rnote">Asking the fellows' site.</p>`;
  else {
    if (!L.store) h += `<div class="err">The fellows' site has no storage connected, so no new phone can sign in.</div>`;
    for (const c of L.codes) {
      const used = c.state !== "new";
      h += `<div class="watchrow${c.tries ? " hot" : ""}"><b>${esc(c.id)}</b><div><span>` +
        (c.state === "off" ? "Turned off" : c.state === "in" ? `${watchAbout(c.dev, c.where)}<br>Last opened ${esc(watchWhen(c.seen))}` : `Not used yet · <span class="code">${esc(c.code)}</span>`) +
        (c.tries ? `<br><em>Tried on another phone ${c.tries === 1 ? "once" : c.tries + " times"}</em>` : "") + `</span>` +
        (used || c.tries ? `<div class="watchacts">` +
          (c.state === "in" ? watchBtn("free", c.id, "Free for new phone") : "") +
          (c.state === "off" ? watchBtn("on", c.id, "Turn back on") : c.state === "in" ? watchBtn("off", c.id, "Turn off", " danger") : "") +
          (c.tries ? watchBtn("clear", c.id, "Clear tries") : "") + `</div>` : "") + `</div></div>`;
    }
    h += `<p class="bnote mono">Checked ${esc(watchWhen(L.at))}</p>`;
  }
  if (watchErr) h += `<div class="err">${esc(watchErr)}</div>`;
  return h + (L ? `<button class="btn" data-action="watchact" data-act="add"${watchActing ? " disabled" : ""}>${ic("plus")}Add a code</button>` : "") +
    `<button class="textbtn sm watchforget" data-action="watchforget">Forget key</button></div></div>`;
}

// ---- Taps and typing ---------------------------------------------------------------------------------
const WATCH_ASK = {free: id => `Free ${id} for a new phone? GI Hub locks on the phone it's on now.`,
  off: id => `Turn off ${id}? GI Hub locks on that phone.`};
// Returns false when it redraws by itself.
function watchDispatch(act, d) {
  const w = watchLoad();
  if (act === "watchkey") {
    const key = watchTyped.trim();
    if (!key) return true;
    watch = {key}; watchTyped = ""; watchErr = null; watchSave(); watchCheck();
  } else if (act === "watchact") {
    if (WATCH_ASK[d.act] && !confirm(WATCH_ASK[d.act](d.id))) return true;
    watchAct(d.act, d.id);
    return false;
  } else if (act === "watchseen") {
    const t = watchNew();
    if (t.length) { w.seenAt = t[0].at; watchSave(); }
  } else if (act === "watchfreshok") { delete w.fresh; watchSave(); }
  else if (act === "watchforget") { watch = {}; watchErr = null; watchSave(); }
  return true;
}
function watchField(t) {
  if (!t.dataset || t.dataset.watch !== "key") return false;
  watchTyped = t.value;
  return true;
}
