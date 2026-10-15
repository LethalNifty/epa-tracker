"use strict";
// GI Hub for fellows: the same app for the other fellows in the program, with
// Study, Pearls, the call card, reminders and the year plan left out (they are
// built on one fellow's reading, rotations and phone). The fellows' page sets
// window.GI_EDITION = "fellows" before the scripts load, and that edition
// saves under its own key (KEY in app.js), so a phone with both never mixes
// them. This file holds what only that edition has: first-run setup (the name
// for the procedure log, the finish date, then catching up from Entrada), its
// Home tab with the finish line, the calendar reminder, and the lock for an
// invite code that has ended.

const FELLOWS = typeof window !== "undefined" && window.GI_EDITION === "fellows";

// ---- Setup ----------------------------------------------------------------------------------------
// felSetup is null, or the setup on screen: {step: 1 or 2, name, n: {pid: approved so far}, again}.
// "again" is the catch-up reopened from Settings: it adds observations and never takes any away.
let felSetup = null;
const felApproved = pid => (Store.state.obs[pid] || []).filter(o => o.status === "approved").length;
const felNeedsSetup = () => FELLOWS && !Store.state.setup && !Store.hasData();
const felFloor = P => felSetup.again ? Math.min(felApproved(P.id), P.required) : 0;
function felStart(again) {
  felSetup = {step: again ? 2 : 1, name: Store.state.scopes.reportName || "", again: !!again, n: {},
    goal: {...(Store.state.goal || felGoalFor("pgy4", getToday()))}};
  for (const P of PARTS) felSetup.n[P.id] = Math.min(felApproved(P.id), P.required);
}
// Catching up adds approved observations with no date: Entrada has the dates.
function felFinish() {
  const s = felSetup, ts = new Date().toISOString();
  let added = 0;
  for (const P of PARTS)
    for (let k = felApproved(P.id); k < s.n[P.id]; k++, added++)
      (Store.state.obs[P.id] ||= []).push({d: "", a: "", n: "", status: "approved", pre: true, ts});
  if (!s.again) { Store.state.scopes.reportName = s.name.trim(); Store.state.goal = s.goal; Store.state.setup = {d: fmtDate(getToday())}; }
  Store.save();
  felSetup = null;
  route = {page: "week"};
  introDone = false;
  showToast(added ? `${added} approved observation${added > 1 ? "s" : ""} added` : s.again ? "Nothing added" : "You're set up");
}

function felSetupHTML() {
  if (felLocked) return felLockHTML();
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
    felGoalFieldsHTML(felSetup.goal, "felyear", "by") +
    `<p class="felhint">${felSetup.goal.year === "pgy5" ? "The end of March leaves room before training ends." : "18 months is a good target for a PGY-4."} ` +
    `You can change it any time in Settings.</p>` +
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
  h += warningsHTML(today) + monitorHTML(today, cur) + stagesHTML(cur) + felFinishHTML(today);
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

// ---- Finish line ------------------------------------------------------------------------------------
// The fellow's year gives the fellowship's start (July 1) and a first finish
// date, which they can change: 18 months for a PGY-4, the end of March for a
// PGY-5. The card is the full app's Year plan finish line: Done fills toward
// the goal line as observations are logged and should stay ahead of Today;
// Pace ends where the last 8 weeks' rate would finish.
const felAY = d => d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
function felGoalFor(year, today) {
  const ay = felAY(today);
  return {year, start: `${year === "pgy5" ? ay - 1 : ay}-07-01`, by: year === "pgy5" ? `${ay + 1}-03-31` : `${ay + 1}-12-31`};
}
const felDay = iso => new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), 12);
function felGoalFieldsHTML(g, yearAct, byField) {
  return `<div class="lbl mono">Your year</div><div class="segtabs felyear" role="group" aria-label="Your year">` +
    [["pgy4", "PGY-4"], ["pgy5", "PGY-5"]].map(([y, label]) => `<button class="${g.year === y ? "on" : ""}" data-action="${yearAct}" data-year="${y}" ` +
      `aria-pressed="${g.year === y}">${label}</button>`).join("") + `</div>` +
    `<label class="lbl mono">Finish every EPA by<input type="date" data-fel="${byField}" min="${g.start}" value="${g.by}"></label>`;
}
// What is left, what that needs a month, and where the last 8 weeks' pace
// would finish. A caught-up observation has no date, so it is spread evenly
// from the start of fellowship to the day it was entered, and the 8 weeks get
// their share; once setup is more than 8 weeks back, only real logging counts.
function felPace(g, today) {
  const DAY = 864e5, req = PARTS.reduce((a, P) => a + P.required, 0);
  const logged = PARTS.reduce((a, P) => a + Math.min((Store.state.obs[P.id] || []).length, P.required), 0), left = req - logged;
  const t0 = felDay(g.start), t1 = new Date(Math.max(+felDay(g.by), +t0 + 30 * DAY));
  const weeks = Math.max(1, Math.min(8, (today - t0) / DAY / 7)), lo = +today - weeks * 7 * DAY;
  let n = 0, spread = false;
  for (const pid in Store.state.obs) for (const o of Store.state.obs[pid]) {
    if (o.d) {
      const age = (today - felDay(o.d)) / DAY;
      if (age > -1 && age < weeks * 7) n++;
    } else if (o.pre) {
      const at = Date.parse(o.ts || ""), end = isNaN(at) ? +today : Math.min(+today, at);
      if (end - t0 < DAY) continue;
      const share = Math.max(0, end - Math.max(+t0, lo)) / (end - t0);
      if (share) { n += share; spread = true; }
    }
  }
  const monthsLeft = Math.max(0, (t1 - today) / DAY / 30.44);
  return {req, logged, left, n: Math.round(n), spread, weeks: Math.round(weeks), t0, t1, monthsLeft,
    finish: left && n ? new Date(+today + left / (n / weeks) * 7 * DAY) : null,
    perMonth: Math.ceil(left / Math.max(1, monthsLeft)),
    behind: Math.round(req * Math.min(1, Math.max(0, (today - t0) / (t1 - t0))) - logged)};
}
function felFinishHTML(today) {
  const g = Store.state.goal;
  if (!g) return `<section class="sec"><div class="sec-head"><h2>Finish line</h2></div><button class="card felscope" data-action="setopen">${ic("target")}` +
    `<span><b>Pick a finish date</b><span>See the pace it takes to log every EPA in time.</span></span>${ic("forward")}</button></section>`;
  const p = felPace(g, today), GOAL = 84, span = (p.t1 - p.t0) / (GOAL / 100);
  const at = d => Math.max(0, Math.min(100, (d - p.t0) / span * 100)), now = at(today);
  const ok = !p.left || (p.finish && p.finish <= p.t1);
  const cell = (label, val, cls, note) => `<div><div class="fin-lbl mono">${label}</div><div class="fin-val${cls ? " " + cls : ""}">${val}</div>` +
    (note ? `<div class="fin-note">${note}</div>` : "") + `</div>`;
  const pace = !p.left ? cell("At your current pace", "Done", "ok") : p.finish ?
    cell("At your current pace", `${MONTHS[p.finish.getMonth()]} ${p.finish.getFullYear()}`, ok ? "ok" : "warn",
      `${p.spread ? "About " : ""}${p.n} in the last ${p.weeks} week${p.weeks === 1 ? "" : "s"}`) :
    cell("At your current pace", "–", "", "Log a few to estimate");
  const months = Math.round(p.monthsLeft);
  const need = !p.left ? cell("Left to log", "None", "ok") :
    cell("To finish on time", `${p.perMonth} a month`, "", `${p.left} left · ${months} month${months === 1 ? "" : "s"}`);
  const paceW = !p.left ? now : p.finish ? at(p.finish) : 0, over = p.finish && (p.finish - p.t0) / span > 1;
  const status = !p.left ? "Every required observation is logged." : p.behind > 0 ? `Behind an even pace by ${p.behind}.` : "Ahead of an even pace.";
  return `<section class="sec"><div class="sec-head"><h2>Finish line</h2><span class="mono">Goal ${MONTHS[p.t1.getMonth()]} ${p.t1.getDate()}, ${p.t1.getFullYear()}</span></div>` +
    `<div class="card finish"><div class="fin-grid">${pace}${need}</div>` +
    `<div class="lanes" aria-hidden="true"><div class="lane-lbl mono"><span>Done</span><span>Pace</span></div>` +
    `<div class="lane-area"><div class="lane-bar"><i class="plan" style="width:${p.logged / p.req * GOAL}%"></i></div>` +
    `<div class="lane-bar">${paceW ? `<i class="pace${ok ? " ok" : ""}${over ? " over" : ""}" style="width:${paceW}%"></i>` : ""}</div>` +
    `<span class="goal-line" style="left:${GOAL}%"></span><span class="today-line" style="left:${now}%"></span>` +
    // Today matters more than the start: the start's label gives way when Today is near it.
    `<div class="axis mono">${now >= 24 ? `<span>${MONTHS[p.t0.getMonth()]} ${p.t0.getFullYear()}</span>` : "<span></span>"}` +
    (now > 6 && now < GOAL - 12 ? `<span class="t" style="left:${now}%">Today</span>` : "") +
    `<span style="left:${GOAL}%">${MONTHS[p.t1.getMonth()]} ${p.t1.getDate()}</span></div></div></div>` +
    `<p class="fin-goal">${status} Done reaches the goal line when everything is logged; keep it ahead of Today.</p></div></section>`;
}

// ---- Invite code ------------------------------------------------------------------------------------
// On the fellows' site Cloudflare checks an invite code before serving anything
// (tools/fellows/access.mjs). Once cached, the app opens without the network,
// so each launch online asks /__access whether its code still works. A 401
// locks the app: the data stays on the phone and a backup can still be made.
// A 404 means there is no check here (the full app, a preview), and no answer
// means no signal; neither locks anything.
let felLocked = false, felCodeTyped = "", felCodeErr = null, felCodeBusy = false;
function felCheckAccess() {
  if (!FELLOWS || typeof fetch !== "function") return;
  fetch("__access", {cache: "no-store"}).then(r => { if (r.status === 401 && !felLocked) { felLocked = true; render(); } }).catch(() => {});
}
function felLockHTML() {
  return `<header class="ph felhead">${markSVG(58)}<p class="eyebrow mono">GI Hub · Adult Gastroenterology</p>` +
    `<h1 class="title">This invite code has ended</h1></header>` +
    `<p class="ph-note">Ask the person who invited you for a new code. Everything you logged is still on this phone; export a backup to keep it safe.</p>` +
    `<label class="lbl mono">Invite code<input type="text" data-fel="code" value="${esc(felCodeTyped)}" autocapitalize="characters" spellcheck="false" placeholder="ABCD-2345"></label>` +
    `<div class="felacts"><button class="btn primary" data-action="felcode"${felCodeBusy ? " disabled" : ""}>Open GI Hub</button>` +
    `<button class="btn" data-action="export">${ic("share")}Export backup</button></div>` +
    (felCodeErr ? `<div class="err">${esc(felCodeErr)}</div>` : "") + (backupError ? `<div class="err">${esc(backupError)}</div>` : "");
}
async function felSendCode() {
  felCodeBusy = true; felCodeErr = null; route.keepScroll = true; render();
  try {
    const r = await fetch("__access", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({code: felCodeTyped})});
    if (r.ok) { location.reload(); return; }
    felCodeErr = "That code doesn't work. Check it, or ask the person who invited you.";
  } catch (e) { felCodeErr = "No connection. Try again once you have signal."; }
  felCodeBusy = false; route.keepScroll = true; render();
}

// ---- Settings ---------------------------------------------------------------------------------------
function felSetHTML() {
  const g = Store.state.goal || felGoalFor("pgy4", getToday());
  return `<div class="setgrp"><div class="set-h mono"><span>Finish line</span></div><div class="card pad felgoal">` +
    felGoalFieldsHTML(g, "felgoalyear", "goalby") + `</div></div>` +
    // A calendar event, not a push: it needs no server, and it fires even when the app stays closed.
    `<div class="setgrp"><div class="set-h mono"><span>Reminder</span></div><div class="card pad">` +
    `<a class="btn" href="reminder.ics" target="_blank" rel="noopener">${ic("bell")}Add a reminder to my calendar</a>` +
    `<p class="bnote mono">Every second Wednesday, 8 AM</p></div></div>` +
    `<div class="setgrp"><div class="set-h mono"><span>Entrada</span></div><div class="card pad">` +
    `<button class="btn" data-action="felagain">${ic("epas")}Catch up from Entrada</button>` +
    `<p class="bnote mono">Adds approved observations; never removes any</p></div></div>`;
}

// ---- Taps -----------------------------------------------------------------------------------------
function felDispatch(act, d) {
  const s = felSetup;
  if (act === "felagain") { setSheet = null; felStart(true); window.scrollTo(0, 0); return; }
  if (act === "felgoalyear") { Store.state.goal = felGoalFor(d.year, getToday()); Store.save(); return; }
  if (act === "felcode") { felSendCode(); return false; }
  if (!s) return;
  if (act === "felyear") { s.goal = felGoalFor(d.year, getToday()); return; }
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
  const k = t.dataset && t.dataset.fel, iso = /^\d{4}-\d{2}-\d{2}$/.test(t.value || "");
  if (!k) return false;
  if (k === "code") { felCodeTyped = t.value; return true; }
  if (k === "goalby") { if (iso && Store.state.goal) { Store.state.goal = {...Store.state.goal, by: t.value}; Store.save(); } return true; }
  if (!felSetup) return true;
  if (k === "name") felSetup.name = t.value;
  else if (k === "by" && iso) felSetup.goal.by = t.value;
  return true;
}
