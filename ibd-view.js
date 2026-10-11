"use strict";
// GI Hub IBD drugs: the third view in Guides. The hero is a map of where
// each class acts, from the lymph node to the gut wall; the list below opens
// into one card per drug, every line tagged with its source. Loaded after
// guides-view.js and ibd.js; uses app.js helpers when it runs. Its taps are
// named guides* so app.js routes them through guidesDispatch.

let ibdTerm = "";
let ibdChip = "all";           // "all", "uc", "cd", a class id, "broad", or "s:<situation>"
const ibdOpen = new Set();
let ibdPrepOpen = false;
let ibdIntro = true;           // the map plays its one entrance the first time it is drawn
let ibdFresh = null;           // the card just opened, so only it slides open on the redraw

// Targets on the map, in the order the lymphocyte passes them. x and y are in
// the map's 320 by 180 viewBox, beside what each labels; at is when the pin
// lights during the entrance (ms); classes are what a tap filters to.
const IBD_PINS = [
  {id: "s1p", label: "S1P", x: 100, y: 96, at: 600, cls: ["s1p"], hue: "core", name: "S1P modulators"},
  {id: "itg", label: "α4β7", x: 162, y: 52, at: 1250, cls: ["itg"], hue: "nbi", name: "Anti-integrin"},
  {id: "tnf", label: "TNF", x: 150, y: 110, at: 1500, cls: ["tnf"], hue: "mucosa", name: "Anti-TNF"},
  {id: "il", label: "IL-23", x: 214, y: 110, at: 1650, cls: ["il"], hue: "ttp", name: "IL-12/23 and IL-23"},
  {id: "jak", label: "JAK", x: 292, y: 80, at: 1950, cls: ["jak"], hue: "flu", name: "JAK inhibitors"},
  {id: "asa", label: "5-ASA", x: 232, y: 162, at: 2150, cls: ["asa"], hue: "wli", name: "5-ASA"},
  {id: "broad", label: "Broad", x: 40, y: 160, at: 2300, cls: ["ster", "imm", "cni"], hue: "dim", name: "Steroids, immunomodulators and cyclosporine"},
];
// The places on the map, named where they are drawn; a is the label's anchor.
const IBD_ZONES = [["Lymph node", 52, 117, "c"], ["Blood vessel", 316, 10, "r"], ["Gut wall", 124, 140, "r"], ["Lumen", 316, 172, "r"]];
const IBD_SRC_CA = new Set(["HC", "CAG", "NACI", "CTS", "CASL"]);
// The route a gut-homing lymphocyte takes: out of the node, along the vessel,
// through the wall at the α4β7 dock, to the T-cell cluster in the gut wall.
const IBD_TRAIL = "M52 80 C 72 70, 88 46, 110 32 C 140 24, 176 24, 196 34 C 204 52, 222 74, 243 79";

// ---- Small pieces ----------------------------------------------------------------------------
// One tag per body, so two AGA reviews on a line read as one AGA; the card's
// Sources list names each document.
function ibdTags(keys) {
  const by = new Map();
  for (const k of ibdKeys(["", keys])) {
    const s = IBD_SRC[k];
    if (s) by.set(s.w, (by.get(s.w) || []).concat(s.t));
  }
  return [...by].map(([w, ts]) =>
    `<span class="st${IBD_SRC_CA.has(w) ? " ca" : w === "Practice" ? " pr" : ""}" title="${esc(ts.join("; "))}">${esc(w)}</span>`).join("");
}
function ibdLine(line) {
  return `<li>${ibdHi(ibdLead(esc(line[0])))}<span class="sts">${ibdTags(line[1])}</span></li>`;
}
// A short label before a colon ("Liver:", "Past cancer:") reads as the line's lead.
function ibdLead(html) {
  const m = /^([^:<]{2,40}): /.exec(html);
  return m ? `<b class="lead">${m[1]}</b>: ${html.slice(m[0].length)}` : html;
}
function ibdList(lines) { return lines && lines.length ? `<ul class="dl">${lines.map(ibdLine).join("")}</ul>` : ""; }
function ibdSec(title, lines, cls) {
  if (!lines || !lines.length) return "";
  return `<section class="ds${cls ? " " + cls : ""}"><h4 class="mono">${title}</h4>${ibdList(lines)}</section>`;
}
function ibdRoute(d) {
  const names = {oral: "Oral", rectal: "Rectal", iv: "IV", sc: "SC"};
  return d.route.map(r => names[r]).join(" · ");
}
// Search words lit in names and lines.
function ibdHi(html) {
  const words = ibdNorm(ibdTerm).split(" ").filter(w => w.length > 1);
  if (!words.length) return html;
  const re = new RegExp("(" + words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?![^<]*>)", "ig");
  return html.replace(re, "<mark>$1</mark>");
}

// ---- The map: where each class acts ---------------------------------------------------------
function ibdMapHTML() {
  const on = ibdChip, active = IBD_PINS.find(p => on === p.id || (p.cls.length === 1 && on === p.cls[0]));
  const dot = (cx, cy, r, cls) => `<circle class="${cls}" cx="${cx}" cy="${cy}" r="${r}"/>`;
  // Lymphocytes waiting in the node, and the crypts of the gut lining.
  const nodeCells = [[40, 74], [52, 66], [62, 80], [46, 88], [58, 94], [34, 86], [68, 68], [50, 78]]
    .map(([x, y]) => dot(x, y, 2.6, "ly")).join("");
  let crypts = "";
  for (let x = 138; x <= 300; x += 18) crypts += `M${x} 150 V130 a6 6 0 0 1 12 0 V150 `;
  const svg = `<svg class="ibd-map" viewBox="0 0 320 180" aria-hidden="true">
    <defs><radialGradient id="ibdNode" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="rgb(136 170 255 / .2)"/><stop offset="1" stop-color="rgb(136 170 255 / 0)"/></radialGradient></defs>
    <g class="z m-node${active && active.id === "s1p" ? " lit" : ""}"><ellipse cx="52" cy="80" rx="34" ry="28" fill="url(#ibdNode)"/>
      <path class="wall" d="M22 70 C 24 50, 66 44, 82 60 C 92 70, 88 100, 70 106 C 50 112, 22 104, 20 86 C 19 80, 21 74, 22 70 Z"/>
      ${nodeCells}<path class="lymph" d="M82 64 C 90 52, 94 40, 104 33"/></g>
    <g class="z m-vessel${active && active.id === "itg" ? " lit" : ""}"><path class="wall" d="M100 24 C 160 16, 236 16, 318 22"/><path class="wall" d="M100 42 C 160 34, 236 34, 318 40"/>
      ${[[136, 30], [170, 27], [244, 27], [290, 29]].map(([x, y]) => dot(x, y, 2.6, "ly")).join("")}
      <path class="dock" d="M188 37 v5 M196 36 v5 M204 36 v5"/></g>
    <g class="z m-gut"><path class="lp" d="M130 52 C 190 47, 260 47, 318 51 V150 H130 Z"/>
      <path class="crypt" d="${crypts}"/><path class="surf" d="M130 150 H318"/>
      <g class="mac${active && (active.id === "tnf" || active.id === "il") ? " lit " + active.id : ""}"><path d="M170 84 c -6 -6, 4 -14, 10 -8 c 6 -8, 18 0, 12 8 c 8 4, 0 16, -8 12 c -6 8, -18 2, -12 -6 c -8 -2, -6 -10, -2 -6 z"/>
        ${[[158, 92], [154, 84], [162, 76]].map(([x, y]) => dot(x, y, 1.9, "tnfd")).join("")}
        ${[[200, 76], [206, 84], [196, 90]].map(([x, y]) => dot(x, y, 1.9, "ild")).join("")}</g>
      <g class="tcell${active && active.id === "jak" ? " lit" : ""}"><circle cx="256" cy="80" r="12"/><path class="jak" d="M250 80 h12 M256 74 v12"/></g>
      <g class="lumen${active && active.id === "asa" ? " lit" : ""}"><path d="M130 162 H318"/></g></g>
    <path class="trail" d="${IBD_TRAIL}"/>
    ${ibdIntro ? `<circle class="mover" r="3.4" cx="0" cy="0"><animateMotion dur="1.8s" begin="0.25s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".33 0 .25 1" path="${IBD_TRAIL}"/></circle>` : ""}
  </svg>`;
  const pin = (p, i) => {
    const lit = active && active.id === p.id;
    return `<button class="ibd-pin h-${p.hue}${lit ? " on" : ""}" style="left:${(p.x / 3.2).toFixed(2)}%;top:${(p.y / 1.8).toFixed(2)}%;--i:${i};--at:${p.at}ms"` +
      ` data-action="guidesdmap" data-pin="${p.id}" aria-pressed="${!!lit}" aria-label="Show ${esc(p.name)}"><i></i><span>${p.label}</span></button>`;
  };
  return `<section class="monitor guidemon ibdmon${ibdIntro ? " intro" : ""}${active ? " picked" : ""}" aria-label="Where each drug class acts">` +
    `<div class="monitor-in"><div class="ov mono"><span>Where they act</span><span>${IBD_DRUGS.length} drugs</span></div>` +
    `<div class="ibd-mapwrap">${svg}${IBD_ZONES.map(([t, x, y, a]) =>
      `<span class="ibd-zone mono ${a}" style="left:${(x / 3.2).toFixed(2)}%;top:${(y / 1.8).toFixed(2)}%">${t}</span>`).join("")}` +
    `${IBD_PINS.map(pin).join("")}</div>` +
    `<p class="ibd-cap">${active ? `${esc(active.name)}. <button class="textbtn sm" data-action="guidesdchip" data-chip="all">Show all</button>` :
      "Tap a target for the drugs that act there."}</p></div></section>`;
}

// ---- Before any advanced therapy ---------------------------------------------------------------
function ibdPrepHTML(open) {
  let h = `<section class="ibd-prep${open ? " open" : ""}${ibdFresh === "prep" ? " fresh" : ""}" id="ibd-prep">` +
    `<button class="ibd-prep-head" data-action="guidesdprep" aria-expanded="${open}">${ic("shield")}` +
    `<span class="t"><b>Before any advanced therapy</b><span>Tests, positive results, vaccines, yearly checks and babies exposed in pregnancy</span></span>${ic("chev", "sm chev")}</button>`;
  if (!open) return h + `</section>`;
  h += `<div class="ibd-prep-body">`;
  h += `<section class="ds"><h4 class="mono">Tests</h4><ul class="dl ck">${IBD_ADV.map(id => ibdLine(IBD_BASE[id])).join("")}</ul>` +
    `<button class="textbtn sm dcopy" data-action="guidesdcopy">${ic("copy", "sm")}Copy the list for a note</button></section>`;
  h += ibdSec("If a result is positive", IBD_PREP.positive);
  h += ibdSec("Vaccines", IBD_PREP.vaccines);
  h += ibdSec("Once on therapy", IBD_PREP.ongoing);
  h += ibdSec("Starting in hospital", IBD_PREP.hospital);
  h += ibdSec("Babies exposed in pregnancy", IBD_PREP.babies);
  h += ibdSec(`${ic("alert", "sm")}Where sources differ`, IBD_PREP.differ, "differ");
  return h + `</div></section>`;
}

// ---- One drug ---------------------------------------------------------------------------------
function ibdDrugHTML(d, opts = {}) {
  const open = ibdOpen.has(d.id) || !!opts.only, c = IBD_CLASS_BY_ID[d.cls];
  let h = `<article class="dr c-${d.cls}${open ? " open" : ""}${ibdFresh === d.id ? " fresh" : ""}" id="d-${esc(d.id)}">` +
    `<button class="dr-head" data-action="guidesdrug" data-id="${esc(d.id)}" aria-expanded="${open}"><i class="dr-bar"></i>` +
    `<span class="dr-name">${ibdHi(esc(d.n))}<span class="dr-sub${opts.why ? " why" : ""}">${opts.why ? esc(opts.why) : ibdHi(esc(d.brands))}</span></span>` +
    `<span class="dr-dz mono">${d.dz.includes("uc") ? "<b>UC</b>" : ""}${d.dz.includes("cd") ? "<b>CD</b>" : ""}</span>` +
    `${d.off ? '<i class="dr-off" aria-label="Off-label in Canada"></i>' : ""}${ic("chev", "sm chev")}</button>`;
  if (!open) return h + `</article>`;
  h += `<div class="dr-body">`;
  if (opts.why && opts.src) h += `<p class="dr-why">${esc(opts.why)}<span class="sts">${ibdTags(opts.src)}</span></p>`;
  h += `<p class="dr-how"><span class="dr-cls mono">${esc(c.n)} · ${ibdRoute(d)}</span>${ibdHi(esc(d.how[0]))}<span class="sts">${ibdTags(d.how[1])}</span></p>`;
  if (opts.why) h += `<p class="dr-brands">${ibdHi(esc(d.brands))}</p>`;
  if (d.off) h += `<p class="dr-offnote">${ic("alert", "sm")}<span>${esc(d.off)}</span></p>`;
  if (d.warn) h += `<div class="dr-warn"><p class="mono">Health Canada boxed warning</p><p>${esc(d.warn[0])}<span class="sts">${ibdTags(d.warn[1])}</span></p></div>`;
  h += ibdSec("Use", d.use);
  h += ibdSec("Dose", d.dose);
  h += ibdSec("Avoid or use with care", d.avoid);
  h += ibdSec("Serious side effects", d.harm, "harm");
  h += d.preg.length ? ibdSec("Pregnancy and breastfeeding", d.preg) :
    `<section class="ds"><h4 class="mono">Pregnancy and breastfeeding</h4><p class="dl-none">Not addressed in the sources used here.</p></section>`;
  const wk = ibdWorkup(d);
  h += `<section class="ds"><h4 class="mono">Before starting</h4>` +
    (wk.length ? `<ul class="dl ck">${wk.map(x => `<li class="${x.own ? "own" : ""}">${ibdHi(esc(x.line[0]))}<span class="sts">${ibdTags(x.line[1])}</span></li>`).join("")}</ul>` : "") +
    (d.before.base.length > 2 ? `<p class="dl-note">Vaccines: see Before any advanced therapy above.</p>` : "") +
    `<button class="textbtn sm dcopy" data-action="guidesdcopy" data-id="${esc(d.id)}">${ic("copy", "sm")}Copy for a note</button></section>`;
  h += ibdSec("Once started", d.monitor);
  h += ibdSec(`${ic("alert", "sm")}Where sources differ`, d.differ, "differ");
  const refs = ibdRefs(d).filter(k => k !== "prac").map(k => IBD_SRC[k]);
  h += `<section class="ds"><h4 class="mono">Sources</h4><div class="srcs">` + refs.map(s =>
    (s.u ? `<a class="src" href="${esc(s.u)}" target="_blank" rel="noopener">` : `<span class="src">`) +
    `<b class="${IBD_SRC_CA.has(s.w) ? "ca" : ""}">${esc(s.w)}${s.y ? " " + s.y : ""}</b><span>${esc(s.t)}${s.d ? ` · ${s.d}` : ""}</span>` +
    (s.u ? `${ic("external", "sm")}</a>` : `</span>`)).join("") + `</div></section>`;
  return h + `</div></article>`;
}

// ---- The view -----------------------------------------------------------------------------------
function viewIbd() {
  const q = ibdTerm.trim();
  const sit = ibdChip.startsWith("s:") ? ibdSituation(ibdChip.slice(2), IBD_DRUGS) : null;
  const pin = IBD_PINS.find(p => p.id === ibdChip);
  let h = ibdMapHTML();
  // The shared card opens by itself when the search is about it.
  const prepHit = q && ibdNorm(JSON.stringify(IBD_PREP) + " " + IBD_ADV.map(id => IBD_BASE[id][0]).join(" ")).includes(ibdNorm(q));
  h += ibdPrepHTML(ibdPrepOpen || !!prepHit);
  h += `<div class="qwrap">${ic("search")}<input id="ibdq" type="search" placeholder="Search: Skyrizi, TPMT, ECG, Shingrix" aria-label="Search IBD drugs" ` +
    `autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(ibdTerm)}">` +
    (ibdTerm ? `<button class="qclear" data-action="guidesdclear" aria-label="Clear">${ic("x")}</button>` : "") + `</div>`;
  const chips = [["all", "All"], ["uc", "UC"], ["cd", "Crohn's"]].concat(IBD_SITS.map(s => ["s:" + s.id, s.n]));
  h += `<div class="bcats gcats ibdcats" id="ibd-list">` + chips.map(([id, label], i) =>
    `${i === 3 ? '<span class="cat-gap" aria-hidden="true"></span>' : ""}<button class="bcat${ibdChip === id ? " on" : ""}${id.startsWith("s:") ? " sit" : ""}" data-action="guidesdchip" data-chip="${id}">${esc(label)}</button>`).join("") + `</div>`;

  let pool = IBD_DRUGS;
  if (pin) pool = IBD_DRUGS.filter(d => pin.cls.includes(d.cls));
  else if (!sit) pool = ibdFilter(IBD_DRUGS, ibdChip);
  const list = q ? ibdSearch(pool, q) : pool;
  h += `<p class="bcount mono">${q || ibdChip !== "all" ? list.length + " of " + IBD_DRUGS.length + " drugs" : IBD_DRUGS.length + " drugs · tap one for its card"}` +
    (list.some(d => d.off) ? `<span class="offkey"><i class="dr-off"></i>Off-label</span>` : "") + `</p>`;
  if (!list.length && !sit) h += `<div class="bempty">No drug matches. Try a brand, a class or a test, like "Remicade", "JAK" or "lipids".</div>`;

  if (sit) {
    const {s, groups} = sit;
    h += `<div class="ibd-sit"><p class="mono">${esc(s.n)}</p><p>${esc(s.sum)}<span class="sts">${ibdTags(s.src)}</span></p></div>`;
    const keep = new Set(list.map(d => d.id));
    for (const [k, label] of [["ok", "Good fit"], ["care", "Use with care"], ["avoid", "Avoid"], ["none", "Not addressed"]]) {
      const rows = groups[k].filter(x => keep.has(x.d.id));
      if (!rows.length) continue;
      h += `<div class="bgrp v-${k}"><i class="vdot"></i><span class="mono">${label}</span><span class="mono n">${rows.length}</span></div>`;
      h += rows.map(x => ibdDrugHTML(x.d, {why: x.why, src: x.src})).join("");
    }
  } else if (q) {
    h += list.map(d => ibdDrugHTML(d, {only: list.length === 1})).join("");
  } else {
    for (const c of IBD_CLASSES) {
      const ds = list.filter(d => d.cls === c.id);
      if (!ds.length) continue;
      h += `<div class="bgrp c-${c.id}"><i class="vdot"></i><span class="mono">${esc(c.n)}</span><span class="mono n">${ds.length}</span></div>`;
      h += ds.map(d => ibdDrugHTML(d)).join("");
    }
  }
  if (!q && ibdChip === "all") h += `<section class="ibd-soon"><p class="mono">Not in Canada yet</p>` +
    IBD_SOON.map(([n, t]) => `<p><b>${esc(n)}</b> ${esc(t)}</p>`).join("") + `</section>`;
  return h + `<p class="bfoot">Checked ${guidesDay(IBD_CHECKED)}, ${IBD_CHECKED.slice(0, 4)}, against current Health Canada monographs. ` +
    `Tags: HC Health Canada, CAG, NACI, CTS (TB standards) and CASL are Canadian; AGA and ACG American; GC the 2025 global pregnancy consensus; ` +
    `CPIC pharmacogenetics; ACR the American College of Rheumatology, for TB timing; ECCO European, used only where no Canadian or US source gives the detail; Practice means common practice. ` +
    `Reference tool: check the monograph and use clinical judgment.</p>`;
}

// ---- Taps and typing ------------------------------------------------------------------------------
// Called from guidesDispatch for guidesd* actions. Returns false when nothing needs redrawing.
function ibdDispatch(act, d) {
  if (act === "guidesdrug") { if (ibdOpen.has(d.id)) ibdOpen.delete(d.id); else { ibdOpen.add(d.id); ibdFresh = d.id; } return true; }
  if (act === "guidesdchip") { ibdChip = d.chip; route.keepScroll = true; return true; }
  if (act === "guidesdmap") {
    ibdChip = ibdChip === d.pin ? "all" : d.pin;
    if (ibdChip !== "all") guidesJump = "#ibd-list";
    return true;
  }
  if (act === "guidesdprep") { ibdPrepOpen = !ibdPrepOpen; if (ibdPrepOpen) ibdFresh = "prep"; return true; }
  if (act === "guidesdclear") { ibdTerm = ""; guidesJump = "#ibdq"; return true; }
  if (act === "guidesdcopy") { ibdCopy(d.id ? IBD_BY_ID[d.id] : null); return false; }
  if (act === "guidesdopen") {
    guidesTab = "d"; ibdTerm = ""; ibdChip = "all"; ibdOpen.add(d.id); guidesJump = "#d-" + d.id;
    if (route.page !== "guides") { go({page: "guides"}); return false; }
    return true;
  }
  return true;
}
function ibdCopy(drug) {
  const text = ibdWorkupText(drug);
  const done = ok => { showToast(ok ? "Copied the work-up" : "Copy isn't available here"); route.keepScroll = true; render(); };
  if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText)
    navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
  else done(false);
}
function ibdField(el) {
  if (!el || el.id !== "ibdq") return false;
  const caret = el.selectionStart;
  ibdTerm = el.value;
  route.keepScroll = true;
  render();
  const q = document.getElementById("ibdq");
  if (q) { q.focus(); try { q.setSelectionRange(caret, caret); } catch (e) {} }
  return true;
}
// The map's entrance plays once per visit to the IBD view.
function ibdAfterRender() {
  ibdFresh = null;
  if (route.page === "guides" && guidesTab === "d") ibdIntro = false;
  else ibdIntro = true;
}
