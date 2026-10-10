"use strict";
// GI Hub Endo tab: the procedure log (say the case, confirm it, save), the
// Progress view, and the biopsy reference. The motif is the colon: each
// colonoscopy lights the colon up to how far the fellow got, with the scope
// tip at the reach, the way the Year plan's insertion tube marks the week.
// Loaded after scope.js and scope-chart.js, before app.js; views use app.js
// helpers (esc, ic, Store, showToast, render) when they run.

let scopeTab = "log";
// The capture box is shared by the + sheet and the Log tab.
let scopeCap = {text: "", cards: [], removed: 0};
let scopeSheet = null, scopeSheetFresh = false;   // {kind: "capture" | "edit" | "staff" | "report"}
let scopePick = null, scopePickFresh = false;     // {key, kind, q, teach}
let scopeSearch = "", scopeAllRecent = false, scopeDot = null, scopePeriod = "since";
let scopeCardsFresh = false, scopeIntroDone = false, scopeLit = null, scopeErr = null, scopeKeySeq = 0, scopeFocus = null;

// ---- Small helpers ------------------------------------------------------------------------
const scopeData = () => Store.state.scopes;
const scopeStaffOf = id => scopeData().staff.find(p => p.id === id) || null;
const scopeSurname = p => String(p.name || "").split(",")[0].trim();
const scopeWho = id => { const p = scopeStaffOf(id); return p ? scopeSurname(p) : ""; };
const scopeSiteShort = k => (SCOPE_SITES.find(x => x[0] === k) || [, , ""])[2];
const scopeLocShort = k => (SCOPE_LOCS.find(x => x[0] === k) || [, , ""])[2];
const scopeIsoDate = iso => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12); };
function scopeDayLabel(iso) {
  const t = fmtDate(getToday()), y = fmtDate(new Date(getToday().getFullYear(), getToday().getMonth(), getToday().getDate() - 1));
  if (iso === t) return "Today";
  if (iso === y) return "Yesterday";
  const d = scopeIsoDate(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
const scopeShortDate = iso => { const d = scopeIsoDate(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const scopeCardByKey = k => scopeCap.cards.find(c => c.key === k) || (scopeSheet && scopeSheet.card && scopeSheet.card.key === k ? scopeSheet.card : null);
const scopeReduced = () => typeof window !== "undefined" && window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- The tract glyph -------------------------------------------------------------------------
// A colonoscopy lights the colon to its reach; an upper case lights the
// esophagus to the duodenum; ERCP adds the bile duct; a flex sig lights the
// left colon.
function scopeGlyph(c, o = {}) {
  const f = scopeFams(c), cls = "tg" + (o.cls ? " " + o.cls : ""), anim = o.anim ? " anim" : "";
  const svg = inner => `<svg class="${cls}${anim}" viewBox="0 0 28 28" aria-hidden="true">${inner}</svg>`;
  const colon = (upTo, tip, dim) => {
    const r = upTo ? scopeRank(upTo) : -1;
    let h = SCOPE_COLON_SEGS.map(([code, d], k) => `<path class="tg-s" d="${d}"/>`).join("");
    h += SCOPE_COLON_SEGS.map(([code, d], k) => k <= r ? `<path class="tg-on${dim ? " dim" : ""}" d="${d}" style="--k:${k}"/>` : "").join("");
    if (tip && upTo) { const [x, y] = SCOPE_COLON_TIP[upTo]; h += `<circle class="tg-tip" cx="${x}" cy="${y}" r="2.1" style="--k:${r}"/>`; }
    return h;
  };
  const upper = (lit, bil) => SCOPE_UPPER_SEGS.map(([k, d]) => `<path class="tg-s" d="${d}"/>`).join("") +
    (lit ? SCOPE_UPPER_SEGS.map(([k, d], i) => `<path class="tg-on" d="${d}" style="--k:${i}"/>`).join("") : "") +
    (bil ? `<path class="tg-on bil" d="${SCOPE_BILIARY}" style="--k:3"/>` : "");
  const one = fam => {
    if (fam === "colo") return svg(scopeHasBase(c) ? colon(c.reach, true) : colon("ti", false, true));
    if (fam === "fs") return svg(colon("desc", false));
    if (fam === "egd") return svg(upper(true));
    if (fam === "ercp") return svg(upper(false, true));
    if (fam === "para") return svg(`<path class="tg-s" d="M7 6.5C5 9 4.6 14 5.4 18.2C6.4 23 10 25.4 14 25.4S21.6 23 22.6 18.2C23.4 14 23 9 21 6.5"/>` +
      `<path class="tg-on" d="M14 11.4C12.4 13.6 11.2 15.4 11.2 17A2.8 2.8 0 0 0 16.8 17C16.8 15.4 15.6 13.6 14 11.4Z"/>`);
    return svg(colon("ti", false, true).replace(/tg-on dim/g, "tg-s") + `<path class="tg-on" d="${SCOPE_COLON_SEGS[6][1]}"/>`);
  };
  if (!f.length) return svg(colon(null, false));
  if (f.length === 1 || o.single) return one(f[0]);
  return `<span class="tg-pair">${f.slice(0, 2).map(one).join("")}</span>`;
}

// ---- Cards -------------------------------------------------------------------------------------
function scopeNewKey() { return "c" + (++scopeKeySeq); }
// A draft from the reader becomes a card: carried, inferred, with UI fields.
function scopeCardsFrom(drafts) {
  const s = scopeData(), today = getToday();
  const carried = scopeCarry(drafts, s.cases, today);
  const stretches = typeof callStretches === "function" ? callStretches(CallStore.list()) : [];
  return carried.map(d => {
    const c = scopeInfer(d, {now: callNow(), stretches, staff: s.staff});
    return {...c, key: scopeNewKey(), note: "", epa: {}, err: null};
  });
}
// A saved case (or a copy) opened as a card.
function scopeCardFromCase(c, copy) {
  return {key: scopeNewKey(), d: copy ? fmtDate(getToday()) : c.d, staff: c.staff, staffHeard: null, staffAlt: [], staffSaid: null,
    site: c.site, loc: c.loc, urg: c.urg, procs: (c.procs || []).slice(), reach: c.reach || null, why: (c.why || []).slice(),
    found: (c.found || []).slice(), leftover: [], note: copy ? "" : c.note || "", n: 1, epa: {}, carried: {}, err: null,
    editId: copy ? null : c.id, otherLabel: c.otherLabel || ""};
}
// EPA parts this card could count toward: active stage, still needing observations.
// What each saved case has already added as an EPA observation, read once per draw.
let scopeSentMemo = null;
const scopeSentFor = id => (id && (scopeSentMemo ||= scopeSentMap(Store.state.obs))[id]) || [];
function scopeOffers(card) {
  const cur = currentStage();
  if (!cur || !card.staff) return [];
  return scopeEpaParts(card).filter(pid => {
    const P = PART_BY_ID[pid];
    return P && P.stage === cur && (Store.state.obs[pid] || []).length < P.required;
  });
}
function scopeChip(label, action, data, cls) {
  const attrs = Object.entries(data || {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join("");
  return `<button class="chip${cls ? " " + cls : ""}" data-action="${action}"${attrs}>${label}</button>`;
}
function scopeSegHTML(card, kind, list) {
  return `<div class="sseg" role="group" aria-label="${kind === "site" ? "Site" : "Location"}">` + list.map(([k, , short]) =>
    `<button class="${card[kind] === k ? "on" : ""}${card.carried && card.carried[kind] && card[kind] === k ? " carried" : ""}" data-action="scopeset" data-key="${card.key}" data-kind="${kind}" data-v="${k}"` +
    (card[kind] === k ? ` aria-pressed="true"` : ` aria-pressed="false"`) + `>${short}</button>`).join("") + `</div>`;
}
function scopeReachHTML(card) {
  if (!card.procs.some(p => scopeFam(p) === "colo")) return "";
  const base = scopeHasBase(card), r = base && card.reach ? scopeRank(card.reach) : -1;
  const need = card.err && card.err.includes("reach");
  let stops = "";
  SCOPE_REACH.forEach(([code, label, short], k) => {
    stops += `<button class="rs${k <= r ? " lit" : ""}${k === r ? " at" : ""}" data-action="scopereach" data-key="${card.key}" data-r="${code}"` +
      ` aria-label="${label}"${k === r ? ` aria-pressed="true"` : ""} style="--k:${k}"><i></i><span class="mono">${short}</span></button>`;
  });
  return `<div class="reach${need ? " need" : ""}${base ? "" : " off"}"><div class="reach-h"><span class="mono">How far you got</span>` +
    `<span class="reach-v">${base ? (card.reach ? esc(scopeReachLabel(card.reach)) : "Tap a landmark") : "Therapy only"}</span></div>` +
    `<div class="reach-track" style="--r:${Math.max(0, r)};--n:${SCOPE_REACH.length - 1}">${stops}</div>` +
    `<div class="reach-f"><button class="textbtn sm" data-action="scopereach" data-key="${card.key}" data-r="${base ? "none" : "drove"}">` +
    `${base ? "I didn't drive: therapy only" : "I drove the colonoscopy"}</button></div></div>`;
}
function scopeListRow(card, kind, label, codes, labeler) {
  const chips = codes.map(c => `<span class="chip on">${esc(labeler(c))}` +
    `<button class="chip-x" data-action="scopedrop" data-key="${card.key}" data-kind="${kind}" data-code="${esc(c)}" aria-label="Remove ${esc(labeler(c))}">${ic("x")}</button></span>`).join("");
  return `<div class="srowk"><span class="mono">${label}</span><div class="chips">${chips}` +
    scopeChip(`${ic("plus")}${codes.length ? "" : "Add"}`, "scopechip", {key: card.key, kind}, "add" + (codes.length ? " icon" : "")) + `</div></div>`;
}
const scopeProcChipLabel = code => {
  const p = SCOPE_PROC[code];
  if (!p) return code;
  return p.base ? (p.fam === "para" ? "Paracentesis" + (code === "para.ther" ? ", therapeutic" : "") : p.fam === "other" ? p.label :
    scopeFamShort(p.fam) + (code === "colo.screen" ? ", screening" : "")) : p.label;
};
function scopeCardHTML(card, i, o = {}) {
  const miss = card.err || [];
  const staffP = scopeStaffOf(card.staff);
  let staff;
  if (staffP) staff = scopeChip(`${ic("user")}${esc(scopeWho(card.staff))}`, "scopechip", {key: card.key, kind: "staff"}, "on" + (card.carried && card.carried.staff ? " carried" : ""));
  else if (card.staffHeard) staff = scopeChip(`${ic("plus")}Add ${esc(card.staffHeard)}`, "scopenewstaff", {key: card.key}, "warn") +
    scopeChip("Someone else", "scopechip", {key: card.key, kind: "staff"}, "ghost");
  else if (card.staffAlt && card.staffAlt.length) staff = card.staffAlt.map(id => scopeChip(esc(scopeWho(id)) + "?", "scopestaff1", {key: card.key, id}, "ghost")).join("");
  else staff = scopeChip(`${ic("user")}Staff`, "scopechip", {key: card.key, kind: "staff"}, "ghost");
  const sent = scopeSentFor(card.editId).filter(x => PART_BY_ID[x.pid]);
  const offers = scopeOffers(card).filter(pid => !sent.some(x => x.pid === pid));
  const epa = sent.length || offers.length ? `<div class="offers">` + sent.map(x => {
    const P = PART_BY_ID[x.pid];
    return `<div class="offer sent"><span class="obox">${ic("check")}</span><span><b>${P.label}</b> added, ` +
      `${x.status === "approved" ? "approved" : "pending"}${x.a ? " with " + esc(scopeBare(x.a)) : ""}</span>` +
      `<span class="cc sm st-${P.stage}">${esc(PART_SHORT[x.pid] || "")}</span></div>`;
  }).join("") + offers.map(pid => {
    const on = !!card.epa[pid], P = PART_BY_ID[pid];
    return `<button class="offer${on ? " on" : ""}" data-action="scopeepa" data-key="${card.key}" data-pid="${pid}" aria-pressed="${on}">` +
      `<span class="obox">${on ? ic("check") : ""}</span><span>${on ? "Adding" : "Add"} <b>${P.label}</b> as pending with ${esc(scopeWho(card.staff))}</span>` +
      `<span class="cc sm st-${P.stage}">${esc(PART_SHORT[pid] || "")}</span></button>`;
  }).join("") + `</div>` : "";
  const left = card.leftover.length ? `<div class="leftover"><span class="mono">Didn't catch</span><div class="chips">` +
    card.leftover.map(w => scopeChip(esc(w), "scopeteach", {key: card.key, w}, "ghost dash")).join("") +
    `</div><button class="textbtn sm" data-action="scopetonote" data-key="${card.key}">Add to note</button></div>` : "";
  const errs = miss.length ? `<div class="err scerr" role="alert">${miss.includes("procedure") ? "Say or add a procedure." : "Tap how far you got, or choose therapy only."}</div>` : "";
  const dateVal = esc(card.d || fmtDate(getToday()));
  return `<article class="scard${miss.length ? " need" : ""}${scopeCardsFresh && !o.still ? " fresh" : ""}" style="--i:${i}" id="card-${card.key}">` +
    `<div class="sc-top">${scopeGlyph(card, {cls: "big", anim: scopeCardsFresh && !o.still})}<div class="sc-title">` +
    `<b>${esc(scopeSummary(card, {heads: true}))}</b><span class="scd-sub">${card.n > 1 ? `<span class="tag">×${card.n}</span>` : ""}` +
    `<label class="datechip mono">${esc(scopeDayLabel(card.d || fmtDate(getToday())))}${ic("chev", "sm")}<input type="date" value="${dateVal}" max="${fmtDate(getToday())}" data-scopedate="${card.key}" aria-label="Date"></label></span></div>` +
    (o.noClose ? "" : `<button class="iconbtn" data-action="scopecardx" data-key="${card.key}" aria-label="Remove this case">${ic("x")}</button>`) + `</div>` +
    `<div class="sc-who">${staff}${scopeChip(card.urg === "urgent" ? "Urgent" : "Elective", "scopeurg", {key: card.key}, card.urg === "urgent" ? "urg on" : "ghost")}</div>` +
    `<div class="sc-where">${scopeSegHTML(card, "site", SCOPE_SITES)}${scopeSegHTML(card, "loc", SCOPE_LOCS)}</div>` +
    scopeReachHTML(card) +
    scopeListRow(card, "procs", "Did", card.procs, scopeProcChipLabel) +
    scopeListRow(card, "why", "Why", card.why, scopeWhyLabel) +
    scopeListRow(card, "found", "Found", card.found, scopeFoundLabel) +
    epa + left +
    `<label class="snote"><span class="mono">Note</span><input type="text" value="${esc(card.note || "")}" placeholder="No patient details" data-scopenote="${card.key}" autocomplete="off"></label>` +
    errs + `</article>`;
}

// ---- The capture box ----------------------------------------------------------------------------
function scopeCtxLine() {
  const t = fmtDate(getToday()), today = scopeData().cases.filter(c => c.d === t).sort((a, b) => String(b.ts).localeCompare(String(a.ts)))[0];
  if (!today) return "New day";
  return [scopeWho(today.staff), scopeSiteShort(today.site), scopeLocShort(today.loc)].filter(Boolean).join(" · ") || "New day";
}
function scopeBoxHTML(where) {
  const today = getToday(), n = scopeCap.cards.length;
  return `<section class="monitor capmon" aria-label="Say the case"><div class="monitor-in">` +
    `<div class="ov mono"><span>${DAYS[today.getDay()]} ${today.getDate()} ${MONTHS[today.getMonth()]}</span><span class="capctx">${esc(scopeCtxLine())}</span></div>` +
    `<textarea id="scopebox-${where}" class="capbox" rows="3" data-scopefield="text" placeholder="EGD with Surname, biopsies for dysphagia, EoE" ` +
    `autocapitalize="sentences" enterkeyhint="done" aria-label="Say or type the case">${esc(scopeCap.text)}</textarea>` +
    `<div class="cap-f"><span class="cap-hint">${ic("mic", "sm")}<span>Tap the mic on your keyboard and say the case. A whole day works too.</span></span>` +
    `<button class="btn primary readbtn" data-action="scoperead">${n ? "Read again" : "Read it"}</button></div>` +
    (scopeCap.removed ? `<div class="guard mono">${ic("shield", "sm")}Removed ${scopeCap.removed === 1 ? "a number" : scopeCap.removed + " numbers"} that could identify a patient</div>` : "") +
    `</div></section>`;
}
function scopeCardsHTML() {
  if (!scopeCap.cards.length) return "";
  const n = scopeCap.cards.reduce((a, c) => a + (c.n || 1), 0);
  return `<div class="scards">${scopeCap.cards.map((c, i) => scopeCardHTML(c, i)).join("")}</div>` +
    `<div class="savebar"><button class="btn primary" data-action="scopesave">${ic("check")}Save ${n === 1 ? "case" : "all " + n}</button>` +
    `<button class="btn ghostbtn" data-action="scopeclear">Clear</button></div>`;
}

// ---- Log -------------------------------------------------------------------------------------------
function scopeRowHTML(c) {
  const sub = [scopeWho(c.staff), scopeSiteShort(c.site), scopeLocShort(c.loc)].filter(Boolean).join(" · ");
  const found = (c.found || []).filter(x => x !== "normal" || (c.found || []).length === 1).slice(0, 2).map(scopeFoundLabel).join(", ");
  return `<div class="srow${c.urg === "urgent" ? " urgent" : ""}${scopeLit === c.id ? " lit" : ""}"><button class="srow-b" data-action="scopeedit" data-id="${esc(c.id)}">` +
    `<span class="srow-g">${scopeGlyph(c)}</span><span class="srow-m"><b>${esc(scopeSummary(c))}</b>` +
    `<span class="srow-s">${esc(sub || "No staff recorded")}${found ? ` · <span class="found">${esc(found)}</span>` : ""}</span></span>` +
    (c.urg === "urgent" ? `<span class="urgtick" title="Urgent"><span class="sr">Urgent</span></span>` : "") +
    scopeSentFor(c.id).filter(x => PART_BY_ID[x.pid]).map(x => `<span class="cc sm st-${PART_BY_ID[x.pid].stage} sentc${x.status === "approved" ? " ok" : ""}">` +
      `${PART_BY_ID[x.pid].label}<span class="sr"> ${x.status === "approved" ? "approved" : "added, pending"}</span></span>`).join("") + `</button>` +
    `<button class="iconbtn again" data-action="scopeagain" data-id="${esc(c.id)}" aria-label="Log another like this">${ic("copy")}</button></div>`;
}
function scopeHintHTML() {
  const s = scopeData(), t = fmtDate(getToday());
  if (s.hintOff === t) return "";
  const today = s.cases.filter(c => c.d === t && c.staff).sort((a, b) => String(b.ts).localeCompare(String(a.ts)))[0];
  if (!today) return "";
  const cur = currentStage();
  const needs = ["f3a", "f4", "c6", "c8a"].map(pid => PART_BY_ID[pid]).filter(P => P && P.stage === cur)
    .map(P => ({P, left: P.required - (Store.state.obs[P.id] || []).length})).filter(x => x.left > 0);
  if (!needs.length) return "";
  const list = needs.map(x => `${x.P.label} (${PART_SHORT[x.P.id]}) needs ${x.left}`).join(", ");
  return `<div class="card shint">${ic("target")}<div><b>Before your next case</b><span>If ${esc(scopeWho(today.staff))} is open to it, ask now: ${esc(list)}.</span></div>` +
    `<button class="iconbtn" data-action="scopehintoff" aria-label="Dismiss for today">${ic("x")}</button></div>`;
}
function scopeRecentHTML() {
  const t = fmtDate(getToday()), q = scopeSearch.trim().toLowerCase();
  let list = scopeData().cases.filter(c => c.d !== t).slice().sort((a, b) => -scopeByDate(a, b));
  if (q) list = list.filter(c => (scopeSummary(c) + " " + scopeWho(c.staff) + " " + (c.found || []).map(scopeFoundLabel).join(" ") + " " +
    (c.why || []).map(scopeWhyLabel).join(" ") + " " + scopeSiteShort(c.site) + " " + scopeDayLabel(c.d) + " " + (c.note || "")).toLowerCase().includes(q));
  const total = list.length, shown = scopeAllRecent || q ? list : list.slice(0, 24);
  if (!total) return `<div class="card empty">${q ? "Nothing matches. Try a staff name, procedure or finding." : "Earlier cases show up here."}</div>`;
  let h = "", lastD = "";
  for (const c of shown) {
    if (c.d !== lastD) { if (lastD) h += `</div>`; h += `<div class="dgrp"><div class="dhead mono"><span>${esc(scopeDayLabel(c.d))}</span><span>${list.filter(x => x.d === c.d).length}</span></div>`; lastD = c.d; }
    h += scopeRowHTML(c);
  }
  h += `</div>`;
  if (shown.length < total) h += `<button class="btn morebtn" data-action="scopemore">Show all ${total}</button>`;
  return h;
}
function scopeLogHTML() {
  const s = scopeData(), t = fmtDate(getToday());
  let h = scopeBoxHTML("tab") + scopeCardsHTML();
  if (!scopeCap.cards.length) h += scopeHintHTML();
  const today = s.cases.filter(c => c.d === t).sort(scopeByDate);
  if (!s.cases.length) {
    h += `<section class="sec"><div class="card pad welcome"><b>Your logbook starts here</b>` +
      `<p>Say a case after you finish it, or a whole day at the end. Only what your hands did: for a colonoscopy, how far you got before staff took over.</p>` +
      `<button class="btn" data-action="scopeimportpick">${ic("download")}Import cases from a file</button></div></section>`;
  } else {
    h += `<section class="sec"><div class="sec-head"><h2>Today</h2><span class="mono">${today.length ? today.reduce((a, c) => a + scopeFams(c).length, 0) + " logged" : "Nothing yet"}</span></div>` +
      (today.length ? `<div class="card list slist">${today.map(scopeRowHTML).join("")}</div>` : `<div class="card empty">Say your first case of the day above.</div>`) + `</section>`;
    h += `<section class="sec"><div class="sec-head"><h2>Earlier</h2><span class="mono">${s.cases.length} cases</span></div>` +
      `<div class="qwrap slim">${ic("search")}<input id="scopeq" type="search" placeholder="Search staff, procedure, finding" aria-label="Search cases" ` +
      `autocomplete="off" autocapitalize="off" value="${esc(scopeSearch)}" data-scopefield="search"></div><div id="scoperecent">${scopeRecentHTML()}</div></section>`;
  }
  h += `<div class="sfoot"><button class="textbtn" data-action="scopestaffopen">${ic("user", "sm")}Staff (${s.staff.filter(p => !p.hidden).length})</button>` +
    `<button class="textbtn" data-action="scopeimportpick">${ic("download", "sm")}Import cases</button>` +
    `<input type="file" id="scopefile" hidden></div>` + (scopeErr ? `<div class="err">${esc(scopeErr)}</div>` : "");
  return h;
}

// ---- Progress --------------------------------------------------------------------------------------
function scopeSceneSVG(sc, o = {}) {
  const f = v => v;
  let h = "";
  for (const it of sc.items) {
    if (it.t === "line") h += `<line class="ch-${it.c}" x1="${f(it.x1)}" y1="${f(it.y1)}" x2="${f(it.x2)}" y2="${f(it.y2)}"/>`;
    else if (it.t === "path") h += `<polyline class="ch-${it.c}" points="${it.pts.map(p => p.join(",")).join(" ")}"/>`;
    else if (it.t === "area") h += `<polygon class="ch-${it.c}" points="${it.pts.map(p => p.join(",")).join(" ")}"/>`;
    else if (it.t === "text") h += `<text class="ch-${it.c}${it.mono ? " mono" : ""}" x="${f(it.x)}" y="${f(it.y)}" text-anchor="${it.a || "start"}" dominant-baseline="middle">${esc(it.s)}</text>`;
    else if (it.t === "ring") h += `<circle class="ch-${it.c}" cx="${it.x}" cy="${it.y}" r="${it.r}"/>`;
    else if (it.t === "dot") {
      const sel = o.sel && it.id === o.sel;
      h += `<circle class="ch-${it.c}${sel ? " sel" : ""}${o.intro ? " in" : ""}" cx="${it.x}" cy="${it.y}" r="${it.r}" style="--k:${it.k || 0}"/>`;
      if (o.tap && it.id) h += `<circle class="ch-hit" cx="${it.x}" cy="${it.y}" r="${Math.max(11, it.r + 7)}" data-action="scopedot" data-id="${esc(it.id)}"/>`;
    }
  }
  return `<svg class="chart${o.cls ? " " + o.cls : ""}" viewBox="0 0 ${sc.w} ${sc.h}" role="img" aria-label="${esc(o.label || "")}">${h}</svg>`;
}
function scopeRanges() {
  const today = getToday(), blk = blockFor(today);
  return {
    block: blk ? [fmtDate(blockStart(blk.num)), fmtDate(blockEnd(blk.num))] : null,
    year: ["2026-07-01", "2027-06-30"],
  };
}
function scopeDepthHTML() {
  const s = scopeData(), series = scopeReachSeries(s.cases), n = series.length;
  const sc = scopeDepthScene(series, {w: 330, h: 206});
  const last20 = series.slice(-20), cec = last20.filter(x => x.rank >= 5).length;
  const sel = scopeDot && series.find(x => x.id === scopeDot) ? series.find(x => x.id === scopeDot) : series[n - 1];
  const selC = sel ? s.cases.find(c => c.id === sel.id) : null;
  const read = selC ? `<div class="readout"><span class="mono">${sel === series[n - 1] && !scopeDot ? "Latest" : "Case " + sel.i}</span>` +
    `<b>${esc(scopeReachLabel(sel.reach))}</b><span>${esc(scopeShortDate(sel.d))}${selC.staff ? " · " + esc(scopeWho(selC.staff)) : ""}</span></div>` : "";
  const desc = n ? `${n} colonoscopies by how far you got; ${cec} of the last ${last20.length} reached the cecum.` : "No colonoscopies yet.";
  return `<section class="monitor depthmon" aria-label="Colon depth"><div class="monitor-in">` +
    `<div class="ov mono"><span>Colon depth</span><span>${n} colonoscop${n === 1 ? "y" : "ies"}</span></div>` +
    `<div class="depth-wrap">${scopeSceneSVG(sc, {cls: "depth" + (scopeIntroDone ? "" : " intro"), tap: true, sel: scopeDot, intro: !scopeIntroDone, label: desc})}` +
    (n ? "" : `<div class="depth-empty"><b>Every colonoscopy you drive lands here</b><span>placed at how far you got, so you can watch the dots climb toward the cecum.</span></div>`) + `</div>` +
    (n ? read + `<div class="ov mono legend"><span><i class="lgd hi"></i>Cecum or TI</span><span><i class="lgd lo"></i>Before the cecum</span>` +
      `<span class="ok">${cec}/${last20.length} last ${last20.length}</span></div>` : "") + `</div></section>`;
}
function scopeTotalsHTML() {
  const s = scopeData(), r = scopeRanges();
  const cols = [["Block", r.block ? scopeTotals(s.cases, r.block[0], r.block[1]) : null], ["Year", scopeTotals(s.cases, r.year[0], r.year[1])], ["All", scopeTotals(s.cases)]];
  const rows = SCOPE_FAMS.filter(([f]) => cols[2][1][f] > 0 || ["egd", "colo"].includes(f));
  return `<section class="sec"><div class="sec-head"><h2>Totals</h2><span class="mono">By procedure</span></div><div class="card ttable" role="table" aria-label="Procedure totals">` +
    `<div class="tr th" role="row"><span role="columnheader"></span>${cols.map(([l]) => `<span class="mono" role="columnheader">${l}</span>`).join("")}</div>` +
    rows.map(([f, label]) => `<div class="tr" role="row"><span class="tf" role="rowheader">${scopeGlyph({procs: [f + (f === "other" ? ".ileo" : ".dx")], reach: f === "colo" ? "ti" : null}, {cls: "sm"})}${esc(label)}</span>` +
      cols.map(([, t]) => `<span class="tn" role="cell">${t ? t[f] : "–"}</span>`).join("") + `</div>`).join("") +
    `<div class="tr tsum" role="row"><span role="rowheader">All procedures</span>${cols.map(([, t]) => `<span class="tn" role="cell">${t ? t.procs : "–"}</span>`).join("")}</div></div></section>`;
}
function scopeShareHTML() {
  const series = scopeReachSeries(scopeData().cases);
  if (series.length < 5) return "";
  const sh = scopeCecumShare(series, 20), sc = scopeShareScene(sh, {w: 330, h: 128});
  const last = sh[sh.length - 1];
  return `<section class="sec"><div class="sec-head"><h2>Reached the cecum</h2><span class="mono">Last ${Math.min(20, series.length)} colonoscopies</span></div>` +
    `<div class="card pad chartcard">${scopeSceneSVG(sc, {cls: "share", label: `Share of recent colonoscopies reaching the cecum, now ${last.share}%`})}` +
    `<p class="chnote">Each point is the share of your previous 20 colonoscopies (fewer at the start) where you reached the cecum or terminal ileum yourself.</p></div></section>`;
}
function scopeTherapyHTML() {
  const rows = scopeTherapy(scopeData().cases, PART_BY_ID.c8a ? PART_BY_ID.c8a.items : [], id => Store.lineVal(id));
  return `<section class="sec"><div class="sec-head"><h2>Therapeutics</h2><span class="mono">Against C8 minimums</span></div><div class="card list tlist">` +
    rows.map(r => {
      let segs = "";
      const cells = Math.max(r.min, Math.min(r.done, r.min + 6));
      for (let k = 0; k < cells; k++) segs += `<i class="${k < r.observed ? "seen" : k < r.done ? "done" : ""}${k >= r.min ? " extra" : ""}"></i>`;
      return `<div class="trow"><div class="trow-h"><span class="tl">${esc(r.label)}</span><span class="mono tv"><b>${r.done}</b> done · ${r.observed}/${r.min} observed</span></div>` +
        `<div class="tsegs" aria-hidden="true">${segs}</div></div>`;
    }).join("") + `</div><p class="goal">Done counts your logged cases. Observed counts the C8 checklist lines you've ticked for Entrada.</p></section>`;
}
function scopeFirstsHTML() {
  const f = scopeFirsts(scopeData().cases);
  if (!f.length) return "";
  return `<section class="sec"><div class="sec-head"><h2>Firsts</h2><span class="mono">${f.length} so far</span></div><ol class="card firsts">` +
    f.map(x => `<li><span class="mono">${esc(scopeShortDate(x.d))}</span><span>${esc(x.label)}</span></li>`).join("") + `</ol></section>`;
}
function scopeBarsHTML(rows, total) {
  const max = Math.max(1, ...rows.map(r => r.n));
  return rows.map(r => `<div class="bw-row"><span class="bw-l">${esc(r.label)}</span><span class="bw-b"><i style="width:${pct(r.n, max)}%"></i></span><span class="mono bw-n">${r.n}</span></div>`).join("");
}
function scopeBreadthHTML() {
  const s = scopeData(), b = scopeBreadth(s.cases, null, null, s.staff);
  if (!b.n) return "";
  const staff = b.staff.slice(0, 8).map(r => ({label: r.id === "none" ? "Not recorded" : scopeSurname(r), n: r.n}));
  const map = (obj, list) => list.map(([k, label]) => ({label, n: obj[k] || 0})).concat(obj.none ? [{label: "Not recorded", n: obj.none}] : []).filter(x => x.n);
  return `<section class="sec"><div class="sec-head"><h2>Breadth</h2><span class="mono">All ${b.n} cases</span></div><div class="card pad breadth">` +
    `<div class="bgrp2"><span class="mono">Staff</span>${scopeBarsHTML(staff)}</div>` +
    `<div class="bgrp2"><span class="mono">Site</span>${scopeBarsHTML(map(b.site, SCOPE_SITES.map(x => [x[0], x[1]])))}</div>` +
    `<div class="bgrp2"><span class="mono">Setting</span>${scopeBarsHTML(map(b.loc, SCOPE_LOCS.map(x => [x[0], x[1]])).concat(map(b.urg, [["urgent", "Urgent"], ["elective", "Elective"]]).filter(r => r.label !== "Not recorded")))}</div>` +
    `</div></section>`;
}
function scopeReportCardHTML() {
  const s = scopeData(), last = s.lastReport;
  const opts = [["since", last ? "Since last report" : "Since you started"], ["block", "This block"], ["year", "This year"], ["all", "All time"]];
  return `<section class="sec"><div class="sec-head"><h2>For your program director</h2><span class="mono">${last ? "Last report " + esc(scopeShortDate(last)) : "No report yet"}</span></div>` +
    `<div class="card pad report"><div class="datechips wrap">${opts.map(([k, l]) => `<button class="pick ghost${scopePeriod === k ? " on" : ""}" data-action="scopeperiod" data-p="${k}">${l}</button>`).join("")}</div>` +
    `<label class="lbl mono">Name on the report<input type="text" value="${esc(s.reportName || "")}" placeholder="Your name" data-scopefield="name" autocomplete="name" autocapitalize="words"></label>` +
    `<button class="btn primary" data-action="scopereport">${ic("share")}Export report (PDF)</button>` +
    `<button class="btn" data-action="scopecsv">${ic("share")}Export spreadsheet</button>` +
    `<p class="bnote">Charts, totals, therapeutics, firsts and every case in the period. No patient details are stored, so it's safe to email.</p>` +
    (scopeErr ? `<div class="err">${esc(scopeErr)}</div>` : "") + `</div></section>`;
}
function scopeProgressHTML() {
  const s = scopeData();
  return scopeDepthHTML() + (s.cases.length ? scopeTotalsHTML() + scopeShareHTML() + scopeTherapyHTML() + scopeFirstsHTML() + scopeBreadthHTML() + scopeReportCardHTML()
    : `<div class="card empty spaced">Log a few cases and your totals, therapeutics and report appear here.</div>`);
}

// ---- The tab -----------------------------------------------------------------------------------------
function scopeSwitchHTML() {
  const b = (k, label) => `<button class="${scopeTab === k ? "on" : ""}" data-action="scopetab" data-tab="${k}"${scopeTab === k ? ` aria-current="page"` : ""}>${label}</button>`;
  return `<div class="segtabs" role="group" aria-label="Endo views">${b("log", "Log")}${b("progress", "Progress")}</div>`;
}
function viewEndo() {
  const s = scopeData(), blk = blockFor(getToday());
  const inBlock = blk ? scopeTotals(s.cases, fmtDate(blockStart(blk.num)), fmtDate(blockEnd(blk.num))).procs : 0;
  if (scopeTab !== "progress") scopeTab = "log";
  let h = `<header class="ph"><p class="eyebrow mono">Procedure log</p><h1 class="title">Endo</h1>` +
    `<div class="ph-meta mono">${blk ? `<b>${inBlock}</b> this block · ` : ""}<b>${scopeTotals(s.cases).procs}</b> logged</div></header>` + scopeSwitchHTML();
  h += warningsHTML(getToday());
  return h + (scopeTab === "progress" ? scopeProgressHTML() : scopeLogHTML());
}

// ---- Sheets: capture (the + button), edit, staff ---------------------------------------------------
function scopeOpenCapture() { scopeSheet = {kind: "capture"}; scopeSheetFresh = true; scopeErr = null; }
function scopeSheetHTML() {
  const sh = scopeSheet, fresh = scopeSheetFresh ? " fresh" : "";
  const head = (t, extra) => `<div class="scrim${fresh}" data-action="scopeclose"></div><div class="sheet scopesheet${fresh}" role="dialog" aria-modal="true" aria-label="${esc(t)}">` +
    `<div class="grab"></div><div class="shead"><b>${esc(t)}</b><button class="iconbtn" data-action="scopeclose" aria-label="Close">${ic("x")}</button></div>` + (extra || "");
  if (sh.kind === "capture")
    // Above the box, so the keyboard and its toolbar can never cover it.
    return head("Log a case", `<button class="btn epalink" data-action="sheet">${ic("epas")}Log an EPA observation instead</button>`) +
      scopeBoxHTML("sheet") + scopeCardsHTML() + `</div>`;
  if (sh.kind === "edit") {
    const c = sh.card;
    return head(sh.copy ? "Another like that" : "Edit case") + `<div class="scards">${scopeCardHTML(c, 0, {noClose: true, still: true})}</div>` +
      `<div class="sactions">${sh.copy ? "" : `<button class="btn danger" data-action="scopedelete">Delete</button>`}` +
      `<button class="btn primary" data-action="${sh.copy ? "scopesavecopy" : "scopeupdate"}">${sh.copy ? "Save case" : "Save changes"}</button></div></div>`;
  }
  if (sh.kind === "staff") {
    const list = scopeData().staff.slice().sort((a, b) => a.name.localeCompare(b.name));
    const counts = {};
    for (const c of scopeData().cases) if (c.staff) counts[c.staff] = (counts[c.staff] || 0) + 1;
    return head("Staff", `<p class="ssub">Names stay on this phone and in your backup. The app learns how dictation spells them when you correct a card.</p>`) +
      `<div class="card list stafflist">` + (list.length ? list.map(p => `<div class="strow${p.hidden ? " hid" : ""}">` +
        `<input type="text" value="${esc(p.name)}" data-staffname="${esc(p.id)}" aria-label="Name" autocapitalize="words">` +
        `<span class="mono">${counts[p.id] || 0} case${counts[p.id] === 1 ? "" : "s"}${(p.aliases || []).length ? " · heard as " + esc(p.aliases.slice(0, 2).join(", ")) : ""}</span>` +
        `<button class="textbtn sm" data-action="scopehide" data-id="${esc(p.id)}">${p.hidden ? "Show" : "Hide"}</button></div>`).join("") :
        `<div class="empty">No staff yet. Add them here, or they're added as you log.</div>`) + `</div>` +
      `<label class="lbl mono">Add staff<input type="text" value="${esc(sh.add || "")}" placeholder="Surname, First name" data-scopefield="addstaff" autocapitalize="words"></label>` +
      `<div class="sactions"><button class="btn primary" data-action="scopeaddstaff">${ic("plus")}Add</button></div></div>`;
  }
  return "";
}

// ---- The picker: search, never a tree ---------------------------------------------------------------
const SCOPE_PICK_TITLE = {staff: "Staff", why: "Why", found: "Found", procs: "Did", teach: "What does it mean?"};
function scopePickOptions() {
  const p = scopePick, q = (p.q || "").trim().toLowerCase(), s = scopeData();
  const use = {};
  for (const c of s.cases) for (const k of ["why", "found", "procs"]) for (const x of c[k] || []) use[k + ":" + x] = (use[k + ":" + x] || 0) + 1;
  let opts = [];
  const vocab = (kind, list, lab) => list.filter(x => x.code !== "other").map(x => ({kind, code: x.code, label: lab(x), n: use[kind + ":" + x.code] || 0, words: x.words || ""}));
  if (p.kind === "staff") {
    const cnt = {};
    for (const c of s.cases) if (c.staff) cnt[c.staff] = (cnt[c.staff] || 0) + 1;
    opts = s.staff.filter(x => !x.hidden).map(x => ({kind: "staff", code: x.id, label: x.name, n: cnt[x.id] || 0, words: (x.aliases || []).join(" ")}));
  } else {
    const kinds = p.kind === "teach" ? ["found", "why", "procs"] : [p.kind];
    for (const k of kinds) {
      if (k === "why") opts = opts.concat(vocab("why", SCOPE_WHY, x => x.label));
      if (k === "found") opts = opts.concat(vocab("found", SCOPE_FOUND, x => x.label));
      if (k === "procs") opts = opts.concat(SCOPE_PROCS.filter(x => x.code !== "other.x").map(x => ({kind: "procs", code: x.code,
        label: (x.base ? scopeProcChipLabel(x.code) : scopeFamShort(x.fam) + ": " + x.label), n: use["procs:" + x.code] || 0, words: x.tres})));
    }
  }
  const card = scopeCardByKey(p.key);
  const have = card ? {staff: [card.staff], why: card.why, found: card.found, procs: card.procs} : {};
  opts = opts.filter(o => !(have[o.kind] || []).includes(o.code));
  if (q) opts = opts.filter(o => (o.label + " " + o.words.replace(/[|?()\\:]/g, " ")).toLowerCase().includes(q));
  return opts.sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}
function scopePickListHTML() {
  const p = scopePick, opts = scopePickOptions(), q = (p.q || "").trim();
  const grp = {why: "Why", found: "Found", procs: "Did"};
  let h = "", last = "";
  for (const o of opts.slice(0, 60)) {
    if (p.kind === "teach" && o.kind !== last) { h += `<div class="pgh mono">${grp[o.kind]}</div>`; last = o.kind; }
    h += `<button class="pkrow" data-action="scopepicked" data-kind="${o.kind}" data-code="${esc(o.code)}"><span>${esc(o.label)}</span>` +
      (o.n ? `<span class="mono">${o.n}</span>` : "") + `</button>`;
  }
  if (p.kind === "staff" && q.length > 1) h += `<button class="pkrow addnew" data-action="scopeaddpicked">${ic("plus")}<span>Add “${esc(q)}” as new staff</span></button>`;
  if (!h) h = `<div class="empty">No match. Try another word.</div>`;
  return h;
}
function scopePickHTML() {
  const p = scopePick, fresh = scopePickFresh ? " fresh" : "";
  const sub = p.kind === "teach" ? `<p class="ssub">You said “${esc(p.teach)}”. Pick what it means and the app will read it that way from now on.</p>` : "";
  return `<div class="scrim top${fresh}" data-action="scopepickclose"></div><div class="sheet picksheet${fresh}" role="dialog" aria-modal="true" aria-label="${esc(SCOPE_PICK_TITLE[p.kind])}">` +
    `<div class="grab"></div><div class="shead"><b>${esc(SCOPE_PICK_TITLE[p.kind])}</b><button class="iconbtn" data-action="scopepickclose" aria-label="Close">${ic("x")}</button></div>${sub}` +
    `<div class="qwrap slim">${ic("search")}<input id="scopepickq" type="search" value="${esc(p.q || "")}" placeholder="Search" data-scopefield="pick" autocomplete="off" autocapitalize="off" aria-label="Search"></div>` +
    `<div class="picklist" id="scopepicklist">${scopePickListHTML()}</div></div>`;
}

// ---- Actions -------------------------------------------------------------------------------------------
function scopeRead() {
  const s = scopeData();
  const r = scopeParse(scopeCap.text, {today: getToday(), staff: s.staff, learned: s.learned});
  scopeCap.cards = scopeCardsFrom(r.cases);
  scopeCap.removed = r.removed;
  // What could identify a patient leaves the box too.
  if (r.removed) scopeCap.text = scopeGuard(scopeCap.text).text;
  scopeCardsFresh = true;
  if (!scopeCap.cards.length) scopeErr = scopeCap.text.trim() ? "Nothing to log in that. Say the procedure, like “EGD with Surname”." : "Say or type a case first.";
  else scopeErr = null;
}
function scopeValidate(card) {
  const m = scopeMissing(card);
  card.err = m.length ? m : null;
  return !m.length;
}
// A card becomes a saved case (and n copies of it).
function scopeCaseOf(card, id) {
  const c = {id: id || scopeId(), d: card.d || fmtDate(getToday()), staff: card.staff || null, site: card.site || null, loc: card.loc || null,
    urg: card.urg || null, procs: card.procs.slice(), reach: scopeHasBase(card) ? card.reach : null, why: card.why.slice(), found: card.found.slice(),
    note: (card.note || "").trim(), src: card.src || "dictated", ts: new Date().toISOString()};
  if (card.otherLabel) c.otherLabel = card.otherLabel;
  return c;
}
function scopeAddEpa(card, caseId) {
  const added = [];
  for (const pid of Object.keys(card.epa || {})) {
    if (!card.epa[pid]) continue;
    const i = Store.logObs(pid);
    Store.setObsMeta(pid, i, {d: card.d || fmtDate(getToday()), a: scopeWho(card.staff), n: SCOPE_EPA_NOTE + scopeSummary(card), status: "pending", src: caseId});
    added.push(PART_BY_ID[pid].label);
  }
  return added;
}
function scopeSaveAll() {
  const cards = scopeCap.cards;
  if (!cards.length) return;
  const ok = cards.map(scopeValidate).every(Boolean);
  if (!ok) { scopeCardsFresh = false; return "invalid"; }
  const before = {scopes: Store.scopeSnapshot(), obs: JSON.parse(JSON.stringify(Store.state.obs))};
  const list = [], epa = [];
  for (const card of cards) {
    const first = list.length;
    for (let k = 0; k < (card.n || 1); k++) list.push(scopeCaseOf(card));
    epa.push(...scopeAddEpa(card, list[first].id));
  }
  Store.addCases(list);
  const n = list.reduce((a, c) => a + scopeFams(c).length, 0);
  scopeCap = {text: "", cards: [], removed: 0};
  if (scopeSheet && scopeSheet.kind === "capture") scopeSheet = null;
  scopeLit = list[list.length - 1].id;
  showToast(`${n === 1 ? "Case" : n + " procedures"} saved${epa.length ? " · " + epa.join(", ") + " pending" : ""}`,
    () => { Store.restoreScopes(before.scopes); Store.state.obs = before.obs; Store.save(); });
}
function scopeApplyPick(kind, code) {
  const p = scopePick, card = scopeCardByKey(p.key), s = scopeData();
  if (!card) { scopePick = null; return; }
  if (kind === "staff") {
    const said = card.staffHeard || card.staffSaid;
    if (said && scopeLetters(said).length > 2) Store.learnStaff(code, said.toLowerCase());
    card.staff = code; card.staffHeard = null; card.staffAlt = []; card.carried = {...card.carried, staff: false};
  } else {
    const list = card[kind];
    if (!list.includes(code)) list.push(code);
    if (kind === "procs" && (code === "colo.dx" || code === "colo.screen")) card.procs = card.procs.filter(x => x === code || (x !== "colo.dx" && x !== "colo.screen"));
    if (p.kind === "teach" && p.teach) {
      Store.learn(kind === "procs" ? "proc" : kind, p.teach, code);
      card.leftover = card.leftover.filter(w => w !== p.teach);
    }
    if (card.err) scopeValidate(card);
  }
  scopePick = null;
}
function scopeDispatch(act, d = {}) {
  const card = d.key ? scopeCardByKey(d.key) : null;
  if (act === "scopetab") { scopeTab = d.tab; scopeErr = null; scopeDot = null; route.keepScroll = false; enterNext = true; }
  else if (act === "scopeopen") scopeOpenCapture();
  else if (act === "scopeclose") { scopeSheet = null; scopeErr = null; }
  else if (act === "scoperead") scopeRead();
  else if (act === "scopeclear") { scopeCap = {text: "", cards: [], removed: 0}; scopeErr = null; }
  else if (act === "scopecardx") { scopeCap.cards = scopeCap.cards.filter(c => c.key !== d.key); scopeCardsFresh = false; }
  else if (act === "scopeset" && card) { card[d.kind] = card[d.kind] === d.v ? null : d.v; card.carried = {...card.carried, [d.kind]: false};
    if (d.kind === "loc" && (d.v === "ed" || d.v === "icu") && card[d.kind]) card.urg = "urgent"; scopeCardsFresh = false; }
  else if (act === "scopeurg" && card) { card.urg = card.urg === "urgent" ? "elective" : "urgent"; scopeCardsFresh = false; }
  else if (act === "scopereach" && card) {
    scopeCardsFresh = false;
    if (d.r === "none") { card.procs = card.procs.filter(p => p !== "colo.dx" && p !== "colo.screen"); card.reach = null; if (!card.procs.length) card.procs.push("colo.hem"); }
    else if (d.r === "drove") { if (!scopeHasBase(card)) card.procs.unshift(card.why.includes("crc") ? "colo.screen" : "colo.dx"); }
    else { if (!scopeHasBase(card)) card.procs.unshift("colo.dx"); card.reach = d.r; }
    if (card.err) scopeValidate(card);
  }
  else if (act === "scopedrop" && card) {
    scopeCardsFresh = false;
    card[d.kind] = card[d.kind].filter(x => x !== d.code);
    if (d.kind === "procs" && !scopeHasBase(card)) card.reach = null;
  }
  else if (act === "scopechip" && card) { scopePick = {key: card.key, kind: d.kind, q: ""}; scopePickFresh = true; scopeCardsFresh = false; }
  else if (act === "scopeteach" && card) { scopePick = {key: card.key, kind: "teach", q: "", teach: d.w}; scopePickFresh = true; scopeCardsFresh = false; }
  else if (act === "scopepicked") scopeApplyPick(d.kind, d.code);
  else if (act === "scopeaddpicked") {
    const name = (scopePick.q || "").trim(), c = scopeCardByKey(scopePick.key);
    if (name && c) { const id = Store.addStaff(name); c.staff = id; c.staffHeard = null; c.staffAlt = []; }
    scopePick = null;
  }
  else if (act === "scopepickclose") scopePick = null;
  else if (act === "scopestaff1" && card) { card.staff = d.id; card.staffAlt = []; if (card.staffSaid) Store.learnStaff(d.id, card.staffSaid.toLowerCase()); scopeCardsFresh = false; }
  else if (act === "scopenewstaff" && card) { const id = Store.addStaff(card.staffHeard); card.staff = id; card.staffHeard = null; scopeCardsFresh = false;
    showToast(`${scopeWho(id)} added to your staff`); }
  else if (act === "scopeepa" && card) { card.epa = {...card.epa, [d.pid]: !card.epa[d.pid]}; scopeCardsFresh = false; }
  else if (act === "scopetonote" && card) { card.note = [card.note, card.leftover.join(" ")].filter(Boolean).join(" "); card.leftover = []; scopeCardsFresh = false; }
  else if (act === "scopesave") { if (scopeSaveAll() === "invalid") { const bad = scopeCap.cards.find(c => c.err); scopeFocus = bad && bad.key; } }
  else if (act === "scopeedit") {
    const c = scopeData().cases.find(x => x.id === d.id);
    if (c) { scopeSheet = {kind: "edit", id: c.id, card: scopeCardFromCase(c, false)}; scopeSheetFresh = true; }
  }
  else if (act === "scopeagain") {
    const c = scopeData().cases.find(x => x.id === d.id);
    if (c) { scopeSheet = {kind: "edit", copy: true, card: scopeCardFromCase(c, true)}; scopeSheetFresh = true; }
  }
  else if (act === "scopeupdate" || act === "scopesavecopy") {
    const sh = scopeSheet, c = sh.card;
    if (!scopeValidate(c)) return true;
    const before = {scopes: Store.scopeSnapshot(), obs: JSON.parse(JSON.stringify(Store.state.obs))};
    const next = scopeCaseOf(c, act === "scopeupdate" ? sh.id : null);
    const epa = scopeAddEpa(c, next.id);
    if (act === "scopeupdate") {
      const old = scopeData().cases.find(x => x.id === sh.id);
      next.src = old ? old.src : "dictated";
      Store.updateCase(sh.id, next);
      showToast("Changes saved" + (epa.length ? " · " + epa.join(", ") + " pending" : ""), () => { Store.restoreScopes(before.scopes); Store.state.obs = before.obs; Store.save(); });
      scopeLit = sh.id;
    } else {
      Store.addCases([next]);
      scopeLit = next.id;
      showToast("Case saved" + (epa.length ? " · " + epa.join(", ") + " pending" : ""), () => { Store.restoreScopes(before.scopes); Store.state.obs = before.obs; Store.save(); });
    }
    scopeSheet = null;
  }
  else if (act === "scopedelete") {
    const id = scopeSheet.id, before = Store.scopeSnapshot();
    Store.removeCase(id); scopeSheet = null;
    showToast("Case deleted", () => Store.restoreScopes(before));
  }
  else if (act === "scopehintoff") { scopeData().hintOff = fmtDate(getToday()); Store.save(); }
  else if (act === "scopemore") scopeAllRecent = true;
  else if (act === "scopedot") scopeDot = scopeDot === d.id ? null : d.id;
  else if (act === "scopeperiod") scopePeriod = d.p;
  else if (act === "scopereport") { scopeExportReport(); return false; }
  else if (act === "scopecsv") { scopeExportCSV(); return false; }
  else if (act === "scopestaffopen") { scopeSheet = {kind: "staff", add: ""}; scopeSheetFresh = true; }
  else if (act === "scopehide") { const p = scopeStaffOf(d.id); if (p) { p.hidden = !p.hidden; Store.save(); } }
  else if (act === "scopeaddstaff") { const nm = (scopeSheet.add || "").trim(); if (nm) { Store.addStaff(nm); scopeSheet.add = ""; showToast(`${nm} added`); } }
  else if (act === "scopeimportpick") { const el = document.getElementById("scopefile"); if (el) el.click(); return false; }
  else return false;
  return true;
}
// Typing never re-renders the page (it would drop the keyboard); lists that
// depend on what's typed redraw in place.
function scopeField(t) {
  const d = t.dataset || {};
  if (d.scopefield === "text") { scopeCap.text = t.value; const other = document.querySelectorAll ? document.querySelectorAll(".capbox") : [];
    for (const el of other) if (el !== t) el.value = t.value; scopeGrow(t); return true; }
  if (d.scopefield === "pick" && scopePick) { scopePick.q = t.value; const box = document.getElementById("scopepicklist"); if (box) box.innerHTML = scopePickListHTML(); return true; }
  if (d.scopefield === "search") { scopeSearch = t.value; const box = document.getElementById("scoperecent"); if (box) box.innerHTML = scopeRecentHTML(); return true; }
  if (d.scopefield === "name") { scopeData().reportName = t.value.slice(0, 80); Store.save(); return true; }
  if (d.scopefield === "addstaff" && scopeSheet) { scopeSheet.add = t.value; return true; }
  if (d.scopenote) { const c = scopeCardByKey(d.scopenote); if (c) c.note = t.value.slice(0, 200); return true; }
  if (d.staffname) return true;
  return false;
}
// Changes that commit: a card's date, a staff rename, the import file.
function scopeFieldChange(t) {
  const d = t.dataset || {};
  if (d.scopedate) { const c = scopeCardByKey(d.scopedate); if (c && /^\d{4}-\d{2}-\d{2}$/.test(t.value)) { c.d = t.value; scopeCardsFresh = false; } route.keepScroll = true; render(); return true; }
  if (d.staffname) { const p = scopeStaffOf(d.staffname), v = t.value.trim(); if (p && v) { p.name = v.slice(0, 60); Store.save(); } return true; }
  if (t.id === "scopefile") { scopeReadImport(t.files && t.files[0]); t.value = ""; return true; }
  return false;
}
function scopeImportText(text) {
  let file;
  try { file = JSON.parse(text); } catch (e) { scopeErr = "Couldn't read that file. Pick the GI-Scopes-Import.json file."; return; }
  const before = Store.scopeSnapshot();
  const r = scopeImport(scopeData(), file);
  if (!r.ok) { scopeErr = r.error; return; }
  Store.restoreScopes(r.next);
  scopeErr = null;
  showToast(`Imported ${r.added} case${r.added === 1 ? "" : "s"}${r.staffAdded ? `, ${r.staffAdded} staff` : ""}${r.skipped ? ` (${r.skipped} already here)` : ""}`,
    () => Store.restoreScopes(before));
}
function scopeReadImport(f) {
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => { scopeImportText(String(rd.result || "")); route.keepScroll = true; render(); };
  rd.readAsText(f);
}
// Redrawing replaces the sheets, so their scroll position is carried across:
// tapping a landmark at the bottom of a card never jumps back to the top.
let scopeScrollKeep = null;
function scopeBeforeRender() {
  scopeScrollKeep = null; scopeSentMemo = null;
  if (typeof document.querySelector !== "function") return;
  const sh = document.querySelector(".scopesheet"), pk = document.querySelector(".picklist");
  if (sh || pk) scopeScrollKeep = {sheet: sh ? sh.scrollTop : 0, pick: pk ? pk.scrollTop : 0};
}
// The box grows with what's said, so a whole day stays readable.
function scopeGrow(el) {
  if (!el || !el.style) return;
  el.style.height = "auto";
  el.style.height = Math.min(Math.max(el.scrollHeight, 88), 360) + "px";
}
function scopeAfterRender() {
  const freshSheet = scopeSheetFresh, freshPick = scopePickFresh;
  // The + sheet opens with the keyboard up, one tap from the mic.
  if (scopeSheetFresh && scopeSheet && scopeSheet.kind === "capture" && document.getElementById) {
    const box = document.getElementById("scopebox-sheet");
    if (box && box.focus) try { box.focus({preventScroll: true}); } catch (e) {}
  }
  scopeSheetFresh = false; scopePickFresh = false;
  if (document.querySelectorAll) for (const el of document.querySelectorAll(".capbox")) scopeGrow(el);
  if (route.page === "endo" && scopeTab === "progress") scopeIntroDone = true;
  if (scopeCardsFresh) setTimeout(() => { scopeCardsFresh = false; }, 50);
  if (scopeLit) { const id = scopeLit; setTimeout(() => { if (scopeLit === id) scopeLit = null; }, 1600); }
  if (scopePick && scopePickFresh === false && typeof document.getElementById === "function") {
    const q = document.getElementById("scopepickq");
    if (q && document.activeElement !== q && q.focus && !scopePick.focused) { scopePick.focused = true; try { q.focus({preventScroll: true}); } catch (e) {} }
  }
  // Last, after the box has grown, so the height is final.
  if (scopeScrollKeep && typeof document.querySelector === "function") {
    const sh = document.querySelector(".scopesheet"), pk = document.querySelector(".picklist");
    if (sh && !freshSheet) sh.scrollTop = scopeScrollKeep.sheet;
    if (pk && !freshPick) pk.scrollTop = scopeScrollKeep.pick;
  }
  // A card that can't be saved yet is brought into view.
  if (scopeFocus && typeof document.getElementById === "function") {
    const el = document.getElementById("card-" + scopeFocus);
    if (el && el.scrollIntoView) el.scrollIntoView({block: "center", behavior: scopeReduced() ? "auto" : "smooth"});
    scopeFocus = null;
  }
}

// ---- Week: last week's scopes in the recap -------------------------------------------------------------
function scopeRecapItem(rc) {
  const [n, w] = rc.key.split("-").map(Number);
  const prev = w > 1 ? {num: n, week: w - 1} : n > 1 ? {num: n - 1, week: 4} : null;
  if (!prev) return "";
  const end = weekEnd(prev.num, prev.week), start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6);
  const wk = scopeWeek(scopeData().cases, fmtDate(start), fmtDate(end));
  if (!wk.n) return "";
  return `<li>${ic("endo")}<span>Scopes last week: <b>${wk.procs}</b>${wk.furthest ? ` · furthest colon: <b>${esc(scopeReachLabel(wk.furthest).toLowerCase())}</b>` : ""}</span></li>`;
}
