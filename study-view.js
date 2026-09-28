"use strict";
// GI Hub study: the Study tab, the Tonight card on Week, and the study sheets.
// The Study tab reads under fluorescein: what you have read glows the same
// yellow-green as the highlighter you read with, and each page of the book is
// drawn as a pit, so the book fills in like a stained mucosal surface.
// Loaded after study.js and before app.js; the views use app.js helpers (esc,
// ic, Store, showToast, render) when they run, never while this file loads.

let studySheet = null, studySheetFresh = false, studyStain = null, studyIntroDone = false;
const STUDY_WHY = {thu: "Thursday: soccer night.", weekend: "The weekend.", call: "You're on call tonight.",
  pause: "Reading is paused.", after: "Year 1 is over.", before: "The plan starts Wednesday."};

const studyDay = d => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
const studyStretchList = () => callStretches(CallStore.list());
function studyState() {
  const today = getToday(), s = Store.state.study, str = studyStretchList();
  return {today, s, str, t: studyTonight(today, s, str)};
}
// "Ch 3" and a title for run indices [from, to); two chapters read as one line.
function studyWhat(from, to) {
  const pc = studyPieces(from, to), items = pc.map(x => x.item).filter((v, i, a) => a.indexOf(v) === i);
  return {lbl: items.map(studyItemLabel).join(" → "), title: items.map(it => it.title).join(", then "), items};
}
const studyPages = n => n + (n === 1 ? " page" : " pages");
function studyDeltaLabel(dl) {
  if (Math.abs(dl) <= 1) return {txt: "On plan", cls: "ok"};
  return dl > 0 ? {txt: dl + " ahead", cls: "ok"} : {txt: -dl + " behind", cls: "warn"};
}
// The pages of one item as pits. lit: read; tn: tonight's; pale: the rest.
function studyPitsHTML(it, cur, tn, opts = {}) {
  const a = studyItemStart(it);
  let h = "";
  for (let k = 0; k < it.n; k++) {
    const i = a + k, lit = i < cur, isTn = tn && i >= tn.from && i < tn.to;
    const stain = studyStain && i >= studyStain.from && i < studyStain.to;
    h += `<i class="pit${lit ? " lit" : ""}${isTn && !lit ? " tn" : ""}${stain ? " stain" : ""}"` +
      ` style="--k:${stain ? i - studyStain.from : k}"></i>`;
  }
  return `<div class="pitrow${opts.cls ? " " + opts.cls : ""}"><span class="pr-l mono">${studyItemLabel(it)}</span>` +
    `<div class="pits-in">${h}</div><span class="pr-r mono">${it.p[0]}–${it.p[1]}</span></div>`;
}

// ---- Tonight: the hero ---------------------------------------------------------------
function studyHeroHTML(st) {
  const {today, s, str, t} = st, S = studySeq();
  const b = Math.min(12, Math.max(4, t.block || 12)), blk = blockFor(today);
  const bRead = Math.max(0, Math.min(t.now, studyDue(b)) - studyDue(b - 1)), bPages = studyDue(b) - studyDue(b - 1);
  const dl = studyDeltaLabel(studyPlanDelta(today, s, str));
  const top = t.kind === "before" ? `Starts ${studyDay(STUDY_START)}` : (t.kind === "read" ? "Tonight · " : "") + studyDay(today);
  const wk = blk ? `Blk ${blk.num} · Wk ${blk.week}` : "Year 1";
  let body = "", strip = null, tn = null;
  const range = (from, to) => { const pp = studyPP(from, to);
    return `<div class="sm-pp${pp.length > 7 ? " long" : ""}"><span class="mono">pp.</span><b>${pp}</b></div>`; };
  if (t.kind === "complete") {
    body = `<div class="sm-done">${ic("check")}</div><div class="sm-title">Mayo, pass 1: read</div>` +
      `<div class="sm-sub">All ${S.total} pages. Questions next: DDSEP round 1.</div>`;
  } else if (t.kind === "read" && !t.ahead && !t.done) {
    const w = studyWhat(t.from, t.to);
    body = `<div class="sm-ch mono">${w.lbl}</div><div class="sm-title">${esc(w.title)}</div>` + range(t.from, t.to) +
      `<div class="sm-sub">${studyPages(t.n)} · PDF ${studyPdfPP(t.from, t.to)}` +
      (t.partial ? ` · <span class="flu">read to p. ${studyAt(t.now - 1).page}</span>` : "") + `</div>`;
    strip = w.items; tn = {from: t.from, to: t.to};
  } else if (t.kind === "read" && t.done) {
    const last = studyAt(Math.max(0, t.now - 1));
    body = `<div class="sm-done">${ic("check")}</div><div class="sm-title">Done for tonight</div>` +
      `<div class="sm-sub">Read through p. ${last.page}, ${studyItemLabel(last.item)}.</div>` +
      (t.next ? `<div class="sm-next mono">Next · ${studyDay(t.next.day)} · pp. ${studyPP(t.next.from, t.next.to)}</div>` : "");
    strip = studyWhat(t.from, t.to).items;
  } else if (t.ahead) {
    body = `<div class="sm-ch mono">Ahead of plan</div><div class="sm-title">Block ${b}'s pages are read</div>` +
      `<div class="sm-sub">Take the night off, or keep going:</div>` + (t.keep ? range(t.keep.from, t.keep.to) : "");
    if (t.keep) { strip = studyWhat(t.keep.from, t.keep.to).items; tn = t.keep; }
  } else {
    const why = t.kind === "pause" ? studyPauseWhy(s, today) : STUDY_WHY[t.kind] || "";
    body = t.kind === "before"
      ? `<div class="sm-ch mono">First night · ${studyDay(STUDY_START)}</div><div class="sm-title">${esc(studyWhat(t.keep.from, t.keep.to).title)}</div>` +
        range(t.keep.from, t.keep.to) + `<div class="sm-sub">${studyPages(t.keep.to - t.keep.from)} · PDF ${studyPdfPP(t.keep.from, t.keep.to)}</div>`
      : `<div class="sm-ch mono">${ic("moon", "sm")}Night off</div><div class="sm-title">${esc(why)}</div>` +
        (t.keep ? `<div class="sm-sub">Reading anyway? Next up:</div>` + range(t.keep.from, t.keep.to) : "") +
        (t.next ? `<div class="sm-next mono">Next reading night · ${studyDay(t.next.day)}</div>` : "");
    if (t.keep) { strip = studyWhat(t.keep.from, t.keep.to).items; tn = t.keep; }
  }
  const intro = !studyIntroDone ? " intro" : "";
  const strips = strip ? `<div class="sm-strips${intro}">` + strip.slice(0, 3).map(it => studyPitsHTML(it, t.now, tn)).join("") + `</div>` : "";
  const foot = t.kind === "complete" ? `<span>${S.total} of ${S.total}</span><span class="ok">Done</span>` :
    `<span>${bRead} of ${bPages} · Block ${b}</span><span class="${dl.cls}">${dl.txt}</span>`;
  return `<section class="monitor studymon${t.done || t.kind === "complete" ? " is-done" : ""}" aria-label="Tonight's reading">` +
    `<div class="monitor-in"><div class="ov mono"><span>${top}</span><span>${wk}</span></div>` +
    `<div class="sm-body">${body}</div>${strips}<div class="ov mono sm-foot">${foot}</div></div></section>` + studyActionsHTML(t);
}
function studyPauseWhy(s, today) {
  const k = fmtDate(today), p = s.pauses.find(x => x.a <= k && k <= x.b);
  if (!p) return "Reading is paused.";
  const [y, m, d] = p.b.split("-").map(Number), end = new Date(y, m - 1, d + 1);
  return `Paused until ${studyDay(end)}.`;
}
function studyActionsHTML(t) {
  if (t.kind === "complete" || t.kind === "after") return "";
  const stop = `<button class="btn" data-action="studystop">${ic("more")}Stopped somewhere else</button>`;
  if (t.kind === "read" && !t.ahead && !t.done)
    return `<div class="sm-acts"><button class="btn flu" data-action="studydone">${ic("check")}Done · through p. ${studyAt(t.to - 1).page}</button>${stop}</div>`;
  if (t.kind === "read" && t.done)
    return `<div class="sm-acts"><button class="btn" data-action="studystop">${ic("plus")}I read more</button></div>`;
  if (t.keep)
    return `<div class="sm-acts"><button class="btn fluline" data-action="studyread" data-to="${t.keep.to}">${ic("check")}I read pp. ${studyPP(t.keep.from, t.keep.to)}</button>${stop}</div>`;
  return `<div class="sm-acts">${stop}</div>`;
}

// ---- A finished question set asks for its score ----------------------------------------
function studyScoreAskHTML(s) {
  const it = studyNeedsScore(s);
  if (!it) return "";
  return `<section class="card scoreask">${ic("target")}<div><b>${esc(it.title)} done</b>` +
    `<span>How many did you get right? It marks weak sections for Year 2.</span></div>` +
    `<button class="pillbtn flu" data-action="studyscore" data-id="${it.id}">Score</button></section>`;
}

// ---- Nights: the block as 4 weeks --------------------------------------------------------
function studyNightsHTML(st) {
  const {today, s, str, t} = st, b = Math.min(13, Math.max(4, t.block || 13));
  const nights = studyNights(b, today, s, str);
  const heads = ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"].map(d => `<span>${d}</span>`).join("");
  let rows = "";
  for (let w = 0; w < 4; w++) {
    rows += `<div class="ng-row"><span class="ng-wk mono">Wk ${w + 1}</span>`;
    for (let k = 0; k < 7; k++) {
      const x = nights[w * 7 + k], cls = `ng k-${x.kind} s-${x.state}${x.state === "today" && t.done ? " tdone" : ""}`;
      let mark = "";
      if (x.state === "done" || (x.state === "today" && t.done)) mark = ic("check");
      else if (x.kind === "read" && x.pages) mark = `<b>${x.pages}</b>`;
      else if (x.kind === "call") mark = `<span class="ng-call"></span>`;
      else if (x.state === "extra") mark = `<span class="ng-dot"></span>`;
      rows += `<div class="${cls}" title="${studyDay(x.date)}"><span class="ng-d">${x.date.getDate()}</span>${mark}</div>`;
    }
    rows += `</div>`;
  }
  const legend = `<div class="ng-legend mono"><span><i class="lg read"></i>Pages planned</span><span><i class="lg done"></i>Read</span>` +
    `<span><i class="lg call"></i>Call</span><span><i class="lg pause"></i>Paused</span></div>`;
  return `<section class="sec"><div class="sec-head"><h2>Nights</h2><span class="mono">Block ${b} · ${blockDates(b)}</span></div>` +
    `<div class="card nights"><div class="ng-days mono"><span></span>${heads}</div>${rows}${legend}</div></section>`;
}

// ---- This block: its chapters and question sets ---------------------------------------------
function studyBlockHTML(st) {
  const {s, t} = st, b = Math.min(12, Math.max(4, t.block || 12)), now = t.now;
  const items = STUDY_ITEMS.filter(it => it.block === b);
  const bPages = studyDue(b) - studyDue(b - 1), bRead = Math.max(0, Math.min(now, studyDue(b)) - studyDue(b - 1));
  // Anything still unread from earlier blocks is listed first, as carried.
  const carried = STUDY_ITEMS.filter(it => it.block < b && studyItemEnd(it) > now);
  const row = (it, carry) => {
    const a = studyItemStart(it), read = Math.max(0, Math.min(now - a, it.n)), done = read >= it.n, cur = !done && now >= a;
    const sc = it.q && s.q[it.id];
    const tail = it.q ? (sc && !sc.skip ? `<span class="chs mono">${sc.r}/${sc.of}</span>` : done ? `<span class="tag flu">Score</span>` : `<span class="chp mono">${it.p[0]}–${it.p[1]}</span>`)
      : `<span class="chp mono">${it.p[0]}–${it.p[1]}</span>`;
    return `<button class="chrow${done ? " done" : cur ? " now" : ""}" data-action="${it.q && done && !sc ? "studyscore" : "studystop"}" data-id="${it.id}">` +
      `<span class="chk">${done ? ic("check") : ""}</span><span class="chl mono">${studyItemLabel(it)}</span>` +
      `<span class="cht"><span class="chn">${esc(it.title)}</span><span class="chbar"><i style="width:${pct(read, it.n)}%"></i></span>` +
      (carry ? `<span class="tag warn">from Block ${it.block}</span>` : "") + `</span>${tail}</button>`;
  };
  return `<section class="sec"><div class="sec-head"><h2>Block ${b} reading</h2><span class="mono"><b>${bRead}</b>/${bPages} pages</span></div>` +
    `<div class="card list chlist">${carried.map(it => row(it, true)).join("")}${items.map(it => row(it, false)).join("")}</div>` +
    `<p class="goal">${esc(BLOCK_NAMES[b])} block. Tap a chapter to set where you stopped.</p></section>`;
}

// ---- The book: every page as a pit, by section ----------------------------------------------
function studyBookHTML(st) {
  const {s, t} = st, now = t.now, S = studySeq(), tn = t.kind === "read" && !t.done && !t.ahead ? t : null;
  let h = "";
  for (const sec of STUDY_SECTIONS) {
    const items = STUDY_ITEMS.filter(it => it.sec === sec.n).sort((x, y) => x.p[0] - y.p[0]);
    let pits = "", read = 0, tot = 0, lit = 0;
    for (const it of items) {
      const a = studyItemStart(it);
      pits += `<span class="bk-ch">`;
      for (let k = 0; k < it.n; k++) {
        const i = a + k, on = i < now, isTn = tn && i >= tn.from && i < tn.to;
        pits += `<i class="${on ? "lit" : isTn ? "tn" : ""}"${on ? ` style="--i:${lit++}"` : ""}></i>`;
        if (on) read++;
      }
      pits += `</span>`;
      tot += it.n;
    }
    const chs = items.map(it => {
      const a = studyItemStart(it), r = Math.max(0, Math.min(now - a, it.n));
      return `<li><span class="mono">${studyItemLabel(it)}</span><span class="bl-t">${esc(it.title)}</span>` +
        `<span class="mono bl-b">Blk ${it.block}</span><span class="mono bl-n${r >= it.n ? " ok" : ""}">${r}/${it.n}</span></li>`;
    }).join("");
    h += `<details class="bsec${read >= tot ? " full" : read ? " some" : ""}"><summary><span class="bs-h">${ic(sec.glyph)}<span class="bs-n">${esc(sec.name)}</span>` +
      `<span class="mono bs-c"><b>${read}</b>/${tot}</span>${ic("chev", "chev")}</span><span class="bk-pits${studyIntroDone ? "" : " intro"}">${pits}</span></summary>` +
      `<ul class="bl">${chs}</ul></details>`;
  }
  return `<section class="sec"><div class="sec-head"><h2>The book</h2><span class="mono"><b>${now}</b>/${S.total} pages</span></div>` +
    `<div class="card book">${h}</div></section>`;
}

// ---- Finish line: pace against the plan -------------------------------------------------------
function studyFinishHTML(st) {
  const {today, s, t} = st, S = studySeq(), p = studyPace(today, s);
  const spanDays = Math.round((STUDY_LAST - STUDY_START) / DAY_MS);
  const at = d => Math.max(0, Math.min(100, pct(Math.round((studyMidnight(d) - STUDY_START) / DAY_MS), spanDays)));
  const md = d => MONTHS[d.getMonth()] + " " + d.getDate();
  const left = S.total - t.now;
  const nightsLeft = studyCountNights(studyMidnight(today), STUDY_END, studyStretchList(), s.pauses);
  const paceCell = p.done ? `<div class="fin-val ok">Done</div>` : p.date ?
    `<div class="fin-val ${p.onTrack ? "ok" : "warn"}">${md(p.date)}</div><div class="fin-note">${p.rate} pages a week lately</div>` :
    p.rate === 0 ? `<div class="fin-val warn">Stalled</div><div class="fin-note">Nothing read in 4 weeks</div>` :
    `<div class="fin-val">–</div><div class="fin-note">Read a week to estimate</div>`;
  const leftCell = `<div class="fin-val">${left}</div><div class="fin-note">${left && nightsLeft ? "About " + Math.max(1, Math.round(left / nightsLeft)) + " a night to Jun 2" : "pages"}</div>`;
  const now = at(today), goal = at(STUDY_END);
  const paceBar = p.done ? `<i class="pace ok" style="width:${now}%"></i>` : p.date ?
    `<i class="pace${p.onTrack ? " ok" : ""}${p.date > STUDY_LAST ? " over" : ""}" style="width:${at(p.date)}%"></i>` : "";
  return `<section class="sec"><div class="sec-head"><h2>Finish line</h2><span class="mono">Plan: pass 1 by Jun 2</span></div>` +
    `<div class="card finish studyfin"><div class="fin-grid"><div><div class="fin-lbl mono">At your pace</div>${paceCell}</div>` +
    `<div><div class="fin-lbl mono">Pages left</div>${leftCell}</div></div>` +
    `<div class="lanes" aria-hidden="true"><div class="lane-lbl mono"><span>Plan</span><span>Pace</span></div>` +
    `<div class="lane-area"><div class="lane-bar"><i class="plan" style="width:${goal}%"></i></div><div class="lane-bar">${paceBar}</div>` +
    `<span class="goal-line" style="left:${goal}%"></span><span class="today-line" style="left:${now}%"></span>` +
    `<div class="axis mono"><span>Sep 30</span>${now > 16 && now < goal - 16 ? `<span class="t" style="left:${now}%">Today</span>` : ""}` +
    `<span style="left:${goal}%">Jun 2</span></div></div></div></div></section>`;
}

// ---- Questions by section -----------------------------------------------------------------------
function studyQuestionsHTML(st) {
  const {s} = st, done = studyDoneIds(s);
  const rows = STUDY_SECTIONS.map(sec => {
    const id = "q" + sec.n, it = STUDY_BY_ID[id], sc = s.q[id];
    let right;
    if (sc && !sc.skip) {
      const p = pct(sc.r, sc.of), cls = p >= 80 ? "ok" : p >= 65 ? "" : "warn";
      right = `<span class="qbar"><i class="${cls}" style="width:${p}%"></i></span><span class="mono qs ${cls}">${sc.r}/${sc.of}</span>`;
    } else if (done.includes(id)) right = `<button class="pillbtn flu" data-action="studyscore" data-id="${id}">Score</button>`;
    else right = `<span class="mono qdue">${sec.q} · Blk ${it.block}</span>`;
    return `<div class="qrow">${ic(sec.glyph)}<span class="qn">${esc(sec.name)}</span>${right}</div>`;
  }).join("");
  return `<section class="sec"><div class="sec-head"><h2>Questions</h2><span class="mono">End of each section</span></div>` +
    `<div class="card qlist">${rows}</div></section>`;
}

// ---- Pause -----------------------------------------------------------------------------------------
function studyPauseHTML(st) {
  const {today, s, str} = st, k = fmtDate(today);
  const md = iso => { const [y, m, d] = iso.split("-").map(Number); return `${DAYS[new Date(y, m - 1, d).getDay()]} ${d} ${MONTHS[m - 1]}`; };
  const list = s.pauses.map((p, i) => ({p, i})).filter(x => x.p.b >= k);
  const rows = list.map(({p, i}) => {
    const [y1, m1, d1] = p.a.split("-").map(Number), [y2, m2, d2] = p.b.split("-").map(Number);
    const n = studyCountNights(new Date(y1, m1 - 1, d1), new Date(y2, m2 - 1, d2), str, []);
    return `<div class="prow">${ic("pause")}<span><b>${md(p.a)}${p.a === p.b ? "" : " – " + md(p.b)}</b>` +
      `<span class="mono">${n} reading night${n === 1 ? "" : "s"} moved on${p.a <= k ? " · now" : ""}</span></span>` +
      `<button class="textbtn" data-action="studyunpause" data-i="${i}">Remove</button></div>`;
  }).join("");
  return `<section class="sec"><div class="sec-head"><h2>Pause</h2><span class="mono">Vacation, conferences</span></div>` +
    `<div class="card pad pausecard">${rows}<button class="btn" data-action="studypause">${ic("pause")}Pause reading</button>` +
    `<p class="rnote">The pages re-spread over the nights that are left.</p></div></section>`;
}

// ---- The tab --------------------------------------------------------------------------------------------
function viewStudy() {
  const st = studyState(), {today, t} = st, S = studySeq(), blk = blockFor(today);
  let h = `<header class="ph"><p class="eyebrow mono">Mayo Board Review · Pass 1</p><h1 class="title">Study</h1>` +
    `<div class="ph-meta mono"><b>${t.now}</b>/${S.total} pages${blk ? ` · Block ${blk.num} · ${esc(blk.name)}` : ""}</div></header>`;
  h += warningsHTML(today) + studyHeroHTML(st) + studyScoreAskHTML(st.s);
  if (t.kind !== "after") h += studyNightsHTML(st);
  if (t.kind !== "complete" && t.kind !== "after") h += studyBlockHTML(st);
  h += studyBookHTML(st) + studyFinishHTML(st) + studyQuestionsHTML(st);
  if (t.kind !== "complete" && t.kind !== "after") h += studyPauseHTML(st);
  return h + `<p class="bfoot">Printed page numbers. Edge's page box counts PDF pages: printed + 15. ` +
    `Reading nights are Monday, Tuesday, Wednesday and Friday; call nights are skipped, and reading on any night counts.</p>`;
}

// ---- Week: the Tonight card -------------------------------------------------------------------------------
function studyCardHTML() {
  const {today, t} = studyState();
  if (t.kind === "after" || fmtDate(today) > fmtDate(STUDY_LAST)) return "";
  let lbl, main, sub, cls = "";
  if (t.kind === "complete") { lbl = "Study"; main = "Mayo pass 1 read"; sub = "Questions next"; cls = " done"; }
  else if (t.kind === "read" && !t.ahead && !t.done) {
    const w = studyWhat(t.from, t.to);
    lbl = "Tonight"; main = "pp. " + studyPP(t.from, t.to); sub = w.lbl + " · " + w.title;
  } else if (t.kind === "read" && t.done) {
    lbl = "Tonight"; main = "Reading done"; cls = " done";
    sub = t.next ? `Next ${studyDay(t.next.day)} · pp. ${studyPP(t.next.from, t.next.to)}` : "Nothing more tonight";
  } else if (t.ahead) { lbl = "Tonight"; main = "Ahead of plan"; sub = "Night off, or keep going"; cls = " done"; }
  else {
    lbl = t.kind === "before" ? "Study starts" : "Tonight";
    main = t.kind === "before" ? studyDay(STUDY_START) : "Night off";
    const n = t.keep || t.next;
    sub = n ? `${t.kind === "before" ? "First" : "Next"}: pp. ${studyPP(n.from, n.to)} · ${studyWhat(n.from, n.to).lbl}` : "";
    cls = " off";
  }
  return `<section class="sec"><div class="sec-head"><h2>Study</h2><span class="mono">Mayo Board Review</span></div>` +
    `<button class="card studycard${cls}" data-action="tab" data-page="study"><span class="sc-glow" aria-hidden="true">` +
    `${ic(cls === " done" ? "check" : cls === " off" ? "moon" : "study")}</span><span class="sc-main"><span class="mono">${lbl}</span>` +
    `<b>${esc(main)}</b><span class="sc-sub">${esc(sub)}</span></span>${ic("chev", "chev")}</button></section>`;
}

// ---- Sheets -------------------------------------------------------------------------------------------------
function studyOpenStop(id) {
  const now = studyCursorNow(Store.state.study.log), S = studySeq();
  const it = id ? STUDY_BY_ID[id] : studyAt(Math.min(now, S.total - 1)).item;
  studySheet = {kind: "stop", id: it.id, sel: now};
  studySheetFresh = true;
}
function studyOpenScore(id) {
  const it = STUDY_BY_ID[id], sc = Store.state.study.q[id];
  studySheet = {kind: "score", id, r: sc && !sc.skip ? sc.r : Math.round(it.q * .75), of: sc && !sc.skip ? sc.of : it.q};
  studySheetFresh = true;
}
function studyOpenPause() {
  const today = getToday(), k = fmtDate(today);
  studySheet = {kind: "pause", a: k, b: fmtDate(studyAddDays(today, 6))};
  studySheetFresh = true;
}
function studySheetHTML() {
  const sh = studySheet, fresh = studySheetFresh ? " fresh" : "";
  const head = (t, sub) => `<div class="scrim${fresh}" data-action="studyclose"></div><div class="sheet studysheet${fresh}" role="dialog" aria-modal="true" aria-label="${esc(t)}">` +
    `<div class="grab"></div><div class="shead"><b>${esc(t)}</b><button class="iconbtn" data-action="studyclose" aria-label="Close">${ic("x")}</button></div>` +
    (sub ? `<p class="ssub">${esc(sub)}</p>` : "");
  if (sh.kind === "stop") {
    const it = STUDY_BY_ID[sh.id], j = STUDY_ITEMS.indexOf(it), a = studyItemStart(it), now = studyCursorNow(Store.state.study.log);
    const cj = STUDY_ITEMS.indexOf(studyAt(Math.min(now, studySeq().total - 1)).item);
    const lo = Math.max(0, Math.min(j, cj) - 1), hi = Math.min(STUDY_ITEMS.length - 1, Math.max(j, cj) + 3);
    const chips = STUDY_ITEMS.slice(lo, hi + 1).map(x => {
      const done = studyItemEnd(x) <= now;
      return `<button class="pick${x === it ? " on" : ""}${done ? " read" : ""}" data-action="studyitem" data-id="${x.id}">${studyItemLabel(x)}</button>`;
    }).join("");
    let grid = "";
    for (let k = 0; k < it.n; k++) {
      const i = a + k, on = i < sh.sel;
      grid += `<button class="pg${on ? " on" : ""}${i + 1 === sh.sel ? " last" : ""}" data-action="studypick" data-i="${i + 1}">${it.p[0] + k}</button>`;
    }
    const at = sh.sel > 0 ? studyAt(sh.sel - 1) : null;
    const summary = at ? `Through p. ${at.page} · ${studyItemLabel(at.item)}` : "Nothing read yet";
    return head("Where did you stop?", "Tap the last page you read.") +
      `<div class="pickrow chips">${chips}</div><div class="pg-title"><span class="mono">${studyItemLabel(it)}</span>${esc(it.title)}</div>` +
      `<div class="pggrid">${grid}</div>` +
      `<div class="pg-sum"><span class="mono">${summary}</span>${sh.sel !== a ? `<button class="textbtn" data-action="studypick" data-i="${a}">Start of ${studyItemLabel(it)}</button>` : ""}</div>` +
      `<div class="sactions"><button class="btn flu" data-action="studysave">Save</button></div></div>`;
  }
  if (sh.kind === "score") {
    const it = STUDY_BY_ID[sh.id], p = pct(sh.r, sh.of);
    const step = (f, label, val) => `<div class="stepper"><span class="mono">${label}</span><div class="st-in">` +
      `<button class="iconbtn" data-action="studystep" data-f="${f}" data-k="-1" aria-label="Fewer">${ic("minus")}</button>` +
      `<b>${val}</b><button class="iconbtn" data-action="studystep" data-f="${f}" data-k="1" aria-label="More">${ic("plus")}</button></div></div>`;
    return head(it.title, `${it.q} questions at the end of the section.`) +
      `<div class="steps">${step("r", "Right", sh.r)}${step("of", "Out of", sh.of)}</div>` +
      `<div class="scorebig"><b>${Math.round(p)}%</b><span class="mono">${p >= 80 ? "Strong" : p >= 65 ? "Solid" : "One to revisit"}</span></div>` +
      `<div class="sactions"><button class="btn" data-action="studyskipq" data-id="${sh.id}">Skip</button>` +
      `<button class="btn flu" data-action="studysave">Save score</button></div></div>`;
  }
  const today = getToday(), k = fmtDate(today), d = n => fmtDate(studyAddDays(today, n));
  const wed = d((3 - today.getDay() + 7) % 7);
  const chip = (a, b, label) => `<button class="pick ghost${sh.a === a && sh.b === b ? " on" : ""}" data-action="studypausechip" data-a="${a}" data-b="${b}">${label}</button>`;
  return head("Pause reading", "Those nights drop out and the pages re-spread over the rest of the block.") +
    `<div class="datechips">${chip(k, k, "Tonight")}${chip(k, wed, "To Wednesday")}${chip(k, d(6), "7 days")}${chip(k, d(13), "2 weeks")}</div>` +
    `<label class="lbl mono">From<input type="date" value="${esc(sh.a)}" data-studyfield="a"></label>` +
    `<label class="lbl mono">To<input type="date" value="${esc(sh.b)}" data-studyfield="b"></label>` +
    `<div class="sactions"><button class="btn flu" data-action="studysave">Pause</button></div></div>`;
}
// Keeps the pause dates in step with typing without re-rendering.
function studyField(t) {
  const f = t.dataset && t.dataset.studyfield;
  if (!f || !studySheet) return false;
  studySheet[f] = t.value;
  return true;
}

// ---- Actions -----------------------------------------------------------------------------------------------
function studySet(c, msg) {
  const before = Store.studySnapshot(), now = studyCursorNow(before.log), today = getToday();
  Store.setStudyCursor(c, today);
  if (c > now) studyStain = {from: now, to: c};
  const at = c > 0 ? studyAt(c - 1) : null;
  showToast(msg || (at ? `Through p. ${at.page} · ${studyItemLabel(at.item)}` : "Bookmark cleared"), () => Store.restoreStudy(before));
}
function studyDispatch(act, d) {
  const {t} = studyState();
  if (act === "studydone") studySet(Math.max(t.now, t.to), `Done · through p. ${studyAt(t.to - 1).page}`);
  else if (act === "studyread") studySet(Math.max(t.now, +d.to));
  else if (act === "studystop") studyOpenStop(d.id);
  else if (act === "studyitem") { studySheet.id = d.id; }
  else if (act === "studypick") { studySheet.sel = +d.i; }
  else if (act === "studyscore") studyOpenScore(d.id);
  else if (act === "studystep") {
    const f = d.f, k = +d.k;
    studySheet[f] = Math.max(0, Math.min(99, studySheet[f] + k));
    if (studySheet.r > studySheet.of) { if (f === "r") studySheet.of = studySheet.r; else studySheet.r = studySheet.of; }
  }
  else if (act === "studyskipq") { Store.state.study.q[d.id] = {skip: true, d: fmtDate(getToday())}; Store.save(); studySheet = null; showToast("Score skipped"); }
  else if (act === "studypause") studyOpenPause();
  else if (act === "studypausechip") { studySheet.a = d.a; studySheet.b = d.b; }
  else if (act === "studyunpause") {
    const before = Store.studySnapshot();
    Store.removePause(+d.i); showToast("Pause removed", () => Store.restoreStudy(before));
  }
  else if (act === "studyclose") studySheet = null;
  else if (act === "studysave") {
    const sh = studySheet;
    if (sh.kind === "stop") { studySheet = null; studySet(sh.sel); }
    else if (sh.kind === "score") { Store.setStudyScore(sh.id, sh.r, sh.of); studySheet = null; showToast(`Score saved · ${sh.r}/${sh.of}`); }
    else if (sh.kind === "pause") {
      if (!sh.a || !sh.b) return false;
      const before = Store.studySnapshot();
      Store.addPause(sh.a, sh.b); studySheet = null; showToast("Reading paused", () => Store.restoreStudy(before));
    }
  }
  else return false;
  return true;
}
// After a render: the pits' first light, and tonight's pages staining in.
function studyAfterRender() {
  if (route.page === "study") studyIntroDone = true;
  studySheetFresh = false;
  if (studyStain) setTimeout(() => { studyStain = null; }, 50);
}
