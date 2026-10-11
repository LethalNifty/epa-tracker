"use strict";
// GI Hub landmark trials: the Trials view in Guides, the trial rows inside
// each guideline topic, and trial matches in the guideline search. The hero
// is the evidence timeline under white light: one bead per trial by year,
// Canadian-led in NBI cyan. Loaded after guides-view.js and trials.js; uses
// app.js helpers when it runs. Its taps are named guidestr* so app.js routes
// them through guidesDispatch.

let trialsTerm = "";
let trialsChip = "all";        // "all", "block", or a section id
const trialsOpen = new Set();
let trialsFresh = null;        // the card just opened, so only it slides open on the redraw
let trialsIntro = true;        // the beads light up once, the first time the view is drawn

// Search words lit in names and bottom lines.
function trialsHi(html) {
  const words = guidesNorm(trialsTerm).split(" ").filter(w => w.length > 1);
  if (!words.length) return html;
  const re = new RegExp("(" + words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?![^<]*>)", "ig");
  return html.replace(re, "<mark>$1</mark>");
}
// Journal names short enough for the card's corner.
const TRIALS_JOURNAL_SHORT = {"Gastroenterology": "Gastro", "Lancet Gastroenterol Hepatol": "Lancet Gastro", "Ann Intern Med": "Annals"};
function trialsJournal(j) { return TRIALS_JOURNAL_SHORT[j] || j; }
function trialsShortSec(name) {
  return name === "Pancreas and biliary" ? "Pancreas" : name === "Screening and polyps" ? "Screening" : name === "Endoscopy practice" ? "Endoscopy" : name;
}

// ---- The evidence timeline ----------------------------------------------------------------------
// One column of beads per year from 1990 to now, Canadian-led at the base;
// anything older stands at the left edge, past a break in the axis.
function trialsMonitorHTML(today) {
  const f = trialsYears(TRIALS, today), now = today.getFullYear();
  const W = 320, H = 34, x0 = 34, from = 1990, gap = (W - x0) / (now - from + 1), step = 5.8, r = 2.3;
  const stack = (cx, c, y) => {
    let out = "";
    for (let i = 0; i < c.all; i++) {
      const cls = i < c.ca ? "ca" : y >= now - 5 ? "fresh" : "";
      out += `<circle class="${cls}" cx="${cx.toFixed(1)}" cy="${(H - 3 - i * step).toFixed(1)}" r="${r}" style="--d:${Math.round(cx / W * 900 + i * 60)}ms"/>`;
    }
    return out;
  };
  const x = y => x0 + (y - from + .5) * gap;
  const early = Object.keys(f.by).map(Number).filter(y => y < from).sort((a, b) => a - b);
  let dots = early.map((y, i) => stack(6 + i * 10, f.by[y], y)).join("");
  for (let y = from; y <= now; y++) if (f.by[y]) dots += stack(x(y), f.by[y], y);
  const pct = v => (v / W * 100).toFixed(1) + "%";
  const ticks = early.slice(0, 1).map(y => `<span class="early">${y}</span>`).join("") +
    `<span style="left:${pct(x(2000))}">2000</span><span class="now">${now}</span>`;
  return `<section class="monitor guidemon ltmon${trialsIntro ? " intro" : ""}" aria-label="The trials by year">` +
    `<div class="monitor-in"><div class="ov mono"><span>Evidence · white light</span><span>${TRIALS.length} trials</span></div>` +
    `<svg class="gl-beads lt-beads" viewBox="0 0 ${W} ${H}" aria-hidden="true">` +
    (early.length ? `<path class="lt-break" d="M${x0 - 14} ${H - 1} l3 -7 M${x0 - 10} ${H - 1} l3 -7"/>` : "") + `${dots}</svg>` +
    `<div class="gl-years lt-years mono">${ticks}</div>` +
    `<p class="gl-sum"><b>${TRIALS.length}</b> trials from ${f.from} to ${f.to} · <b>${f.recent}</b> from the last 5 years · <b class="ca">${f.ca}</b> Canadian-led</p></div></section>`;
}

// ---- One trial --------------------------------------------------------------------------------
function trialsChipsHTML(t) {
  const topics = Guides.data ? t.tp.map(id => Guides.byId[id]).filter(Boolean) : [];
  const drugs = typeof IBD_BY_ID !== "undefined" ? (t.drugs || []).map(id => IBD_BY_ID[id]).filter(Boolean) : [];
  if (!topics.length && !drugs.length) return "";
  return `<div class="lt-chips">` +
    topics.map(g => `<button class="chip" data-action="guidesopen" data-id="${esc(g.id)}">${ic("guides")}<span class="nm">${esc(g.n)}</span></button>`).join("") +
    drugs.map(d => `<button class="chip dr-chip" data-action="guidesdopen" data-id="${esc(d.id)}">${ic("shield")}<span class="nm">${esc(d.n)}</span></button>`).join("") + `</div>`;
}
function trialsCardHTML(t, opts = {}) {
  const open = trialsOpen.has(t.id) || !!opts.only;
  let h = `<article class="lt${open ? " open" : ""}${trialsFresh === t.id ? " fresh" : ""}" id="t-${esc(t.id)}">` +
    `<button class="lt-head" data-action="guidestrtoggle" data-id="${esc(t.id)}" aria-expanded="${open}">` +
    `<span class="lt-name">${opts.sec ? `<span class="gt-sec mono">${esc(opts.sec)}</span>` : ""}` +
    `<b>${trialsHi(esc(t.n))}</b>${t.ca ? '<span class="catag mono">CA</span>' : ""}` +
    `<span class="lt-line">${trialsHi(esc(t.line))}</span></span>` +
    `<span class="lt-cite mono">${esc(trialsJournal(t.j))}<span class="yr">${t.y}</span></span>${ic("chev", "sm chev")}</button>`;
  if (!open) return h + `</article>`;
  h += `<div class="lt-body">`;
  h += `<p class="lt-design mono">${esc(t.au)} · ${esc(t.design)}</p>`;
  h += `<p class="lt-q">${esc(t.q)}</p>`;
  h += `<dl class="lt-pico"><dt class="mono">Who</dt><dd>${esc(t.who)}</dd><dt class="mono">Arms</dt><dd>${esc(t.arms)}</dd></dl>`;
  h += `<div class="lt-key${t.key.v.length > 14 ? " long" : ""}"><span class="v">${esc(t.key.v)}</span><span class="l">${esc(t.key.l)}</span></div>`;
  h += `<p class="lt-res">${esc(t.res)}</p>`;
  h += `<section class="ds lt-sec"><h4 class="mono">What it changed</h4><p>${esc(t.now)}</p></section>`;
  h += `<section class="ds lt-sec differ"><h4 class="mono">${ic("alert", "sm")}The catch</h4><p>${esc(t.catch)}</p></section>`;
  if (t.since) h += `<section class="ds lt-sec"><h4 class="mono">Since</h4><p>${esc(t.since)}</p></section>`;
  if (t.canada) h += `<div class="lt-ca"><p class="mono">In Canada</p><p>${esc(t.canada)}</p></div>`;
  h += trialsChipsHTML(t);
  h += `<div class="lt-src">` +
    `<a class="glink alt" href="https://pubmed.ncbi.nlm.nih.gov/${esc(t.pmid)}/" target="_blank" rel="noopener"><span class="who mono">PubMed<span class="yr">${esc(t.pmid)}</span></span><span class="tt">The abstract</span>${ic("external", "sm")}</a>` +
    `<a class="glink alt" href="https://doi.org/${esc(t.doi)}" target="_blank" rel="noopener"><span class="who mono">${esc(trialsJournal(t.j))}<span class="yr">${t.y}</span></span><span class="tt">The paper</span>${ic("external", "sm")}</a></div>`;
  return h + `</div></article>`;
}
// A trial as one line: inside a guideline topic and in the guideline search.
function trialsMiniHTML(t) {
  return `<button class="lt-mini" data-action="guidestropen" data-id="${esc(t.id)}">` +
    `<span class="tx"><b>${esc(t.n)}</b><span class="yr mono">${t.y}</span><span class="ln">${esc(t.line)}</span></span>${ic("forward", "sm")}</button>`;
}

// ---- The view ---------------------------------------------------------------------------------
function viewTrials() {
  const today = getToday(), blk = blockFor(today), q = trialsTerm.trim();
  let h = "";
  if (!q && trialsChip === "all") h += trialsMonitorHTML(today);
  h += `<div class="qwrap">${ic("search")}<input id="trialsq" type="search" placeholder="Search: PREDESCI, albumin, Villanueva" aria-label="Search trials" ` +
    `autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(trialsTerm)}">` +
    (trialsTerm ? `<button class="qclear" data-action="guidestrclear" aria-label="Clear">${ic("x")}</button>` : "") + `</div>`;
  const blockTrials = blk && Guides.data ? trialsForBlock(Guides.data.topics, blk.num) : [];
  const chips = [["all", "All", null]];
  if (blockTrials.length) chips.push(["block", `Block ${blk.num} · ${GUIDES_FAMILY_LABEL[BLOCK_FAMILY[blk.num]] || esc(blk.name)}`, "week"]);
  for (const [id, n, glyph] of TRIALS_SECS) if (TRIALS.some(t => t.s === id)) chips.push([id, trialsShortSec(n), glyph]);
  h += `<div class="bcats gcats">` + chips.map(([id, label, glyph]) => `<button class="bcat${trialsChip === id ? " on" : ""}" data-action="guidestrchip" data-chip="${esc(id)}">` +
    `${glyph ? ic(glyph) : ""}${label}</button>`).join("") + `</div>`;
  let pool = TRIALS;
  if (trialsChip === "block") pool = blockTrials;
  else if (trialsChip !== "all") pool = TRIALS.filter(t => t.s === trialsChip);
  const list = q ? trialsSearch(pool, q) : pool;
  h += `<p class="bcount mono">${q || trialsChip !== "all" ? list.length + " of " + TRIALS.length + " trials" : TRIALS.length + " trials · tap one for its card"}</p>`;
  if (!list.length) h += `<div class="bempty">No trial matches. Try a drug, a disease or a name, like "albumin" or "VARSITY".</div>`;
  if (q) {
    // One match: it opens by itself.
    h += list.map(t => trialsCardHTML(t, {sec: TRIALS_SEC_BY_ID[t.s].n, only: list.length === 1})).join("");
  } else if (trialsChip === "block") {
    h += `<div class="bgrp">${ic("week")}<span class="mono">On ${esc(blk.name)}</span><span class="mono n">${list.length}</span></div>`;
    h += list.map(t => trialsCardHTML(t, {sec: TRIALS_SEC_BY_ID[t.s].n})).join("");
  } else {
    let sec = "";
    for (const t of list) {
      if (t.s !== sec) {
        sec = t.s;
        const S = TRIALS_SEC_BY_ID[sec];
        h += `<div class="bgrp">${ic(S.glyph)}<span class="mono">${esc(S.n)}</span><span class="mono n">${list.filter(x => x.s === sec).length}</span></div>`;
      }
      h += trialsCardHTML(t);
    }
  }
  return h + `<p class="bfoot">Checked ${guidesDay(TRIALS_CHECKED)}, ${TRIALS_CHECKED.slice(0, 4)}: every number against the trial's PubMed record, ` +
    `Canadian notes against Health Canada's drug database and Canadian guidelines. Summaries are in our own words; ` +
    `CA marks a Canadian-led trial. Read the paper before quoting it.</p>`;
}

// ---- In the guideline library ------------------------------------------------------------------
// A topic's landmark trials, for its open card.
function trialsTopicHTML(t) {
  const ts = trialsForTopic(t.id);
  if (!ts.length) return "";
  return `<div class="gt-sub mono">Landmark trials</div><div class="lt-minis">${ts.map(trialsMiniHTML).join("")}</div>`;
}
// Trials whose name, author or alias matches the guideline search.
function trialsSearchHTML(q) {
  const ts = trialsSearch(TRIALS, q, true).slice(0, 4);
  if (!ts.length) return "";
  return `<div class="bgrp">${ic("trial")}<span class="mono">Landmark trials</span><span class="mono n">${ts.length}</span></div>` +
    `<div class="lt-minis lt-found">${ts.map(trialsMiniHTML).join("")}</div>`;
}

// ---- Taps and typing ------------------------------------------------------------------------------
// Called from guidesDispatch for guidestr* actions. Returns false when nothing needs redrawing.
function trialsDispatch(act, d) {
  if (act === "guidestrtoggle") { if (trialsOpen.has(d.id)) trialsOpen.delete(d.id); else { trialsOpen.add(d.id); trialsFresh = d.id; } return true; }
  if (act === "guidestrchip") { trialsChip = d.chip; trialsOpen.clear(); route.keepScroll = false; return true; }
  if (act === "guidestrclear") { trialsTerm = ""; guidesJump = "#trialsq"; return true; }
  if (act === "guidestropen") {
    if (!TRIALS_BY_ID[d.id]) return false;
    guidesTab = "t"; trialsTerm = ""; trialsChip = "all"; trialsOpen.add(d.id); trialsFresh = d.id; guidesJump = "#t-" + d.id;
    if (route.page !== "guides") { go({page: "guides"}); return false; }
    return true;
  }
  return true;
}
function trialsField(el) {
  if (!el || el.id !== "trialsq") return false;
  const caret = el.selectionStart;
  trialsTerm = el.value;
  route.keepScroll = true;
  render();
  const q = document.getElementById("trialsq");
  if (q) { q.focus(); try { q.setSelectionRange(caret, caret); } catch (e) {} }
  return true;
}
function trialsAfterRender() {
  trialsFresh = null;
  trialsIntro = !(route.page === "guides" && guidesTab === "t");
}
