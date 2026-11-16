"use strict";
// GI Hub Year 1 so far: the year's scopes, EPAs and reading on one sheet,
// open any time and named the year in review once June 30 comes. It saves
// as a picture through the share sheet. Full app only.
// Loaded after scope-report.js (scopeShareFile) and before app.js; the view
// uses app.js helpers (esc, ic, Store, tally, showToast, render) when it runs.

const REVIEW_YEAR = {n: 1, from: "2026-07-01", to: "2027-06-30", span: "July 2026 to June 2027"};
let reviewSheet = null, reviewFresh = false, reviewErr = null;

// ---- For your CV -------------------------------------------------------------------------------
// Your own talks, abstracts and posters, papers and teaching, kept as they
// happen so the CV has a list to copy from. Each: {id, k (kind), t (what),
// d (day), w (where or for whom), n (a note: submitted, first author), ts}.
// In the saved state, so it goes in the backup. Full app only.
const WORK_KINDS = [["talk", "Talk", "Talks"], ["abstract", "Abstract or poster", "Abstracts and posters"], ["paper", "Paper", "Papers"],
  ["teach", "Teaching", "Teaching"], ["other", "Other", "Other"]];
const WORK_T_MAX = 200, WORK_W_MAX = 120, WORK_N_MAX = 200;
let workSheet = null, workFresh = false, workShow = null;
function workClean(raw) {
  const out = [], taken = new Set();
  for (const x of Array.isArray(raw) ? raw : []) {
    const t = x && typeof x.t === "string" ? x.t.trim().slice(0, WORK_T_MAX) : "";
    if (!t || typeof x.d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x.d)) continue;
    let id = typeof x.id === "string" && /^w[a-z0-9]{1,24}$/.test(x.id) ? x.id : "";
    if (!id || taken.has(id)) id = workNewId(taken);
    taken.add(id);
    out.push({id, k: WORK_KINDS.some(w => w[0] === x.k) ? x.k : "other", t, d: x.d,
      w: typeof x.w === "string" ? x.w.trim().slice(0, WORK_W_MAX) : "", n: typeof x.n === "string" ? x.n.trim().slice(0, WORK_N_MAX) : "",
      ts: typeof x.ts === "string" ? x.ts : ""});
  }
  return out;
}
function workNewId(taken) {
  let id;
  do id = "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); while (taken.has(id));
  return id;
}
const workList = () => (Store.state.work || []).slice().sort((a, b) => b.d.localeCompare(a.d) || b.ts.localeCompare(a.ts));
const workKindName = k => (WORK_KINDS.find(w => w[0] === k) || WORK_KINDS[4])[1];
const workDay = iso => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
// The list as text for a CV: by kind, newest first, one line each.
function workText(list = workList()) {
  return WORK_KINDS.map(([k, , head]) => {
    const xs = list.filter(x => x.k === k);
    return xs.length ? head + "\n" + xs.map(x => "- " + [x.t, x.w, workDay(x.d), x.n].filter(Boolean).join(". ") + ".").join("\n") : "";
  }).filter(Boolean).join("\n\n");
}
function workSectionHTML() {
  const list = workList();
  const rows = list.map(x => `<button class="cv-row" data-action="reviewworkopen" data-id="${x.id}"><span class="cv-t"><b>${esc(x.t)}</b>` +
    `<span>${esc([workKindName(x.k), x.w, x.n].filter(Boolean).join(" · "))}</span></span><span class="mono cv-d">${esc(workDay(x.d))}</span></button>`).join("");
  return `<div class="yrv-g"><div class="mono yrv-gh cv-gh"><span>For your CV</span>${list.length ? `<span>${list.length}</span>` : ""}</div>` +
    `<div class="card list yrv-list cv-list">${rows || `<p class="cv-empty">Talks, abstracts and posters, papers and teaching you've done. Add each one as it happens, and Copy gives you the list to paste into your CV.</p>`}</div>` +
    `<div class="cv-acts"><button class="btn" data-action="reviewworknew">${ic("plus")}Add</button>` +
    (list.length ? `<button class="btn" data-action="reviewworkcopy">${ic("copy")}Copy for your CV</button>` : "") + `</div>` +
    `<button class="textbtn cv-paste" data-action="reviewworkpaste">Paste a list</button>` +
    (workShow ? `<textarea class="cv-show mono" readonly rows="6" aria-label="Your CV list">${esc(workShow)}</textarea>` : "") + `</div>`;
}
function workOpen(id) {
  const x = id ? (Store.state.work || []).find(w => w.id === id) : null;
  workSheet = x ? {mode: "edit", id, k: x.k, t: x.t, d: x.d, w: x.w, n: x.n, err: null}
    : {mode: "new", k: "talk", t: "", d: fmtDate(getToday()), w: "", n: "", err: null};
  workFresh = true;
}
function workSheetHTML() {
  const s = workSheet, edit = s.mode === "edit", fresh = workFresh ? " fresh" : "", title = edit ? "Edit" : s.mode === "paste" ? "Paste a list" : "Add to your CV list";
  if (s.mode === "paste") {
    return `<div class="scrim top${fresh}" data-action="reviewworkclose"></div><div class="sheet worksheet${fresh}" role="dialog" aria-modal="true" aria-label="${title}">` +
      `<div class="grab"></div><div class="shead"><b>${title}</b><button class="iconbtn" data-action="reviewworkclose" aria-label="Close">${ic("x")}</button></div>` +
      `<p class="ssub">One per line, the way Copy writes them: What. Where. 5 Oct 2026. Note. Lines under a heading like Talks or Papers go in that group.</p>` +
      `<textarea class="cv-paste-box" rows="9" data-work="text" aria-label="Your list" autocapitalize="sentences" placeholder="Talks&#10;- A talk title. GI rounds. 5 Oct 2026.">${esc(s.text)}</textarea>` +
      `<p class="cv-count mono" id="workcount" aria-live="polite">${esc(s.text.trim() ? workPasteWords(workPasteSummary(s.text)) : "")}</p>` +
      (s.err ? `<div class="err" role="alert">${esc(s.err)}</div>` : "") +
      `<div class="sactions"><button class="btn primary" data-action="reviewworkpastesave">Add them</button></div></div>`;
  }
  const chip = ([k, label]) => `<button class="pick ghost${s.k === k ? " on" : ""}" data-action="reviewworkkind" data-k="${k}" aria-pressed="${s.k === k}">${label}</button>`;
  return `<div class="scrim top${fresh}" data-action="reviewworkclose"></div><div class="sheet worksheet${fresh}" role="dialog" aria-modal="true" aria-label="${title}">` +
    `<div class="grab"></div><div class="shead"><b>${title}</b><button class="iconbtn" data-action="reviewworkclose" aria-label="Close">${ic("x")}</button></div>` +
    `<div class="pickrow">${WORK_KINDS.map(chip).join("")}</div>` +
    `<label class="lbl mono">What<input type="text" value="${esc(s.t)}" data-work="t" placeholder="Title of the talk, abstract or paper" autocapitalize="sentences"></label>` +
    `<label class="lbl mono">Day<input type="date" value="${esc(s.d)}" data-work="d"></label>` +
    `<label class="lbl mono">Where or for whom<input type="text" value="${esc(s.w)}" data-work="w" placeholder="GI rounds, CDDW 2027, the journal, med students" autocapitalize="sentences"></label>` +
    `<label class="lbl mono">Note<input type="text" value="${esc(s.n)}" data-work="n" placeholder="Submitted, accepted as a poster, first author" autocapitalize="sentences"></label>` +
    (s.err ? `<div class="err" role="alert">${esc(s.err)}</div>` : "") +
    `<div class="sactions">${edit ? `<button class="btn danger" data-action="reviewworkdel">Delete</button>` : ""}` +
    `<button class="btn primary" data-action="reviewworksave">${edit ? "Save" : "Add"}</button></div></div>`;
}
// Typing keeps the words; nothing redraws.
function workField(t) {
  const f = t && t.dataset && t.dataset.work;
  if (!f || !workSheet) return false;
  workSheet[f] = t.value;
  const c = f === "text" && typeof document !== "undefined" && document.getElementById ? document.getElementById("workcount") : null;
  if (c) c.textContent = t.value.trim() ? workPasteWords(workPasteSummary(t.value)) : "";
  return true;
}
function workSave() {
  const s = workSheet, t = s.t.trim();
  if (!t) { s.err = "Give it a title first."; return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.d || "")) { s.err = "Pick a day."; return; }
  const before = JSON.parse(JSON.stringify(Store.state.work || [])), list = Store.state.work || (Store.state.work = []);
  if (s.mode === "edit") { const x = list.find(w => w.id === s.id); if (x) Object.assign(x, {k: s.k, t, d: s.d, w: s.w.trim(), n: s.n.trim()}); }
  else list.push({id: workNewId(new Set(list.map(w => w.id))), k: s.k, t, d: s.d, w: s.w.trim(), n: s.n.trim(), ts: new Date().toISOString()});
  Store.state.work = workClean(list); Store.save();
  showToast(s.mode === "edit" ? "Changes saved" : "Added to your CV list", () => { Store.state.work = before; Store.save(); });
  workSheet = null; workShow = null;
}
// ---- Paste a list ---------------------------------------------------------------------------------
// Lines the way Copy writes them ("- What. Where. 5 Oct 2026. Note."), under
// the kind headings. The day can also be "Oct 5, 2026", 2026-10-05, or "23 Nov"
// (this year, or last year when that would be months ahead). The bit just
// before the day is Where, so a title can hold a full stop ("A vs. B"). A line
// with no day is left out, and so is one already on the list.
const WORK_MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WORK_HEADS = [["talk", /^(?:talks?|presentations?)$/], ["abstract", /^(?:abstracts?(?: and posters?)?|posters?)$/],
  ["paper", /^(?:papers?|publications?)$/], ["teach", /^teaching$/], ["other", /^others?$/]];
const WORK_BULLET = /^(?:[-•*]|\d+[.)])\s+/;
function workDayOf(s, today) {
  const t = String(s).trim().replace(/\.$/, "").toLowerCase();
  let m, d, mo, y = null;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t))) { y = +m[1]; mo = +m[2] - 1; d = +m[3]; }
  else if ((m = /^(\d{1,2}) ([a-z]{3})[a-z]*,? ?(\d{4})?$/.exec(t))) { d = +m[1]; mo = WORK_MON.indexOf(m[2]); y = m[3] ? +m[3] : null; }
  else if ((m = /^([a-z]{3})[a-z]* (\d{1,2}),? ?(\d{4})?$/.exec(t))) { d = +m[2]; mo = WORK_MON.indexOf(m[1]); y = m[3] ? +m[3] : null; }
  else return null;
  if (mo < 0) return null;
  if (y === null) { y = today.getFullYear(); if (new Date(y, mo, d) - today > 270 * 864e5) y--; }
  const at = new Date(y, mo, d);
  return at.getFullYear() === y && at.getMonth() === mo && at.getDate() === d ? fmtDate(at) : null;
}
function workParse(text, today = getToday()) {
  const items = [], seen = new Set();
  let k = "other", skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = WORK_BULLET.test(line), body = line.replace(WORK_BULLET, "");
    const head = !bullet && WORK_HEADS.find(([, rx]) => rx.test(body.toLowerCase().replace(/:$/, "")));
    if (head) { k = head[0]; continue; }
    const parts = body.split(/\.\s+/).map(p => p.trim().replace(/\.$/, "")).filter(Boolean);
    const di = parts.findIndex((p, i) => i > 0 && workDayOf(p, today));
    if (di < 1) { skipped++; continue; }
    const x = {k, t: (di > 1 ? parts.slice(0, di - 1) : parts.slice(0, 1)).join(". "), d: workDayOf(parts[di], today),
      w: di > 1 ? parts[di - 1] : "", n: parts.slice(di + 1).join(". ")};
    const key = x.t.toLowerCase() + "|" + x.d;
    if (!seen.has(key)) { seen.add(key); items.push(x); }
  }
  return {items, skipped};
}
function workPasteSummary(text) {
  const p = workParse(text), have = new Set((Store.state.work || []).map(w => w.t.toLowerCase() + "|" + w.d));
  const fresh = p.items.filter(x => !have.has(x.t.toLowerCase() + "|" + x.d));
  return {fresh, skipped: p.skipped, dup: p.items.length - fresh.length};
}
function workPasteWords(s) {
  const bits = [`${s.fresh.length} to add`];
  if (s.dup) bits.push(`${s.dup} already on the list`);
  if (s.skipped) bits.push(`${s.skipped} line${s.skipped === 1 ? "" : "s"} with no day, left out`);
  return bits.join(" · ");
}
function workPasteSave() {
  const s = workPasteSummary(workSheet.text);
  if (!s.fresh.length) { workSheet.err = "Nothing new to add. Each line needs a day, like 5 Oct 2026."; return; }
  const before = JSON.parse(JSON.stringify(Store.state.work || [])), list = Store.state.work || (Store.state.work = []), ts = new Date().toISOString();
  for (const x of s.fresh) list.push({id: workNewId(new Set(list.map(w => w.id))), ...x, ts});
  Store.state.work = workClean(list); Store.save();
  showToast(`Added ${s.fresh.length} to your CV list`, () => { Store.state.work = before; Store.save(); });
  workSheet = null; workShow = null;
}
function workCopy() {
  const text = workText(), redraw = () => { route.keepScroll = true; render(); };
  try {
    navigator.clipboard.writeText(text).then(() => { workShow = null; showToast("Copied: paste it into your CV"); redraw(); }, () => { workShow = text; redraw(); });
  } catch (e) { workShow = text; }
}

// ---- The numbers ----------------------------------------------------------------------------
function reviewYear(st, today) {
  const Y = REVIEW_YEAR, t = fmtDate(today), over = t >= Y.to, to = over ? Y.to : t;
  const sc = st.scopes || {}, all = (sc.cases || []).filter(c => scopeIn(c, Y.from, to)).slice().sort(scopeByDate);
  const famsN = c => scopeFams(c).length;
  const months = [];
  for (let k = 0; k < 12; k++) {
    const m = new Date(2026, 6 + k, 1), key = fmtDate(m).slice(0, 7);
    months.push({label: MONTHS[m.getMonth()], key, n: all.filter(c => c.d.slice(0, 7) === key).reduce((a, c) => a + famsN(c), 0), future: key > to.slice(0, 7)});
  }
  // Colonoscopies you drove, in order: the cecum, the first time, the longest run.
  const series = scopeReachSeries(all);
  let run = 0, bestRun = {n: 0, d: null};
  for (const x of series) { run = x.rank >= 5 ? run + 1 : 0; if (run > bestRun.n) bestRun = {n: run, d: x.d}; }
  const perDay = {};
  for (const c of all) perDay[c.d] = (perDay[c.d] || 0) + famsN(c);
  let busiest = null;
  for (const d of Object.keys(perDay).sort()) if (!busiest || perDay[d] > busiest.n) busiest = {n: perDay[d], d};
  const lists = {};
  for (const c of all) if (c.staff) (lists[c.staff] ||= new Set()).add(c.d);
  let mostWith = null;
  for (const id in lists) {
    const p = (sc.staff || []).find(x => x.id === id), n = lists[id].size;
    if (p && (!mostWith || n > mostWith.n)) mostWith = {name: String(p.name || "").split(",")[0].trim(), n};
  }
  const egds = all.filter(c => (c.procs || []).includes("egd.dx")), ans = egds.filter(c => scopeD2Ok(c.d2));
  // EPAs as the dial counts them; reading as the Study tab does.
  const ep = tally(PARTS), stage = currentStage();
  const sd = st.study || {}, log = sd.log || {}, qa = sd.qa || {};
  let pages = 0, nights = 0;
  for (const d of Object.keys(log).sort()) {
    if (d > to) break;
    if (log[d] > pages) { if (d >= Y.from) nights++; pages = log[d]; }
  }
  return {
    title: `Year ${Y.n} ${over ? "in review" : "so far"}`, over, to,
    span: over ? Y.span : `July 2026 to ${today.getDate()} ${MONTHS[today.getMonth()]}`,
    day: Math.round((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(2026, 6, 1)) / 864e5) + 1,
    procs: all.reduce((a, c) => a + famsN(c), 0), months,
    colos: series.length, cecum: series.filter(x => x.rank >= 5).length, firstCecum: (series.find(x => x.rank >= 5) || {}).d || null, bestRun,
    busiest, scopeDays: Object.keys(perDay).length, mostWith, tx: all.filter(scopeIsTherapeutic).length,
    d2: {yes: ans.filter(c => c.d2 === "yes").length, of: ans.length, left: egds.length - ans.length},
    epas: {req: ep.req, logged: ep.logged, approved: ep.approved, stage: stage ? STAGE_NAMES[stage] : "All logged"},
    study: {pages, total: studySeq().total, nights, answered: Object.keys(qa).length, right: Object.values(qa).filter(x => x && x.ok).length},
  };
}
const reviewDay = iso => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]}`; };
const reviewPct = (k, n) => n ? Math.round(k / n * 100) + "%" : "";

// ---- The sheet ----------------------------------------------------------------------------------
function reviewOpen() { reviewSheet = {}; reviewFresh = true; reviewErr = null; }
// The rows, shared by the sheet and the picture (which leaves out staff names).
function reviewRows(y, o = {}) {
  const endo = [["Colonoscopies", String(y.colos)]];
  if (y.colos) endo.push(["To the cecum yourself", `${y.cecum} of ${y.colos} · ${reviewPct(y.cecum, y.colos)}`]);
  if (y.firstCecum) endo.push(["First cecum yourself", reviewDay(y.firstCecum)]);
  if (y.bestRun.n) endo.push(["Best run to the cecum", `${y.bestRun.n} in a row`]);
  if (y.d2.of) endo.push(["D2 yourself", `${y.d2.yes} of ${y.d2.of}`]);
  endo.push(["Therapeutic cases", String(y.tx)]);
  if (y.busiest) endo.push(["Busiest list", `${y.busiest.n} on ${reviewDay(y.busiest.d)}`]);
  endo.push(["Scope days", String(y.scopeDays)]);
  if (y.mostWith && !o.noStaff) endo.push(["Most lists with", `${y.mostWith.name} · ${y.mostWith.n}`]);
  const epas = [["Logged", `${y.epas.logged} of ${y.epas.req}`], ["Approved", String(y.epas.approved)], ["Stage now", y.epas.stage]];
  const read = [["Pages read", `${y.study.pages} of ${y.study.total}`], ["Reading nights", String(y.study.nights)]];
  if (y.study.answered) read.push(["Questions", `${y.study.answered} · ${reviewPct(y.study.right, y.study.answered)} right`]);
  return [["Endoscopy", endo], ["EPAs", epas], ["Reading", read]];
}
function reviewSheetHTML() {
  const y = reviewYear(Store.state, getToday()), fresh = reviewFresh ? " fresh" : "";
  const max = Math.max(1, ...y.months.map(m => m.n));
  const bars = y.months.map(m => `<div class="yrv-bar${m.future ? " fut" : ""}"><span class="yrv-track">` +
    `<i style="height:${m.future ? 0 : Math.max(m.n ? 6 : 0, Math.round(m.n / max * 100))}%"></i></span><span class="yrv-m">${m.label[0]}</span>` +
    `${m.n ? `<span class="yrv-n">${m.n}</span>` : ""}</div>`).join("");
  const hero = [[y.procs, "procedures"], [y.epas.logged, "EPA forms"], [y.study.pages, "pages read"]]
    .map(([n, l]) => `<div><b>${n}</b><span class="mono">${l}</span></div>`).join("");
  const groups = reviewRows(y).map(([h, rows]) => `<div class="yrv-g"><div class="mono yrv-gh">${h}</div><div class="card list yrv-list">` +
    rows.map(([l, v]) => `<div class="yrv-row"><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join("") + `</div></div>`).join("");
  const notes = [y.d2.of && y.d2.left ? `D2 counts answered EGDs only: ${y.d2.left} not recorded, left out.` : "",
    y.over ? "" : "This becomes Year 1 in review on 30 June."].filter(Boolean).join(" ");
  return `<div class="scrim${fresh}" data-action="reviewclose"></div>` +
    `<div class="sheet yrvsheet${fresh}" role="dialog" aria-modal="true" aria-label="${esc(y.title)}"><div class="grab"></div>` +
    `<div class="shead"><b>${esc(y.title)}</b><button class="iconbtn" data-action="reviewclose" aria-label="Close">${ic("x")}</button></div>` +
    `<p class="yrv-span mono">${esc(y.span)}${y.over ? "" : ` · day ${y.day} of 365`}</p>` +
    `<div class="yrv-hero">${hero}</div>` +
    `<div class="card pad yrv-months"><div class="mono yrv-gh">Procedures by month</div><div class="yrv-bars" aria-hidden="true">${bars}</div></div>` +
    groups + workSectionHTML() + (notes ? `<p class="yrv-note">${esc(notes)}</p>` : "") +
    `<button class="btn primary" data-action="reviewsave">${ic("share")}Save as image</button>` +
    `<p class="bnote">A picture of this page for your phone's photos. Staff names stay off it.</p>` +
    (reviewErr ? `<div class="err">${esc(reviewErr)}</div>` : "") + `</div>`;
}
// The way in from the Year plan.
function reviewEntryHTML() {
  if (FELLOWS) return "";
  const y = reviewYear(Store.state, getToday());
  return `<button class="card yrv-entry" data-action="reviewopen"><span class="yrv-et"><span class="mono">${esc(y.span)}</span><b>${esc(y.title)}</b>` +
    `<span class="yrv-es">${y.procs} procedures · ${y.epas.logged} EPA forms · ${y.study.pages} pages</span></span>${ic("chev", "chev")}</button>`;
}

// ---- The picture ---------------------------------------------------------------------------------
const REVIEW_INK = {bg: "#0d0b1f", light: "#f5f2ff", dim: "#b3aed0", faint: "#8781a8", nbi: "#d58cff", fold: "rgba(255,255,255,0.10)", wall: "rgba(255,255,255,0.055)"};
function reviewDraw(ctx, y, W, H) {
  const I = REVIEW_INK, F = (w, px) => `${w} ${px}px Outfit, -apple-system, system-ui, sans-serif`, M = 80;
  const grad = (g, stops, fallback) => { if (!g || !g.addColorStop) return fallback; for (const [o, c] of stops) g.addColorStop(o, c); return g; };
  const text = (s, x, yy, font, color, align = "left") => { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "alphabetic"; ctx.fillText(s, x, yy); };
  const box = (x, yy, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, yy); ctx.arcTo(x + w, yy, x + w, yy + h, r); ctx.arcTo(x + w, yy + h, x, yy + h, r);
    ctx.arcTo(x, yy + h, x, yy, r); ctx.arcTo(x, yy, x + w, yy, r); ctx.closePath(); };
  ctx.fillStyle = I.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = grad(ctx.createRadialGradient && ctx.createRadialGradient(220, 120, 0, 220, 120, 900), [[0, "rgba(139,108,255,0.38)"], [1, "rgba(13,11,31,0)"]], I.bg); ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = grad(ctx.createRadialGradient && ctx.createRadialGradient(W - 120, H - 60, 0, W - 120, H - 60, 700), [[0, "rgba(255,142,107,0.20)"], [1, "rgba(13,11,31,0)"]], I.bg); ctx.fillRect(0, 0, W, H);
  const name = (Store.state.scopes && Store.state.scopes.reportName || "").trim();
  text((name || "Adult gastroenterology").toUpperCase(), M, 118, F(500, 26), I.nbi);
  text(y.title, M, 206, F(600, 86), I.light);
  text(y.over ? y.span : `${y.span} · day ${y.day} of 365`, M, 262, F(400, 34), I.dim);
  // Three big numbers.
  const cw = (W - 2 * M) / 3;
  [[y.procs, "procedures"], [y.epas.logged, "EPA forms"], [y.study.pages, "pages read"]].forEach(([n, l], k) => {
    text(String(n), M + k * cw, 410, F(300, 124), I.light);
    text(l, M + k * cw + 4, 458, F(500, 28), I.dim);
  });
  // Procedures by month.
  const top = 520, bh = 190, bw = (W - 2 * M) / 12, max = Math.max(1, ...y.months.map(m => m.n));
  box(M - 24, top - 24, W - 2 * M + 48, bh + 120, 28); ctx.fillStyle = I.wall; ctx.fill();
  text("Procedures by month", M, top + 18, F(500, 26), I.dim);
  const base = top + bh + 20, trackH = bh - 50;
  y.months.forEach((m, k) => {
    const x = M + k * bw + bw * .18, w = bw * .64, h = m.future ? 0 : Math.max(m.n ? 8 : 0, m.n / max * trackH);
    box(x, base - trackH, w, trackH, 8); ctx.fillStyle = m.future ? "rgba(255,255,255,0.03)" : I.fold; ctx.fill();
    if (h) { box(x, base - h, w, h, 8); ctx.fillStyle = grad(ctx.createLinearGradient && ctx.createLinearGradient(0, base - h, 0, base),
      [[0, "#e063d3"], [1, "#8b6cff"]], I.nbi); ctx.fill(); }
    text(m.label[0], x + w / 2, base + 42, F(500, 24), m.future ? I.faint : I.dim, "center");
  });
  // Two columns of the year's lines (no staff names on a picture).
  const rows = reviewRows(y, {noStaff: true});
  const pick = (g, l) => (rows.find(r => r[0] === g)[1].find(r => r[0] === l) || null);
  const left = [pick("Endoscopy", "To the cecum yourself"), pick("Endoscopy", "Best run to the cecum"), pick("Endoscopy", "D2 yourself"), pick("Endoscopy", "Therapeutic cases")].filter(Boolean);
  const right = [pick("Endoscopy", "Scope days"), pick("EPAs", "Stage now"), pick("Reading", "Reading nights"), pick("Reading", "Questions")].filter(Boolean);
  const col = (list, x) => list.slice(0, 4).forEach(([l, v], k) => {
    const yy = 900 + k * 98;
    text(l, x, yy, F(400, 26), I.dim);
    text(v, x, yy + 44, F(500, 38), I.light);
  });
  col(left, M); col(right, M + (W - 2 * M) / 2 + 20);
  text("GI Hub · no patient identifiers", W - M, H - 44, F(400, 22), I.faint, "right");
}
async function reviewSave() {
  reviewErr = null;
  try {
    const y = reviewYear(Store.state, getToday());
    if (document.fonts && document.fonts.load) await Promise.all(["300 124px Outfit", "500 38px Outfit", "600 86px Outfit"].map(f => document.fonts.load(f).catch(() => null)));
    const c = document.createElement("canvas");
    c.width = 1080; c.height = 1350;
    reviewDraw(c.getContext("2d"), y, c.width, c.height);
    const blob = await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error("no image")), "image/png"));
    const ok = await scopeShareFile(blob, `GI-Hub-year-${REVIEW_YEAR.n}-${y.over ? "in-review" : "so-far"}-${fmtDate(getToday())}.png`, "image/png", y.title);
    if (ok) showToast("Image ready");
  } catch (e) { console.error(e); reviewErr = "Couldn't make the image. Try again."; }
  route.keepScroll = true; render();
}

// ---- Taps --------------------------------------------------------------------------------------------
// Returns false when it redraws by itself.
function reviewDispatch(act, d = {}) {
  if (act === "reviewopen") reviewOpen();
  else if (act === "reviewclose") { reviewSheet = null; reviewErr = null; workShow = null; }
  else if (act === "reviewsave") { reviewSave(); return false; }
  else if (act === "reviewworknew") workOpen(null);
  else if (act === "reviewworkpaste") { workSheet = {mode: "paste", text: "", err: null}; workFresh = true; }
  else if (act === "reviewworkpastesave" && workSheet && workSheet.mode === "paste") workPasteSave();
  else if (act === "reviewworkopen") workOpen(d.id);
  else if (act === "reviewworkkind" && workSheet && WORK_KINDS.some(w => w[0] === d.k)) workSheet.k = d.k;
  else if (act === "reviewworksave" && workSheet) workSave();
  else if (act === "reviewworkclose") workSheet = null;
  else if (act === "reviewworkdel" && workSheet) {
    const before = JSON.parse(JSON.stringify(Store.state.work || []));
    Store.state.work = (Store.state.work || []).filter(w => w.id !== workSheet.id); Store.save();
    workSheet = null; workShow = null;
    showToast("Deleted from your CV list", () => { Store.state.work = before; Store.save(); });
  }
  else if (act === "reviewworkcopy") { workCopy(); return false; }
}
function reviewAfterRender() { reviewFresh = false; workFresh = false; }
