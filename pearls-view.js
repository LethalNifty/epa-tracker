"use strict";
// Pearls on screen: the catch sheet (from the +), the Pearls page off Study,
// Study's Pearls card, a topic's pearls in Guides, and Send. Reads pearls.js,
// the store (app.js) and the guideline library (guides.js).

let pearlSheet = null, pearlSheetFresh = false, pearlsQ = "", pearlsError = null;
const pearlList = () => Store.state.pearls;
const pearlCount = n => `${n} pearl${n === 1 ? "" : "s"}`;

// ---- The catch sheet ------------------------------------------------------------------------------
function pearlOpen(id) {
  const p = id && pearlList().find(x => x.id === id);
  pearlSheet = p ? {mode: "edit", id: p.id, t: p.t, who: p.who, topic: p.topic, d: p.d, sent: p.sent}
    : {mode: "new", t: "", who: "", topic: "", d: fmtDate(getToday()), sent: null};
  Object.assign(pearlSheet, {more: false, tq: "", err: null});
  pearlSheetFresh = true;
}
// The chosen topic, then the topics the words point to (or, once Other topic
// is open, the ones the search finds). Tapping the chosen one clears it.
function pearlTopicsHTML() {
  const s = pearlSheet;
  if (!s) return "";
  const topics = Guides.data ? Guides.data.topics : [];
  const chip = (id, on) => `<button class="pick ghost${on ? " on" : ""}" data-action="pearltopic" data-id="${esc(id)}">${esc(pearlTopicName(id))}</button>`;
  const found = s.more && s.tq.trim() ? guidesSearch(topics, s.tq).slice(0, 6) : pearlTopicGuess(s.t, topics);
  return (s.topic ? chip(s.topic, true) : "") + found.filter(t => t.id !== s.topic).map(t => chip(t.id, false)).join("") +
    (!s.more && topics.length ? `<button class="pick ghost more" data-action="pearltopicmore">${ic("search", "sm")}Other topic</button>` : "");
}
// Names already used for pearls, newest first, then the Endo staff by
// surname, as the observation sheet asks for them; each person once.
function pearlWhoNames() {
  const out = [], seen = new Set();
  const add = n => { const k = (n || "").toLowerCase(); if (k && !seen.has(k)) { seen.add(k); out.push(n); } };
  for (const p of pearlsNewest(pearlList())) add(scopeBare(p.who));
  for (const st of Store.state.scopes.staff) if (!st.hidden) add(scopeSurname(st));
  return out;
}
function pearlWhoHTML() {
  const s = pearlSheet;
  if (!s) return "";
  const typed = s.who.trim().toLowerCase();
  return pearlWhoNames().filter(n => !typed || (n.toLowerCase().includes(typed) && n.toLowerCase() !== typed)).slice(0, 4)
    .map(n => `<button class="pick ghost" data-action="pearlwho" data-name="${esc(n)}">${esc(n)}</button>`).join("");
}
function pearlWarnHTML() {
  return pearlSheet && pearlFlagged(pearlSheet.t)
    ? `${ic("alert", "sm")}<span>This may hold a patient detail. Keep only the teaching point.</span>` : "";
}
function pearlSheetHTML() {
  const s = pearlSheet, fresh = pearlSheetFresh ? " fresh" : "", edit = s.mode === "edit", today = getToday();
  const title = edit ? "Edit pearl" : "Catch a pearl";
  const iso = fmtDate(today), yest = fmtDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
  const dchip = (d, label) => `<button class="pick ghost${s.d === d ? " on" : ""}" data-action="pearldate" data-date="${d}">${label}</button>`;
  const topics = Guides.data || s.topic
    ? `<div class="lbl mono">Topic</div>` + (s.more ? `<div class="qwrap slim">${ic("search")}<input id="pearltq" type="search" value="${esc(s.tq)}" ` +
        `data-pearl="tq" placeholder="Search topics" autocomplete="off" autocapitalize="off" aria-label="Search topics"></div>` : "") +
      `<div class="pickrow" id="pearltopics">${pearlTopicsHTML()}</div>` : "";
  return `<div class="scrim${fresh}" data-action="pearlclose"></div>` +
    `<div class="sheet pearlsheet${fresh}" role="dialog" aria-modal="true" aria-label="${title}"><div class="grab"></div>` +
    `<div class="shead"><b>${title}</b><button class="iconbtn" data-action="pearlclose" aria-label="Close">${ic("x")}</button></div>` +
    `<p class="ssub">Teaching point only. No patient details.</p>` +
    `<section class="monitor capmon prlmon" aria-label="Say the pearl"><div class="monitor-in">` +
    `<div class="ov mono"><span id="pearlday">${pearlDay(s.d)}</span><span>Pearl</span></div>` +
    `<textarea id="pearlbox" class="capbox" rows="3" data-pearl="t" placeholder="What did they teach?" autocapitalize="sentences" ` +
    `aria-label="Say or type the pearl">${esc(s.t)}</textarea>` +
    `<div class="cap-f"><span class="cap-hint">${ic("mic", "sm")}<span>Tap the mic on your keyboard and say it.</span></span></div>` +
    `<div class="prl-warn" id="pearlwarn" role="status">${pearlWarnHTML()}</div></div></section>` + topics +
    `<label class="lbl mono">Who said it<input type="text" value="${esc(s.who)}" data-pearl="who" placeholder="Optional. Stays on this phone." ` +
    `autocomplete="off" autocapitalize="words"></label><div class="pickrow sugg" id="pearlwho">${pearlWhoHTML()}</div>` +
    `<label class="lbl mono">Date<input type="date" value="${esc(s.d)}" data-pearl="d"></label>` +
    `<div class="datechips">${dchip(iso, "Today")}${dchip(yest, "Yesterday")}</div>` +
    (edit && s.sent ? `<p class="prl-sentnote">${ic("check", "sm")}<span>Sent ${pearlDay(s.sent)}</span>` +
      `<button class="textbtn" data-action="pearlunsend">Send again</button></p>` : "") +
    (edit && !s.sent && s.again ? `<p class="prl-sentnote">${ic("share", "sm")}<span>Goes out with the next send</span></p>` : "") +
    (s.err ? `<div class="err" role="alert">${esc(s.err)}</div>` : "") +
    `<div class="sactions">${edit ? `<button class="btn danger" data-action="pearldelete">Delete</button>` : ""}` +
    `<button class="btn primary" data-action="pearlsave">${edit ? "Save" : "Save pearl"}</button></div></div>`;
}
function pearlSave() {
  const s = pearlSheet, t = s.t.trim();
  if (!t) { s.err = "Say or type the pearl first."; return; }
  const fields = {t: t.slice(0, PEARL_MAX), who: s.who.trim().slice(0, PEARL_WHO_MAX), topic: s.topic,
    d: PEARL_ISO.test(s.d) ? s.d : fmtDate(getToday())};
  if (s.mode === "new") { const id = Store.addPearl(fields); showToast("Pearl saved", () => Store.removePearl(id)); }
  else { Store.updatePearl(s.id, {...fields, sent: s.sent}); showToast("Pearl updated"); }
  pearlSheet = null;
}
// Keeps the sheet in step with typing without a redraw (which would drop the
// keyboard): only the topic chips, the warning and the name suggestions change.
function pearlField(t) {
  const put = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  if (t.id === "pearlsq") { pearlsQ = t.value; put("pearlslist", pearlsListHTML()); return true; }
  const f = t.dataset && t.dataset.pearl;
  if (!f || !pearlSheet) return false;
  pearlSheet[f] = t.value;
  if (f === "t" || f === "tq") put("pearltopics", pearlTopicsHTML());
  if (f === "t") put("pearlwarn", pearlWarnHTML());
  if (f === "who") put("pearlwho", pearlWhoHTML());
  if (f === "d" && PEARL_ISO.test(t.value)) put("pearlday", pearlDay(t.value));
  return true;
}
// The change event fires as a field loses focus, often to a chip being
// tapped: redrawing the chips then would swap that chip out mid-tap and lose
// the tap. So it only keeps the value.
function pearlFieldChange(t) {
  const f = t.dataset && t.dataset.pearl;
  if (!f || !pearlSheet) return false;
  pearlSheet[f] = t.value;
  if (f === "d" && PEARL_ISO.test(t.value)) { const el = document.getElementById("pearlday"); if (el) el.innerHTML = pearlDay(t.value); }
  return true;
}

// ---- The Pearls page --------------------------------------------------------------------------------
function pearlRowHTML(p, opts = {}) {
  const tp = opts.noTopic ? "" : pearlTopicName(p.topic);
  return `<button class="prl" data-action="pearledit" data-id="${esc(p.id)}">` +
    `<span class="prl-top mono"><span>${pearlDay(p.d)}</span>${tp ? `<span class="prl-tp">${esc(tp)}</span>` : ""}` +
    (p.sent ? `<span class="prl-st">Sent</span>` : `<span class="prl-st new">To send</span>`) + `</span>` +
    `<span class="prl-t">${esc(p.t)}</span>` + (p.who ? `<span class="prl-who">${ic("user", "sm")}${esc(p.who)}</span>` : "") + `</button>`;
}
function pearlsListHTML() {
  const all = pearlList();
  if (!all.length) return `<div class="empty">No pearls yet. When staff teach something worth keeping, tap + and Catch a pearl.</div>`;
  const list = pearlsSearch(all, pearlsQ);
  return list.length ? list.map(p => pearlRowHTML(p)).join("") : `<div class="empty">No pearl matches. Try another word.</div>`;
}
function viewPearls() {
  const all = pearlList(), un = pearlsUnsent(all).length;
  const back = {study: "Study", guides: "Guides", week: "This week", endo: "Endo"}[route.from] || "Study";
  let h = `<header class="ph"><button class="back" data-action="back">${ic("back")}${back}</button>` +
    `<p class="eyebrow mono">Taught on the wards</p><h1 class="title">Pearls</h1>` +
    (all.length ? `<div class="ph-meta mono"><b>${all.length}</b> pearl${all.length === 1 ? "" : "s"} · <b>${un}</b> to send</div>` : "") + `</header>`;
  h += `<section class="card pad prl-send">` + (un
    ? `<button class="btn primary" data-action="pearlssend">${ic("share")}Send ${pearlCount(un)}</button>` +
      `<p class="prl-how">Save the file to Drive › Fellowship › GI Anki › pearls. Sunday night they become cards, waiting for you in the GI Studio.</p>`
    : `<p class="prl-how">${all.length ? "All sent. New pearls wait here until you send them." : "Nothing to send yet."}</p>`) +
    (pearlsError ? `<div class="err" role="alert">${esc(pearlsError)}</div>` : "") +
    `<button class="btn" data-action="pearlnew">${ic("plus")}Catch a pearl</button></section>`;
  if (all.length) h += `<div class="qwrap">${ic("search")}<input id="pearlsq" type="search" placeholder="Search pearls" aria-label="Search pearls" ` +
    `autocomplete="off" autocapitalize="off" value="${esc(pearlsQ)}"></div>`;
  return h + `<div class="prl-list" id="pearlslist">${pearlsListHTML()}</div>`;
}

// ---- Study's card and a topic's pearls in Guides ------------------------------------------------------
function pearlsStudyHTML() {
  const all = pearlList(), top = pearlsNewest(all)[0];
  return `<section class="sec"><div class="sec-head"><h2>Pearls</h2>` +
    (all.length ? `<span class="mono"><b>${pearlsUnsent(all).length}</b> to send</span>` : "") + `</div>` +
    `<button class="card studycard prlcard" data-action="pearlsopen"><span class="sc-glow" aria-hidden="true">${ic("pearl")}</span>` +
    `<span class="sc-main"><span class="mono">${top ? `${pearlCount(all.length)} · newest ${pearlDay(top.d)}` : "Taught on the wards"}</span>` +
    `<b>${top ? esc(top.t) : "Tap +, then Catch a pearl"}</b></span>${ic("chev", "chev")}</button></section>`;
}
function pearlsTopicHTML(t) {
  const list = pearlsNewest(pearlList().filter(p => p.topic === t.id));
  return list.length ? `<div class="gt-sub mono">Your pearls</div><div class="prl-list in">${list.map(p => pearlRowHTML(p, {noTopic: true})).join("")}</div>` : "";
}

// ---- Send -------------------------------------------------------------------------------------------
// The unsent pearls go to the share sheet as a text file (Save to Files puts
// it in Drive for the cards night), or download where there's no share sheet.
// Only a finished hand-over marks them sent; Undo puts them back.
async function pearlsSend() {
  const list = pearlsUnsent(pearlList());
  if (!list.length) return;
  pearlsError = null;
  const risky = list.filter(p => pearlFlagged(p.t)).length;
  if (risky && !confirm(`${risky === 1 ? "One pearl" : risky + " pearls"} may hold a patient detail (a long number, an ID, or a name after Mr or Mrs). Send anyway?`)) return;
  const now = getToday(), text = pearlsSendText(list, now), name = pearlFileName(now), ids = list.map(p => p.id);
  let done = false;
  const file = typeof File === "function" && navigator.canShare ? new File([text], name, {type: "text/plain"}) : null;
  if (file && navigator.canShare({files: [file]})) {
    try { await navigator.share({files: [file], title: "GI Hub pearls"}); done = true; }
    catch (e) { if (!e || e.name !== "AbortError") pearlsError = "Couldn't share the pearls. Try again."; }
  } else {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], {type: "text/plain"}));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    done = true;
  }
  if (done) {
    Store.markPearlsSent(ids, fmtDate(now));
    showToast(`Sent ${pearlCount(ids.length)}`, () => Store.markPearlsSent(ids, null));
  }
  route.keepScroll = true; render();
}

// ---- Taps and after a redraw ---------------------------------------------------------------------------
// Returns false when it redraws by itself.
function pearlDispatch(act, d) {
  const s = pearlSheet;
  if (act === "pearlnew") { scopeSheet = null; scopePick = null; pearlOpen(null); }
  else if (act === "pearledit") pearlOpen(d.id);
  else if (act === "pearlclose") pearlSheet = null;
  else if (act === "pearlsave" && s) pearlSave();
  else if (act === "pearldelete" && s) {
    const before = Store.pearlsSnapshot();
    Store.removePearl(s.id); pearlSheet = null;
    showToast("Pearl deleted", () => Store.restorePearls(before)); }
  else if (act === "pearltopic" && s) { s.topic = s.topic === d.id ? "" : d.id; s.more = false; s.tq = ""; }
  else if (act === "pearltopicmore" && s) { s.more = true; s.focusTq = true; }
  else if (act === "pearlwho" && s) s.who = d.name;
  else if (act === "pearldate" && s) s.d = d.date;
  else if (act === "pearlunsend" && s) { s.sent = null; s.again = true; }
  else if (act === "pearlsopen") { go({page: "pearls", from: route.page === "pearls" ? route.from : route.page}); return false; }
  else if (act === "pearlssend") { pearlsSend(); return false; }
  return true;
}
function pearlsAfterRender() {
  const s = pearlSheet, byId = id => document.getElementById && document.getElementById(id);
  // A new pearl opens with the keyboard up, one tap from the mic.
  if (s && pearlSheetFresh && s.mode === "new") { const box = byId("pearlbox"); if (box && box.focus) try { box.focus({preventScroll: true}); } catch (e) {} }
  if (s && s.focusTq) { s.focusTq = false; const q = byId("pearltq"); if (q && q.focus) try { q.focus({preventScroll: true}); } catch (e) {} }
  pearlSheetFresh = false;
  if (s) scopeGrow(byId("pearlbox"));
}
