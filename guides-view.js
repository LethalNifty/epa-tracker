"use strict";
// GI Hub guides: the Guides tab (the guideline library, landmark trials, the
// biopsy protocols and IBD drugs), and the guideline links on the Study tab. The motif is white
// light: the reference view every other image is read against. Loaded after
// guides.js and before app.js; uses app.js helpers when it runs.

let guidesTab = "g";          // "g": guidelines, "t": landmark trials, "b": biopsy protocols, "d": IBD drugs
let guidesTerm = "";
let guidesChip = "all";       // "all", "block", "pins", or a section id
const guidesOpen = new Set();
const guidesSecs = new Set();  // sections unfolded in the full list
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
  // Trials carries a dot while the weekly watch has a trial this phone hasn't shown.
  const tdot = guidesTab !== "t" && Guides.data && trialsWatchUnseenCount() ? '<i class="gdot" aria-label="New trials"></i>' : "";
  return `<div class="segtabs four" role="group" aria-label="Guides views">${b("g", "Guidelines")}${b("t", "Trials" + tdot)}${b("d", "IBD drugs")}${b("b", "Biopsy")}</div>`;
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
    `<div class="monitor-in"><div class="ov mono"><span>Reference library</span><span>Checked ${guidesDay(D.checked)}</span></div>` +
    `<svg class="gl-beads" viewBox="0 0 ${W} ${H}" aria-hidden="true">${dots}</svg>` +
    `<div class="gl-years mono">${ticks}</div>` +
    `<p class="gl-sum"><b>${f.recent}</b> topics led by a guideline from the last 3 years · <b class="ca">${f.ca}</b> Canadian-led` +
    (f.old ? ` · <b class="old">${f.old}</b> with a lead guideline ${GUIDES_OLD_YEARS} or more years old` : "") + `</p></div></section>`;
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
  let h = `<article class="gt${open ? " open" : ""}" id="${opts.idp || "g-"}${esc(t.id)}">` +
    `<button class="gt-head" data-action="guidestoggle" data-id="${esc(t.id)}" aria-expanded="${open}">` +
    `<span class="gt-name">${opts.sec ? `<span class="gt-sec mono">${esc(opts.sec)}</span>` : ""}${guidesHi(esc(t.n))}</span>` +
    (lead ? `<span class="gt-lead mono${lead.ca ? " ca" : ""}${old ? " old" : ""}">${esc(lead.w)} ${lead.y}${t.p.length > 1 ? `<span class="more">+${t.p.length - 1}</span>` : ""}</span>` :
      `<span class="gt-lead mono">Biopsy</span>`) +
    (isNew ? '<i class="gdot" aria-label="New"></i>' : "") + (pinned ? ic("star", "sm pin") : "") + ic("chev", "sm chev") + `</button>`;
  if (!open) return h + `</article>`;
  h += `<div class="gt-body">`;
  if (t.id === "biopsy") h += `<button class="btn" data-action="guidestab" data-tab="b">${ic("jar")}Open the biopsy protocols</button>`;
  if (t.s === "ibd") h += `<button class="btn" data-action="guidestab" data-tab="d">${ic("shield")}Open the IBD drug reference</button>`;
  h += t.p.map(d => guidesLinkHTML(d)).join("");
  if (old) h += `<p class="gt-warn">${ic("clock", "sm")}The lead guideline is ${GUIDES_OLD_YEARS} or more years old. Check for newer guidance.</p>`;
  if (t.a.length) h += `<div class="gt-sub mono">Also</div>` + t.a.map(d => guidesLinkHTML(d, true)).join("");
  if (t.c.length) h += `<div class="gt-sub mono">Scores and classifications</div><div class="gsc">` +
    t.c.map(c => `<a href="${esc(c.u)}" target="_blank" rel="noopener">${esc(c.t)}</a>`).join("") + `</div>`;
  h += trialsTopicHTML(t) + pearlsTopicHTML(t);
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
const guidesHi = html => searchHi(html, guidesTerm);

// ---- One search across Guides ----------------------------------------------------------------------
// The Guidelines box searches every part of Guides the way each part's own box
// does, so a count here is what that tab shows for the same words.
const GUIDES_KINDS = [["g", "Guidelines", "guides", "Guidelines"], ["t", "Trials", "trial", "Landmark trials"], ["d", "IBD drugs", "shield", "IBD drugs"],
  ["b", "Biopsy", "jar", "Biopsy"], ["p", "Pearls", "pearl", "Your pearls"]];
function guidesFind(q) {
  const found = {g: guidesScored(Guides.data.topics, q), t: trialsScored(TRIALS, q), d: ibdScored(IBD_DRUGS, q),
    b: biopsyScored(q), p: pearlsScored(Store.state.pearls, q)};
  // Trials, like the Trials tab, also lists what the weekly watch kept, after the landmark ones.
  const watch = trialsWatchSearch(trialsWatch(Guides.data), q, Guides.byId);
  return GUIDES_KINDS.map(([k, chip, icon, head], i) => ({k, chip, icon, head, i,
    list: found[k].map(x => x.item).concat(k === "t" ? watch : []),
    top: Math.max(k === "t" && watch.length ? 1 : 0, ...found[k].map(x => x.score))}));
}
// A count for each kind, then each kind's matches, the best-matching kind first.
// Trials, drugs, protocols and pearls show their best three; the count opens the rest.
function guidesFindHTML(q, D, opts) {
  const kinds = guidesFind(q), total = kinds.reduce((a, x) => a + x.list.length, 0);
  let h = `<div class="bcats gfind" data-key="find">` + kinds.map(x => `<button class="bcat${x.k === "g" ? " on" : ""}" data-action="guidesfind" data-tab="${x.k}"` +
    (x.list.length ? "" : " disabled") + `>${ic(x.icon)}${x.chip} <b>${x.list.length}</b></button>`).join("") + `</div>`;
  if (!total) return h + `<div class="bempty">Nothing in Guides matches. Try a drug, a score or a society, like "ACG".</div>`;
  h += `<p class="bcount mono">${total} found across Guides</p>`;
  const row = (act, attr, title, sub) => `<button class="gf-row" data-action="${act}" ${attr}><span class="gf-t">${searchHi(esc(title), q)}</span>` +
    `<span class="gf-s">${searchHi(esc(sub), q)}</span></button>`;
  const rows = (x, fn) => `<div class="card list gf-list">${x.list.slice(0, 3).map(fn).join("")}</div>`;
  const more = x => x.list.length > 3 ? `<button class="gmore" data-action="guidesfind" data-tab="${x.k}">All ${x.list.length} in ${x.chip}${ic("forward", "sm")}</button>` : "";
  const body = {
    // One topic: it opens by itself.
    g: x => x.list.map(t => guidesTopicHTML(t, {...opts, sec: D.secs[t.s].name, only: x.list.length === 1})).join(""),
    t: x => {
      const top = x.list.slice(0, 3), lt = top.filter(t => TRIALS_BY_ID[t.id] === t), wk = top.filter(t => !lt.includes(t));
      return (lt.length ? `<div class="lt-minis lt-found">${lt.map(trialsMiniHTML).join("")}</div>` : "") +
        (wk.length ? rows({list: wk}, r => row("guidesfind", `data-tab="t"`, (r.n ? r.n + " · " : "") + trialsJournal(r.w), "Weekly watch · " + r.t)) : "") + more(x);
    },
    d: x => rows(x, d => row("guidesdopen", `data-id="${esc(d.id)}"`, d.n, d.brands + " · " + IBD_CLASS_BY_ID[d.cls].n)) + more(x),
    b: x => rows(x, b => row("guidesbx", `data-q="${esc(b.title)}"`, b.title, b.cat + " · " + (b.src === "mb" ? "Manitoba" : b.ref.short))) + more(x),
    p: x => rows(x, p => row("pearledit", `data-id="${esc(p.id)}"`, p.t, pearlDay(p.d) + (p.who ? " · " + p.who : ""))) + more(x),
  };
  for (const x of kinds.filter(x => x.list.length).sort((a, b) => b.top - a.top || a.i - b.i))
    h += `<div class="bgrp">${ic(x.icon)}<span class="mono">${x.head}</span><span class="mono n">${x.list.length}</span></div>` + body[x.k](x);
  return h;
}

// ---- The tab ------------------------------------------------------------------------------------
function viewGuides() {
  // The fellows' edition knows no one's rotations, so it has no block chip.
  const today = getToday(), blk = FELLOWS ? null : blockFor(today), D = Guides.data;
  const head = (eyebrow, meta) => `<header class="ph"><p class="eyebrow mono">${eyebrow}</p><h1 class="title">Guides</h1>${meta}</header>`;
  if (guidesTab === "b")
    return head("Shared Health Manitoba · 2022", `<p class="ph-note">Biopsy protocols: Manitoba first; other sources where it's silent.</p>`) +
      guidesSwitchHTML() + viewBiopsy({embedded: true});
  if (guidesTab === "t")
    return head(`Landmark trials · checked ${guidesDay(TRIALS_CHECKED)}`, `<p class="ph-note">The trials staff ask about: what each asked, what it found, what it changed, and where Canada differs.</p>`) +
      guidesSwitchHTML() + viewTrials();
  if (guidesTab === "d")
    return head("Health Canada · CAG · NACI", `<p class="ph-note">Every IBD drug sold in Canada: use, dose, work-up, monitoring and pregnancy, each line tagged with its source.</p>`) +
      guidesSwitchHTML() + viewIbd();
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
  h += `<div class="qwrap">${ic("search")}<input id="guidesq" type="search" placeholder="Search: Baveno, vedolizumab, celiac" aria-label="Search Guides" ` +
    `autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(guidesTerm)}">` +
    (guidesTerm ? `<button class="qclear" data-action="guidesclear" aria-label="Clear">${ic("x")}</button>` : "") + `</div>`;
  if (q) return h + guidesFindHTML(q, D, {newsKeys}) + guidesFootHTML();
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
  const list = pool;
  h += `<p class="bcount mono">${guidesChip !== "all" ? list.length + " of " + D.topics.length + " topics" : D.topics.length + " topics · tap one for its guidelines"}</p>`;
  if (!list.length) h += `<div class="bempty">Nothing pinned yet.</div>`;
  const opts = {newsKeys};
  if (groups) {
    for (const [label, glyph, ts] of groups) {
      if (!ts.length) continue;
      h += `<div class="bgrp">${ic(glyph)}<span class="mono">${label}</span><span class="mono n">${ts.length}</span></div>`;
      h += ts.map(t => guidesTopicHTML(t, {...opts, sec: D.secs[t.s].name})).join("");
    }
  } else if (guidesChip === "all") {
    // This block's first six topics (the Block chip has the rest), then every
    // section folded to one row that unfolds in place.
    if (blockTopics.length) {
      h += `<div class="bgrp">${ic("week")}<span class="mono">Block ${blk.num} · ${esc(blk.name)}</span><span class="mono n">${blockTopics.length}</span></div>` +
        blockTopics.slice(0, 6).map(t => guidesTopicHTML(t, {...opts, sec: D.secs[t.s].name, idp: "gb-"})).join("") +
        (blockTopics.length > 6 ? `<button class="gmore" data-action="guideschip" data-chip="block">${blockTopics.length - 6} more for this block${ic("forward", "sm")}</button>` : "") +
        `<div class="bgrp">${ic("guides")}<span class="mono">Every topic</span><span class="mono n">${D.topics.length}</span></div>`;
    }
    let rows = [];
    const flush = () => { if (rows.length) h += `<div class="card list gsecs">${rows.join("")}</div>`; rows = []; };
    for (const S of D.sections) {
      const ts = D.topics.filter(t => t.s === S.id), open = guidesSecs.has(S.id);
      rows.push(`<button class="gsec${open ? " open" : ""}" data-action="guidessec" data-id="${esc(S.id)}" aria-expanded="${open}">` +
        `${ic(S.glyph || "guides")}<span class="gs-n">${esc(S.name)}</span><span class="mono">${ts.length}</span>${ic("chev", "sm chev")}</button>`);
      if (open) { flush(); h += ts.map(t => guidesTopicHTML(t, opts)).join(""); }
    }
    flush();
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
  return h + guidesFootHTML();
}
function guidesFootHTML() {
  return `<p class="bfoot">Canadian guidance comes first and is marked CA; where it is older than the American, both are linked. ` +
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
function guidesUnfold(id) { const t = Guides.byId[id]; if (t) guidesSecs.add(t.s); }
// Returns false when nothing needs redrawing.
function guidesDispatch(act, d) {
  if (act.startsWith("guidesd")) return ibdDispatch(act, d);
  if (act.startsWith("guidestr")) return trialsDispatch(act, d);
  if (act === "guidestab") { guidesTab = d.tab; if (route.page !== "guides") { go({page: "guides"}); return false; } route.keepScroll = false; enterNext = true; return true; }
  if (act === "guideschip") { guidesChip = d.chip; guidesOpen.clear(); route.keepScroll = false; return true; }
  // From the search's counts: that part of Guides, searching the same words.
  if (act === "guidesfind") {
    const q = guidesTerm.trim();
    if (d.tab === "p") { pearlsQ = q; go({page: "pearls", from: "guides"}); return false; }
    if (d.tab === "t") { trialsTerm = q; trialsChip = "all"; }
    else if (d.tab === "d") { ibdTerm = q; ibdChip = "all"; }
    else if (d.tab === "b") { biopsyTerm = q; biopsyCat = "all"; }
    else return false;
    guidesTab = d.tab; route.keepScroll = false; enterNext = true; return true;
  }
  // Opening a topic unfolds its section, so it is on the page wherever it was opened from.
  if (act === "guidestoggle") { if (guidesOpen.has(d.id)) guidesOpen.delete(d.id); else { guidesOpen.add(d.id); guidesUnfold(d.id); } return true; }
  if (act === "guidessec") { if (guidesSecs.has(d.id)) guidesSecs.delete(d.id); else guidesSecs.add(d.id); return true; }
  if (act === "guidespin") { Store.toggleGuidePin(d.id); return true; }
  if (act === "guidesclear") { guidesTerm = ""; guidesJump = "#guidesq"; return true; }
  if (act === "guidesopen") {
    guidesTab = "g"; guidesTerm = ""; guidesChip = "all"; guidesOpen.add(d.id); guidesUnfold(d.id); guidesJump = "#g-" + d.id;
    if (route.page !== "guides") { go({page: "guides"}); return false; }
    return true;
  }
  if (act === "guidesbx") { guidesTab = "b"; biopsyTerm = d.q; biopsyCat = "all"; route.keepScroll = false; enterNext = true; return true; }
  return true;
}
function guidesField(el) {
  if (ibdField(el) || trialsField(el)) return true;
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
  ibdAfterRender();
  trialsAfterRender();
  guidesCatsAfterRender();
  if (route.page !== "guides") { guidesVisit = null; return; }
  if (guidesTab === "g" && Guides.data) {
    const news = guidesNews(Guides.data.topics, getToday());
    if (guidesUnseen(news, Store.state.guides.seen).length) Store.markGuidesSeen(news.map(n => n.k));
  }
  if (!guidesJump) return;
  const sel = guidesJump; guidesJump = null;
  if (sel === "#guidesq" || sel === "#ibdq" || sel === "#trialsq") { const q = document.getElementById(sel.slice(1)); if (q) q.focus(); return; }
  const el = document.querySelector && document.querySelector(sel);
  if (el && el.scrollIntoView) el.scrollIntoView({block: "start", behavior: "smooth"});
}
// Chip rows scroll sideways (Guidelines, Trials, IBD drugs, Biopsy). Each keeps its
// place across redraws, brings a newly picked chip clear of the faded edges,
// and fades whichever edge has more chips past it.
const guidesCats = {};
function guidesCatsAfterRender() {
  if (route.page !== "guides" || typeof document === "undefined" || !document.querySelectorAll) return;
  document.querySelectorAll(".bcats").forEach((row, i) => {
    const key = guidesTab + ((row.dataset && row.dataset.key) || i);
    const st = guidesCats[key] || (guidesCats[key] = {x: 0, on: null});
    row.scrollLeft = st.x;
    const on = row.querySelector(".bcat.on");
    const id = on ? on.getAttribute("data-chip") || on.getAttribute("data-cat") : null;
    if (on && st.on !== null && id !== st.on) {
      // The fades are 34 px (left) and 48 px (right) wide.
      const l = on.offsetLeft - 40, r = on.offsetLeft + on.offsetWidth + 54 - row.clientWidth;
      if (row.scrollLeft > l) row.scrollLeft = l;
      else if (row.scrollLeft < r) row.scrollLeft = r;
    }
    st.on = id;
    const edges = () => {
      st.x = row.scrollLeft;
      row.classList.toggle("fl", row.scrollLeft > 4);
      row.classList.toggle("fr", row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
    };
    edges();
    row.onscroll = edges;
  });
}
// Redraws once the library arrives, unless a sheet is open or a field has
// the keyboard.
function guidesRedraw() {
  const a = typeof document !== "undefined" && document.activeElement;
  if (anySheet() || (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA"))) return;
  route.keepScroll = true;
  render();
}
// The bar's dot: guidelines published this month, and trials the weekly watch
// kept, that this phone hasn't shown.
function guidesUnseenCount() {
  if (!Guides.data) return 0;
  return guidesUnseen(guidesNews(Guides.data.topics, getToday()), Store.state.guides.seen).length + trialsWatchUnseenCount();
}
