"use strict";
// GI Hub settings: one sheet, opened from the gear on Week, holding the
// version (and whether this phone is up to date), backup, reminders and the
// fellows' codes (watch.js).
// Loaded after remind.js and before app.js; uses app.js helpers when it runs.

let setSheet = null, setFresh = false;
// What the version row knows about the live app: its version, when it was
// asked, and whether asking failed. pulling: Update now was tapped; stuck:
// the update didn't arrive.
const updateInfo = {latest: null, at: 0, busy: false, failed: false, pulling: false, stuck: false};
const updateNum = v => +((/epa-v(\d+)/.exec(v || "") || [0, 0])[1]);

function setOpen() { setSheet = {}; setFresh = true; updateLook(); if (!FELLOWS) watchCheck(); }
// Asks the live app which version it serves, past every cache.
async function updateLook() {
  updateInfo.busy = true; updateInfo.failed = false;
  try {
    if (typeof fetch !== "function") throw new Error("no fetch");
    const res = await fetch("sw.js", {cache: "no-store"});
    const m = res.ok && /const CACHE = "(epa-v\d+)"/.exec(await res.text());
    updateInfo.latest = m ? m[1] : null; updateInfo.failed = !m;
  } catch (e) { updateInfo.failed = true; }
  updateInfo.busy = false; updateInfo.at = Date.now();
  if (setSheet) { route.keepScroll = true; render(); }
}
// Update now: the service worker fetches the new version; when it takes over,
// updateReady is set (app.js) and the row offers a restart.
function updatePull() {
  updateInfo.pulling = true; updateInfo.stuck = false;
  if (navigator.serviceWorker && navigator.serviceWorker.getRegistration)
    navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {});
  setTimeout(() => {
    if (updateReady || !updateInfo.pulling) return;
    updateInfo.pulling = false; updateInfo.stuck = true;
    if (setSheet) { route.keepScroll = true; render(); }
  }, 20000);
}
function updateState() {
  if (updateReady) return "ready";
  if (updateInfo.busy || !updateInfo.at) return "checking";
  if (updateInfo.failed) return "offline";
  if (updateNum(updateInfo.latest) > updateNum(APP_VERSION)) return updateInfo.pulling ? "pulling" : updateInfo.stuck ? "stuck" : "behind";
  return "ok";
}

// ---- The sheet -------------------------------------------------------------------------------------
function setVersionHTML() {
  const st = updateState(), latest = esc(updateInfo.latest || ""), at = new Date(updateInfo.at);
  const pill = (cls, icon, text) => `<span class="svpill ${cls}">${icon ? ic(icon, "sm") : ""}${text}</span>`;
  const again = `<button class="textbtn sm" data-action="setcheck">Check again</button>`;
  const row = {
    checking: [pill("off", null, "Checking"), "Asking the live app.", ""],
    ok: [pill("ok", "check", "Up to date"), `Checked at ${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}.`, again],
    offline: [pill("off", null, "Offline"), "Checks when you have signal.", again],
    behind: [pill("ready", "alert", `${latest} is out`), `This phone is on ${APP_VERSION}.`,
      `<button class="btn primary" data-action="setpull">${ic("download")}Update now</button>`],
    pulling: [pill("ready", "download", `Downloading ${latest}`), "This takes a few seconds.", ""],
    stuck: [pill("ready", "alert", `${latest} is out`), `Still on ${APP_VERSION}. Swipe GI Hub away in the app switcher, then open it again.`, again],
    ready: [pill("ready", "download", "Update ready"), `${latest || "The new version"} is downloaded.`,
      `<button class="btn primary" data-action="setrestart">${ic("undo")}Restart to update</button>`],
  }[st];
  return `<div class="setgrp"><div class="set-h mono"><span>App</span></div><div class="card pad setver">` +
    `<div class="sv-top"><span class="sv-name">GI Hub <b>${APP_VERSION}</b></span>${row[0]}</div>` +
    `<p class="rnote">${row[1]}</p>${row[2]}` +
    (liveCalm() ? `<p class="rnote">Reduce Motion is on, so animations are gentle.</p>` : "") + `</div></div>`;
}
function setBackupHTML() {
  const lb = Store.state.lastBackup;
  return `<div class="setgrp"><div class="set-h mono"><span>Backup</span><span>Last: ${lb ? esc(dayLabel(fmtDate(new Date(lb)))) : "never"}</span></div>` +
    `<div class="card pad"><button class="btn" data-action="export">${ic("share")}Export backup</button>` +
    `<button class="btn" data-action="importpick">${ic("download")}Import backup</button>` +
    `<input type="file" id="importfile" accept=".json,application/json" hidden>` +
    `<p class="bnote mono">Saved on this phone only</p>` +
    (backupError ? `<div class="err">${esc(backupError)}</div>` : "") + `</div></div>`;
}
function setSheetHTML() {
  const fresh = setFresh ? " fresh" : "";
  return `<div class="scrim${fresh}" data-action="setclose"></div>` +
    `<div class="sheet setsheet${fresh}" role="dialog" aria-modal="true" aria-label="Settings"><div class="grab"></div>` +
    `<div class="shead"><b>Settings</b><button class="iconbtn" data-action="setclose" aria-label="Close">${ic("x")}</button></div>` +
    setVersionHTML() + setBackupHTML() + (FELLOWS ? felSetHTML() : remindGroupHTML() + watchSetHTML()) + `</div>`;
}

// ---- Taps -----------------------------------------------------------------------------------------
// Returns false when it redraws by itself.
function setDispatch(act) {
  if (act === "setopen") setOpen();
  else if (act === "setclose") setSheet = null;
  else if (act === "setcheck") { updateInfo.stuck = false; updateLook(); }
  else if (act === "setpull") updatePull();
  else if (act === "setrestart") { updateNow(); return false; }
  return true;
}
function setAfterRender() { setFresh = false; }
