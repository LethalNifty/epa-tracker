"use strict";
// GI Hub guides: the Guides tab (the guideline library and the biopsy
// protocols), and the guideline links on the Study tab. The motif is white
// light: the reference view every other image is read against. Loaded after
// guides.js and before app.js; uses app.js helpers when it runs.

let guidesTab = "g";          // "g": guidelines, "b": biopsy protocols
let guidesTerm = "";
let guidesChip = "all";       // "all", "block", "pins", or a section id
const guidesOpen = new Set();
let guidesJump = null;        // a topic to scroll to after the next draw
// The news not yet seen when this visit to Guides began: its dots stay
// until the next visit, though the bar's dot clears at once.
let guidesVisit = null;

function guidesDay(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return MONTHS[m - 1] + " " + d;
}
function guidesSwitchHTML() {
  const b = (k, label) => `<button class="${guidesTab === k ? "on" : ""}" data-action="guidestab" data-tab="${k}"${guidesTab === k ? ` aria-current="page"` : ""}>${label}</button>`;
  return `<div class="segtabs" role="group" aria-label="Guides views">${b("g", "Guidelines")}${b("b", "Biopsy")}</div>`;
}
function guidesState() { return Store.state.guides; }

// ---- The white-light monitor: the library by lead-guideline year -----------------
function guidesLightHTML(D, today) {
  const f = guidesFreshness(D.topics, today), span = f.to - f.from + 1;
  // Each year is a little stack of beads, three across, Canadian at the base.
  const W = 320, H = 58, gap = W / span, cols = 3, step = Math.min(6.4, (gap - 2) / cols), r = step * .38;
  let dots = "";
  for (let y = f.from; y <= f.to; y++) {
    const c = f.by[y];
    if (!c) continue;
    const x0 = (y - f.from + .5) * gap - (cols - 1) * step / 2;
    for (let i = 0; i < c.all; i++) {
      const cls = i < c.ca ? "ca" : y >= f.to - 2 ? "fresh" : f.to - y >= GUIDES_OLD_YEARS ? "old" : "";
      const cx = x0 + (i % cols) * step, cy = H - 3 - Math.floor(i / cols) * step;
      dots += `<circle class="${cls}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(2)}"/>`;
    }
  }
  const ticks = [f.from, Math.round((f.from + f.to) / 2), f.to].map((y, i) =>
    `<span style="left:${((y - f.from + .5) / span * 100).toFixed(1)}%"${i === 2 ? ' class="now"' : ""}>${y}</span>`).join("");
  return `<section class="monitor guidemon" aria-label="The library by year">` +
    `<div class="monitor-in"><div class="ov mono"><span>Reference · white light</span><span>Checked ${guidesDay(D.checked)}</span></div>` +
    `<svg class="gl-beads" viewBox="0 0 ${W} ${H}" aria-hidden="true">${dots}</svg>` +
    `<div class="gl-years mono">${ticks}</div>` +
    `<p class="gl-sum"><b>${f.recent}</b> topics led by a guideline from the last 3 years · <b class="ca">${f.ca}</b> Canadian-led` +
    (f.old ? ` · <b class="old">${f.old}</b> ${GUIDES_OLD_YEARS} or more years old` : "") + `</p></div></section>`;
}

// ---- New --------------------------------------------------------------------------------
function guidesNewsHTML(news, unseen) {
  if (!news.length) return "";
  const fresh = new Set(unseen.map(n => n.k));
  return `<section class="gnew" aria-label="New guidelines"><div class="gnew-h mono"><span>New · last ${GUIDES_NEW_DAYS} days</span><span>${news.length}</span></div>` +
    news.slice(0, 6).map(n => `<button class="gnew-row" data-action="guidesopen" data-id="${esc(n.topic.id)}">` +
      `<span class="d mono">${guidesDay(n.d)}</span><span class="tx"><b class="${n.ca ? "ca" : ""}">${esc(n.w)} ${n.y}</b> ${esc(n.t)}` +
      `<span class="tp">${esc(n.topic.n)}</span></span>${fresh.has(n.k) ? '<i class="gdot" aria-label="Not seen yet"></i>' : ""}${ic("forward", "sm")}</button>`).join("") +
    `</section>`;
}

// ---- One topic ------------------------------------------------------------------------------
function guidesLinkHTML(d, alt) {
  return `<a class="glink${d.ca ? " ca" : ""}${alt ? " alt" : ""}" href="${esc(d.u)}" target="_blank" rel="noopener">` +
    `<span class="who mono">${esc(d.w)}<span class="yr">${d.y}</span></span><span class="tt">${esc(d.t)}` +
    `${d.ca && !alt ? '<span class="catag mono">CA</span>' : ""}</span>${ic("external", "sm")}</a>`;
}
function guidesReadHTML(t) {
  const out = [];
  for (const ch of t.ch) {
    const c = typeof STUDY_CH !== "undefined" && STUDY_CH[ch];
    if (!c) continue;
    const it = STUDY_ITEMS.find(x => x.ch === ch);
    out.push(`<span class="gread">${ic("study", "sm")}<span>Mayo ch. ${ch} · ${esc(c[0])} · pp. ${c[1]}–${c[2]}` +
      `${it ? ` · Block ${it.block}` : ""}</span></span>`);
  }
  return out.join("");
}
function guidesTopicHTML(t, opts = {}) {
  const open = guidesOpen.has(t.id) || !!opts.only, today = getToday(), pinned = guidesState().pins.includes(t.id);
  const lead = t.p[0], newsKeys = opts.newsKeys || new Set();
  const isNew = t.p.concat(t.a).some(d => newsKeys.has(d.k));
  const year = lead ? guidesLeadYear(t) : null, old = year && today.getFullYear() - year >= GUIDES_OLD_YEARS;
  let h = `<article class="gt${open ? " open" : ""}" id="g-${esc(t.id)}">` +
    `<button class="gt-head" data-action="guidestoggle" data-id="${esc(t.id)}" aria-expanded="${open}">` +
    `<span class="gt-name">${opts.sec ? `<span class="gt-sec mono">${esc(opts.sec)}</span>` : ""}${guidesHi(esc(t.n))}</span>` +
    (lead ? `<span class="gt-lead mono${lead.ca ? " ca" : ""}${old ? " old" : ""}">${esc(lead.w)} ${lead.y}${t.p.length > 1 ? `<span class="more">+${t.p.length - 1}</span>` : ""}</span>` :
      `<span class="gt-lead mono">Biopsy</span>`) +
    (isNew ? '<i class="gdot" aria-label="New"></i>' : "") + (pinned ? ic("star", "sm pin") : "") + ic("chev", "sm chev") + `</button>`;
  if (!open) return h + `</article>`;
  h += `<div class="gt-body">`;
  if (t.id === "biopsy") h += `<button class="btn" data-action="guidestab" data-tab="b">${ic("jar")}Open the biopsy protocols</button>`;
  h += t.p.map(d => guidesLinkHTML(d)).join("");
  if (old) h += `<p class="gt-warn">${ic("clock", "sm")}The lead guideline is ${GUIDES_OLD_YEARS} or more years old. Check for newer guidance.</p>`;
  if (t.a.length) h += `<div class="gt-sub mono">Also</div>` + t.a.map(d => guidesLinkHTML(d, true)).join("");
  if (t.c.length) h += `<div class="gt-sub mono">Scores and classifications</div><div class="gsc">` +
    t.c.map(c => `<a href="${esc(c.u)}" target="_blank" rel="noopener">${esc(c.t)}</a>`).join("") + `</div>`;
  const read = guidesReadHTML(t);
  const bx = t.bx.filter(title => BIOPSY_DATA.some(b => b.title === title));
  if (read || bx.length) h += `<div class="gt-meta">${read}` + bx.map(title =>
    `<button class="gread bx" data-action="guidesbx" data-q="${esc(title)}">${ic("jar", "sm")}<span>Biopsy: ${esc(title)}</span>${ic("forward", "sm")}</button>`).join("") + `</div>`;
  if (t.note) h += `<p class="gt-note">${esc(t.note)}</p>`;
  h += `<div class="gt-acts"><button class="textbtn sm${pinned ? " on" : ""}" data-action="guidespin" data-id="${esc(t.id)}" aria-pressed="${pinned}">` +
    `${ic("star", "sm")}${pinned ? "Pinned" : "Pin to the top"}</button></div>`;
  return h + `</div></article>`;
}
// Search words lit in topic names.
function guidesHi(html) {
  const words = guidesNorm(guidesTerm).split(" ").filter(w => w.length > 1);
  if (!words.length) return html;
  const re = new RegExp("(" + words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?![^<]*>)", "ig");
  return html.replace(re, "<mark>$1</mark>");
}

// ---- The tab ------------------------------------------------------------------------------------
function viewGuides() {
  const today = getToday(), blk = blockFor(today), D = Guides.data;
  const head = (eyebrow, meta) => `<header class="ph"><p class="eyebrow mono">${eyebrow}</p><h1 class="title">Guides</h1>${meta}</header>`;
  if (guidesTab === "b")
    return head("Shared Health Manitoba · 2022", `<p class="ph-note">Biopsy protocols: Manitoba first; other sources where it's silent.</p>`) +
      guidesSwitchHTML() + viewBiopsy({embedded: true});
  if (!D)
    return head("Guideline library", "") + guidesSwitchHTML() +
      `<div class="card empty spaced">${Guides.status === "idle" ? "Loading the guideline library." :
        "The guideline library downloads the first time Guides opens with signal. Biopsy protocols work offline now."}</div>`;
  const st = guidesState(), news = guidesNews(D.topics, today);
  if (!guidesVisit) guidesVisit = new Set(guidesUnseen(news, st.seen).map(n => n.k));
  const unseen = news.filter(n => guidesVisit.has(n.k)), newsKeys = guidesVisit;
  const q = guidesTerm.trim();
  let h = head(`${D.topics.length} topics · Canadian first`, `<p class="ph-note">Current guidelines by topic, best one first. Links open the publisher's page.</p>`) + guidesSwitchHTML();
  if (!q && guidesChip === "all") h += guidesLightHTML(D, today) + guidesNewsHTML(news, unseen);
  h += `<div class="qwrap">${ic("search")}<input id="guidesq" type="search" placeholder="Search: C diff, Baveno, ACG" aria-label="Search guidelines" ` +
    `autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(guidesTerm)}">` +
    (guidesTerm ? `<button class="qclear" data-action="guidesclear" aria-label="Clear">${ic("x")}</button>` : "") + `</div>`;
  const blockTopics = blk ? guidesForBlock(D.topics, blk.num) : [];
  const chips = [["all", "All", null]];
  if (blk) chips.push(["block", `Block ${blk.num} · ${GUIDES_FAMILY_LABEL[BLOCK_FAMILY[blk.num]] || esc(blk.name)}`, "week"]);
  if (st.pins.length) chips.push(["pins", `Pinned ${st.pins.length}`, "star"]);
  for (const s of D.sections) chips.push([s.id, s.name === "Pancreas and biliary" ? "Pancreas" : s.name === "Screening and polyps" ? "Screening" :
    s.name === "Endoscopy practice" ? "Endoscopy" : s.name, s.glyph]);
  h += `<div class="bcats gcats">` + chips.map(([id, label, glyph]) => `<button class="bcat${guidesChip === id ? " on" : ""}" data-action="guideschip" data-chip="${esc(id)}">` +
    `${glyph ? ic(glyph) : ""}${label}</button>`).join("") + `</div>`;
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    h += `<p class="gt-off">${ic("alert", "sm")}Offline: the list works; links open once you have signal.</p>`;
  // What the list shows.
  let pool = D.topics, groups = null;
  if (guidesChip === "block") {
    const {ch, items} = guidesBlockReading(blk ? blk.num : 0), fam = blk && BLOCK_FAMILY[blk.num];
    const fromItems = new Set(items.flatMap(id => GUIDES_BY_ITEM[id]));
    const reading = blockTopics.filter(t => t.ch.some(c => ch.includes(c)) || fromItems.has(t.id));
    groups = [["This block's reading", "study", reading], [`On ${blk ? esc(blk.name) : "this rotation"}`, "week", blockTopics.filter(t => !reading.includes(t))]];
    pool = blockTopics;
    if (fam === "consults") groups[1][0] = "On consults";
  } else if (guidesChip === "pins") {
    pool = st.pins.map(id => Guides.byId[id]).filter(Boolean);
    groups = [["Pinned", "star", pool]];
  } else if (guidesChip !== "all") pool = D.topics.filter(t => t.s === guidesChip);
  const list = q ? guidesSearch(pool, q) : pool;
  if (q && groups) groups = groups.map(([l, g, ts]) => [l, g, list.filter(t => ts.includes(t))]);
  h += `<p class="bcount mono">${q || guidesChip !== "all" ? list.length + " of " + D.topics.length + " topics" : D.topics.length + " topics · tap one for its guidelines"}</p>`;
  if (!list.length) h += `<div class="bempty">No topic matches. Try a drug, a score or a society, like "ACG".</div>`;
  const opts = {newsKeys};
  if (groups) {
    for (const [label, glyph, ts] of groups) {
      if (!ts.length) continue;
      h += `<div class="bgrp">${ic(glyph)}<span class="mono">${label}</span><span class="mono n">${ts.length}</span></div>`;
      h += ts.map(t => guidesTopicHTML(t, {...opts, sec: D.secs[t.s].name})).join("");
    }
  } else if (q) {
    // One match: it opens by itself.
    h += list.map(t => guidesTopicHTML(t, {...opts, sec: D.secs[t.s].name, only: list.length === 1})).join("");
  } else {
    let sec = "";
    for (const t of list) {
      if (t.s !== sec) {
        sec = t.s;
        const S = D.secs[sec];
        h += `<div class="bgrp">${S.glyph ? ic(S.glyph) : ""}<span class="mono">${esc(S.name)}</span><span class="mono n">${list.filter(x => x.s === sec).length}</span></div>`;
      }
      h += guidesTopicHTML(t, opts);
    }
  }
  return h + `<p class="bfoot">Canadian guidance comes first and is marked CA; where it is older than the American, both are linked. ` +
    `European guidelines are not added yet. The library is checked weekly. ` +
    `Reference tool: check the guideline itself and use clinical judgment.</p>`;
}

// ---- Study: the guidelines for tonight's chapter -------------------------------------------
function guidesStudyHTML(item) {
  if (!Guides.data || !item) return "";
  const ts = guidesForItem(Guides.data.topics, item);
  if (!ts.length) return "";
  return `<div class="gstudy"><span class="mono">Guidelines for this reading</span><div class="gstudy-row">` +
    ts.map(t => `<button class="chip" data-action="guidesopen" data-id="${esc(t.id)}">${ic("guides")}${esc(t.n)}</button>`).join("") + `</div></div>`;
}

// ---- Taps and typing ---------------------------------------------------------------------------
// Returns false when nothing needs redrawing.
function guidesDispatch(act, d) {
  if (act === "guidestab") { guidesTab = d.tab; if (route.page !== "guides") { go({page: "guides"}); return false; } route.keepScroll = false; enterNext = true; return true; }
  if (act === "guideschip") { guidesChip = d.chip; guidesOpen.clear(); route.keepScroll = false; return true; }
  if (act === "guidestoggle") { if (guidesOpen.has(d.id)) guidesOpen.delete(d.id); else guidesOpen.add(d.id); return true; }
  if (act === "guidespin") { Store.toggleGuidePin(d.id); return true; }
  if (act === "guidesclear") { guidesTerm = ""; guidesJump = "#guidesq"; return true; }
  if (act === "guidesopen") {
    guidesTab = "g"; guidesTerm = ""; guidesChip = "all"; guidesOpen.add(d.id); guidesJump = "#g-" + d.id;
    if (route.page !== "guides") { go({page: "guides"}); return false; }
    return true;
  }
  if (act === "guidesbx") { guidesTab = "b"; biopsyTerm = d.q; biopsyCat = "all"; route.keepScroll = false; enterNext = true; return true; }
  return true;
}
function guidesField(el) {
  if (!el || el.id !== "guidesq") return false;
  const caret = el.selectionStart;
  guidesTerm = el.value;
  route.keepScroll = true;
  render();
  const q = document.getElementById("guidesq");
  if (q) { q.focus(); try { q.setSelectionRange(caret, caret); } catch (e) {} }
  return true;
}
// After a draw: scroll a jumped-to topic into view, and mark today's news seen.
function guidesAfterRender() {
  if (route.page !== "guides") { guidesVisit = null; return; }
  if (guidesTab !== "g" || !Guides.data) return;
  const news = guidesNews(Guides.data.topics, getToday());
  if (guidesUnseen(news, Store.state.guides.seen).length) Store.markGuidesSeen(news.map(n => n.k));
  if (!guidesJump) return;
  const sel = guidesJump; guidesJump = null;
  if (sel === "#guidesq") { const q = document.getElementById("guidesq"); if (q) q.focus(); return; }
  const el = document.querySelector && document.querySelector(sel);
  if (el && el.scrollIntoView) el.scrollIntoView({block: "start", behavior: "smooth"});
}
// Redraws once the library arrives, unless a sheet is open or a field has
// the keyboard.
function guidesRedraw() {
  const a = typeof document !== "undefined" && document.activeElement;
  if (sheet || studySheet || scopeSheet || scopePick || (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA"))) return;
  route.keepScroll = true;
  render();
}
// The bar's dot: guidelines published this month that this phone hasn't shown.
function guidesUnseenCount() {
  if (!Guides.data) return 0;
  return guidesUnseen(guidesNews(Guides.data.topics, getToday()), Store.state.guides.seen).length;
}
