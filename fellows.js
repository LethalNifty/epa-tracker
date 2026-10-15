"use strict";
// GI Hub for fellows: the same app for the other fellows in the program, with
// Study, Pearls, the call card, reminders and the year plan left out (they are
// built on one fellow's reading, rotations and phone). The fellows' page sets
// window.GI_EDITION = "fellows" before the scripts load, and that edition
// saves under its own key (KEY in app.js), so a phone with both never mixes
// them. This file holds what only that edition has: first-run setup (the name
// for the procedure log, then catching up from Entrada) and its Home tab.

const FELLOWS = typeof window !== "undefined" && window.GI_EDITION === "fellows";

// ---- Setup ----------------------------------------------------------------------------------------
// felSetup is null, or the setup on screen: {step: 1 or 2, name, n: {pid: approved so far}, again}.
// "again" is the catch-up reopened from Settings: it adds observations and never takes any away.
let felSetup = null;
const felApproved = pid => (Store.state.obs[pid] || []).filter(o => o.status === "approved").length;
const felNeedsSetup = () => FELLOWS && !Store.state.setup && !Store.hasData();
const felFloor = P => felSetup.again ? Math.min(felApproved(P.id), P.required) : 0;
function felStart(again) {
  felSetup = {step: again ? 2 : 1, name: Store.state.scopes.reportName || "", again: !!again, n: {}};
  for (const P of PARTS) felSetup.n[P.id] = Math.min(felApproved(P.id), P.required);
}
// Catching up adds approved observations with no date: Entrada has the dates.
function felFinish() {
  const s = felSetup, ts = new Date().toISOString();
  let added = 0;
  for (const P of PARTS)
    for (let k = felApproved(P.id); k < s.n[P.id]; k++, added++)
      (Store.state.obs[P.id] ||= []).push({d: "", a: "", n: "", status: "approved", pre: true, ts});
  if (!s.again) { Store.state.scopes.reportName = s.name.trim(); Store.state.setup = {d: fmtDate(getToday())}; }
  Store.save();
  felSetup = null;
  route = {page: "week"};
  introDone = false;
  showToast(added ? `${added} approved observation${added > 1 ? "s" : ""} added` : s.again ? "Nothing added" : "You're set up");
}

function felSetupHTML() {
  if (!felSetup) felStart(false);
  return felSetup.step === 1 ? felWelcomeHTML() : felCatchUpHTML();
}
function felWelcomeHTML() {
  const point = (icon, head, text) => `<li>${ic(icon)}<span><b>${head}</b>${text}</span></li>`;
  return `<header class="ph felhead">${markSVG(58)}<p class="eyebrow mono">GI Hub · Adult Gastroenterology</p>` +
    `<h1 class="title">EPAs and scopes, on your phone</h1></header>` +
    `<ul class="card felpoints">` +
    point("epas", "EPAs", "Every observation by stage, what's still pending, and forms waiting 14+ days in Entrada.") +
    point("scope", "Endo", "Say each case after the scope. It becomes your procedure log, with a PDF for your program.") +
    point("guides", "Guides", "Current guidelines, landmark trials, IBD drugs and the Manitoba biopsy protocol.") +
    point("shield", "Private", "Everything stays on this phone. Nothing is sent anywhere, and no one else can see it.") + `</ul>` +
    `<label class="lbl mono">Your name, as it prints on the procedure log<input type="text" data-fel="name" value="${esc(felSetup.name)}" ` +
    `placeholder="Name, PGY-5 Adult Gastroenterology" autocomplete="name" autocapitalize="words"></label>` +
    `<div class="felacts"><button class="btn primary" data-action="felnext">Next: catch up from Entrada${ic("forward")}</button>` +
    `<button class="btn" data-action="importpick">${ic("download")}Restore a backup</button></div>` +
    `<input type="file" id="importfile" accept=".json,application/json" hidden>` +
    (backupError ? `<div class="err">${esc(backupError)}</div>` : "");
}
function felCatchUpHTML() {
  const s = felSetup;
  const adds = PARTS.reduce((a, P) => a + Math.max(0, s.n[P.id] - felApproved(P.id)), 0);
  let h = `<header class="ph"><p class="eyebrow mono">${s.again ? "Catch up" : "Step 2 of 2"}</p><h1 class="title">What Entrada already has</h1>` +
    `<p class="ph-note">Approved observations so far, for each EPA. Log pending forms one at a time afterwards, so they show up when they need chasing.</p></header>`;
  for (const st of STAGE_ORDER) {
    const parts = PARTS.filter(P => P.stage === st);
    const full = parts.every(P => s.n[P.id] >= P.required);
    const got = parts.reduce((a, P) => a + s.n[P.id], 0), req = parts.reduce((a, P) => a + P.required, 0);
    h += `<section class="felstage st-${st}"><div class="felstage-head"><i></i><div><h2>${STAGE_NAMES[st]}</h2><span class="mono">${got} of ${req}</span></div>` +
      `<button class="chip${full ? " on" : " ghost"}" data-action="felall" data-stage="${st}" aria-pressed="${full}">${ic("check")}All approved</button></div>` +
      `<div class="card">` + parts.map(P => {
        const v = s.n[P.id], low = v <= felFloor(P), top = v >= P.required;
        return `<div class="felrow"><span class="cc sm">${P.label}</span><span class="felname">${esc(PART_SHORT[P.id] || "")}</span>` +
          `<span class="felstep"><button class="iconbtn" data-action="felstep" data-part="${P.id}" data-by="-1"${low ? " disabled" : ""} aria-label="One fewer ${P.label}">${ic("minus")}</button>` +
          `<b class="${top ? "full" : v ? "some" : ""}">${v}<span>/${P.required}</span></b>` +
          `<button class="iconbtn" data-action="felstep" data-part="${P.id}" data-by="1"${top ? " disabled" : ""} aria-label="One more ${P.label}">${ic("plus")}</button></span></div>`;
      }).join("") + `</div></section>`;
  }
  const go = s.again ? (adds ? `Add ${adds} approved` : "Done") : adds ? `Start with ${adds} approved` : "Start";
  return h + `<div class="felbar"><button class="btn primary" data-action="feldone">${go}</button>` +
    `<button class="textbtn" data-action="${s.again ? "felcancel" : "felback"}">${s.again ? "Cancel" : "Back"}</button></div>`;
}

// ---- Home -----------------------------------------------------------------------------------------
// The dial, the stages and the chase list from Week; then what is left in the
// stage being worked on, and the scope log. Nothing here knows a fellow's
// rotations, so there is no weekly plan.
function felHomeHTML() {
  const today = getToday(), blk = blockFor(today), cur = currentStage();
  let h = `<header class="ph has-gear"><button class="iconbtn phgear" data-action="setopen" aria-label="Settings">${ic("gear")}</button>` +
    (blk ? `<p class="eyebrow mono">Block ${blk.num}</p><h1 class="title">Week ${blk.week} of 4</h1>` :
      `<p class="eyebrow mono">GI Hub</p><h1 class="title">Home</h1>`) + `</header>`;
  h += warningsHTML(today) + monitorHTML(today, cur) + stagesHTML(cur);
  const chase = chaseList(Store.state.obs, today);
  if (chase.length) h += chaseHTML(chase);
  return h + felLeftHTML(cur) + felScopeHTML();
}
function felLeftHTML(cur) {
  if (!cur) return `<section class="sec"><div class="card pad empty">Every required observation is logged.</div></section>`;
  const rows = PARTS.filter(P => P.stage === cur)
    .map(P => ({P, left: P.required - Math.min((Store.state.obs[P.id] || []).length, P.required)})).filter(r => r.left > 0);
  return `<section class="sec"><div class="sec-head"><h2>Still to log</h2><span class="mono">${STAGE_NAMES[cur]} · ${rows.reduce((a, r) => a + r.left, 0)} left</span></div>` +
    `<div class="card list st-${cur}">` + rows.map(({P, left}) => `<button class="wrow" data-action="sheet" data-part="${P.id}"><span class="tick"></span>` +
      `<span class="cc">${P.label}</span><span class="wname">${esc(PART_SHORT[P.id] || "")}</span><span class="wn">×${left}</span></button>`).join("") +
    `</div></section>`;
}
function felScopeHTML() {
  const cases = Store.state.scopes.cases;
  const head = `<div class="sec-head"><h2>Scope log</h2>${cases.length ? `<span class="mono">${scopeTotals(cases).procs} procedures</span>` : ""}</div>`;
  if (!cases.length)
    return `<section class="sec">${head}<button class="card felscope" data-action="scopeopen">${ic("mic")}<span><b>Log your first case</b>` +
      `<span>Say it after the scope, like “colonoscopy with Surname to the cecum, polypectomy”.</span></span>${ic("forward")}</button></section>`;
  const last = cases.slice().sort(scopeByDate)[cases.length - 1];
  return `<section class="sec">${head}<button class="card felscope" data-action="tab" data-page="endo">${ic("scope")}<span><b>Last: ${esc(dayLabel(last.d))}</b>` +
    `<span>${esc(scopeSummary(last))}</span></span>${ic("forward")}</button></section>`;
}

// ---- Settings ---------------------------------------------------------------------------------------
function felSetHTML() {
  return `<div class="setgrp"><div class="set-h mono"><span>Entrada</span></div><div class="card pad">` +
    `<button class="btn" data-action="felagain">${ic("epas")}Catch up from Entrada</button>` +
    `<p class="bnote mono">Adds approved observations; never removes any</p></div></div>`;
}

// ---- Taps -----------------------------------------------------------------------------------------
function felDispatch(act, d) {
  const s = felSetup;
  if (act === "felagain") { setSheet = null; felStart(true); window.scrollTo(0, 0); return; }
  if (!s) return;
  if (act === "felnext") { s.step = 2; window.scrollTo(0, 0); }
  else if (act === "felback") { s.step = 1; window.scrollTo(0, 0); }
  else if (act === "felcancel") felSetup = null;
  else if (act === "feldone") felFinish();
  else if (act === "felstep") { const P = PART_BY_ID[d.part]; s.n[P.id] = Math.max(felFloor(P), Math.min(P.required, s.n[P.id] + +d.by)); }
  else if (act === "felall") {
    const parts = PARTS.filter(P => P.stage === d.stage), full = parts.every(P => s.n[P.id] >= P.required);
    for (const P of parts) s.n[P.id] = full ? felFloor(P) : P.required;
  }
}
// The name box keeps what is typed without a redraw, so the keyboard stays up.
function felField(t) {
  if (!felSetup || !t.dataset || t.dataset.fel !== "name") return false;
  felSetup.name = t.value;
  return true;
}
