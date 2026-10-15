"use strict";
// Keeping an eye on the fellows' invite codes, in the full app only (the
// fellows' build leaves this file out). With the admin key saved on this
// phone, GI Hub asks the fellows' site on launch, and when Settings opens,
// which phone each code is on and whether a code was tried on another phone.
// Week shows an alert for tries not seen yet; Settings lists the codes. The
// key is kept apart from the app's data, so it never goes into a backup.
// Loaded after settings.js and before app.js; uses app.js helpers when it runs.

const WATCH_SITE = "https://gi-hub-fellows.pages.dev", WATCH_STORE = "gi-watch-v1";
let watch = null, watchTyped = "", watchBusy = false;
function watchLoad() {
  if (watch) return watch;
  try { watch = JSON.parse(localStorage.getItem(WATCH_STORE) || "null"); } catch (e) {}
  if (!watch || typeof watch !== "object") watch = {};
  return watch;
}
function watchSave() { try { localStorage.setItem(WATCH_STORE, JSON.stringify(watch)); } catch (e) {} }

// Asks the fellows' site; redraws only when the answer changed.
async function watchCheck() {
  const w = watchLoad();
  if (!w.key || watchBusy || typeof fetch !== "function") return;
  watchBusy = true;
  const before = JSON.stringify([w.bad, w.last && w.last.codes, w.last && w.last.tries]);
  try {
    const r = await fetch(WATCH_SITE + "/__admin/summary", {headers: {Authorization: "Bearer " + w.key}, cache: "no-store"});
    if (r.status === 401) w.bad = true;
    else if (r.ok) {
      const j = await r.json();
      w.bad = false;
      w.last = {at: new Date().toISOString(), total: j.total || 0, inUse: j.inUse || 0, store: j.store !== false, codes: j.codes || [], tries: j.tries || []};
    }
    watchSave();
  } catch (e) {}
  watchBusy = false;
  if (JSON.stringify([w.bad, w.last && w.last.codes, w.last && w.last.tries]) !== before) { route.keepScroll = true; render(); }
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
    `<a class="btn" href="${WATCH_SITE}/__admin" target="_blank" rel="noopener">Open</a>` +
    `<button class="iconbtn" data-action="watchseen" aria-label="Dismiss">${ic("x")}</button></div>`;
}

// ---- Settings ----------------------------------------------------------------------------------------
function watchSetHTML() {
  const w = watchLoad(), L = w.key && !w.bad ? w.last : null;
  let h = `<div class="setgrp"><div class="set-h mono"><span>Fellows' codes</span>${L ? `<span>${L.inUse} of ${L.total} in use</span>` : ""}</div><div class="card pad watchset">`;
  if (!w.key) {
    return h + `<label class="lbl mono">Admin key<input type="text" data-watch="key" value="${esc(watchTyped)}" autocomplete="off" ` +
      `autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX"></label>` +
      `<button class="btn primary" data-action="watchkey">${ic("check")}Save key</button>` +
      `<p class="bnote mono">Stays on this phone; never in a backup</p></div></div>`;
  }
  if (w.bad) h += `<div class="err">This key doesn't work any more. Forget it and paste the current one.</div>`;
  else if (!L) h += `<p class="rnote">Asking the fellows' site.</p>`;
  else {
    if (!L.store) h += `<div class="err">The fellows' site has no storage connected, so no new phone can sign in.</div>`;
    const rows = L.codes.filter(c => c.state !== "new" || c.tries), unused = L.codes.filter(c => c.state === "new" && !c.tries);
    h += rows.map(c => `<div class="watchrow${c.tries ? " hot" : ""}"><b>${esc(c.id)}</b><span>` +
      (c.state === "off" ? "Turned off" : c.state === "in" ? `${watchAbout(c.dev, c.where)}<br>Last opened ${esc(watchWhen(c.seen))}` : "Not used yet") +
      (c.tries ? `<br><em>Tried on another phone ${c.tries === 1 ? "once" : c.tries + " times"}</em>` : "") + `</span></div>`).join("");
    if (unused.length) h += `<p class="rnote">Not used yet: ${unused.map(c => esc(c.id)).join(", ")}</p>`;
    h += `<p class="bnote mono">Checked ${esc(watchWhen(L.at))}</p>`;
  }
  return h + `<a class="btn" href="${WATCH_SITE}/__admin" target="_blank" rel="noopener">${ic("shield")}Open the admin page</a>` +
    `<button class="textbtn sm" data-action="watchforget">Forget key</button></div></div>`;
}

// ---- Taps and typing ---------------------------------------------------------------------------------
// Returns false when it redraws by itself.
function watchDispatch(act) {
  const w = watchLoad();
  if (act === "watchkey") {
    const key = watchTyped.trim();
    if (!key) return true;
    watch = {key}; watchTyped = ""; watchSave(); watchCheck();
  } else if (act === "watchseen") {
    const t = watchNew();
    if (t.length) { w.seenAt = t[0].at; watchSave(); }
  } else if (act === "watchforget") { watch = {}; watchSave(); }
  return true;
}
function watchField(t) {
  if (!t.dataset || t.dataset.watch !== "key") return false;
  watchTyped = t.value;
  return true;
}
