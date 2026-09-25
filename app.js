"use strict";
// GI Hub app: saved progress (Store), the screens, and what each tap does.
// Reads EPA_DATA and BIOPSY_DATA (index.html) and the coach (coach.js).

const KEY = "epa-state-v1";
const Store = {
  state: {v:1, obs:{}, lines:{}, lastBackup:null, recapSeen:null},
  persistFailed: false,
  load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) this.state = s; } catch(e){} this.migrate(); },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch(e){ this.persistFailed = true; } },
  migrate() {
    delete this.state.celebrated;
    if (this.state.recapSeen === undefined) this.state.recapSeen = null;
    for (const k in this.state.obs) for (const o of this.state.obs[k]) if (!o.status) o.status = "approved"; },
  logObs(p) { (this.state.obs[p] ||= []).push({status:"pending", ts:new Date().toISOString()});
    this.save(); return this.state.obs[p].length - 1; },
  removeObs(p, i) { (this.state.obs[p]||[]).splice(i,1); this.save(); },
  restoreObs(p, i, o) { (this.state.obs[p] ||= []).splice(i, 0, o); this.save(); },
  setObsMeta(p, i, m) { Object.assign(this.state.obs[p][i], m); this.save(); },
  setObsStatus(p, i, s) { if (this.state.obs[p] && this.state.obs[p][i]) { this.state.obs[p][i].status = s; this.save(); } },
  toggleObsStatus(p, i) { const o = this.state.obs[p][i];
    o.status = o.status === "approved" ? "pending" : "approved"; this.save(); return o.status; },
  setRecapSeen(key) { this.state.recapSeen = key; this.save(); },
  partApproved(p) { return (this.state.obs[p]||[]).filter(o => o.status === "approved").length; },
  partPending(p) { return (this.state.obs[p]||[]).filter(o => o.status !== "approved").length; },
  overallApproved() { let d = 0; for (const e of EPA_DATA) for (const p of e.parts)
    d += Math.min(this.partApproved(p.id), p.required); return d; },
  overallPending() { let n = 0; for (const k in this.state.obs)
    n += this.state.obs[k].filter(o => o.status !== "approved").length; return n; },
  cycleLine(id, target) { const cur = this.lineVal(id), nv = (cur + 1) % (target + 1);
    if (nv === 0) { const meta = this.state.lines[id]; delete this.state.lines[id];
      if (meta && (meta.d || meta.n)) { this.state.lines[id] = {v:0, d:meta.d, n:meta.n}; } }
    else (this.state.lines[id] ||= {}).v = nv;
    this.save(); return nv; },
  lineVal(id) { return (this.state.lines[id] && this.state.lines[id].v) || 0; },
  setLineMeta(id, m) { Object.assign(this.state.lines[id] ||= {v:0}, m); this.save(); },
  partDone(p) { return (this.state.obs[p]||[]).length; },
  epaProgress(code) { const e = EPA_DATA.find(x => x.code === code);
    let done = 0, req = 0;
    for (const p of e.parts) { req += p.required; done += Math.min(this.partDone(p.id), p.required); }
    return {done, req}; },
  exportJSON() { return JSON.stringify(this.state, null, 1); },
  markBackup() { this.state.lastBackup = new Date().toISOString(); this.save(); },
  importJSON(text) {
    try {
      const s = JSON.parse(text);
      if (!s || s.v !== 1 || typeof s.obs !== "object" || !s.obs || typeof s.lines !== "object" || !s.lines)
        return {ok:false, error:"Not a valid EPA backup file."};
      this.state = {v:1, obs:s.obs, lines:s.lines, lastBackup:s.lastBackup || null, recapSeen:s.recapSeen || null};
      this.migrate(); this.save(); return {ok:true};
    } catch(e) { return {ok:false, error:"Could not read that file."}; }
  },
  hasData() {
    return Object.keys(this.state.obs).some(k => this.state.obs[k].length > 0) ||
      Object.keys(this.state.lines).length > 0;
  }
};

let nudgeDismissed = false, backupError = null;
function needsNudge(today) {
  if (!Store.hasData()) return false;
  const lb = Store.state.lastBackup;
  return !lb || (today - new Date(lb)) > 30 * 86400000;
}

// ---- Biopsy reference ------------------------------------------------------
const MB_PDF = "https://healthproviders.sharedhealthmb.ca/files/clinical-guideline-gi-endoscopic-biopsy.pdf";
let biopsyTerm = "", biopsyCat = "all";
// [category, chip label, tract-map glyph]
const BIOPSY_CATS = [["all", "All", null], ["Esophagus", "Esophagus", "esoph"], ["Stomach", "Stomach", "stomach"],
  ["Duodenum / Small bowel", "Duodenum", "duod"], ["Colon", "Colon", "colon"]];
function biopsyFilter(term, cat) {
  term = (term || "").trim().toLowerCase();
  return BIOPSY_DATA.filter(d => {
    if (cat !== "all" && d.cat !== cat) return false;
    if (!term) return true;
    const hay = (d.title + " " + d.cat + " " + (d.kw || "") + " " + d.rows.map(r => r.join(" ")).join(" ") + " " +
      (d.sec ? "Shared Health " + d.sec[1] : "") + " " + (d.ref ? d.ref.short + " " + d.ref.label : "")).toLowerCase();
    return hay.includes(term);
  });
}
let biopsyBold;
try {
  const bre = new RegExp("(?<![A-Za-z0-9/])(?:[≥≤<>~]\\s?)?\\d+(?:[–-]\\d+)?(?:\\s?(?:cm|mm|wk|%)|\\s?eos/hpf)?", "g");
  biopsyBold = s => s.replace(bre, m => "<b>" + m + "</b>");
} catch(e) { biopsyBold = s => s; }
function biopsyHi(html, term) {
  if (!term) return html;
  const t = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.replace(new RegExp("(" + t + ")(?![^<]*>)", "ig"), "<mark>$1</mark>");
}

// ---- Shared helpers ----------------------------------------------------------
const STAGE_NAMES = {ttd:"Transition to Discipline", f:"Foundations", core:"Core", ttp:"Transition to Practice"};
const STAGE_SHORT = {ttd:"TTD", f:"Foundations", core:"Core", ttp:"TTP"};
const STAGE_ORDER = ["ttd", "f", "core", "ttp"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
let route = {page:"week"};
function getToday() { return window.__today || new Date(); }
function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function ic(name, cls) { return `<svg class="ic${cls ? " " + cls : ""}" aria-hidden="true"><use href="#i-${name}"/></svg>`; }
function overall() { let d=0, r=0;
  for (const e of EPA_DATA) { const p = Store.epaProgress(e.code); d += p.done; r += p.req; }
  return {d, r}; }
const pct = (n, of) => of ? Math.round(n / of * 1000) / 10 : 0;

// Logged, approved and pending for a set of parts, each capped at what is required.
function tally(parts) {
  let req = 0, logged = 0, approved = 0;
  for (const P of parts) {
    const list = Store.state.obs[P.id] || [];
    req += P.required;
    logged += Math.min(list.length, P.required);
    approved += Math.min(list.filter(o => o.status === "approved").length, P.required);
  }
  return {req, logged, approved, pending: Math.max(0, logged - approved)};
}
const stageTally = st => tally(PARTS.filter(P => P.stage === st));
// The stage the coach is working on: the first coached stage with anything unlogged.
function currentStage() {
  return COACH_STAGES.find(st => PARTS.some(P => P.stage === st && (Store.state.obs[P.id] || []).length < P.required)) || null;
}
function stageState(st, cur) {
  const t = stageTally(st);
  if (t.logged >= t.req) return "done";
  if (st === "ttd") return "behind";
  return st === cur ? "now" : "locked";
}
const STATE_LABEL = {done: "Done", now: "Now", locked: "Locked", behind: "Earlier"};

// A ring of ticks, one per required observation, grouped into segments in order.
// segs: [{stage, total, approved, pending, next}]; next tints the unlogged ticks
// of the stage being worked on.
function dialSVG(segs, o) {
  const S = o.size, c = S / 2, gap = o.gap || 0;
  const slots = segs.reduce((a, s) => a + s.total + gap, 0), step = 2 * Math.PI / slots;
  const f = v => Math.round(v * 10) / 10;
  let k = gap / 2, i = 0, lines = "";
  for (const s of segs) {
    for (let j = 0; j < s.total; j++, k++) {
      const kind = j < s.approved ? "lit" : j < s.approved + s.pending ? "pend" : "off";
      const a = -Math.PI / 2 + (k + .5) * step, cs = Math.cos(a), sn = Math.sin(a);
      const r1 = kind === "off" ? o.r1off : o.r1;
      lines += `<line class="t ${kind}${kind === "off" && s.next ? " next" : ""} st-${s.stage}" x1="${f(c + r1 * cs)}" y1="${f(c + r1 * sn)}"` +
        ` x2="${f(c + o.r2 * cs)}" y2="${f(c + o.r2 * sn)}"` + (kind === "off" ? "" : ` style="--i:${i++}"`) + `/>`;
    }
    k += gap;
  }
  const rings = (o.rings || []).map(r => `<circle class="fold-ring" cx="${c}" cy="${c}" r="${r}"/>`).join("");
  return `<svg class="dial${o.cls ? " " + o.cls : ""}" viewBox="0 0 ${S} ${S}" aria-hidden="true">${rings}${lines}</svg>`;
}
const stageSegs = cur => STAGE_ORDER.map(st => {
  const t = stageTally(st);
  return {stage: st, total: t.req, approved: t.approved, pending: t.pending, next: st === cur};
});

// ---- Chrome: bottom bar, warnings, toast, crash screen ----------------------
const NAV = [["week", "Week", "week"], ["epas", "EPAs", "epas"], ["plan", "Plan", "plan"], ["biopsy", "Biopsy", "jar"]];
function navHTML(active) {
  const item = ([page, label, icon]) => `<button class="nv${active === page ? " on" : ""}" data-action="tab" data-page="${page}"` +
    (active === page ? ` aria-current="page"` : "") + `>${ic(icon)}<span>${label}</span></button>`;
  const split = NAV.length - 2;
  return `<nav class="bnav" aria-label="Main"><div class="bnav-in">${NAV.slice(0, split).map(item).join("")}` +
    `<button class="fab" data-action="sheet" aria-label="Log observation">${ic("plus")}</button>` +
    `${NAV.slice(split).map(item).join("")}</div></nav>`;
}
function warningsHTML(today) {
  let h = "";
  if (Store.persistFailed)
    h += `<div class="warnbar" role="alert">${ic("alert")}<span>Progress can't be saved (private browsing?). Anything you log will be lost when the app closes.</span></div>`;
  if (!nudgeDismissed && needsNudge(today))
    h += `<div class="card nudge">${ic("shield")}<span>No backup in over 30 days.</span><button class="btn" data-action="export">Back up</button>` +
      `<button class="iconbtn" data-action="dismissnudge" aria-label="Dismiss">${ic("x")}</button></div>`;
  return h;
}
let toast = null, toastFresh = false, toastTimer = null;
function showToast(msg, undo) {
  toast = {msg, undo: undo || null};
  toastFresh = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast = null;
    const el = document.getElementById("toast");
    if (el) el.remove();
  }, 5000);
}
function toastHTML() {
  return `<div class="toast${toastFresh ? " fresh" : ""}" id="toast" role="status">${ic("check")}<span>${esc(toast.msg)}</span>` +
    (toast.undo ? `<button class="textbtn" data-action="undo">Undo</button>` : "") + `</div>`;
}
function markSVG(size) {
  const n = 44, lit = 17, c = 32, step = 2 * Math.PI / n;
  let t = "";
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i + .5) * step, on = i < lit, r1 = on ? 18.8 : 20.1;
    t += `<line x1="${(c + r1 * Math.cos(a)).toFixed(2)}" y1="${(c + r1 * Math.sin(a)).toFixed(2)}" x2="${(c + 23.3 * Math.cos(a)).toFixed(2)}"` +
      ` y2="${(c + 23.3 * Math.sin(a)).toFixed(2)}" stroke="${on ? "#8ef1e0" : "#28474b"}" stroke-width="${on ? 1.1 : .9}" stroke-linecap="round"/>`;
  }
  return `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">${t}<circle cx="32" cy="32" r="3.4" fill="#8ef1e0"/></svg>`;
}
function crashHTML() {
  return `<div class="crash card">${markSVG(64)}<h1>This screen hit a problem</h1>` +
    `<p>Your saved progress is untouched. Export a backup, then reload the app.</p>` +
    `<button class="btn primary" data-action="export">${ic("share")}Export backup</button>` +
    `<button class="btn" data-action="reload">Reload</button></div>`;
}

// ---- Week --------------------------------------------------------------------
let introDone = false, chaseOpen = false;
function monitorHTML(today, cur) {
  const t = tally(PARTS), curT = cur ? stageTally(cur) : null;
  const date = `${DAYS[today.getDay()]} ${today.getDate()} ${MONTHS[today.getMonth()]}`;
  return `<section class="monitor" aria-label="${t.logged} of ${t.req} required observations logged; ${t.approved} approved, ${t.pending} pending">` +
    `<div class="monitor-in"><div class="ov mono"><span>Year 1 · 2026–27</span><span>${date}</span></div>` +
    `<div class="dial-wrap">${dialSVG(stageSegs(cur), {size: 300, r2: 140, r1: 114, r1off: 126, gap: 3, rings: [102, 78], cls: introDone ? "" : "intro"})}` +
    `<div class="dial-center"><div class="dial-num" data-count="${t.logged}">${t.logged}</div><div class="dial-lbl">of ${t.req} logged</div>` +
    (cur ? `<div class="dial-sub mono st-${cur}">${STAGE_NAMES[cur]} ${curT.logged}/${curT.req}</div>` : `<div class="dial-sub mono">Every stage logged</div>`) +
    `</div></div><div class="ov mono"><span class="ok">${t.approved} approved</span><span class="pend">${t.pending} pending</span></div></div></section>`;
}
function stagesHTML(cur) {
  return `<div class="stages">` + STAGE_ORDER.map(st => {
    const s = stageTally(st), state = stageState(st, cur);
    return `<button class="stg st-${st} ${state}" data-action="tab" data-page="epas"><span class="stg-name"><i></i>${STAGE_SHORT[st]}</span>` +
      `<span class="stg-count">${s.logged}/${s.req}</span><span class="stg-state mono">${state === "locked" ? ic("lock", "sm") : ""}${STATE_LABEL[state]}</span></button>`;
  }).join("") + `</div>`;
}
// rows is this week's list: a slipped part is either on it now or was moved
// on to a later block whose rotation suits it.
function recapHTML(rc, rows) {
  const list = xs => xs.map(x => `${x.label} ×${x.n}`).join(", ");
  const onNow = rc.slipped.filter(s => rows.some(r => r.pid === s.pid && r.outstanding > 0));
  const later = rc.slipped.filter(s => !onNow.includes(s));
  const items = [`<li>${ic("check")}<span>Logged last week: <b>${rc.got.length ? list(rc.got) : "nothing"}</b></span></li>`];
  if (!rc.slipped.length) items.push(`<li>${ic("shield")}<span>Nothing slipped.</span></li>`);
  if (onNow.length) items.push(`<li class="warn">${ic("carry")}<span>Carried onto this week: <b>${list(onNow)}</b></span></li>`);
  if (later.length) items.push(`<li>${ic("forward")}<span>Moved to a later block: <b>${list(later)}</b></span></li>`);
  return `<section class="brief" aria-label="Week in review"><div class="brief-head"><span class="mono">Week in review</span>` +
    `<button class="iconbtn" data-action="dismissrecap" data-key="${rc.key}" aria-label="Dismiss">${ic("x")}</button></div>` +
    `<h2>Your week, Jared</h2><ul>${items.join("")}</ul></section>`;
}
function thisWeekHTML(rows, stage) {
  const due = rows.reduce((a, r) => a + r.outstanding, 0);
  let h = `<section class="sec"><div class="sec-head"><h2>This week</h2><span class="mono">${stage ? STAGE_NAMES[stage] + " · " : ""}${due} due</span></div>`;
  if (!rows.length) return h + `<div class="card empty">Nothing due this week. Log anything you get.</div></section>`;
  h += `<div class="card list st-${stage}">`;
  for (const r of rows) {
    const done = r.outstanding === 0;
    h += `<button class="wrow${done ? " done" : ""}" data-action="sheet" data-part="${r.pid}">` +
      `<span class="tick">${done ? ic("check") : ""}</span><span class="cc">${r.label}</span>` +
      `<span class="wname">${esc(r.short)}</span>` +
      (r.carried ? `<span class="tag warn">carried</span>` : "") +
      (done ? "" : `<span class="wn">×${r.outstanding}</span>`) + `</button>`;
  }
  return h + `</div></section>`;
}
function lookHTML(items) {
  return `<section class="sec"><div class="sec-head"><h2>Look for</h2><span class="mono">Cases you still need</span></div><div class="card list">` +
    items.map(x => `<button class="lrow" data-action="open" data-code="${PART_BY_ID[x.pid].code}">${ic("target")}` +
      `<span class="wname">${esc(x.name)}</span><span class="cc sm st-${PART_BY_ID[x.pid].stage}">${x.part}</span>` +
      (x.left > 1 ? `<span class="wn">×${x.left}</span>` : "") + `</button>`).join("") + `</div></section>`;
}
function chaseHTML(list) {
  return `<section class="sec"><details class="card chase"${chaseOpen ? " open" : ""}><summary>${ic("clock")}` +
    `<b>${list.length} form${list.length > 1 ? "s" : ""} pending 14+ days</b><span class="mono">Entrada</span>${ic("chev", "chev")}</summary>` +
    list.map(c => `<div class="crow"><span class="cc sm st-${PART_BY_ID[c.pid].stage}">${c.label}</span>` +
      `<span class="cmeta"><span class="num">${esc(c.date)}</span> · ${c.a ? esc(c.a) : "no assessor"}</span>` +
      `<button class="pillbtn" data-action="chaseok" data-part="${c.pid}" data-obs="${c.i}">Approved</button></div>`).join("") +
    `</details></section>`;
}
// The finish-line chart spans Jul 2 2026 to mid Sep 2027, so a date past the
// Jun 30 goal still has room to show; later dates run off the end.
const SPAN = 440, onSpan = d => Math.max(0, Math.min(100, pct(dayIndex(d), SPAN)));
function finishHTML(pace, plan, today) {
  const month = d => MONTHS[d.getMonth()] + " " + d.getFullYear();
  const day = d => MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
  const cell = (label, r, fmt, empty, note) => `<div><div class="fin-lbl mono">${label}</div>` +
    (r.done ? `<div class="fin-val ok">Done</div>` : r.date ?
      `<div class="fin-val ${r.onTrack ? "ok" : "warn"}">${fmt(r.date)}</div>` + (note ? `<div class="fin-note">${note}</div>` : "") :
      `<div class="fin-val">–</div><div class="fin-note">${empty}</div>`) + `</div>`;
  const paceNote = pace.date ? `${pace.n} logged in the last ${pace.weeks} week${pace.weeks === 1 ? "" : "s"}` : "";
  const bar = (r, cls) => r.done ? `<i class="${cls}" style="width:${onSpan(today)}%"></i>` : r.date ?
    `<i class="${cls}${dayIndex(r.date) > SPAN ? " over" : ""}" style="width:${onSpan(r.date)}%"></i>` : "";
  const goal = pct(363, SPAN), now = onSpan(today);
  return `<section class="sec"><div class="sec-head"><h2>Finish line</h2><span class="mono">Goal Jun 30, 2027</span></div>` +
    `<div class="card finish"><div class="fin-grid">` +
    cell("At your current pace", pace, month, "Log a few to estimate", paceNote) + cell("If you hit the plan", plan, day, "", "") +
    `</div><div class="lanes" aria-hidden="true"><div class="lane-lbl mono"><span>Plan</span><span>Pace</span></div>` +
    `<div class="lane-area"><div class="lane-bar">${bar(plan, "plan")}</div><div class="lane-bar">${bar(pace, "pace" + (pace.onTrack ? " ok" : ""))}</div>` +
    `<span class="goal-line" style="left:${goal}%"></span><span class="today-line" style="left:${now}%"></span>` +
    `<div class="axis mono"><span>Jul</span>${now > 14 && now < goal - 16 ? `<span class="t" style="left:${now}%">Today</span>` : ""}` +
    `<span style="left:${goal}%">Jun 30</span></div></div></div>` +
    `<p class="fin-goal">Goal: everything logged by Jun 30, 2027.</p></div></section>`;
}
function viewWeek() {
  const today = getToday(), blk = blockFor(today), obsBy = Store.state.obs, cur = currentStage();
  let h = `<header class="ph">` + (blk
    ? `<p class="eyebrow mono">Block ${blk.num} · ${esc(blk.name)}</p><h1 class="title">Week ${blk.week} of 4</h1>`
    : `<p class="eyebrow mono">GI Hub</p><h1 class="title">${dayIndex(today) < 0 ? "Almost time" : "Year 1 done"}</h1>`) + `</header>`;
  h += warningsHTML(today) + monitorHTML(today, cur) + stagesHTML(cur);
  if (!blk) {
    return h + `<div class="card pad empty spaced">${dayIndex(today) < 0 ? "Fellowship starts July 2, 2026." :
      "Year 1 is done. Anything still open is on the EPAs tab. Ask Claude to load the Year 2 schedule."}</div>`;
  }
  const cp = coachPlan(obsBy, today), rows = weekRows(obsBy, today);
  if (Store.state.recapSeen !== blk.num + "-" + blk.week) {
    const rc = recapFor(obsBy, today);
    if (rc) h += recapHTML(rc, rows);
  }
  h += thisWeekHTML(rows, cp.active);
  const look = lookFor(rows, id => Store.lineVal(id));
  if (look.length) h += lookHTML(look);
  const chase = chaseList(obsBy, today);
  if (chase.length) h += chaseHTML(chase);
  return h + finishHTML(paceFinish(obsBy, today), planFinish(cp), today);
}

// ---- EPAs --------------------------------------------------------------------
function epaRowHTML(e, focus) {
  const t = tally(PARTS.filter(P => P.code === e.code));
  const pend = e.parts.reduce((a, pt) => a + Store.partPending(pt.id), 0);
  return `<button class="epa st-${e.stage}" data-action="open" data-code="${e.code}"><span class="code">${e.code}</span>` +
    `<span class="epa-mid"><span class="epa-title">${esc(e.title)}</span>` +
    `<span class="bar"><i style="width:${pct(t.approved, t.req)}%"></i><i class="pend" style="width:${pct(t.pending, t.req)}%"></i></span>` +
    `<span class="epa-tags">${focus.includes(e.code) ? `<span class="tag">this block</span>` : ""}` +
    `${pend ? `<span class="tag warn">${pend} pending</span>` : ""}</span></span>` +
    `<span class="epa-count${t.logged >= t.req ? " done" : ""}">${t.logged}/${t.req}</span></button>`;
}
function backupHTML() {
  const lb = Store.state.lastBackup;
  return `<section class="sec"><div class="sec-head"><h2>Backup</h2><span class="mono">Last backup: ${lb ? esc(lb.slice(0, 10)) : "never"}</span></div>` +
    `<div class="card pad"><button class="btn" data-action="export">${ic("share")}Export backup</button>` +
    `<button class="btn" data-action="importpick">${ic("download")}Import backup</button>` +
    `<input type="file" id="importfile" accept=".json,application/json" hidden>` +
    `<p class="bnote mono">Saved on this phone only</p>` +
    (backupError ? `<div class="err">${esc(backupError)}</div>` : "") + `</div></section>`;
}
const LOCK_NOTE = {core: "Opens once every Foundations observation is logged.", ttp: "Opens once every Core observation is logged."};
function viewEpas() {
  const today = getToday(), cp = coachPlan(Store.state.obs, today), focus = cp ? blockFocus(cp) : [];
  const cur = currentStage(), t = tally(PARTS);
  let h = `<header class="ph"><p class="eyebrow mono">Royal College · Adult Gastroenterology</p><h1 class="title">EPAs</h1>` +
    `<div class="ph-meta mono"><b>${t.logged}</b>/${t.req} logged · <b>${Store.overallPending()}</b> pending</div></header>` + warningsHTML(today);
  for (const st of STAGE_ORDER) {
    const s = stageTally(st), state = stageState(st, cur);
    const list = EPA_DATA.filter(x => x.stage === st);
    const done = list.filter(e => { const p = Store.epaProgress(e.code); return p.done >= p.req; });
    h += `<section class="stage-sec st-${st}"><div class="stage-head${state === "locked" ? " lock" : ""}"><i></i><h2>${STAGE_NAMES[st]}</h2>` +
      `<span class="mono state">${STATE_LABEL[state]}</span><span class="mono">${s.logged}/${s.req}</span></div>` +
      `<div class="stage-bar"><i style="width:${pct(s.approved, s.req)}%"></i><i class="pend" style="width:${pct(s.pending, s.req)}%"></i></div>` +
      (st === "ttd" && state !== "done" ? `<p class="stagenote">${ic("forward")}<span>Earlier stage: the coach won't suggest these. ` +
        `Log anything Entrada has that's missing here so your totals match.</span></p>` : "") +
      (state === "locked" ? `<p class="stagenote">${ic("lock")}<span>${LOCK_NOTE[st]} You can still log these any time.</span></p>` : "") +
      list.filter(e => !done.includes(e)).map(e => epaRowHTML(e, focus)).join("");
    if (done.length) h += `<details class="donegrp"><summary>${ic("chev")}Done (${done.length})</summary>${done.map(e => epaRowHTML(e, focus)).join("")}</details>`;
    h += `</section>`;
  }
  return h + backupHTML();
}

// ---- EPA detail --------------------------------------------------------------
function lineEditorHTML(id) {
  const meta = Store.state.lines[id] || {};
  return `<div class="editor">` +
    `<label class="lbl mono">Date<input type="date" value="${esc(meta.d || "")}" data-field="d" data-line="${id}"></label>` +
    `<label class="lbl mono">Note<input type="text" value="${esc(meta.n || "")}" placeholder="Assessor, case details" data-field="n" data-line="${id}"></label>` +
    `<div class="erow"><button class="textbtn" data-action="closeedit">Done</button></div></div>`;
}
function partBlock(p, st) {
  const t = tally([PART_BY_ID[p.id]]), list = Store.state.obs[p.id] || [];
  const m = p.name ? /^(Part [A-Z]):\s*(.*)$/.exec(p.name) : null;
  let h = `<section class="part st-${st}"><div class="part-head"><div>${m ? `<p class="eyebrow mono">${esc(m[1])}</p>` : ""}` +
    `<h3>${esc(m ? m[2] : p.name || "Observations")}</h3></div><div class="part-count">${list.length}<span>/${p.required}</span></div></div>` +
    `<div class="segs" aria-hidden="true">` + Array.from({length: p.required}, (_, j) =>
      `<i${j < t.approved ? ` class="lit"` : j < t.approved + t.pending ? ` class="pend"` : ""}></i>`).join("") + `</div>`;
  if (t.pending || t.approved >= p.required)
    h += `<div class="part-state">${t.pending ? `<span class="mono pend">${t.pending} pending</span>` : ""}` +
      `${t.approved >= p.required ? `<span class="mono ok">Complete</span>` : ""}</div>`;
  if (list.length) {
    h += `<ol class="obs">`;
    list.forEach((o, i) => {
      const appd = o.status === "approved";
      h += `<li class="ob"><button class="spill ${appd ? "approved" : "pending"}" data-action="togglestatus" data-part="${p.id}" data-obs="${i}">` +
        `${ic(appd ? "check" : "clock")}${appd ? "Approved" : "Pending"}</button>` +
        `<button class="ometabtn" data-action="sheet" data-part="${p.id}" data-obs="${i}">` +
        `<span class="onum">${String(i + 1).padStart(2, "0")}</span><span class="odate">${esc(o.d || "no date")}</span>` +
        `<span class="otext">${[o.a, o.n].filter(Boolean).map(esc).join(" · ")}</span></button></li>`;
    });
    h += `</ol>`;
  }
  h += `<button class="logbtn" data-action="sheet" data-part="${p.id}">${ic("plus")}Log observation</button>`;
  if (p.items.length) {
    h += `<div class="ctx"><span class="mono">Context checklist</span>`;
    for (const it of p.items) {
      if (it.h) { h += `<div class="ihead">${esc(it.h)}</div>`; continue; }
      const v = Store.lineVal(it.id), ldone = v >= it.target;
      const box = it.target === 1 ? (v ? ic("check") : "") : `${v}/2`;
      h += `<div class="line${ldone ? " ldone" : ""}" data-action="cycleline" data-line="${it.id}" data-target="${it.target}">` +
        `<span class="lbox${!ldone && v ? " half" : ""}">${box}</span><span class="llab">${esc(it.label)}</span>` +
        `<button class="lmeta" data-action="linemeta" data-line="${it.id}" aria-label="Date and note">${ic("more")}</button></div>`;
      if (route.editLine === it.id) h += lineEditorHTML(it.id);
    }
    h += `</div>`;
  }
  return h + `</section>`;
}
function fold(title, body) {
  return `<details class="fold"><summary><span>${title}</span>${ic("chev")}</summary><div class="fold-body">${body}</div></details>`;
}
function refBlock(e) {
  const r = e.ref;
  const plan = r.plan.map(pl => `<div class="planitem">` + (pl.part ? `<b>${esc(pl.part)}</b>` : "") +
    `<span class="meth">${esc(pl.method)}</span>` +
    (pl.collects.length ? `<ul>` + pl.collects.map(c => `<li>${esc(c)}</li>`).join("") + `</ul>` : "") +
    `<div class="rule">${esc(pl.rule)}</div></div>`).join("");
  const ms = r.milestones.map(g => (g.part ? `<h5>${esc(g.part)}</h5>` : "") + `<ol>` + g.list.map(m => `<li>${esc(m)}</li>`).join("") + `</ol>`).join("");
  return `<div class="ref"><div class="sec-head"><h2>Reference</h2><span class="mono">Royal College guide</span></div>` +
    fold("Key features", `<ul>` + r.keyFeatures.map(k => `<li>${esc(k)}</li>`).join("") + `</ul>`) +
    fold("Assessment plan", plan) + fold("CanMEDS milestones", ms) +
    `<p class="copy">EPA definitions: Copyright © 2024 The Royal College of Physicians and Surgeons of Canada. Referenced and produced with permission. Reproduced for educational purposes.</p></div>`;
}
function viewEpa(code) {
  const e = EPA_DATA.find(x => x.code === code), st = e.stage;
  const t = tally(PARTS.filter(P => P.code === code));
  const backTo = {week: "This week", plan: "Plan"}[route.from] || "All EPAs";
  const segs = e.parts.map(p => { const pt = tally([PART_BY_ID[p.id]]);
    return {stage: st, total: p.required, approved: pt.approved, pending: pt.pending, next: true}; });
  let h = `<header class="ph"><button class="back" data-action="back">${ic("back")}${backTo}</button></header>` +
    `<div class="epa-hero st-${st}"><div class="dial-wrap">${dialSVG(segs, {size: 104, r2: 50, r1: 37, r1off: 43, gap: e.parts.length > 1 ? 2 : 0, cls: "sm"})}` +
    `<div class="dial-center"><div class="dial-num">${t.logged}</div><div class="dial-lbl">of ${t.req}</div></div></div>` +
    `<div><p class="eyebrow mono">${e.code} · ${STAGE_NAMES[st]}</p><h1 class="detail-title">${esc(e.title)}</h1>` +
    `<div class="ph-meta mono">${t.approved} approved · ${t.pending} pending</div></div></div>`;
  for (const p of e.parts) h += partBlock(p, st);
  return h + refBlock(e);
}

// ---- Plan --------------------------------------------------------------------
function viewPlan() {
  const today = getToday(), blk = blockFor(today), obsBy = Store.state.obs;
  const cp = blk ? coachPlan(obsBy, today) : null;
  const curNum = blk ? blk.num : (dayIndex(today) < 0 ? 0 : 14);
  let h = `<header class="ph"><p class="eyebrow mono">Recalculated from what you've logged</p><h1 class="title">Year 1 plan</h1></header>`;
  if (cp) h += finishHTML(paceFinish(obsBy, today), planFinish(cp), today);
  const order = {
    f: "You're on Foundations. Core opens once every Foundations observation is logged, then Transition to Practice (P1). ",
    core: "You're on Core. Transition to Practice (P1) opens once every Core observation is logged. ",
    ttp: "You're on Transition to Practice. ",
  };
  h += `<p class="goal">${cp ? (order[cp.active] || "Everything is logged. ") : ""}` +
    `What's left in your stage is due as soon as a block can fit it; the next stage starts the block after. ` +
    `Targets update every time you log. Past blocks show what you logged.</p><ol class="tube">`;
  for (let n = 1; n <= 13; n++) {
    const chips = blockTargets(n, obsBy, cp, curNum), now = n === curNum, past = n < curNum;
    const weight = {};
    for (const c of chips) { const s = PART_BY_ID[c.pid].stage; weight[s] = (weight[s] || 0) + c.n; }
    const dom = past ? null : Object.keys(weight).sort((a, b) => weight[b] - weight[a])[0];
    let rail = `<span class="node"></span>`;
    for (let w = 1; w <= 4; w++) rail += `<span class="wk" style="top:${w * 20 + 6}%"></span>`;
    if (now) rail += `<span class="tip" style="top:${blk.week * 20 + 6}%"></span>`;
    h += `<li class="blk${now ? " now" : past ? " past" : ""}${dom ? " st-" + dom : ""}"><div class="rail" aria-hidden="true">${rail}</div>` +
      `<div class="blk-body"><div class="blk-top"><span class="mono">Blk ${String(n).padStart(2, "0")}</span>` +
      (now ? `<span class="tag solid">Now</span>` : "") + `<span class="mono dates">${blockDates(n)}</span></div>` +
      `<h3>${esc(BLOCK_NAMES[n])}</h3><p class="hint">${esc(BLOCK_HINTS[n])}</p><div class="pchips">` +
      (chips.length ? chips.map(c => `<button class="pchip st-${PART_BY_ID[c.pid].stage}${c.past ? " past" : ""}" data-action="open" data-code="${c.code}">` +
        `<b>${c.label}</b><span class="x">×${c.n}</span></button>`).join("") :
        `<span class="pnone">${past ? "Nothing logged here" : "Nothing left here"}</span>`) + `</div></div></li>`;
  }
  return h + `</ol>`;
}

// ---- Biopsy ------------------------------------------------------------------
function sourceHTML(d) {
  if (d.src === "mb")
    return `<a class="srcrow" href="${MB_PDF}" target="_blank" rel="noopener">${ic("book")}` +
      `<span>Shared Health §${esc(d.sec[0])} ${esc(d.sec[1])} · p. ${esc(d.sec[2])}</span>${ic("external", "sm")}</a>`;
  const r = d.ref;
  return r.url
    ? `<a class="srcrow" href="${esc(r.url)}" target="_blank" rel="noopener">${ic("book")}<span>${esc(r.label)}</span>${ic("external", "sm")}</a>`
    : `<div class="srcrow">${ic("book")}<span>${esc(r.label)}</span></div>`;
}
function viewBiopsy() {
  const list = biopsyFilter(biopsyTerm, biopsyCat);
  let h = `<header class="ph"><p class="eyebrow mono">Shared Health Manitoba · 2022</p><h1 class="title">Biopsy</h1>` +
    `<p class="ph-note">Manitoba first; other sources where it's silent.</p></header>`;
  h += `<a class="btn guide" href="${MB_PDF}" target="_blank" rel="noopener">${ic("book")}Open the full Manitoba guideline${ic("external", "sm")}</a>`;
  h += `<div class="qwrap">${ic("search")}<input id="biopsyq" type="search" placeholder="Search (celiac, reflux, H. pylori)" aria-label="Search protocols" ` +
    `autocomplete="off" autocapitalize="off" value="${esc(biopsyTerm)}">` +
    (biopsyTerm ? `<button class="qclear" data-action="bclear" aria-label="Clear">${ic("x")}</button>` : "") + `</div>`;
  h += `<div class="bcats">` + BIOPSY_CATS.map(([cat, label, glyph]) =>
    `<button class="bcat${biopsyCat === cat ? " on" : ""}" data-action="bcat" data-cat="${esc(cat)}">${glyph ? ic(glyph) : ""}${esc(label)}</button>`).join("") + `</div>`;
  const filtered = biopsyTerm || biopsyCat !== "all";
  h += `<p class="bcount mono">${filtered ? list.length + " of " + BIOPSY_DATA.length + " shown" : BIOPSY_DATA.length + " protocols"}</p>`;
  if (!list.length) h += `<div class="bempty">No match. Try a different term.</div>`;
  let lastCat = "";
  for (const d of list) {
    if (d.cat !== lastCat) {
      const glyph = (BIOPSY_CATS.find(c => c[0] === d.cat) || [])[2];
      h += `<div class="bgrp">${glyph ? ic(glyph) : ""}<span class="mono">${esc(d.cat)}</span><span class="mono n">${list.filter(x => x.cat === d.cat).length}</span></div>`;
      lastCat = d.cat;
    }
    const tag = d.src === "mb" ? `<span class="btag mb">MB</span>` : `<span class="btag us">${esc(d.ref.short)}</span>`;
    h += `<article class="bcard"><h3><span class="t">${biopsyHi(esc(d.title), biopsyTerm)}</span> ${tag}</h3>`;
    for (const row of d.rows) {
      const key = row.length > 1 ? row[0] : "", val = row.length > 1 ? row[1] : row[0];
      h += `<div class="brow"><div class="bk">${esc(key)}</div>` +
        `<div class="${key === "Notes" || key === "" ? "bv note" : "bv"}">${biopsyHi(biopsyBold(esc(val)), biopsyTerm)}</div></div>`;
    }
    h += sourceHTML(d) + `</article>`;
  }
  return h + `<p class="bfoot">Label every jar with a standard location term first, then your descriptor. ` +
    `Put the clinical question or differential on every requisition. ` +
    `Reference tool: check the current guideline and use clinical judgment.</p>`;
}

// ---- Log sheet -----------------------------------------------------------------
let sheet = null, sheetError = null, sheetFresh = false;
function openSheet(pid, i) {
  const o = pid && i !== undefined && Store.state.obs[pid] && Store.state.obs[pid][+i];
  sheet = o
    ? {mode: "edit", pid, i: +i, d: o.d || "", a: o.a || "", n: o.n || "", status: o.status || "pending", all: false}
    : {mode: "new", pid: pid || null, d: fmtDate(getToday()), a: "", n: "", status: "pending", all: false};
  sheetError = null;
  sheetFresh = true;
}
function saveSheet() {
  if (!sheet.pid) { sheetError = "Pick an EPA first."; return; }
  const {pid, mode, status} = sheet;
  const meta = {d: sheet.d, a: sheet.a.trim(), n: sheet.n.trim(), status};
  const i = mode === "new" ? Store.logObs(pid) : sheet.i;
  Store.setObsMeta(pid, i, meta);
  sheet = null; sheetError = null;
  if (mode === "new") showToast(`${PART_BY_ID[pid].label} logged as ${status}`, () => Store.removeObs(pid, i));
  else showToast("Changes saved");
}
// Every assessor name used so far, most recently logged first, one spelling each.
function assessorNames() {
  const all = [];
  for (const k in Store.state.obs) for (const o of Store.state.obs[k]) if (o.a && o.a.trim()) all.push(o);
  all.sort((x, y) => String(y.ts || "").localeCompare(String(x.ts || "")));
  const out = [];
  for (const o of all) {
    const name = o.a.trim();
    if (!out.some(x => x.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out;
}
function assessorSuggestions(typed) {
  const t = (typed || "").trim().toLowerCase();
  return assessorNames().filter(n => !t || (n.toLowerCase().includes(t) && n.toLowerCase() !== t)).slice(0, 4);
}
function suggHTML(typed) {
  return assessorSuggestions(typed).map(x =>
    `<button class="pick ghost" data-action="pickassessor" data-name="${esc(x)}">${esc(x)}</button>`).join("");
}
function sheetHTML() {
  const s = sheet, today = getToday();
  const chip = pid => `<button class="pick st-${PART_BY_ID[pid].stage}${s.pid === pid ? " on" : ""}" data-action="pickpart" data-part="${pid}">${PART_BY_ID[pid].label}</button>`;
  let picker;
  if (s.mode === "edit") picker = `<div class="pickrow">${chip(s.pid)}</div>`;
  else {
    const quick = weekRows(Store.state.obs, today).filter(r => r.outstanding > 0).map(r => r.pid);
    if (s.pid && !quick.includes(s.pid)) quick.unshift(s.pid);
    picker = !s.all && quick.length
      ? `<div class="lbl mono">This week's EPAs</div><div class="pickrow">${quick.map(chip).join("")}` +
        `<button class="pick ghost" data-action="pickall">All EPAs</button></div>`
      : `<div class="lbl mono">All EPAs</div>` + STAGE_ORDER.map(st =>
        `<div class="pickgrp mono st-${st}"><i></i>${STAGE_NAMES[st]}</div><div class="pickrow">` +
        PARTS.filter(P => P.stage === st).map(P => chip(P.id)).join("") + `</div>`).join("");
  }
  const edit = s.mode === "edit";
  const iso = fmtDate(today), yest = fmtDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
  const dchip = (d, label) => `<button class="pick ghost${s.d === d ? " on" : ""}" data-action="sheetdate" data-date="${d}">${label}</button>`;
  return `<div class="scrim${sheetFresh ? " fresh" : ""}" data-action="closesheet"></div>` +
    `<div class="sheet${sheetFresh ? " fresh" : ""}" role="dialog" aria-modal="true" aria-label="${edit ? "Edit" : "Log"} observation"><div class="grab"></div>` +
    `<div class="shead"><b>${edit ? "Edit observation" : "Log observation"}</b>` +
    `<button class="iconbtn" data-action="closesheet" aria-label="Close">${ic("x")}</button></div>` + picker +
    `<label class="lbl mono">Date<input type="date" value="${esc(s.d)}" data-sheet="d"></label>` +
    `<div class="datechips">${dchip(iso, "Today")}${dchip(yest, "Yesterday")}</div>` +
    `<label class="lbl mono">Assessor<input type="text" value="${esc(s.a)}" placeholder="Dr. Surname" data-sheet="a" autocomplete="off" autocapitalize="words"></label>` +
    `<div class="pickrow sugg" id="sugg">${suggHTML(s.a)}</div>` +
    `<label class="lbl mono">Note<input type="text" value="${esc(s.n)}" placeholder="Case details" data-sheet="n"></label>` +
    `<div class="seg" role="group" aria-label="Status"><button class="pending${s.status === "pending" ? " on" : ""}" data-action="sheetstatus" data-status="pending">${ic("clock")}Pending</button>` +
    `<button class="approved${s.status === "approved" ? " on" : ""}" data-action="sheetstatus" data-status="approved">${ic("check")}Approved</button></div>` +
    (sheetError ? `<div class="err" role="alert">${esc(sheetError)}</div>` : "") +
    `<div class="sactions">${edit ? `<button class="btn danger" data-action="sheetdelete">Delete</button>` : ""}` +
    `<button class="btn primary" data-action="sheetsave">${edit ? "Save" : "Save as " + s.status}</button></div></div>`;
}
// Keeps sheet fields in step with typing without re-rendering (which would
// drop the keyboard); only the assessor suggestions redraw.
function sheetField(t) {
  const f = t.dataset && t.dataset.sheet;
  if (!f || !sheet) return false;
  sheet[f] = t.value;
  if (f === "a") { const box = document.getElementById("sugg"); if (box) box.innerHTML = suggHTML(t.value); }
  return true;
}

// ---- Backup --------------------------------------------------------------------
// Hands the backup to the iPhone share sheet when it can take a file,
// otherwise downloads it. Only a completed hand-over counts as a backup.
async function exportBackup() {
  const name = "epa-backup-" + fmtDate(getToday()) + ".json";
  const json = Store.exportJSON();
  backupError = null;
  if (typeof File === "function" && navigator.canShare) {
    const file = new File([json], name, {type: "application/json"});
    if (navigator.canShare({files: [file]})) {
      try { await navigator.share({files: [file], title: "GI Hub backup"}); Store.markBackup(); showToast("Backup exported"); }
      catch (e) { if (!e || e.name !== "AbortError") backupError = "Couldn't share the backup. Try again."; }
      route.keepScroll = true; render();
      return;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([json], {type: "application/json"}));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  Store.markBackup(); showToast("Backup exported"); route.keepScroll = true; render();
}

// ---- Render and dispatch ---------------------------------------------------------
let enterNext = true;
function render() {
  const p = route.page;
  let html;
  try {
    const body = p === "week" ? viewWeek() : p === "epas" ? viewEpas() : p === "plan" ? viewPlan() :
      p === "biopsy" ? viewBiopsy() : viewEpa(route.code);
    html = `<main class="page${enterNext ? " enter" : ""}">${body}</main>` + navHTML(p === "epa" ? route.from : p) +
      (sheet ? sheetHTML() : "") + (toast ? toastHTML() : "");
  } catch (err) {
    console.error(err);
    html = `<main class="page">${crashHTML()}</main>`;
  }
  document.getElementById("app").innerHTML = html;
  const countUp = p === "week" && !introDone;
  if (p === "week") introDone = true;
  enterNext = false; sheetFresh = false; toastFresh = false;
  if (!route.keepScroll) window.scrollTo(0, 0);
  route.keepScroll = false;
  if (countUp) countUpDial();
}
// The dial's number counts up once, the first time Week is drawn.
function countUpDial() {
  if (typeof requestAnimationFrame !== "function") return;
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const el = document.querySelector(".dial-num[data-count]");
  if (!el) return;
  const target = +el.dataset.count, t0 = performance.now(), dur = 950;
  const step = now => {
    const k = Math.min(1, (now - t0) / dur);
    el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  el.textContent = "0";
  requestAnimationFrame(step);
}
function go(next) { route = next; enterNext = true; render(); }
function dispatch(act, d) {
  if (act === "open") go({page: "epa", code: d.code, from: route.page === "epa" ? route.from : route.page});
  else if (act === "back") go({page: route.from || "epas"});
  else if (act === "tab") { if (route.page !== d.page) go({page: d.page}); else { window.scrollTo(0, 0); } }
  else if (act === "sheet") { openSheet(d.part, d.obs); route.keepScroll = true; render(); }
  else if (act === "closesheet") { sheet = null; sheetError = null; route.keepScroll = true; render(); }
  else if (act === "pickpart") { sheet.pid = d.part; sheet.all = false; sheetError = null; route.keepScroll = true; render(); }
  else if (act === "pickall") { sheet.all = true; route.keepScroll = true; render(); }
  else if (act === "pickassessor") { sheet.a = d.name; route.keepScroll = true; render(); }
  else if (act === "sheetdate") { sheet.d = d.date; route.keepScroll = true; render(); }
  else if (act === "sheetstatus") { sheet.status = d.status; route.keepScroll = true; render(); }
  else if (act === "sheetsave") { saveSheet(); route.keepScroll = true; render(); }
  else if (act === "sheetdelete") {
    const {pid, i} = sheet, removed = Store.state.obs[pid][i];
    Store.removeObs(pid, i); sheet = null;
    showToast("Observation deleted", () => Store.restoreObs(pid, i, removed));
    route.keepScroll = true; render(); }
  else if (act === "togglestatus") { Store.toggleObsStatus(d.part, +d.obs); route.keepScroll = true; render(); }
  else if (act === "dismissrecap") { Store.setRecapSeen(d.key); route.keepScroll = true; render(); }
  else if (act === "chaseok") {
    const pid = d.part, i = +d.obs;
    Store.setObsStatus(pid, i, "approved"); chaseOpen = true;
    showToast(`${PART_BY_ID[pid].label} marked approved`, () => Store.setObsStatus(pid, i, "pending"));
    route.keepScroll = true; render(); }
  else if (act === "undo") { if (toast && toast.undo) toast.undo(); toast = null; route.keepScroll = true; render(); }
  else if (act === "cycleline") { Store.cycleLine(d.line, +d.target); route.keepScroll = true; render(); }
  else if (act === "linemeta") { route.editLine = route.editLine === d.line ? null : d.line; route.keepScroll = true; render(); }
  else if (act === "closeedit") { route.editLine = null; route.keepScroll = true; render(); }
  else if (act === "dismissnudge") { nudgeDismissed = true; route.keepScroll = true; render(); }
  else if (act === "export") { exportBackup(); }
  else if (act === "importpick") { document.getElementById("importfile").click(); }
  else if (act === "reload") { location.reload(); }
  else if (act === "bcat") { biopsyCat = d.cat; route.keepScroll = true; render(); }
  else if (act === "bclear") { biopsyTerm = ""; route.keepScroll = true; render();
    const q = document.getElementById("biopsyq"); if (q) q.focus(); }
}
document.getElementById("app").addEventListener("click", ev => {
  const t = ev.target.closest("[data-action]");
  if (t) dispatch(t.dataset.action, t.dataset);
});
document.getElementById("app").addEventListener("input", ev => {
  if (sheetField(ev.target)) return;
  if (ev.target.id !== "biopsyq") return;
  const caret = ev.target.selectionStart;
  biopsyTerm = ev.target.value;
  route.keepScroll = true;
  render();
  const q = document.getElementById("biopsyq");
  if (q) { q.focus(); try { q.setSelectionRange(caret, caret); } catch(e){} }
});
document.getElementById("app").addEventListener("change", ev => {
  const t = ev.target, d = t.dataset || {};
  if (sheetField(t)) return;
  if (t.id === "importfile") {
    const f = t.files && t.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      backupError = null;
      if (confirm("Replace current progress with this backup?")) {
        const res = Store.importJSON(rd.result);
        if (!res.ok) backupError = res.error; else showToast("Backup imported");
      }
      render();
    };
    rd.readAsText(f);
    return;
  }
  if (d.field && d.line) Store.setLineMeta(d.line, {[d.field]: t.value});
});
Store.load();
render();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
