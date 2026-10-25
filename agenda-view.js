"use strict";
// The Agenda tab: Days and Month, the event sheet, your usual week and Add
// from file, over agenda.js. Full app only.

let agView = "d", agSel = null, agMonth = null, agSheet = null, agSheetFresh = false, agUsual = null, agError = null;
const agToday = () => fmtDate(getToday());
const agDayWords = iso => { const d = agDate(iso); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const agHeading = iso => { const t = agToday();
  return iso === t ? "Today · " + agDayWords(iso) : iso === agAddDays(t, 1) ? "Tomorrow · " + agDayWords(iso) : agDayWords(iso); };

// ---- Rows ------------------------------------------------------------------------------------
// One row of a day: the time, a dot in its colour, what it is and a line under it.
function agRowHTML(r) {
  const time = r.from || (r.allDay ? "All day" : "");
  const sub = r.k === "work" ? `until ${r.to}` : r.k === "ev" || r.k === "all"
    ? [r.to && r.k === "ev" ? `until ${r.to}` : r.more ? "continues tomorrow" : "", r.sub].filter(Boolean).join(" · ") : r.sub;
  const inner = `<span class="ct mono">${time}</span><i class="cdot"></i><span class="cm"><b>${esc(r.t)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}</span>`;
  const cls = `ag-row k-${r.k}${r.off ? " off" : ""}${r.done ? " done" : ""}`;
  if (r.k === "ev" || r.k === "all") return `<button class="${cls}" data-action="agopen" data-id="${esc(r.id)}">${inner}</button>`;
  if (r.k === "call") return `<button class="${cls}" data-action="agcall">${inner}</button>`;
  if (r.k === "read") return `<button class="${cls}" data-action="agstudy">${inner}</button>`;
  return `<div class="${cls}">${inner}</div>`;
}
// A day's rows in a card; today's carry a line at the time it is now.
function agListHTML(iso, ctx) {
  const rows = agDay(iso, ctx), hol = rows.filter(r => r.k === "hol"), rest = rows.filter(r => r.k !== "hol");
  let h = hol.map(r => `<div class="ag-hol mono">${esc(r.t)}</div>`).join(""), now = iso === agToday() ? agHM(callNow()) : null;
  for (const r of rest) {
    if (now && !r.allDay && !r.cont && r.from && r.from > now) { h += `<div class="ag-now"><span class="mono">Now</span></div>`; now = null; }
    h += agRowHTML(r);
  }
  if (!rest.length) h += `<p class="ag-empty">Nothing on.</p>`;
  return `<div class="card ag-list">${h}</div>`;
}
const agMarksHTML = m => `<i class="mk">${m.hol ? `<i class="m-hol"></i>` : ""}${m.call ? `<i class="m-call"></i>` : ""}` +
  `${m.read ? `<i class="m-read"></i>` : ""}${`<i class="m-ev"></i>`.repeat(Math.min(2, m.ev))}</i>`;

// ---- Days ------------------------------------------------------------------------------------
function agDaysHTML(ctx) {
  const mon = agMonday(agSel), today = agToday();
  let strip = "";
  for (let k = 0; k < 7; k++) {
    const iso = agAddDays(mon, k), d = agDate(iso), cls = [iso === today ? "today" : "", iso === agSel ? "sel" : ""].filter(Boolean).join(" ");
    strip += `<button class="ws${cls ? " " + cls : ""}" data-action="agday" data-day="${iso}"><span class="mono">${DAYS[d.getDay()]}</span>` +
      `<b>${d.getDate()}</b>${agMarksHTML(agMarks(iso, ctx))}</button>`;
  }
  let h = `<div class="ag-strip"><button class="iconbtn ag-step" data-action="agweek" data-step="-1" aria-label="Previous week">${ic("back", "sm")}</button>` +
    `<div class="wstrip">${strip}</div><button class="iconbtn ag-step fwd" data-action="agweek" data-step="1" aria-label="Next week">${ic("back", "sm")}</button></div>` +
    `<section class="sec"><div class="sec-head"><h2>${agHeading(agSel)}</h2></div>${agListHTML(agSel, ctx)}</section>`;
  // The rest of the week: holidays, your events and call; not the daily work rows or reading.
  let later = "";
  for (let iso = agAddDays(agSel, 1); iso < agAddDays(mon, 7); iso = agAddDays(iso, 1)) {
    const rows = agDay(iso, ctx).filter(r => r.k === "hol" || r.k === "ev" || r.k === "all" || r.k === "call");
    if (rows.length) later += `<div class="ag-later-d mono">${agDayWords(iso)}</div>` +
      rows.map(r => r.k === "hol" ? `<div class="ag-hol mono">${esc(r.t)}</div>` : agRowHTML(r)).join("");
  }
  if (later) h += `<section class="sec"><div class="sec-head"><h2>Later this week</h2></div><div class="card ag-list">${later}</div></section>`;
  return h;
}

// ---- Month -----------------------------------------------------------------------------------
function agMonthHTML(ctx) {
  const [y, m] = agMonth.split("-").map(Number), first = agMonday(agMonth + "-01");
  const days = new Date(y, m, 0).getDate(), weeks = Math.ceil((agDiff(first, agMonth + "-01") + days) / 7), today = agToday();
  let grid = "";
  for (let k = 0; k < weeks * 7; k++) {
    const iso = agAddDays(first, k), cls = [iso.slice(0, 7) !== agMonth ? "out" : "", iso < today ? "past" : "", iso === today ? "today" : "",
      iso === agSel ? "sel" : ""].filter(Boolean).join(" ");
    grid += `<button class="mc${cls ? " " + cls : ""}" data-action="agday" data-day="${iso}"><span>${agDate(iso).getDate()}</span>${agMarksHTML(agMarks(iso, ctx))}</button>`;
  }
  return `<div class="card ag-month"><div class="cm-head"><button class="iconbtn ag-step" data-action="agmonth" data-step="-1" aria-label="Previous month">${ic("back", "sm")}</button>` +
    `<b>${LONG_MONTHS[m - 1]} ${y}</b><button class="iconbtn ag-step fwd" data-action="agmonth" data-step="1" aria-label="Next month">${ic("back", "sm")}</button></div>` +
    `<div class="cm-days mono">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => `<span>${d}</span>`).join("")}</div><div class="cm-grid">${grid}</div>` +
    `<div class="cm-leg mono"><span><i class="m-call"></i>Call</span><span><i class="m-read"></i>Reading</span><span><i class="m-ev"></i>Yours</span><span><i class="m-hol"></i>Holiday</span></div></div>` +
    `<section class="sec"><div class="sec-head"><h2>${agHeading(agSel)}</h2></div>${agListHTML(agSel, ctx)}</section>`;
}

// ---- The page --------------------------------------------------------------------------------
function viewAgenda() {
  if (!agSel) agSel = agToday();
  if (!agMonth) agMonth = agSel.slice(0, 7);
  const blk = blockFor(getToday()), ctx = agCtx(), seg = (v, label) =>
    `<button class="${agView === v ? "on" : ""}" data-action="agview" data-view="${v}"${agView === v ? ` aria-current="page"` : ""}>${label}</button>`;
  return `<header class="ph has-gear"><button class="iconbtn phgear" data-action="agnew" aria-label="Add an event">${ic("plus")}</button>` +
    `<p class="eyebrow mono">${blk ? `Block ${blk.num} · ${esc(blk.name)}` : "GI Hub"}</p><h1 class="title">Agenda</h1></header>` +
    `<div class="segtabs ag-seg" role="group" aria-label="Agenda views">${seg("d", "Days")}${seg("m", "Month")}</div>` +
    (agView === "m" ? agMonthHTML(ctx) : agDaysHTML(ctx)) +
    `<section class="sec"><div class="card ag-links">` +
    `<button class="ag-link" data-action="agfilepick">${ic("download")}<span><b>Add from file</b><span>An invite or a calendar export (.ics)</span></span></button>` +
    `<button class="ag-link" data-action="agusual">${ic("clock")}<span><b>Your usual week</b><span>The work hours shown on each day</span></span></button></div>` +
    (agError ? `<div class="err" role="alert">${esc(agError)}</div>` : "") + `<input type="file" id="agfile" hidden></section>`;
}

// ---- The event sheet -----------------------------------------------------------------------------
function agOpen(id) {
  const it = id ? agState().items.find(x => x.id === id) : null;
  agSheet = it ? {mode: "edit", id, t: it.t, d: it.d, d2: it.d2, s: it.s || "09:00", e: it.e || "", allDay: !it.s, multi: !!it.d2, rep: it.rep, n: it.n, uid: it.uid, err: null}
    : {mode: "new", t: "", d: agSel || agToday(), d2: null, s: "09:00", e: "10:00", allDay: false, multi: false, rep: null, n: "", uid: null, err: null};
  agSheetFresh = true;
}
function agSheetHTML() {
  const s = agSheet, edit = s.mode === "edit", title = edit ? "Edit event" : "New event", fresh = agSheetFresh ? " fresh" : "";
  const chip = (act, on, label, extra = "") => `<button class="pick ghost${on ? " on" : ""}" data-action="${act}"${extra} aria-pressed="${on}">${label}</button>`;
  return `<div class="scrim${fresh}" data-action="agclose"></div><div class="sheet agsheet${fresh}" role="dialog" aria-modal="true" aria-label="${title}">` +
    `<div class="grab"></div><div class="shead"><b>${title}</b><button class="iconbtn" data-action="agclose" aria-label="Close">${ic("x")}</button></div>` +
    (edit && s.uid ? `<p class="ssub">From a calendar file. Adding that file again updates it.</p>` : "") +
    `<label class="lbl mono">What<input type="text" value="${esc(s.t)}" data-ag="t" placeholder="Dentist, soccer, a flight" autocapitalize="sentences"></label>` +
    `<label class="lbl mono">${s.multi ? "First day" : "Day"}<input type="date" value="${esc(s.d)}" data-ag="d"></label>` +
    (s.multi ? `<label class="lbl mono">Last day<input type="date" value="${esc(s.d2 || "")}" data-ag="d2"></label>` : "") +
    `<div class="pickrow">${chip("agallday", s.allDay, "All day")}${chip("agmulti", s.multi, "Ends another day")}</div>` +
    (s.allDay ? "" : `<div class="ag-times"><label class="lbl mono">Starts<input type="time" value="${esc(s.s)}" data-ag="s"></label>` +
      `<label class="lbl mono">Ends<input type="time" value="${esc(s.e)}" data-ag="e"></label></div>`) +
    `<div class="lbl mono">Repeats</div><div class="pickrow">` + [["", "Never"], ["w", "Weekly"], ["m", "Monthly"], ["y", "Yearly"]]
      .map(([r, label]) => chip("agrep", (s.rep || "") === r, label, ` data-rep="${r}"`)).join("") + `</div>` +
    `<label class="lbl mono">Note<input type="text" value="${esc(s.n)}" data-ag="n" placeholder="Where, who, what to bring"></label>` +
    (s.err ? `<div class="err" role="alert">${esc(s.err)}</div>` : "") +
    `<div class="sactions">${edit ? `<button class="btn danger" data-action="agdelete">Delete</button>` : ""}` +
    `<button class="btn primary" data-action="agsave">${edit ? "Save" : "Add event"}</button></div></div>`;
}
// Checks the sheet, then saves it; the sheet stays open with a message when something's missing.
function agSave() {
  const s = agSheet, t = s.t.trim(), timed = !s.allDay;
  const err = !t ? "Give it a name first." : !agValidIso(s.d) ? "Pick a day." : s.multi && !(agValidIso(s.d2) && s.d2 > s.d) ? "The last day is before the first." :
    timed && !AG_HM.test(s.s) ? "Pick a start time." : timed && !s.multi && s.e && AG_HM.test(s.e) && s.e <= s.s ? "It ends before it starts." : null;
  if (err) { s.err = err; return; }
  const f = {t, d: s.d, d2: s.multi ? s.d2 : null, s: timed ? s.s : null, e: timed && AG_HM.test(s.e) ? s.e : null, rep: s.rep, n: s.n};
  const before = agSnapshot();
  if (s.mode === "new") { agAdd(f); showToast(`${t} added`, () => agRestore(before)); }
  else { agUpdate(s.id, f); showToast("Changes saved", () => agRestore(before)); }
  agSheet = null;
}
// Typing keeps a sheet in step without a redraw (which would drop the keyboard).
function agField(t) {
  const ds = t && t.dataset;
  if (ds && ds.ag && agSheet) { agSheet[ds.ag] = t.value; return true; }
  const b = ds && ds.agu && agUsual && (agUsual.days[ds.day] || [])[+ds.i];
  if (b) { b[ds.agu] = t.value; return true; }
  return false;
}

// ---- Your usual week ----------------------------------------------------------------------------
const AG_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function agUsualHTML() {
  const u = agUsual, fresh = agSheetFresh ? " fresh" : "";
  const day = k => `<div class="agu-day"><div class="agu-h"><b>${AG_WEEKDAYS[k]}</b><button class="textbtn sm" data-action="agblockadd" data-day="${k}">Add</button></div>` +
    (u.days[k].length ? u.days[k].map((b, i) => { const at = `data-day="${k}" data-i="${i}"`;
      return `<div class="agu-b"><input type="text" value="${esc(b.t)}" data-agu="t" ${at} aria-label="What" autocapitalize="sentences">` +
        `<input type="time" value="${esc(b.a)}" data-agu="a" ${at} aria-label="From"><span class="mono">to</span>` +
        `<input type="time" value="${esc(b.b)}" data-agu="b" ${at} aria-label="To">` +
        `<button class="iconbtn" data-action="agblockdel" ${at} aria-label="Remove">${ic("x", "sm")}</button></div>`; }).join("")
      : `<p class="agu-none">Nothing</p>`) + `</div>`;
  return `<div class="scrim${fresh}" data-action="agusualclose"></div><div class="sheet agusual${fresh}" role="dialog" aria-modal="true" aria-label="Your usual week">` +
    `<div class="grab"></div><div class="shead"><b>Your usual week</b><button class="iconbtn" data-action="agusualclose" aria-label="Close">${ic("x")}</button></div>` +
    `<p class="ssub">Your work hours on each day. Work takes the rotation's name.</p>` +
    [1, 2, 3, 4, 5, 6, 0].map(day).join("") +
    (u.err ? `<div class="err" role="alert">${esc(u.err)}</div>` : "") +
    `<div class="sactions"><button class="btn primary" data-action="agusualsave">Save</button></div></div>`;
}
function agUsualSave() {
  const all = Object.values(agUsual.days).flat();
  if (all.some(b => !AG_HM.test(b.a) || !AG_HM.test(b.b) || b.b <= b.a)) { agUsual.err = "Each block needs to end after it starts."; return; }
  const before = agSnapshot();
  agSetUsual(agUsual); agUsual = null;
  showToast("Usual week saved", () => agRestore(before));
}

// ---- Add from file ----------------------------------------------------------------------------------
// A file's events, or a call file handed to Call; what happened goes in a toast, or why not on the page.
function agImportText(text, name) {
  const r = agImport(text, name);
  if (!r.ok) { agError = r.error || "Couldn't read that file. Try again."; return r; }
  agError = null;
  if (r.call) return r;
  const n = r.added + r.changed + r.removed;
  showToast(!n ? "Already up to date" : r.added && !r.changed && !r.removed ? `Added ${r.added} event${r.added === 1 ? "" : "s"}` :
    "Updated: " + [r.added && `${r.added} new`, r.changed && `${r.changed} changed`, r.removed && `${r.removed} removed`].filter(Boolean).join(", "),
    n ? () => agRestore(r.before) : null);
  return r;
}
// No accept filter on the picker, as with Call's: iOS greys out .ics files in some places when one is set.
function agReadFile(f) {
  if (!f) return;
  const done = text => { agImportText(text, f.name); route.keepScroll = true; render(); };
  const fail = () => { agError = "Couldn't read that file. Try again."; route.keepScroll = true; render(); };
  if (typeof f.arrayBuffer === "function") f.arrayBuffer().then(b => done(icsText(new Uint8Array(b))), fail);
  else { const rd = new FileReader(); rd.onload = () => done(icsText(new Uint8Array(rd.result))); rd.onerror = fail; rd.readAsArrayBuffer(f); }
}

// ---- Taps --------------------------------------------------------------------------------------
// Returns false when it redraws by itself.
function agDispatch(act, d) {
  if (act === "agview") { agView = d.view === "m" ? "m" : "d"; agMonth = agSel.slice(0, 7); }
  else if (act === "agday") { agSel = d.day; if (agView === "m") agMonth = agSel.slice(0, 7); }
  else if (act === "agweek") agSel = agAddDays(agSel, 7 * (+d.step || 0));
  else if (act === "agmonth") {
    const [y, m] = agMonth.split("-").map(Number), t = new Date(y, m - 1 + (+d.step || 0), 1);
    agMonth = fmtDate(t).slice(0, 7);
    agSel = agToday().slice(0, 7) === agMonth ? agToday() : agMonth + "-01";
  }
  else if (act === "agcall") { go({page: "call", from: "agenda"}); return false; }
  else if (act === "agstudy") { studyTab = "t"; go({page: "study"}); return false; }
  else if (act === "agnew") agOpen(null);
  else if (act === "agopen") agOpen(d.id);
  else if (act === "agclose") agSheet = null;
  else if (act === "agsave" && agSheet) agSave();
  else if (act === "agdelete" && agSheet) {
    const before = agSnapshot();
    agRemove(agSheet.id); agSheet = null;
    showToast("Event deleted", () => agRestore(before)); }
  else if (act === "agallday" && agSheet) agSheet.allDay = !agSheet.allDay;
  else if (act === "agmulti" && agSheet) { agSheet.multi = !agSheet.multi; if (agSheet.multi && !(agSheet.d2 > agSheet.d)) agSheet.d2 = agAddDays(agSheet.d, 1); }
  else if (act === "agrep" && agSheet) agSheet.rep = d.rep || null;
  else if (act === "agusual") { agUsual = JSON.parse(JSON.stringify(agState().usual)); agSheetFresh = true; }
  else if (act === "agusualclose") agUsual = null;
  else if (act === "agusualsave" && agUsual) agUsualSave();
  else if (act === "agblockadd" && agUsual) agUsual.days[d.day].push({a: "08:00", b: "17:00", t: "Work"});
  else if (act === "agblockdel" && agUsual) agUsual.days[d.day].splice(+d.i, 1);
  else if (act === "agfilepick") { agError = null; const f = document.getElementById("agfile"); if (f) f.click(); return false; }
  return true;
}
