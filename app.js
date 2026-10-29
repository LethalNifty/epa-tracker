"use strict";
// GI Hub app: saved progress (Store), the screens, and what each tap does.
// Reads EPA_DATA and BIOPSY_DATA (index.html), the coach (coach.js) and the
// guideline library (guides.js).

// The fellows' edition (fellows.js) saves apart from the full app.
const KEY = FELLOWS ? "gihub-fellows-v1" : "epa-state-v1";
// Matches the service worker's cache name; shown at the foot of EPAs.
const APP_VERSION = "epa-v65";
const Store = {
  state: {v:1, obs:{}, lines:{}, lastBackup:null, recapSeen:null},
  persistFailed: false,
  load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) this.state = s; } catch(e){} this.migrate(); },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch(e){ this.persistFailed = true; } },
  migrate() {
    delete this.state.celebrated;
    if (this.state.recapSeen === undefined) this.state.recapSeen = null;
    // What to ask for: a setting saved before it had a day counts as today's pick.
    if (this.state.ask && !this.state.askOn) this.state.askOn = fmtDate(getToday());
    const ad = this.state.askDays;
    this.state.askDays = {};
    if (ad && typeof ad === "object") for (const k in ad) if (ASK.some(x => x.id === ad[k])) this.state.askDays[k] = ad[k];
    const sd = this.state.study;
    this.state.study = {log: sd && typeof sd.log === "object" && sd.log ? sd.log : {},
      q: sd && typeof sd.q === "object" && sd.q ? sd.q : {}, pauses: sd && Array.isArray(sd.pauses) ? sd.pauses : [],
      qa: sd && typeof sd.qa === "object" && sd.qa ? sd.qa : {}};
    for (const k in this.state.obs) for (const o of this.state.obs[k]) if (!o.status) o.status = "approved";
    // Forms that came back not achieved, kept apart so no count sees them.
    const ms = this.state.missed;
    this.state.missed = {};
    if (ms && typeof ms === "object") for (const k in ms) if (PART_BY_ID[k] && Array.isArray(ms[k]))
      this.state.missed[k] = ms[k].filter(o => o && typeof o === "object").map(o => ({...o, status: "missed"}));
    // Parts Entrada no longer has (C9 Part B, October 2026): their forms leave
    // every count but stay in the backup.
    for (const k of Object.keys(this.state.obs)) if (!PART_BY_ID[k]) {
      const r = this.state.retired ||= {};
      r[k] = [...(Array.isArray(r[k]) ? r[k] : []), ...(Array.isArray(this.state.obs[k]) ? this.state.obs[k] : [])];
      delete this.state.obs[k];
    }
    // Agenda: your own events and usual week (full app).
    if (!FELLOWS) this.state.agenda = agClean(this.state.agenda);
    const sc = this.state.scopes, arr = v => Array.isArray(v) ? v : [];
    this.state.scopes = {cases: arr(sc && sc.cases), staff: arr(sc && sc.staff).map(p => ({aliases: [], hidden: false, ...p})),
      learned: arr(sc && sc.learned), lastReport: (sc && sc.lastReport) || null, reportName: (sc && sc.reportName) || "", hintOff: (sc && sc.hintOff) || null, sitesFilled: !!(sc && sc.sitesFilled), ageOn: !!(sc && sc.ageOn)};
    // Once: cases imported before sites were filled on import take their block's hospital.
    if (!this.state.scopes.sitesFilled) { scopeFillSites(this.state.scopes.cases); this.state.scopes.sitesFilled = true; }
    const gd = this.state.guides;
    this.state.guides = {pins: arr(gd && gd.pins).filter(x => typeof x === "string"), seen: arr(gd && gd.seen).filter(x => typeof x === "string")};
    this.state.pearls = pearlsClean(this.state.pearls);
    scopeLinkEpas(this.state.scopes.cases, this.state.obs, this.state.scopes.staff); },
  logObs(p) { (this.state.obs[p] ||= []).push({status:"pending", ts:new Date().toISOString()});
    this.save(); return this.state.obs[p].length - 1; },
  removeObs(p, i) { (this.state.obs[p]||[]).splice(i,1); this.save(); },
  restoreObs(p, i, o) { (this.state.obs[p] ||= []).splice(i, 0, o); this.save(); },
  // A pending form coming back (approved, or not achieved) keeps the day it did
  // (ok), for its assessor's usual turnaround; a form just being logged (no date
  // yet), or one going back to pending, keeps none.
  statusTo(o, s) { const back = s === "approved" || s === "missed";
    if (back && o.status === "pending" && o.d) o.ok = fmtDate(getToday()); if (!back) delete o.ok; o.status = s; },
  // Not achieved (below the entrustment mark): the form leaves the observations
  // for state.missed, so it never counts, and its checklist lines go back.
  // Returns where it landed there.
  missObs(p, i) { const o = (this.state.obs[p] || [])[i]; if (!o) return -1;
    this.statusTo(o, "missed"); this.state.obs[p].splice(i, 1);
    if (o.tk && o.tk.length) this.bumpLines(o.tk, -1);
    (this.state.missed[p] ||= []).push(o); this.save(); return this.state.missed[p].length - 1; },
  // Back from not achieved, as status s, at i in the observations (else the end).
  unmissObs(p, j, s, i) { const o = (this.state.missed[p] || [])[j]; if (!o) return -1;
    this.state.missed[p].splice(j, 1); this.statusTo(o, s);
    const list = this.state.obs[p] ||= [], at = i === undefined ? list.length : i; list.splice(at, 0, o);
    if (o.tk && o.tk.length) this.bumpLines(o.tk, 1); this.save(); return at; },
  removeMissed(p, j) { (this.state.missed[p] || []).splice(j, 1); this.save(); },
  restoreMissed(p, j, o) { (this.state.missed[p] ||= []).splice(j, 0, o); this.save(); },
  setObsMeta(p, i, m) { const o = this.state.obs[p][i]; if (m.status) this.statusTo(o, m.status); Object.assign(o, m); this.save(); },
  setObsStatus(p, i, s) { if (this.state.obs[p] && this.state.obs[p][i]) { this.statusTo(this.state.obs[p][i], s); this.save(); } },
  toggleObsStatus(p, i) { const o = this.state.obs[p][i];
    this.statusTo(o, o.status === "approved" ? "pending" : "approved"); this.save(); return o.status; },
  setRecapSeen(key) { this.state.recapSeen = key; this.save(); },
  toggleGuidePin(id) { const p = this.state.guides.pins, i = p.indexOf(id);
    if (i >= 0) p.splice(i, 1); else p.push(id); this.save(); return i < 0; },
  // Keys of guidelines shown in Guides' New list; the newest 300 are kept.
  markGuidesSeen(keys) { const s = this.state.guides.seen;
    for (const k of keys) if (!s.includes(k)) s.push(k);
    if (s.length > 300) s.splice(0, s.length - 300); this.save(); },
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
  // Moves checklist lines up (by 1) or back (by -1), within 0 and each line's target.
  bumpLines(ids, by) {
    for (const id of ids) {
      const v = Math.max(0, Math.min(itemTarget(id), this.lineVal(id) + by)), meta = this.state.lines[id];
      if (v) (this.state.lines[id] ||= {}).v = v;
      else if (meta && (meta.d || meta.n)) meta.v = 0;
      else delete this.state.lines[id];
    }
    this.save(); },
  // Ticks the next open line of each named checklist group; returns the lines ticked.
  tickGroups(pid, names) {
    const ids = [];
    for (const g of checklistGroups(pid, id => this.lineVal(id))) {
      if (!names.includes(g.name)) continue;
      const id = g.ids.find(x => this.lineVal(x) < itemTarget(x));
      if (id) ids.push(id);
    }
    if (ids.length) this.bumpLines(ids, 1);
    return ids; },
  // Ticks of a line that forms hold (o.tk), and those whose form is still
  // pending: they show as pending and count (lineOk) once it's approved.
  lineHeld(id, pend) { let n = 0;
    for (const k in this.state.obs) for (const o of this.state.obs[k])
      if (o.tk && (!pend || o.status !== "approved")) n += o.tk.filter(x => x === id).length;
    return Math.min(n, this.lineVal(id)); },
  linePend(id) { return this.lineHeld(id, true); },
  lineOk(id) { return this.lineVal(id) - this.linePend(id); },
  // A logged form's checklist groups, changed: a group taken off gives its line
  // back; one added takes over a tick no form holds (made by hand for this
  // case), else ticks the group's next open line.
  setObsTicks(p, i, names) {
    const o = this.state.obs[p][i], nameOf = id => { const g = checklistGroups(p, () => 0).find(x => x.ids.includes(id)); return g && g.name; };
    const keep = (o.tk || []).filter(id => names.includes(nameOf(id))), drop = (o.tk || []).filter(id => !keep.includes(id));
    if (drop.length) this.bumpLines(drop, -1);
    const have = keep.map(nameOf), add = [];
    for (const g of checklistGroups(p, () => 0)) {
      if (!names.includes(g.name) || have.includes(g.name)) continue;
      const free = g.ids.find(x => this.lineVal(x) > this.lineHeld(x));
      const id = free || g.ids.find(x => this.lineVal(x) < itemTarget(x));
      if (!id) continue;
      if (!free) this.bumpLines([id], 1);
      add.push(id);
    }
    if (keep.length + add.length) o.tk = [...keep, ...add]; else delete o.tk;
    this.save(); },
  setLineMeta(id, m) { Object.assign(this.state.lines[id] ||= {v:0}, m); this.save(); },
  partDone(p) { return (this.state.obs[p]||[]).length; },
  exportJSON() { return JSON.stringify(this.state, null, 1); },
  markBackup() { this.state.lastBackup = new Date().toISOString(); this.save(); },
  importJSON(text) {
    try {
      const s = JSON.parse(text);
      if (!s || s.v !== 1 || typeof s.obs !== "object" || !s.obs || typeof s.lines !== "object" || !s.lines)
        return {ok:false, error:"Not a valid EPA backup file."};
      this.state = {v:1, obs:s.obs, lines:s.lines, lastBackup:s.lastBackup || null, recapSeen:s.recapSeen || null, ask:s.ask || null, askOn:s.askOn || null, askDays:s.askDays || {}, study:s.study, scopes:s.scopes, guides:s.guides, pearls:s.pearls, setup:s.setup || null, goal:s.goal || null, missed:s.missed || {}, agenda:s.agenda, retired:s.retired};
      this.migrate(); this.save(); return {ok:true};
    } catch(e) { return {ok:false, error:"Could not read that file."}; }
  },
  hasData() {
    return Object.keys(this.state.obs).some(k => this.state.obs[k].length > 0) ||
      Object.keys(this.state.lines).length > 0 || Object.keys(this.state.study.log).length > 0 || this.state.scopes.cases.length > 0 ||
      this.state.pearls.length > 0;
  },
  // Study: the bookmark is saved against the day it was set.
  setStudyCursor(c, day) {
    this.state.study.log[fmtDate(day)] = Math.max(0, Math.min(studySeq().total, Math.round(c))); this.save(); },
  setStudyScore(id, r, of) { this.state.study.q[id] = {r, of, d: fmtDate(getToday())}; this.save(); },
  addPause(a, b, skip) {
    if (b < a) [a, b] = [b, a];
    this.state.study.pauses.push(skip ? {a, b, skip: true} : {a, b});
    this.state.study.pauses.sort((x, y) => x.a < y.a ? -1 : x.a > y.a ? 1 : 0); this.save(); },
  removePause(i) { this.state.study.pauses.splice(i, 1); this.save(); },
  // A question marked right (true) or missed (false); null clears the mark.
  setQMark(id, ok) {
    if (ok === null) delete this.state.study.qa[id];
    else this.state.study.qa[id] = {ok: !!ok, d: fmtDate(getToday())};
    this.save(); },
  studySnapshot() { return JSON.parse(JSON.stringify(this.state.study)); },
  restoreStudy(snap) { this.state.study = snap; this.save(); },
  // Scope log: cases, the staff roster (names live only here and in backups), learned words.
  addCases(list) { this.state.scopes.cases.push(...list); this.save(); },
  updateCase(id, c) { const i = this.state.scopes.cases.findIndex(x => x.id === id); if (i >= 0) { this.state.scopes.cases[i] = c; this.save(); } },
  removeCase(id) { this.state.scopes.cases = this.state.scopes.cases.filter(x => x.id !== id); this.save(); },
  scopeSnapshot() { return JSON.parse(JSON.stringify(this.state.scopes)); },
  restoreScopes(snap) { this.state.scopes = JSON.parse(JSON.stringify(snap)); this.save(); },
  addStaff(name) {
    const nm = String(name || "").trim().slice(0, 60), hit = this.state.scopes.staff.find(p => scopeLetters(p.name) === scopeLetters(nm));
    if (hit) { hit.hidden = false; this.save(); return hit.id; }
    const id = "s" + scopeId();
    this.state.scopes.staff.push({id, name: nm, aliases: [], hidden: false}); this.save(); return id; },
  learnStaff(id, heard) {
    const p = this.state.scopes.staff.find(x => x.id === id), h = String(heard || "").trim().toLowerCase();
    if (!p || !h || scopeStaffScore(h, p) >= 3) return;
    p.aliases = (p.aliases || []).concat(h).slice(-8); this.save(); },
  learn(kind, heard, code) {
    const h = String(heard || "").trim().toLowerCase();
    if (!h) return;
    this.state.scopes.learned = this.state.scopes.learned.filter(l => l.heard !== h).concat({kind, heard: h, code}).slice(-200); this.save(); },
  markReport(iso) { this.state.scopes.lastReport = iso; this.save(); },
  // Pearls (pearls.js): who said it lives only here and in backups.
  addPearl(f) { const p = pearlClean({...f, id: pearlId(new Set(this.state.pearls.map(x => x.id))), sent: null, ts: new Date().toISOString()});
    this.state.pearls.push(p); this.save(); return p.id; },
  updatePearl(id, f) { const p = this.state.pearls.find(x => x.id === id); if (p) { Object.assign(p, f); this.save(); } },
  removePearl(id) { this.state.pearls = this.state.pearls.filter(x => x.id !== id); this.save(); },
  markPearlsSent(ids, day) { for (const p of this.state.pearls) if (ids.includes(p.id)) p.sent = day; this.save(); },
  pearlsSnapshot() { return JSON.parse(JSON.stringify(this.state.pearls)); },
  restorePearls(snap) { this.state.pearls = JSON.parse(JSON.stringify(snap)); this.save(); }
};

let nudgeDismissed = false, backupError = null;
function needsNudge(today) {
  if (!Store.hasData()) return false;
  // A fellow who just set up gets 30 days before the first nudge.
  const lb = Store.state.lastBackup || (Store.state.setup && Store.state.setup.d + "T12:00:00");
  return !lb || (today - new Date(lb)) > 30 * 86400000;
}

// ---- Biopsy reference ------------------------------------------------------
const MB_PDF = "https://healthproviders.sharedhealthmb.ca/files/clinical-guideline-gi-endoscopic-biopsy.pdf";
let biopsyTerm = "", biopsyCat = "all";
// [category, chip label, tract-map glyph]
const BIOPSY_CATS = [["all", "All", null], ["Esophagus", "Esophagus", "esoph"], ["Stomach", "Stomach", "stomach"],
  ["Duodenum / Small bowel", "Duodenum", "duod"], ["Colon", "Colon", "colon"]];
// A protocol's words: its title counts most, then its keywords, then the card
// and its source. Matches keep the protocol order, so each tract stays together.
const BIOPSY_HAY = new Map(BIOPSY_DATA.map(d => [d, {t: searchHay(d.title), k: searchHay(d.cat + " " + (d.kw || "")),
  body: searchHay(d.rows.map(r => r.join(" ")).join(" ") + " " + (d.sec ? "Shared Health " + d.sec[1] : "") + " " + (d.ref ? d.ref.short + " " + d.ref.label : ""))}]));
const biopsyScored = term => searchScored(BIOPSY_DATA, term, d => { const h = BIOPSY_HAY.get(d); return [[h.t, 6], [h.k, 4], [h.body, 1]]; }, {keep: true});
const biopsyFilter = (term, cat) => biopsyScored(term).map(x => x.item).filter(d => cat === "all" || d.cat === cat);
let biopsyBold;
try {
  const bre = new RegExp("(?<![A-Za-z0-9/])(?:[≥≤<>~]\\s?)?\\d+(?:[–-]\\d+)?(?:\\s?(?:cm|mm|wk|%)|\\s?eos/hpf)?", "g");
  biopsyBold = s => s.replace(bre, m => "<b>" + m + "</b>");
} catch(e) { biopsyBold = s => s; }
const biopsyHi = (html, term) => searchHi(html, term);

// ---- Shared helpers ----------------------------------------------------------
const STAGE_NAMES = {ttd:"Transition to Discipline", f:"Foundations", core:"Core", ttp:"Transition to Practice"};
const STAGE_SHORT = {ttd:"TTD", f:"Foundations", core:"Core", ttp:"TTP"};
const STAGE_ORDER = ["ttd", "f", "core", "ttp"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
let route = {page:"week"};
function getToday() { return window.__today || new Date(); }
function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function ic(name, cls) { return `<svg class="ic${cls ? " " + cls : ""}" aria-hidden="true"><use href="#i-${name}"/></svg>`; }
const pct = (n, of) => of ? Math.round(n / of * 1000) / 10 : 0;
// "Fri 10 Jul" for 2026-07-10, the way every screen writes a day; the year
// only for a day outside this one.
function dayLabel(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(y, m - 1, d);
  return `${DAYS[dt.getDay()]} ${d} ${MONTHS[m - 1]}` + (y !== getToday().getFullYear() ? " " + y : "");
}

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
  if (st === cur) return "now";
  // A later stage with forms already logged is open: they count, and more can come.
  return t.logged ? "open" : "locked";
}
const STATE_LABEL = {done: "Done", now: "Now", open: "Open", locked: "Locked", behind: "Earlier"};

// Sunset colours for the Week arc, first logged tick to latest: violet,
// orchid, apricot. Worked out here rather than mixed in CSS, so the power-on
// flash fades into a plain colour.
const SUNSET = [[139, 108, 255], [224, 99, 211], [255, 142, 107]];
function sunsetAt(t) {
  const x = Math.min(1, Math.max(0, t)) * 2, k = Math.min(1, Math.floor(x)), u = x - k, a = SUNSET[k], b = SUNSET[k + 1];
  return "#" + a.map((v, n) => Math.round(v + (b[n] - v) * u).toString(16).padStart(2, "0")).join("");
}
// A ring of ticks, one per required observation, grouped into segments in order.
// segs: [{stage, total, approved, pending, next}]; next tints the unlogged ticks
// of the stage being worked on. o.arc lays them over the top half instead, left
// to right like the sun's path, with a sun where the active stage has got to.
function dialSVG(segs, o) {
  const S = o.size, c = S / 2, gap = o.gap || 0;
  const from = o.arc ? Math.PI : -Math.PI / 2, sweep = o.arc ? Math.PI : 2 * Math.PI;
  const slots = segs.reduce((a, s) => a + s.total + gap, 0), step = sweep / slots;
  const f = v => Math.round(v * 10) / 10;
  // --i orders the lit ticks for the power-on sweep; --w the active stage's
  // open ticks, which a slow wave of light runs along.
  const lit = segs.reduce((a, s) => a + s.approved, 0);
  let k = gap / 2, i = 0, w = 0, li = 0, lines = "", tip = null;
  for (const s of segs) {
    for (let j = 0; j < s.total; j++, k++) {
      const kind = j < s.approved ? "lit" : j < s.approved + s.pending ? "pend" : "off", next = kind === "off" && s.next;
      const a = from + (k + .5) * step, cs = Math.cos(a), sn = Math.sin(a);
      const r1 = kind === "off" ? o.r1off : o.r1;
      if (s.next && kind !== "off") tip = [cs, sn];
      const sun = o.arc && kind === "lit" ? `;--sun:${sunsetAt(lit > 1 ? li++ / (lit - 1) : 1)}` : "";
      lines += `<line class="t ${kind}${next ? " next" : ""} st-${s.stage}" x1="${f(c + r1 * cs)}" y1="${f(c + r1 * sn)}"` +
        ` x2="${f(c + o.r2 * cs)}" y2="${f(c + o.r2 * sn)}"` + (kind !== "off" ? ` style="--i:${i++}${sun}"` : next ? ` style="--w:${w++}"` : "") + `/>`;
    }
    k += gap;
  }
  const rings = (o.rings || []).map(r => o.arc
    ? `<path class="fold-ring" d="M${c - r} ${c}A${r} ${r} 0 0 1 ${c + r} ${c}"/>`
    : `<circle class="fold-ring" cx="${c}" cy="${c}" r="${r}"/>`).join("");
  const orb = o.arc && tip ? `<circle class="orb" cx="${f(c + (o.r2 + 8) * tip[0])}" cy="${f(c + (o.r2 + 8) * tip[1])}" r="5.5"/>` : "";
  return `<svg class="dial${o.cls ? " " + o.cls : ""}${o.arc ? " arc" : ""}" style="--n:${Math.max(1, i)}" viewBox="0 0 ${S} ${o.arc ? c + 8 : S}"` +
    ` aria-hidden="true">${rings}${lines}${orb}</svg>`;
}
// The small version for one EPA: a ring of arcs, one per required observation,
// with a wider gap between parts. Reads well even with only a handful.
function ringSVG(segs, o) {
  const S = o.size, c = S / 2, r = o.r, gap = o.gap || 0, cut = o.cut || 0.16;
  const slots = segs.reduce((a, s) => a + s.total + gap, 0), step = 2 * Math.PI / slots;
  const f = v => Math.round(v * 100) / 100;
  let k = gap / 2, arcs = "";
  for (const s of segs) {
    for (let j = 0; j < s.total; j++, k++) {
      const kind = j < s.approved ? "lit" : j < s.approved + s.pending ? "pend" : "off";
      const a0 = -Math.PI / 2 + (k + cut / 2) * step, a1 = a0 + (1 - cut) * step;
      arcs += `<path class="t ${kind}${kind === "off" && s.next ? " next" : ""} st-${s.stage}" d="M${f(c + r * Math.cos(a0))} ${f(c + r * Math.sin(a0))}` +
        `A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${f(c + r * Math.cos(a1))} ${f(c + r * Math.sin(a1))}"/>`;
    }
    k += gap;
  }
  return `<svg class="dial ring" viewBox="0 0 ${S} ${S}" aria-hidden="true">${arcs}</svg>`;
}
const stageSegs = cur => STAGE_ORDER.map(st => {
  const t = stageTally(st);
  return {stage: st, total: t.req, approved: t.approved, pending: t.pending, next: st === cur};
});

// ---- Chrome: bottom bar, warnings, toast, crash screen ----------------------
const NAV = FELLOWS ? [["week", "Home", "week"], ["epas", "EPAs", "epas"], ["endo", "Endo", "endo"], ["guides", "Guides", "guides"]]
  : [["week", "Week", "dial"], ["agenda", "Agenda", "week"], ["epas", "EPAs", "epas"], null, ["study", "Study", "study"], ["endo", "Endo", "endo"], ["guides", "Guides", "guides"]];
// Pages that light up another tab in the bar: the year plan sits inside EPAs.
const NAV_HOME = {plan: "epas", pearls: "study"};
function navHTML(active) {
  active = NAV_HOME[active] || active;
  const dot = page => page === "guides" && active !== "guides" && guidesUnseenCount() > 0;
  const item = ([page, label, icon]) => `<button class="nv${active === page ? " on" : ""}" data-action="tab" data-page="${page}"` +
    (active === page ? ` aria-current="page"` : "") + `>${ic(icon)}<span>${label}</span>` +
    (dot(page) ? `<i class="nvdot" aria-label="New guidelines"></i>` : "") + `</button>`;
  const plus = cls => `<button class="fab ${cls}" data-action="scopeopen" aria-label="Log a case">${ic("plus")}</button>`;
  // The full app: three tabs either side of the log button (null in NAV).
  if (!FELLOWS) return `<nav class="bnav" aria-label="Main"><div class="bnav-in seven">${NAV.map(x => x ? item(x) : plus("mid")).join("")}</div></nav>`;
  // The fellows' four tabs; the log button floats above the bar's right end. It
  // steps aside while Endo's own save bar is up, where it would cover Clear.
  const busy = active === "endo" && scopeTab !== "progress" && scopeCap.cards.length;
  return `<nav class="bnav" aria-label="Main"><div class="bnav-in">${NAV.map(item).join("")}</div></nav>` + (busy ? "" : plus("float"));
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
// next: after logging an observation, {d, a, ask} for Log another (stays up longer).
function showToast(msg, undo, next) {
  toast = {msg, undo: undo || null, next: next || null};
  toastFresh = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast = null;
    const el = document.getElementById("toast");
    if (el) el.remove();
  }, next ? 8000 : 5000);
}
function toastHTML() {
  const nx = toast.next, today = getToday();
  const when = nx && (nx.d === fmtDate(today) ? "today"
    : nx.d === fmtDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)) ? "yesterday" : dayLabel(nx.d));
  return `<div class="toast${nx ? " next" : ""}${toastFresh ? " fresh" : ""}" id="toast" role="status">${ic("check")}<span>${esc(toast.msg)}</span>` +
    (toast.undo ? `<button class="textbtn" data-action="undo">Undo</button>` : "") +
    (nx ? `<button class="toastnext" data-action="another">${ic("plus")}${nx.a ? "Another with " + esc(nx.a) : "Log another"}<small>${esc(when)}</small></button>` : "") +
    `</div>`;
}
function markSVG(size) {
  const n = 44, lit = 17, c = 32, step = 2 * Math.PI / n;
  let t = "";
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i + .5) * step, on = i < lit, r1 = on ? 18.8 : 20.1;
    t += `<line x1="${(c + r1 * Math.cos(a)).toFixed(2)}" y1="${(c + r1 * Math.sin(a)).toFixed(2)}" x2="${(c + 23.3 * Math.cos(a)).toFixed(2)}"` +
      ` y2="${(c + 23.3 * Math.sin(a)).toFixed(2)}" stroke="${on ? "#ebc9ff" : "#3a3460"}" stroke-width="${on ? 1.1 : .9}" stroke-linecap="round"/>`;
  }
  return `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">${t}<circle cx="32" cy="32" r="3.4" fill="#ebc9ff"/></svg>`;
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
  // The first draw after launch powers the monitor on: light, ticks, overlay.
  return `<section class="monitor${liveBootClass()}"${liveBootStyle()} aria-label="${t.logged} of ${t.req} required observations logged; ${t.approved} approved, ${t.pending} pending">` +
    `<div class="monitor-in"><div class="ov mono"><span>${FELLOWS ? "Adult GI" : "Year 1"} · 2026–27</span><span>${date}<span class="clock" data-clock>${liveClockText()}</span></span></div>` +
    `<div class="dial-wrap arc">${dialSVG(stageSegs(cur), {size: 320, r2: 138, r1: 114, r1off: 125, gap: 3, rings: [153], arc: true, cls: liveBootClass() ? "intro" : ""})}` +
    `<div class="dial-center"><div class="dial-num" data-count="${t.logged}">${t.logged}</div><div class="dial-lbl">of ${t.req} logged</div>` +
    (cur ? `<div class="dial-sub mono st-${cur}">${STAGE_NAMES[cur]} ${curT.logged}/${curT.req}</div>` : `<div class="dial-sub mono">Every stage logged</div>`) +
    `</div></div>` + (FELLOWS ? "" : paceLineHTML(today)) +
    `<div class="ov mono"><span class="ok">${t.approved} approved</span><span class="pend">${t.pending} pending</span></div></div></section>`;
}
// Under the dial: when the last weeks' pace would finish, against the June 30 goal.
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function paceLineHTML(today) {
  const p = paceFinish(Store.state.obs, today);
  if (!p.date) return "";
  const when = LONG_MONTHS[p.date.getMonth()] + " " + p.date.getFullYear();
  return p.onTrack ? `<div class="dial-pace ok">On pace for ${when}</div>` : `<div class="dial-pace warn">At this pace: ${when} · goal June 30</div>`;
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
  const scopes = scopeRecapItem(rc);
  if (scopes) items.push(scopes);
  return `<section class="brief" aria-label="Week in review"><div class="brief-head"><span class="mono">Week in review</span>` +
    `<button class="iconbtn" data-action="dismissrecap" data-key="${rc.key}" aria-label="Dismiss">${ic("x")}</button></div>` +
    `<h2>Your week</h2><ul>${items.join("")}</ul></section>`;
}
function thisWeekHTML(rows, stage) {
  const due = rows.reduce((a, r) => a + r.outstanding, 0);
  let h = `<section class="sec"><div class="sec-head"><h2>This week</h2><span class="mono">${stage ? STAGE_NAMES[stage] + " · " : ""}${due} due</span></div>`;
  if (!rows.length) return h + `<div class="card empty">${stage ? "Nothing due this week. Log anything you get." : "Every required observation is logged."}</div></section>`;
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
// Where you are today: what you picked today; on call, Ward and call;
// otherwise where you were the last time it was this weekday.
const ASK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function askToday(today, cs) {
  const st = Store.state;
  if (st.askOn === fmtDate(today)) return {set: st.ask || null, why: "pick"};
  if (cs && cs.cur) return {set: "ward", why: "call"};
  const set = (st.askDays || {})[today.getDay()] || null;
  return {set, why: set ? "day" : null};
}
// What to ask for where you are today: tap where, see the EPAs that suit it and
// the checklist lines still open; a row opens the log sheet with the setting ticked.
// Before you pick, the cases this week still needs (look: lookFor's list).
function askHTML(a, look) {
  const cur = a.set, note = a.why === "day" ? `Like last ${ASK_DAYS[getToday().getDay()]}` : a.why === "call" ? "On call now" : "Where are you today?";
  let h = `<section class="sec ask"><div class="sec-head"><h2>What to ask for</h2><span class="mono${a.why === "day" || a.why === "call" ? " auto" : ""}">${note}</span></div>` +
    `<div class="pickrow askset">` + ASK.map(s => `<button class="pick ghost${cur === s.id ? " on" : ""}" data-action="askset" data-set="${s.id}" ` +
      `aria-pressed="${cur === s.id}">${s.n}</button>`).join("") + `</div>`;
  if (!cur) return h + (look.length ? `<div class="lbl mono asklook">Cases you still need</div>` + lookRowsHTML(look) : "") + `</section>`;
  const rows = askRows(cur, Store.state.obs, id => Store.lineVal(id));
  if (!rows.length) return h + `<div class="card empty">Everything that suits this is logged.</div></section>`;
  const left = g => g.total - g.done > 1 ? ` ×${g.total - g.done}` : "";
  return h + `<div class="card list">` + rows.map(r => `<button class="arow" data-action="sheet" data-part="${r.pid}" data-ask="${cur}">` +
    `<span class="cc st-${PART_BY_ID[r.pid].stage}">${r.label}</span><span class="ameta"><b>${esc(r.short)}</b>` +
    (r.open.length ? `<span class="aopen">${r.open.slice(0, 5).map(g => esc(askName(g.name)) + left(g)).join(" · ")}` +
      `${r.open.length > 5 ? ` · ${r.open.length - 5} more` : ""}</span>` : "") +
    `</span><span class="wn">${r.logged}/${r.required}</span></button>`).join("") + `</div></section>`;
}
function lookRowsHTML(items) {
  return `<div class="card list">` +
    items.map(x => `<button class="lrow" data-action="open" data-code="${PART_BY_ID[x.pid].code}">${ic("target")}` +
      `<span class="wname">${esc(x.name)}</span><span class="cc sm st-${PART_BY_ID[x.pid].stage}">${x.part}</span>` +
      (x.left > 1 ? `<span class="wn">×${x.left}</span>` : "") + `</button>`).join("") + `</div>`;
}
// A spare (a form the EPA no longer needs) is listed last and not counted.
function chaseHTML(list) {
  const n = list.filter(c => !c.spare).length, sp = assessorSpeed();
  return `<section class="sec"><details class="card chase"${chaseOpen ? " open" : ""}><summary>${ic("clock")}` +
    `<b>${n} form${n > 1 ? "s" : ""} pending 14+ days</b><span class="mono">Entrada</span>${ic("chev", "chev")}</summary>` +
    [...list.filter(c => !c.spare), ...list.filter(c => c.spare)].map(c => {
      // No assessor on the form: the scope log may know who it was with.
      const sc = Store.state.scopes, g = c.a ? {ids: []} : scopeStaffOn(sc.cases, c.date, c.pid);
      const names = g.ids.map(id => scopeStaffName(sc.staff, id)).filter(Boolean).slice(0, 2);
      const usual = c.a && sp[scopeBare(c.a).toLowerCase()];
      const who = c.a ? esc(scopeBare(c.a)) + (usual ? `<span class="usual"> · ${speedText(usual)}</span>` : "") : names.length ? `<i>${esc(names.join(" or "))}?</i> from your scope log` : "No assessor yet · tap to add";
      const note = c.n.startsWith(SCOPE_EPA_NOTE) ? c.n.slice(SCOPE_EPA_NOTE.length) : c.n;
      return `<div class="crow${c.spare ? " spare" : ""}"><button class="cmain" data-action="sheet" data-part="${c.pid}" data-obs="${c.i}" data-chase="1"` +
        `${names.length === 1 ? ` data-a="${esc(names[0])}"` : ""}><span class="cc sm st-${PART_BY_ID[c.pid].stage}">${c.label}</span>` +
        `<span class="cmeta"><b>${esc(PART_SHORT[c.pid] || "")}</b>` +
        `<span class="cwho"><span class="num">${esc(scopeShortDate(c.date))}</span> · ${who}${note ? " · " + esc(note) : ""}</span></span></button>` +
        // The two answers sit on their own line, so the form keeps its words.
        `<div class="cacts">` + (c.spare ? `<span class="sparetag mono">Spare</span>` : "") +
        `<button class="pillbtn miss" data-action="chasemiss" data-part="${c.pid}" data-obs="${c.i}">Not achieved</button>` +
        `<button class="pillbtn" data-action="chaseok" data-part="${c.pid}" data-obs="${c.i}">Approved</button></div></div>`;
    }).join("") +
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
  const paceNote = pace.date ? `${pace.n} in the last ${pace.weeks} week${pace.weeks === 1 ? "" : "s"}` : "";
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
// What Week puts first under the dial: on a call day from noon until the shift
// starts, the Call card; on a reading night from 17:00 until its pages are read,
// Study; otherwise What to ask for.
function weekLead(now, cs) {
  const d = new Date(now), nx = cs.next;
  if (!cs.cur && nx && new Date(nx.s).toDateString() === d.toDateString() && d.getHours() >= 12) return "call";
  if (d.getHours() >= 17 && studyDueTonight()) return "study";
  return "ask";
}
// On call, the Call panel leads the page; otherwise Week follows the day (weekLead).
// Week keeps to today: the finish line is on Year plan.
function viewWeek() {
  if (FELLOWS) return felHomeHTML();
  const today = getToday(), blk = blockFor(today), obsBy = Store.state.obs, cur = currentStage();
  const now = callNow(), cs = callStatus(CallStore.list(), now);
  // The gear opens Settings: version, backup and reminders.
  let h = `<header class="ph has-gear"><button class="iconbtn phgear" data-action="setopen" aria-label="Settings">${ic("gear")}</button>` + (blk
    ? `<p class="eyebrow mono">Block ${blk.num} · ${esc(blk.name)}</p><h1 class="title">Week ${blk.week} of 4</h1>`
    : `<p class="eyebrow mono">GI Hub</p><h1 class="title">${dayIndex(today) < 0 ? "Almost time" : "Year 1 done"}</h1>`) + `</header>`;
  h += warningsHTML(today) + watchWeekHTML() + (cs.cur ? callLiveHTML(cs, now, "week") : "") + monitorHTML(today, cur) + stagesHTML(cur);
  if (!blk) {
    return h + `<div class="card pad empty spaced">${dayIndex(today) < 0 ? "Fellowship starts July 2, 2026." :
      "Year 1 is done. Anything still open is on the EPAs tab. Ask Claude to load the Year 2 schedule."}</div>` +
      (cs.cur ? "" : callCardHTML(cs, now)) + remindRowHTML();
  }
  h += agNextHTML();
  const cp = coachPlan(obsBy, today), rows = weekRows(obsBy, today), lead = weekLead(now, cs);
  const part = {ask: askHTML(askToday(today, cs), lookFor(rows, id => Store.lineVal(id))), week: thisWeekHTML(rows, cp.active),
    study: studyCardHTML(), call: cs.cur ? "" : callCardHTML(cs, now)};
  if (lead !== "ask") h += part[lead];
  h += part.ask + part.week + (lead === "study" ? "" : part.study);
  if (Store.state.recapSeen !== blk.num + "-" + blk.week) {
    const rc = recapFor(obsBy, today);
    if (rc) h += recapHTML(rc, rows);
  }
  if (lead !== "call") h += part.call;
  h += remindRowHTML();
  const chase = chaseList(obsBy, today);
  if (chase.some(c => !c.spare)) h += chaseHTML(chase);
  return h;
}

// ---- EPAs --------------------------------------------------------------------
// An EPA's row: a ring (approved in the stage colour, pending in peach), the
// code, the short name, tags and the count; the EPA's page has the Royal
// College title.
function epaItemHTML(e, focus) {
  const t = tally(PARTS.filter(P => P.code === e.code)), C = 2 * Math.PI * 9;
  const pend = e.parts.reduce((a, pt) => a + Store.partPending(pt.id), 0);
  const arc = (n, from, cls) => n ? `<circle class="${cls}" cx="12" cy="12" r="9" stroke-dasharray="${(C * n / t.req).toFixed(2)} ${C.toFixed(2)}"` +
    ` stroke-dashoffset="${(-C * from / t.req).toFixed(2)}"/>` : "";
  return `<button class="eli st-${e.stage}" data-action="open" data-code="${e.code}" aria-label="${e.code}: ${esc(e.title)}">` +
    `<svg class="ering" viewBox="0 0 24 24" aria-hidden="true"><circle class="rb" cx="12" cy="12" r="9"/>${arc(t.approved, 0, "ra")}${arc(t.pending, t.approved, "rp")}</svg>` +
    `<span class="ecode">${e.code}</span><span class="emid"><span class="ename">${esc(epaShort(e))}</span>` +
    (focus.includes(e.code) || pend ? `<span class="etags">${focus.includes(e.code) ? `<span class="tag">this block</span>` : ""}` +
      `${pend ? `<span class="tag warn">${pend} pending</span>` : ""}</span>` : "") + `</span>` +
    `<span class="ecount${t.approved >= t.req ? " done" : ""}">${t.logged}/${t.req}</span></button>`;
}
// One stage's EPAs as a single list.
const epaListHTML = (list, focus) => list.length ? `<div class="card elist">${list.map(e => epaItemHTML(e, focus)).join("")}</div>` : "";
// EPAs and the year plan share a tab, with a switch under the header.
function epaSwitchHTML(on) {
  const b = (page, label) => `<button class="${on === page ? "on" : ""}" data-action="tab" data-page="${page}"` +
    (on === page ? ` aria-current="page"` : "") + `>${label}</button>`;
  return `<div class="segtabs" role="group" aria-label="EPA views">${b("epas", "Checklist")}${b("plan", "Year plan")}</div>`;
}
const LOCK_NOTE = {core: "Opens once every Foundations observation is logged.", ttp: "Opens once every Core observation is logged."};
function viewEpas() {
  const today = getToday(), cp = FELLOWS ? null : coachPlan(Store.state.obs, today), focus = cp ? blockFocus(cp) : [];
  const cur = currentStage(), t = tally(PARTS);
  let h = `<header class="ph"><p class="eyebrow mono">Royal College · Adult Gastroenterology</p><h1 class="title">EPAs</h1>` +
    `<div class="ph-meta mono"><b>${t.logged}</b>/${t.req} logged · <b>${Store.overallPending()}</b> pending</div></header>` +
    (FELLOWS ? "" : epaSwitchHTML("epas")) + warningsHTML(today);
  for (const st of STAGE_ORDER) {
    const s = stageTally(st), state = stageState(st, cur);
    const list = EPA_DATA.filter(x => x.stage === st);
    // Done means approved in Entrada; a pending form keeps the EPA in the list.
    const done = list.filter(e => { const t = tally(PARTS.filter(P => P.code === e.code)); return t.approved >= t.req; });
    h += `<section class="stage-sec st-${st}"><div class="stage-head${state === "locked" ? " lock" : ""}"><i></i><h2>${STAGE_NAMES[st]}</h2>` +
      `<span class="mono state">${STATE_LABEL[state]}</span><span class="mono">${s.logged}/${s.req}</span></div>` +
      `<div class="stage-bar"><i style="width:${pct(s.approved, s.req)}%"></i><i class="pend" style="width:${pct(s.pending, s.req)}%"></i></div>` +
      (st === "ttd" && state !== "done" && !FELLOWS ? `<p class="stagenote">${ic("forward")}<span>Earlier stage: the coach won't suggest these. ` +
        `Log anything Entrada has that's missing here so your totals match.</span></p>` : "") +
      (state === "locked" ? `<p class="stagenote">${ic("lock")}<span>${LOCK_NOTE[st]} You can still log these any time.</span></p>` : "") +
      epaListHTML(list.filter(e => !done.includes(e)), focus);
    if (done.length) h += `<details class="donegrp"><summary>${ic("chev")}Done (${done.length})</summary>${epaListHTML(done, focus)}</details>`;
    h += `</section>`;
  }
  return h;
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
        `<span class="onum">${String(i + 1).padStart(2, "0")}</span><span class="odate">${o.d ? esc(dayLabel(o.d)) : o.pre ? "From Entrada" : "no date"}</span>` +
        `<span class="otext">${[scopeBare(o.a), o.n].filter(Boolean).map(esc).join(" · ")}</span></button></li>`;
    });
    h += `</ol>`;
  }
  const ms = Store.state.missed[p.id] || [];
  if (ms.length) h += `<div class="misslist"><span class="mono">Not achieved · doesn't count</span>` + ms.map((o, j) =>
    `<button class="omiss" data-action="sheet" data-part="${p.id}" data-missed="${j}">${ic("x", "sm")}` +
    `<span class="odate">${o.d ? esc(dayLabel(o.d)) : "no date"}</span><span class="otext">${[scopeBare(o.a), o.n].filter(Boolean).map(esc).join(" · ")}</span></button>`).join("") + `</div>`;
  h += `<button class="logbtn" data-action="sheet" data-part="${p.id}">${ic("plus")}Log observation</button>`;
  if (p.items.length) {
    h += `<div class="ctx"><span class="mono">Context checklist</span>`;
    for (const it of p.items) {
      if (it.h) { h += `<div class="ihead">${esc(it.h)}</div>`; continue; }
      // A tick whose form is still pending shows as pending, and counts once it's approved.
      const v = Store.lineVal(it.id), pend = Store.linePend(it.id), ok = v - pend, ldone = ok >= it.target, lp = pend && !ldone;
      const box = it.target === 1 ? (ok ? ic("check") : pend ? ic("clock") : "") : `${v}/2`;
      h += `<div class="line${ldone ? " ldone" : lp ? " lpend" : ""}" data-action="cycleline" data-line="${it.id}" data-target="${it.target}">` +
        `<span class="lbox${lp ? " pend" : !ldone && v ? " half" : ""}">${box}</span>` +
        `<span class="llab">${esc(it.label)}${lp ? `<span class="lpn mono">Pending</span>` : ""}</span>` +
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
  const backTo = {week: FELLOWS ? "Home" : "This week", plan: "Plan"}[route.from] || "All EPAs";
  const segs = e.parts.map(p => { const pt = tally([PART_BY_ID[p.id]]);
    return {stage: st, total: p.required, approved: pt.approved, pending: pt.pending, next: true}; });
  let h = `<header class="ph"><button class="back" data-action="back">${ic("back")}${backTo}</button></header>` +
    `<div class="epa-hero st-${st}" data-code="${e.code}" data-bar="${e.code} · ${STAGE_NAMES[st]}"><div class="dial-wrap">${ringSVG(segs, {size: 104, r: 45, gap: e.parts.length > 1 ? .6 : 0})}` +
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
  let h = `<header class="ph"><p class="eyebrow mono">Recalculated from what you've logged</p><h1 class="title">Year 1 plan</h1></header>` +
    epaSwitchHTML("plan");
  if (cp) h += finishHTML(paceFinish(obsBy, today), planFinish(cp), today);
  h += reviewEntryHTML();
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
    // Week marks start below the block's node, so the scope tip in week 1
    // doesn't sit on top of it.
    const wkTop = w => `calc(40px + ${w - 1} * (100% - 66px) / 3)`;
    let rail = `<span class="node"></span>`;
    for (let w = 1; w <= 4; w++) rail += `<span class="wk" style="top:${wkTop(w)}"></span>`;
    if (now) rail += `<span class="tip" style="top:${wkTop(blk.week)}"></span>`;
    const hint = past ? "" : blockHint(n, cp ? cp.active : null, Object.keys(weight));
    h += `<li class="blk${now ? " now" : past ? " past" : ""}${dom ? " st-" + dom : ""}"><div class="rail" aria-hidden="true">${rail}</div>` +
      `<div class="blk-body"><div class="blk-top"><span class="mono">Blk ${String(n).padStart(2, "0")}</span>` +
      (now ? `<span class="tag solid">Now</span>` : "") + `<span class="mono dates">${blockDates(n)}</span></div>` +
      `<h3>${esc(BLOCK_NAMES[n])}</h3>${hint ? `<p class="hint">${esc(hint)}</p>` : ""}<div class="pchips">` +
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
// Embedded: drawn inside the Endo tab, under its header and switch.
function viewBiopsy(opts = {}) {
  const list = biopsyFilter(biopsyTerm, biopsyCat);
  let h = opts.embedded ? "" : `<header class="ph"><p class="eyebrow mono">Shared Health Manitoba · 2022</p><h1 class="title">Biopsy</h1>` +
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

// ---- The + : Case | EPA | Pearl --------------------------------------------------
// The + opens the case sheet with a switch across its top. The switch moves
// between the case, EPA observation and pearl sheets, one shown at a time, and
// each keeps what was typed until the + flow ends: closing, saving or deleting
// the sheet in view ends it (render checks).
let plusOn = null;    // "c", "e" or "p" while the + flow is open
const PLUS = [["c", "Case", "scope"], ["e", "EPA", "epas"], ["p", "Pearl", "pearl"]].filter(x => !FELLOWS || x[0] !== "p");
function plusHeadHTML(close) {
  return `<div class="grab"></div><div class="shead plushead"><div class="segtabs${PLUS.length === 3 ? " three" : ""} plusseg" role="group" aria-label="Log">` +
    PLUS.map(([k, label, icon]) => `<button class="${plusOn === k ? "on" : ""}" data-action="plusto" data-to="${k}"` +
      (plusOn === k ? ` aria-current="true"` : "") + `>${ic(icon, "sm")}${label}</button>`).join("") +
    `</div><button class="iconbtn" data-action="${close}" aria-label="Close">${ic("x")}</button></div>`;
}
// Switching shows the other sheet in place: it doesn't slide up again.
function plusTo(k) {
  if (k === "c" && !scopeSheet) scopeOpenCapture();
  if (k === "e" && !sheet) openSheet();
  if (k === "p" && !pearlSheet) { pearlOpen(null); pearlSheet.focusBox = true; }
  plusOn = k; sheetFresh = false; scopeSheetFresh = false; pearlSheetFresh = false;
}
function plusEnd() {
  plusOn = null; sheet = null; sheetError = null; pearlSheet = null;
  if (scopeSheet && scopeSheet.kind === "capture") scopeSheet = null;
}
const plusShows = k => !plusOn || plusOn === k;

// ---- Log sheet -----------------------------------------------------------------
let sheet = null, sheetError = null, sheetFresh = false;
// A What to ask for setting's own checklist line (outpatient, inpatient), when the part still needs it.
function askPreTick(pid, askId) {
  const ask = askId && ASK.find(x => x.id === askId);
  return ask && ask.pre && pid && checklistGroups(pid, id => Store.lineVal(id)).some(g => g.name === ask.pre && g.done < g.total) ? [ask.pre] : [];
}
// mi: a not-achieved form's place in state.missed, in place of i.
function openSheet(pid, i, mi) {
  const missed = mi !== undefined, at = missed ? mi : i, from = missed ? Store.state.missed : Store.state.obs;
  const o = pid && at !== undefined && from[pid] && from[pid][+at];
  const held = o && !missed ? checklistGroups(pid, () => 0).filter(g => (o.tk || []).some(id => g.ids.includes(id))).map(g => g.name) : [];
  sheet = o
    ? {mode: "edit", pid, i: +at, missed, d: o.d || "", a: o.a || "", n: o.n || "", status: o.status || "pending", all: false, tick: held, held}
    : {mode: "new", pid: pid || null, d: fmtDate(getToday()), a: "", n: "", status: "pending", all: false, tick: []};
  sheetError = null;
  sheetFresh = true;
}
function saveSheet() {
  if (!sheet.pid) { sheetError = "Pick an EPA first."; return; }
  const {pid, mode, status} = sheet;
  const meta = {d: sheet.d, a: sheet.a.trim(), n: sheet.n.trim(), status};
  // A not-achieved form: its details change in place, or it moves back.
  if (sheet.missed) {
    Object.assign(Store.state.missed[pid][sheet.i], {d: meta.d, a: meta.a, n: meta.n});
    if (status !== "missed") Store.unmissObs(pid, sheet.i, status); else Store.save();
    sheet = null; sheetError = null; showToast("Changes saved"); return;
  }
  const i = mode === "new" ? Store.logObs(pid) : sheet.i;
  // Checklist lines ticked with it go back if it's undone or deleted (or not achieved).
  const tk = mode === "new" && status !== "missed" && sheet.tick && sheet.tick.length ? Store.tickGroups(pid, sheet.tick) : [];
  if (tk.length) meta.tk = tk;
  Store.setObsMeta(pid, i, meta);
  if (mode === "edit" && status !== "missed") Store.setObsTicks(pid, i, sheet.tick || []);
  if (status === "missed") {
    const j = Store.missObs(pid, i), L = PART_BY_ID[pid].label;
    sheet = null; sheetError = null;
    if (mode === "new") showToast(`${L} logged as not achieved`, () => Store.removeMissed(pid, j));
    else showToast(`${L} marked not achieved. It won't count toward ${L}.`);
    return;
  }
  // Log another: same day and assessor, and the same What to ask for setting.
  const next = mode === "new" ? {d: sheet.d, a: meta.a, ask: sheet.ask || null} : null;
  sheet = null; sheetError = null;
  if (mode === "new") showToast(`${PART_BY_ID[pid].label} logged as ${status}${tk.length ? `, ${tk.length} checklist line${tk.length > 1 ? "s" : ""} ticked` : ""}`,
    () => { Store.removeObs(pid, i); if (tk.length) Store.bumpLines(tk, -1); }, next);
  else showToast("Changes saved");
}
// Every form logged, counted or not achieved.
const everyForm = () => [...Object.values(Store.state.obs), ...Object.values(Store.state.missed)].flat();
// Every assessor name used so far, most recently logged first, one spelling each.
function assessorNames() {
  const all = [];
  for (const o of everyForm()) if (o.a && o.a.trim()) all.push(o);
  all.sort((x, y) => String(y.ts || "").localeCompare(String(x.ts || "")));
  const out = [];
  for (const o of all) {
    const name = scopeBare(o.a);
    if (!out.some(x => x.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out;
}
// Each assessor's usual turnaround: the median days from an observation to the
// day it was marked approved (o.ok), once there are two; keyed by lower-case surname.
function assessorSpeed() {
  const by = {};
  for (const o of everyForm()) {
    const name = scopeBare(o.a).toLowerCase(), d = attrDate(o);
    if (!o.ok || !name || !d) continue;
    const days = dayIndex(attrDate({d: o.ok})) - dayIndex(d);
    if (days >= 0) (by[name] ||= []).push(days);
  }
  const out = {};
  for (const name in by) {
    const xs = by[name].sort((a, b) => a - b), m = xs.length >> 1;
    if (xs.length >= 2) out[name] = {days: xs.length % 2 ? xs[m] : Math.round((xs[m - 1] + xs[m]) / 2), n: xs.length};
  }
  return out;
}
const speedText = s => s.days === 0 ? "usually the same day" : s.days < 14 ? `usually ${s.days} day${s.days > 1 ? "s" : ""}` : `usually ${Math.round(s.days / 7)} weeks`;
const speedShort = s => s.days === 0 ? "same day" : s.days < 14 ? `${s.days} d` : `${Math.round(s.days / 7)} wk`;
function assessorSuggestions(typed) {
  const t = (typed || "").trim().toLowerCase();
  return assessorNames().filter(n => !t || (n.toLowerCase().includes(t) && n.toLowerCase() !== t)).slice(0, 4);
}
function suggHTML(typed) {
  const sp = assessorSpeed();
  return assessorSuggestions(typed).map(x => { const s = sp[x.toLowerCase()];
    return `<button class="pick ghost" data-action="pickassessor" data-name="${esc(x)}">${esc(x)}${s ? `<span class="sp">${speedShort(s)}</span>` : ""}</button>`; }).join("");
}
function sheetHTML() {
  const s = sheet, today = getToday();
  // Each EPA is named beside its code, and the picked one in full.
  const chip = pid => `<button class="pick st-${PART_BY_ID[pid].stage}${s.pid === pid ? " on" : ""}" data-action="pickpart" data-part="${pid}">` +
    `<span class="pc">${PART_BY_ID[pid].label}</span><span class="pn">${esc(PART_SHORT[pid] || "")}</span></button>`;
  let picker;
  if (s.mode === "edit") picker = `<div class="pickrow">${chip(s.pid)}</div>`;
  else {
    // The fellows' edition knows no one's rotations: it offers what is left in the current stage.
    const cur = FELLOWS ? currentStage() : null;
    const quick = FELLOWS ? PARTS.filter(P => P.stage === cur && (Store.state.obs[P.id] || []).length < P.required).map(P => P.id)
      : weekRows(Store.state.obs, today).filter(r => r.outstanding > 0).map(r => r.pid);
    if (s.pid && !quick.includes(s.pid)) quick.unshift(s.pid);
    picker = !s.all && quick.length
      ? `<div class="lbl mono">${FELLOWS ? `Still to log in ${STAGE_NAMES[cur] || "your stage"}` : "This week's EPAs"}</div><div class="pickrow">${quick.map(chip).join("")}` +
        `<button class="pick ghost" data-action="pickall">All EPAs</button></div>`
      : `<div class="lbl mono">All EPAs</div>` + STAGE_ORDER.map(st =>
        `<div class="pickgrp mono st-${st}"><i></i>${STAGE_NAMES[st]}</div><div class="pickrow">` +
        PARTS.filter(P => P.stage === st).map(P => chip(P.id)).join("") + `</div>`).join("");
  }
  const edit = s.mode === "edit";
  // A new observation can tick its checklist lines as it's logged.
  // An edited one shows the groups it holds, any still open, and any with a
  // tick made by hand that no form holds yet (it takes that one over).
  const free = g => g.ids.some(x => Store.lineVal(x) > Store.lineHeld(x));
  const groups = s.missed || !s.pid ? [] : checklistGroups(s.pid, id => Store.lineVal(id))
    .filter(g => g.done < g.total || (edit && ((s.held || []).includes(g.name) || free(g)))).sort((a, b) => b.kase - a.kase);
  const ticks = groups.length ? `<div class="lbl mono">${edit ? "Checklist lines for this form" : "Also tick on the checklist"}</div><div class="pickrow ticks">` +
    groups.map(g => { const on = (s.tick || []).includes(g.name);
      return `<button class="pick ghost${on ? " on" : ""}" data-action="sheettick" data-name="${esc(g.name)}" aria-pressed="${on}">` +
        `${esc(askName(g.name))}<span class="tn">${g.done}/${g.total}</span></button>`; }).join("") + `</div>` : "";
  const iso = fmtDate(today), yest = fmtDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
  const dchip = (d, label) => `<button class="pick ghost${s.d === d ? " on" : ""}" data-action="sheetdate" data-date="${d}">${label}</button>`;
  return `<div class="scrim${sheetFresh ? " fresh" : ""}" data-action="closesheet"></div>` +
    `<div class="sheet${sheetFresh ? " fresh" : ""}" role="dialog" aria-modal="true" aria-label="${edit ? "Edit" : "Log"} observation">` +
    (plusOn ? plusHeadHTML("closesheet") : `<div class="grab"></div><div class="shead"><b>${edit ? "Edit observation" : "Log observation"}</b>` +
      `<button class="iconbtn" data-action="closesheet" aria-label="Close">${ic("x")}</button></div>`) + picker +
    (s.pid ? `<div class="picked"><b>${PART_BY_ID[s.pid].label}</b> ${esc(partTitle(s.pid))}</div>` : "") +
    `<label class="lbl mono">Date<input type="date" value="${esc(s.d)}" data-sheet="d"></label>` +
    `<div class="datechips">${dchip(iso, "Today")}${dchip(yest, "Yesterday")}</div>` +
    `<label class="lbl mono">Assessor<input type="text" value="${esc(s.a)}" placeholder="Surname" data-sheet="a" autocomplete="off" autocapitalize="words"></label>` +
    `<div class="pickrow sugg" id="sugg">${suggHTML(s.a)}</div>` +
    `<label class="lbl mono">Note<input type="text" value="${esc(s.n)}" placeholder="Case details" data-sheet="n"></label>` + ticks +
    `<div class="seg three" role="group" aria-label="Status"><button class="pending${s.status === "pending" ? " on" : ""}" data-action="sheetstatus" data-status="pending">${ic("clock")}Pending</button>` +
    `<button class="approved${s.status === "approved" ? " on" : ""}" data-action="sheetstatus" data-status="approved">${ic("check")}Approved</button>` +
    `<button class="missed${s.status === "missed" ? " on" : ""}" data-action="sheetstatus" data-status="missed">${ic("x")}Not achieved</button></div>` +
    (sheetError ? `<div class="err" role="alert">${esc(sheetError)}</div>` : "") +
    `<div class="sactions">${edit ? `<button class="btn danger" data-action="sheetdelete">Delete</button>` : ""}` +
    `<button class="btn primary" data-action="sheetsave">${edit ? "Save" : "Save as " + (s.status === "missed" ? "not achieved" : s.status)}</button></div></div>`;
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
// The change event fires as a field loses focus, often to a suggestion being
// tapped: redrawing the suggestions then would swap that one out mid-tap and
// lose the tap. So it only keeps the value.
function sheetFieldChange(t) {
  const f = t.dataset && t.dataset.sheet;
  if (!f || !sheet) return false;
  sheet[f] = t.value;
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
const scrollMemo = {};
function render() {
  const p = route.page, setup = FELLOWS && !!(felLocked || felSetup || felNeedsSetup());
  // Opening the app (or coming back to it) on Week powers the monitor on.
  if (p === "week" && !introDone && !setup) { introDone = true; liveBootArm(); }
  // The sheet in view on the + closed (a save, a delete, Close): the + flow ends.
  if (plusOn && !{c: scopeSheet, e: sheet, p: pearlSheet}[plusOn]) plusEnd();
  let html;
  try {
    const body = setup ? felSetupHTML() : p === "week" ? viewWeek() : p === "epas" ? viewEpas() : p === "plan" ? viewPlan() :
      p === "endo" ? viewEndo() : p === "call" ? viewCall() : p === "study" ? viewStudy() : p === "pearls" ? viewPearls() : p === "agenda" ? viewAgenda() : p === "guides" ? viewGuides() : viewEpa(route.code);
    html = `<main class="page${enterNext ? " enter" : ""}${liveStackClass()}${setup ? " felsetup" : ""}">${body}</main>` + (setup ? "" : navHTML(p === "epa" || p === "call" ? route.from : p)) +
      (sheet && plusShows("e") ? sheetHTML() : "") + (studySheet ? studySheetHTML() : "") + (scopeSheet && plusShows("c") ? scopeSheetHTML() : "") +
      (scopePick ? scopePickHTML() : "") + (pearlSheet && plusShows("p") ? pearlSheetHTML() : "") + (setSheet ? setSheetHTML() : "") +
      (reviewSheet ? reviewSheetHTML() : "") + (agSheet ? agSheetHTML() : "") + (agUsual ? agUsualHTML() : "") + (toast ? toastHTML() : "");
  } catch (err) {
    console.error(err);
    html = `<main class="page">${crashHTML()}</main>`;
  }
  scopeBeforeRender();
  const app = document.getElementById("app");
  liveBeforeSwap(app);
  app.innerHTML = html;
  liveAfterSwap();
  enterNext = false; sheetFresh = false; toastFresh = false; agSheetFresh = false;
  const up = anySheet();
  if (!up) holdPage(false);
  if (route.restoreY !== undefined) { window.scrollTo(0, route.restoreY); delete route.restoreY; }
  else if (!route.keepScroll) window.scrollTo(0, 0);
  route.keepScroll = false;
  if (up) holdPage(true);
  liveBootKick();
  callAfterRender();
  studyAfterRender();
  scopeAfterRender();
  remindAfterRender();
  guidesAfterRender();
  pearlsAfterRender();
  setAfterRender();
  reviewAfterRender();
  liveAfterRender(p);
}
// A sheet up holds the page still behind it. On iPhone a drag that runs past
// the end of a sheet, or starts on one too short to scroll, would otherwise
// scroll the page underneath; the body is fixed where it was (html.held), and
// letting go scrolls the page back to the same place.
let heldY = null;
function holdPage(on) {
  const root = document.documentElement, b = document.body;
  if (!root || !root.classList || !b || !b.style) return;
  if (on && heldY === null) { heldY = window.scrollY || 0; b.style.top = -heldY + "px"; root.classList.add("held"); }
  else if (!on && heldY !== null) { const y = heldY; heldY = null; root.classList.remove("held"); b.style.top = ""; window.scrollTo(0, y); }
}
// Any sheet up: no redraw from outside (an update, coming back to the app, the library arriving) while one is open.
const anySheet = () => !!(sheet || studySheet || scopeSheet || scopePick || pearlSheet || setSheet || reviewSheet || agSheet || agUsual);
// The dial's number counts up once, the first time Week is drawn.
function countUpDial() {
  if (typeof requestAnimationFrame !== "function") return;
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const el0 = document.querySelector(".dial-num[data-count]");
  if (!el0) return;
  const target = +el0.dataset.count, t0 = performance.now(), dur = 950;
  const step = now => {
    // A redraw may have replaced the number; carry on in the new one.
    const el = document.querySelector(".dial-num[data-count]");
    if (!el) return;
    const k = Math.min(1, (now - t0) / dur);
    el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  el0.textContent = "0";
  requestAnimationFrame(step);
}
// Navigate. Tabs and Back return to where that page was last scrolled.
function go(next, restore) {
  // Biopsy lives in Guides. Agenda is the full app's.
  if (next.page === "biopsy") { next = {...next, page: "guides"}; guidesTab = "b"; }
  if (next.page === "agenda" && FELLOWS) next = {...next, page: "week"};
  if (route.page !== "epa") scrollMemo[route.page] = window.scrollY || 0;
  const kind = liveKind(route.page, next.page);
  route = next; callError = null;
  if (restore && scrollMemo[next.page]) route.restoreY = scrollMemo[next.page];
  enterNext = true;
  liveSwap(render, kind);
}
function dispatch(act, d) {
  if (act === "plusto") { plusTo(d.to); route.keepScroll = true; render(); return; }
  if (act.startsWith("ag")) { if (agDispatch(act, d || {}) !== false) { route.keepScroll = true; render(); } return; }
  if (act.startsWith("pearl")) { if (pearlDispatch(act, d || {}) !== false) { route.keepScroll = true; render(); } return; }
  if (act.startsWith("fel")) { if (felDispatch(act, d || {}) !== false) { route.keepScroll = true; render(); } return; }
  if (act.startsWith("set")) { if (setDispatch(act, d || {}) !== false) { route.keepScroll = true; render(); } return; }
  if (act.startsWith("watch")) { if (watchDispatch(act, d || {}) !== false) { route.keepScroll = true; render(); } return; }
  if (act.startsWith("review")) { if (reviewDispatch(act, d || {}) !== false) { route.keepScroll = true; render(); } return; }
  if (act === "studytab") { studyDispatch(act, d); liveSwap(render, "seg"); return; }
  if (act.startsWith("study")) { if (studyDispatch(act, d) !== false) { route.keepScroll = true; render(); } return; }
  if (act.startsWith("guides")) { route.keepScroll = true; if (guidesDispatch(act, d || {}) !== false) act === "guidestab" ? liveSwap(render, "seg") : render(); return; }
  if (act.startsWith("scope")) {
    d = d || {};
    if (act === "scopetab") { scopeDispatch(act, d); liveSwap(render, "seg"); return; }
    if (scopeDispatch(act, d) !== false) { route.keepScroll = true; render(); }
    return;
  }
  if (act === "open") go({page: "epa", code: d.code, from: route.page === "epa" ? route.from : route.page});
  else if (act === "back") go({page: route.from || "epas"}, true);
  else if (act === "tab") { if (route.page !== d.page) go({page: d.page}, true); else window.scrollTo({top: 0, behavior: "smooth"}); }
  else if (act === "sheet") {
    scopeSheet = null; openSheet(d.part, d.obs, d.missed);
    // From What to ask for: the setting's own line (outpatient, inpatient) is ticked to start.
    if (d.ask && sheet.mode === "new") { sheet.ask = d.ask; sheet.tick = askPreTick(d.part, d.ask); }
    // From the pending list: it stays open behind the sheet, and the scope log's guess is offered.
    if (d.chase) chaseOpen = true;
    if (d.a && sheet.mode === "edit" && !sheet.a) sheet.a = d.a;
    route.keepScroll = true; render(); }
  else if (act === "closesheet") { sheet = null; sheetError = null; route.keepScroll = true; render(); }
  else if (act === "pickpart") { sheet.pid = d.part; sheet.all = false; sheet.tick = askPreTick(d.part, sheet.ask); sheetError = null; route.keepScroll = true; render(); }
  else if (act === "another") {
    const nx = toast && toast.next;
    toast = null; clearTimeout(toastTimer);
    if (nx) { scopeSheet = null; openSheet(); sheet.d = nx.d; sheet.a = nx.a; sheet.ask = nx.ask; }
    route.keepScroll = true; render(); }
  else if (act === "sheettick") { const t = sheet.tick ||= [], k = t.indexOf(d.name);
    if (k >= 0) t.splice(k, 1); else t.push(d.name); route.keepScroll = true; render(); }
  else if (act === "askset") {
    // Today's pick, remembered for this weekday; tapping the lit one clears both.
    const today = getToday(), on = askToday(today, callStatus(CallStore.list(), callNow())).set, set = on === d.set ? null : d.set;
    const days = Store.state.askDays || (Store.state.askDays = {});
    Store.state.ask = set; Store.state.askOn = fmtDate(today);
    if (set) days[today.getDay()] = set; else delete days[today.getDay()];
    Store.save(); route.keepScroll = true; render(); }
  else if (act === "pickall") { sheet.all = true; route.keepScroll = true; render(); }
  else if (act === "pickassessor") { sheet.a = d.name; route.keepScroll = true; render(); }
  else if (act === "sheetdate") { sheet.d = d.date; route.keepScroll = true; render(); }
  else if (act === "sheetstatus") { sheet.status = d.status; route.keepScroll = true; render(); }
  else if (act === "sheetsave") { saveSheet(); route.keepScroll = true; render(); }
  else if (act === "sheetdelete" && sheet.missed) {
    const {pid, i} = sheet, removed = Store.state.missed[pid][i];
    Store.removeMissed(pid, i); sheet = null;
    showToast("Observation deleted", () => Store.restoreMissed(pid, i, removed));
    route.keepScroll = true; render(); }
  else if (act === "sheetdelete") {
    const {pid, i} = sheet, removed = Store.state.obs[pid][i], tk = removed.tk || [];
    Store.removeObs(pid, i); if (tk.length) Store.bumpLines(tk, -1); sheet = null;
    showToast("Observation deleted", () => { Store.restoreObs(pid, i, removed); if (tk.length) Store.bumpLines(tk, 1); });
    route.keepScroll = true; render(); }
  else if (act === "togglestatus") { Store.toggleObsStatus(d.part, +d.obs); route.keepScroll = true; render(); }
  else if (act === "dismissrecap") { Store.setRecapSeen(d.key); route.keepScroll = true; render(); }
  else if (act === "chaseok") {
    const pid = d.part, i = +d.obs;
    Store.setObsStatus(pid, i, "approved"); chaseOpen = true;
    showToast(`${PART_BY_ID[pid].label} marked approved`, () => Store.setObsStatus(pid, i, "pending"));
    route.keepScroll = true; render(); }
  else if (act === "chasemiss") {
    const pid = d.part, i = +d.obs, j = Store.missObs(pid, i), L = PART_BY_ID[pid].label; chaseOpen = true;
    showToast(`${L} marked not achieved. It won't count toward ${L}.`, () => Store.unmissObs(pid, j, "pending", i));
    route.keepScroll = true; render(); }
  else if (act === "undo") { if (toast && toast.undo) toast.undo(); toast = null; route.keepScroll = true; render(); }
  else if (act === "cycleline") { Store.cycleLine(d.line, +d.target); route.keepScroll = true; render(); }
  else if (act === "linemeta") { route.editLine = route.editLine === d.line ? null : d.line; route.keepScroll = true; render(); }
  else if (act === "closeedit") { route.editLine = null; route.keepScroll = true; render(); }
  else if (act === "dismissnudge") { nudgeDismissed = true; route.keepScroll = true; render(); }
  else if (act === "export") { exportBackup(); }
  else if (act === "importpick") { document.getElementById("importfile").click(); }
  else if (act === "reload") { location.reload(); }
  else if (act === "callopen" || act === "callsetup") {
    const from = route.page === "epa" || route.page === "call" ? route.from : route.page;
    if (route.page === "call") { route.focus = d.site; route.keepScroll = true; render(); }
    else go({page: "call", from, focus: act === "callsetup" ? d.site : undefined}); }
  else if (act === "callimport") { document.getElementById("callfile").click(); }
  else if (act === "callclear") {
    const before = CallStore.snapshot();
    CallStore.clear(); callError = null;
    showToast("Call data cleared", () => CallStore.restore(before));
    route.keepScroll = true; render(); }
  else if (act === "remindon") { remindEnable(); }
  else if (act === "remindshare") { remindShare(); }
  else if (act === "remindcopy") { remindCopy(); }
  else if (act === "remindoff") { remindOff(); }
  else if (act === "reminddismiss") { RemindStore.state.dismissed = true; RemindStore.save(); route.keepScroll = true; render(); }
  else if (act === "bcat") { biopsyCat = d.cat; route.keepScroll = true; render(); }
  else if (act === "bclear") { biopsyTerm = ""; route.keepScroll = true; render();
    const q = document.getElementById("biopsyq"); if (q) q.focus(); }
}
document.getElementById("app").addEventListener("click", ev => {
  const t = ev.target.closest("[data-action]");
  if (t) { liveTap(t.dataset.action, t); dispatch(t.dataset.action, t.dataset); }
});
document.getElementById("app").addEventListener("input", ev => {
  if (agField(ev.target) || felField(ev.target) || (!FELLOWS && watchField(ev.target)) || sheetField(ev.target) || callField(ev.target) || studyField(ev.target) || scopeField(ev.target) || guidesField(ev.target) || pearlField(ev.target)) return;
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
  if (agField(t) || sheetFieldChange(t) || studyField(t) || scopeFieldChange(t) || pearlFieldChange(t)) return;
  if (t.id === "callfile") { callReadFile(t.files && t.files[0]); t.value = ""; return; }
  if (t.id === "agfile") { agReadFile(t.files && t.files[0]); t.value = ""; return; }
  if (d.callnum) { callNumDone(t); return; }
  if (t.id === "importfile") {
    const f = t.files && t.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      backupError = null;
      if (confirm("Replace current progress with this backup?")) {
        const res = Store.importJSON(rd.result);
        if (!res.ok) backupError = res.error;
        else {
          showToast("Backup imported");
          // A fellow restoring onto a new phone skips setup.
          if (FELLOWS) { felSetup = null; if (!Store.state.setup) { Store.state.setup = {d: fmtDate(getToday())}; Store.save(); } }
        }
      }
      render();
    };
    rd.readAsText(f);
    return;
  }
  if (d.field && d.line) Store.setLineMeta(d.line, {[d.field]: t.value});
});
// ---- Sheets: the handle closes them, and the keyboard never covers them ---------
// Dragging a sheet's handle or title down closes it, the same as its X.
let sheetDrag = null;
function sheetDragStart(ev) {
  const t = ev.target, zone = t && t.closest ? t.closest(".grab, .shead") : null;
  if (!zone || t.closest("button, input, a") || sheetDrag) return;
  const sh = zone.closest(".sheet"), prev = sh && sh.previousElementSibling;
  if (!sh) return;
  sheetDrag = {sh, id: ev.pointerId, y: ev.clientY, dy: 0, t: Date.now(), scrim: prev && prev.classList.contains("scrim") ? prev : null};
  sh.style.animation = "none"; sh.style.transition = "none";
  try { zone.setPointerCapture(ev.pointerId); } catch (e) {}
}
function sheetDragMove(ev) {
  const s = sheetDrag;
  if (!s || ev.pointerId !== s.id) return;
  s.dy = Math.max(0, ev.clientY - s.y);
  s.sh.style.transform = `translateY(${s.dy}px)`;
  if (s.scrim) { s.scrim.style.animation = "none"; s.scrim.style.opacity = String(Math.max(.2, 1 - s.dy / Math.max(1, s.sh.offsetHeight))); }
  liveLift(s.dy / Math.max(1, s.sh.offsetHeight));
}
function sheetDragEnd(ev) {
  const s = sheetDrag;
  if (!s || ev.pointerId !== s.id) return;
  sheetDrag = null;
  // Far enough, or a quick flick.
  const flick = s.dy > 30 && s.dy / Math.max(1, Date.now() - s.t) > .5;
  const close = ev.type === "pointerup" && (s.dy > Math.min(130, s.sh.offsetHeight * .3) || flick);
  s.sh.style.transition = "transform .2s cubic-bezier(.2, .8, .2, 1)";
  if (s.scrim) s.scrim.style.transition = "opacity .2s";
  if (!close) { s.sh.style.transform = ""; if (s.scrim) s.scrim.style.opacity = ""; liveLift(0, true); return; }
  s.sh.style.transform = "translateY(105%)";
  if (s.scrim) s.scrim.style.opacity = "0";
  const x = s.sh.querySelector(".shead .iconbtn[data-action]");
  setTimeout(() => { if (x && x.isConnected) dispatch(x.dataset.action, x.dataset); }, 190);
}
for (const [type, fn] of [["pointerdown", sheetDragStart], ["pointermove", sheetDragMove], ["pointerup", sheetDragEnd], ["pointercancel", sheetDragEnd]])
  document.getElementById("app").addEventListener(type, fn);
// iOS lays the keyboard over the page without resizing it, so a sheet pinned
// to the bottom ends up behind the keys. --kb is how much of the page the
// keyboard covers and --vvh the height still in view; the sheet CSS uses both.
function syncKeyboard(vv = window.visualViewport) {
  const root = document.documentElement;
  if (!vv || !root || !root.style) return;
  const kb = Math.round((root.clientHeight || window.innerHeight) - vv.height - vv.offsetTop), up = kb > 80;
  root.style.setProperty("--kb", (up ? kb : 0) + "px");
  root.style.setProperty("--vvh", Math.round(vv.height) + "px");
  root.classList.toggle("kb", up);
  const el = document.activeElement;
  if (up && el && el.closest && el.closest(".sheet") && el.scrollIntoView) el.scrollIntoView({block: "nearest"});
}
if (window.visualViewport && window.visualViewport.addEventListener) {
  window.visualViewport.addEventListener("resize", () => syncKeyboard());
  window.visualViewport.addEventListener("scroll", () => syncKeyboard());
}
// Coming back to the app redraws it, so the call card and the week are current,
// and checks whether a reminder has arrived.
// Back on Week after more than a few seconds away, the monitor powers on again:
// iOS keeps the app alive in the background, so this is what opening it looks like.
let hiddenAt = 0;
if (document.addEventListener) document.addEventListener("visibilitychange", () => {
  if (!FELLOWS) remindOpened();
  if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
  const a = document.activeElement;
  if (document.visibilityState === "visible") { updateCheck(); if (!FELLOWS) watchCheck(); }
  if (document.visibilityState === "visible" && !anySheet() &&
      !(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA"))) {
    if (updateNow()) return;
    if (route.page === "week" && hiddenAt && Date.now() - hiddenAt > 5000) introDone = false;
    route.keepScroll = true; render(); remindInit(); studyqInit(); guidesInit(); }
});
// A tapped reminder opens its screen (Call, Study or Pearls): by link when
// the app was closed, by message from the service worker when it was open.
const APP_LINKS = {call: {page: "call", from: "week"}, study: {page: "study"}, pearls: {page: "pearls", from: "study"}};
function appOpenFromLink(name) {
  if (!APP_LINKS[name]) return;
  if (name === "study") studyTab = "t";
  sheet = null; studySheet = null; scopeSheet = null; scopePick = null; pearlSheet = null; setSheet = null; reviewSheet = null;
  go({...APP_LINKS[name]});
}
if (typeof location !== "undefined" && APP_LINKS[location.hash.slice(1)] && !FELLOWS) {
  route = {...APP_LINKS[location.hash.slice(1)]};
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
}
if (navigator.serviceWorker && navigator.serviceWorker.addEventListener)
  navigator.serviceWorker.addEventListener("message", ev => { if (ev.data && ev.data.go) appOpenFromLink(ev.data.go); });
Store.load();
CallStore.load();
render();
// The fellows' edition has no reminders or study questions; it checks its invite code instead.
// The full app looks in on the fellows' codes (watch.js).
if (!FELLOWS) { remindInit(); studyqInit(); watchCheck(); remindOpened(); }
else felCheckAccess();
guidesInit();
// ---- Updates ----------------------------------------------------------------------------
// A new version installs in the background. When it takes over, the app
// reloads into it straight away if it was just opened, otherwise the next time
// it comes back, and never in the middle of an entry. A toast says so.
let updateReady = false;
const openedAt = Date.now();
function updateNow() {
  if (!updateReady) return false;
  updateReady = false;
  try { sessionStorage.setItem("gi-updated", "1"); } catch (e) {}
  location.reload();
  return true;
}
// iOS resumes the app rather than relaunching it, so look for a new version on the way back too.
function updateCheck() {
  if (navigator.serviceWorker && navigator.serviceWorker.getRegistration)
    navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {});
}
if ("serviceWorker" in navigator) {
  const hadWorker = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadWorker) return;   // the first install: this page is already the newest
    updateReady = true;
    const a = document.activeElement;
    if (Date.now() - openedAt < 15000 && !anySheet() &&
        !(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA"))) updateNow();
    // Settings open: its version row now offers the restart.
    else if (setSheet) { route.keepScroll = true; render(); }
  });
}
try {
  if (sessionStorage.getItem("gi-updated")) {
    sessionStorage.removeItem("gi-updated");
    showToast(`Updated to ${APP_VERSION}`); route.keepScroll = true; render();
  }
} catch (e) {}
