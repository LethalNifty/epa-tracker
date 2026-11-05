"use strict";
// Daily backup to Cloudflare, in the full app only (the fellows' build leaves
// this file out). The first time GI Hub opens each day, it locks a copy of what
// is saved on the phone and sends it to its own Worker (tools/backup), which
// keeps the last 14 days. The lock is AES-GCM, with a key made from a
// passphrase only the user knows, so Cloudflare only ever holds scrambled data.
// The passphrase itself is never kept or sent: the phone keeps two keys made
// from it, one that locks and opens the backups and one that shows the Worker
// it's the same person, apart from the app's data, so neither goes into a backup.
// Settings > Backup sets it up, sends one now, restores one (on this phone or a
// new one), turns it off, or deletes the copies on Cloudflare.
// Loaded after settings.js and before app.js; uses app.js helpers when it runs.

// The Worker's address (tools/backup), once it's deployed.
const BACKUP_URL = "https://gi-hub-backup.REPLACE_WITH_SUBDOMAIN.workers.dev", BACKUP_STORE = "gi-backup-v1";
// Turning a passphrase into keys is slow on purpose (well under a second on a
// phone), so guessing one is slow too. The tests turn it down.
const BACKUP_KDF = {rounds: 600000};
const BK_MIN = 10;

// bk: what this phone keeps ({key, tok, last, err}). bkPane: the form open
// ("set" or "restore"); bkTyped: what's typed in it, never saved; bkMsg: the
// last error to show; bkFound: for Restore, the keys a passphrase made and the
// days they open; bkWork: the request in flight, if any (tests wait on it).
let bk = null, bkPane = null, bkTyped = {p1: "", p2: ""}, bkMsg = null, bkFound = null, bkWork = null, bkBusy = false;
function bkLoad() {
  if (bk) return bk;
  try { bk = JSON.parse(localStorage.getItem(BACKUP_STORE) || "null"); } catch (e) {}
  if (!bk || typeof bk !== "object") bk = {};
  return bk;
}
// Nothing is kept until a backup has gone up (or come down) with the keys.
function bkSave() {
  try { if (bk.key) localStorage.setItem(BACKUP_STORE, JSON.stringify(bk)); else localStorage.removeItem(BACKUP_STORE); } catch (e) {}
}
const bkOn = () => !FELLOWS && !!(bkLoad().key && bk.tok);

// ---- Keys and the lock ------------------------------------------------------------------------
const bkText = s => new TextEncoder().encode(s);
function bkB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function bkBytes(s) {
  const b = atob(String(s).replace(/-/g, "+").replace(/_/g, "/")), out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
// The passphrase to the two keys: PBKDF2 (the slow part) to one secret, then
// HKDF to the key that locks and the token that signs in. The salt is fixed, so
// any phone makes the same keys from the same passphrase.
async function bkKeys(pass) {
  const subtle = crypto.subtle, salt = bkText("gi-hub-backup-v1");
  const base = await subtle.importKey("raw", bkText(pass.normalize("NFC")), "PBKDF2", false, ["deriveBits"]);
  const seed = await subtle.deriveBits({name: "PBKDF2", salt, iterations: BACKUP_KDF.rounds, hash: "SHA-256"}, base, 256);
  const hk = await subtle.importKey("raw", seed, "HKDF", false, ["deriveBits"]);
  const part = async info => bkB64(new Uint8Array(await subtle.deriveBits({name: "HKDF", hash: "SHA-256", salt, info: bkText(info)}, hk, 256)));
  return {key: await part("gi-hub-backup lock"), tok: await part("gi-hub-backup token")};
}
const bkAes = (k, use) => crypto.subtle.importKey("raw", bkBytes(k.key), "AES-GCM", false, [use]);
// The day is locked in with it, so one day's copy can't pass for another's.
async function bkLock(k, day, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({name: "AES-GCM", iv, additionalData: bkText(day)}, await bkAes(k, "encrypt"), bkText(text));
  return JSON.stringify({v: 1, iv: bkB64(iv), ct: bkB64(new Uint8Array(ct))});
}
async function bkOpen(k, day, body) {
  const s = JSON.parse(body);
  const plain = await crypto.subtle.decrypt({name: "AES-GCM", iv: bkBytes(s.iv), additionalData: bkText(day)}, await bkAes(k, "decrypt"), bkBytes(s.ct));
  return new TextDecoder().decode(plain);
}

// ---- The Worker ----------------------------------------------------------------------------------
// One request: {status, text}; status 0 when there's no connection (or no
// answer in 30 seconds).
async function bkAsk(method, p, tok, body) {
  if (typeof fetch !== "function") return {status: 0};
  const ctl = typeof AbortController === "function" ? new AbortController() : null, t = ctl && setTimeout(() => ctl.abort(), 30000);
  try {
    const headers = body ? {Authorization: "Bearer " + tok, "Content-Type": "application/json"} : {Authorization: "Bearer " + tok};
    const res = await fetch(BACKUP_URL + p, {method, headers, body, signal: ctl ? ctl.signal : undefined});
    return {status: res.status, text: await res.text()};
  } catch (e) { return {status: 0}; }
  finally { clearTimeout(t); }
}
const bkPut = async (k, day) => (await bkAsk("PUT", "/backups/" + day, k.tok, await bkLock(k, day, JSON.stringify(Store.state)))).status;
const bkNoGo = st => st === 0 ? "No connection. Try again when you have signal." : `Cloudflare answered with error ${st}. Try again later.`;
// Runs one piece of backup work; only one at a time. A quiet run (the daily
// backup) redraws only when Settings is open, so nobody's typing is cut off.
function bkRun(fn, quiet) {
  bkBusy = true;
  bkWork = (async () => {
    try { await fn(); } catch (e) { if (!quiet) bkMsg = "That didn't work. Try again."; }
    bkBusy = false;
    if (!quiet || setSheet) { route.keepScroll = true; render(); }
  })();
  return bkWork;
}
function bkClose() { bkPane = null; bkTyped = {p1: "", p2: ""}; bkMsg = null; bkFound = null; }
// A backup sent: the time for Settings, and it counts as the phone's backup.
function bkSent(k) { bk = {key: k.key, tok: k.tok, last: callNow(), err: null}; bkSave(); Store.markBackup(); }

// Once a day, the first time GI Hub opens (or comes back): today's backup,
// unless one went up today, or the phone holds nothing (an empty phone never
// takes the place of the good copies).
function backupDaily() {
  if (FELLOWS || bkBusy || !bkOn() || !Store.hasData()) return bkWork;
  const day = fmtDate(getToday());
  if (bk.last && fmtDate(new Date(bk.last)) === day) return bkWork;
  return bkRun(() => bkDaily(day), true);
}
async function bkDaily(day) {
  const st = await bkPut(bk, day);
  if (st === 200) bkSent(bk);
  else { bk.err = {day, st}; bkSave(); }
}
async function bkTurnOn(pass) {
  const k = await bkKeys(pass), st = await bkPut(k, fmtDate(getToday()));
  if (st === 200) { bkSent(k); bkClose(); showToast("Daily backup is on"); return; }
  if (st === 401) { bkTyped = {p1: "", p2: ""}; bkMsg = "The backups on Cloudflare are locked with a different passphrase. Type that one instead."; }
  else bkMsg = bkNoGo(st);
}
async function bkNow() {
  const st = await bkPut(bk, fmtDate(getToday()));
  if (st === 200) { bkSent(bk); showToast("Backed up"); }
  else bkMsg = st === 401 ? bkLockedText : bkNoGo(st);
}
// The days a passphrase's keys open, newest first.
async function bkList(k) {
  const r = await bkAsk("GET", "/backups", k.tok);
  if (r.status !== 200) { bkMsg = r.status === 401 ? "That passphrase doesn't open these backups." : bkNoGo(r.status); return; }
  let days = [];
  try { days = JSON.parse(r.text).days; } catch (e) {}
  days = (Array.isArray(days) ? days : []).filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.day)).map(x => ({day: x.day, size: +x.size || 0}));
  bkFound = {key: k.key, tok: k.tok, days}; bkMsg = null;
}
// Restoring counts as today's backup: the copy taken this morning stays on
// Cloudflare, in case this one was the wrong day.
async function bkPick(day) {
  const k = bkFound, r = await bkAsk("GET", "/backups/" + day, k.tok);
  if (r.status !== 200) { bkMsg = r.status === 404 ? "That backup isn't there any more." : bkNoGo(r.status); return; }
  let text;
  try { text = await bkOpen(k, day, r.text); } catch (e) { bkMsg = "That backup couldn't be opened."; return; }
  const res = Store.importJSON(text);
  if (!res.ok) { bkMsg = res.error; return; }
  bk = {key: k.key, tok: k.tok, last: callNow(), err: null}; bkSave();
  bkClose(); showToast("Restored the backup from " + dayLabel(day));
}
async function bkDelete() {
  const r = await bkAsk("DELETE", "/backups", bk.tok);
  if (r.status === 204) { bk = {}; bkSave(); bkClose(); showToast("Deleted the backups on Cloudflare"); }
  else bkMsg = r.status === 401 ? bkLockedText : bkNoGo(r.status);
}
const bkLockedText = "The backups on Cloudflare are locked with a different passphrase now. Turn backup off, then set it up with that one.";

// ---- Settings --------------------------------------------------------------------------------------
function bkWhen() {
  if (!bk.last) return "Not yet";
  const d = fmtDate(new Date(bk.last));
  return d === fmtDate(getToday()) ? "Today " + callHM(bk.last) : dayLabel(d);
}
function bkErrText(e) {
  const why = e.st === 0 ? "no connection. It tries again the next time you open GI Hub."
    : e.st === 401 ? "the backups on Cloudflare are locked with a different passphrase now. Turn backup off, then set it up with that one."
    : `Cloudflare answered with error ${e.st}. It tries again the next time you open GI Hub.`;
  return `Couldn't back up ${dayLabel(e.day)}: ${why}`;
}
const bkFieldHTML = (k, label, ac) => `<label class="lbl mono">${label}<input type="password" data-bk="${k}" autocomplete="${ac}" ` +
  `name="${k === "p2" ? "confirm-password" : "password"}" value="${esc(bkTyped[k])}" autocapitalize="off" spellcheck="false"></label>`;
// The name the iPhone's Passwords keeps the passphrase under: out of sight, but
// in the form ahead of the passphrase, where Passwords looks for it.
const BK_NAME = "GI Hub backup";
const bkNameHTML = `<input class="cbk-name" type="text" name="username" autocomplete="username" value="${BK_NAME}" tabindex="-1" aria-hidden="true">`;
const bkCancel = `<button class="textbtn sm cbk-cancel" data-action="bkcancel">Cancel</button>`;
// A pane with boxes is a form, sent by its button or Return (bkSubmit), so the
// iPhone sees a passphrase go and can offer a strong one or keep it.
function bkPaneHTML(dis) {
  if (bkPane === "set") return `<form class="cbk-form" data-bkform="bkon">` +
    `<p class="rnote">Your iPhone can make the passphrase and keep it in Passwords: tap the box, then Use Strong Password. ` +
    `Or type your own, at least ${BK_MIN} characters, and keep it there. Each backup is locked with it before it leaves this phone, and none opens without it.</p>` +
    bkNameHTML + bkFieldHTML("p1", "Passphrase", "new-password") + bkFieldHTML("p2", "Same again", "new-password") +
    `<button type="submit" class="btn primary"${dis}>${ic("lock")}${bkBusy ? "Locking today's backup" : "Turn on"}</button></form>` + bkCancel;
  if (bkFound) return (bkFound.days.length ? `<p class="rnote">Pick a day. It replaces everything on this phone.</p>` +
    bkFound.days.map(x => `<button class="btn" data-action="bkpick" data-day="${esc(x.day)}"${dis}>${esc(dayLabel(x.day))} · ${Math.max(1, Math.round(x.size / 1024))} KB</button>`).join("")
    : `<p class="rnote">No backups on Cloudflare yet.</p>`) + bkCancel;
  if (bkOn()) return (bkMsg ? "" : `<p class="rnote">Asking Cloudflare.</p>`) + bkCancel;
  return `<form class="cbk-form" data-bkform="bkunlock">` +
    `<p class="rnote">Tap the box and Passwords fills in the passphrase the backups were locked with, or type it.</p>` +
    bkNameHTML + bkFieldHTML("p1", "Passphrase", "current-password") +
    `<button type="submit" class="btn primary"${dis}>${ic("lock")}${bkBusy ? "Opening" : "Open the backups"}</button></form>` + bkCancel;
}
function bkSetHTML() {
  const on = bkOn(), lb = Store.state.lastBackup, dis = bkBusy ? " disabled" : "";
  const head = !on ? "Last: " + (lb ? esc(dayLabel(fmtDate(new Date(lb)))) : "never") : bkBusy && !bkPane ? "Backing up" : esc(bkWhen()) + " · automatic";
  let h = `<div class="setgrp"><div class="set-h mono"><span>Backup</span><span>${head}</span></div><div class="card pad cbk">`;
  if (bkPane) h += bkPaneHTML(dis);
  else {
    h += on ? `<p class="rnote">Each day, locked with your passphrase and sent to Cloudflare. The last 14 days are kept.</p>` +
        (bk.err ? `<div class="err">${esc(bkErrText(bk.err))}</div>` : "") +
        `<button class="btn" data-action="bknow"${dis}>${ic("shield")}Back up now</button>`
      : `<p class="rnote">Back up to Cloudflare once a day, locked with a passphrase only you know.</p>` +
        (Store.hasData() ? `<button class="btn primary" data-action="bkset"${dis}>${ic("shield")}Set up daily backup</button>` : "");
    h += `<button class="btn" data-action="bkrestore"${dis}>${ic("undo")}Restore a backup</button>` + setFileHTML() +
      (on ? `<div class="cbk-acts"><button class="textbtn sm" data-action="bkoff"${dis}>Turn off</button>` +
        `<button class="textbtn sm danger" data-action="bkdelete"${dis}>Delete the backups on Cloudflare</button></div>`
        : `<p class="bnote mono">Saved on this phone only</p>`) +
      (backupError ? `<div class="err">${esc(backupError)}</div>` : "");
  }
  return h + (bkMsg ? `<div class="err">${esc(bkMsg)}</div>` : "") + `</div></div>`;
}

// ---- Taps and typing ---------------------------------------------------------------------------------
// Returns false when it redraws by itself. Nothing starts while a request is out.
function bkDispatch(act, d) {
  if (FELLOWS) return false;
  if (act === "bkcancel") { if (!bkBusy) bkClose(); return true; }
  if (bkBusy) return true;
  if (act === "bkset") { if (Store.hasData()) { bkClose(); bkPane = "set"; } }
  else if (act === "bkon") {
    const p = bkTyped.p1.trim();
    if (p.length < BK_MIN) bkMsg = `Use at least ${BK_MIN} characters.`;
    else if (p !== bkTyped.p2.trim()) bkMsg = "The two don't match.";
    else { bkMsg = null; bkRun(() => bkTurnOn(p)); }
  } else if (act === "bknow") { if (bkOn()) { bkMsg = null; bkRun(bkNow); } }
  else if (act === "bkrestore") { bkClose(); bkPane = "restore"; if (bkOn()) bkRun(() => bkList(bk)); }
  else if (act === "bkunlock") {
    const p = bkTyped.p1.trim();
    if (p) { bkMsg = null; bkRun(async () => bkList(await bkKeys(p))); }
  } else if (act === "bkpick") {
    if (!bkFound || !bkFound.days.some(x => x.day === d.day)) return true;
    if (!confirm(`Restore the backup from ${dayLabel(d.day)}? It replaces everything on this phone.`)) return true;
    bkRun(() => bkPick(d.day));
  } else if (act === "bkoff") { bk = {}; bkSave(); bkClose(); showToast("Daily backup is off. The backups on Cloudflare stay."); }
  else if (act === "bkdelete") {
    if (!confirm("Delete every backup on Cloudflare? What's on this phone stays.")) return true;
    bkMsg = null; bkRun(bkDelete);
  }
  return true;
}
// The passphrase fields: kept in memory only, with no redraw.
function bkField(t) {
  if (FELLOWS || !t.dataset || !t.dataset.bk || !(t.dataset.bk in bkTyped)) return false;
  bkTyped[t.dataset.bk] = t.value;
  return true;
}
// The setup and restore forms, sent by a tap on their button or by Return. The
// boxes are read from the form itself, since Passwords can fill them in without
// a keystroke. Returns the action, or null for any other form.
function bkSubmit(f) {
  const act = !FELLOWS && f && f.dataset ? f.dataset.bkform : null;
  if (act !== "bkon" && act !== "bkunlock") return null;
  for (const el of f.querySelectorAll("[data-bk]")) bkField(el);
  return act;
}
