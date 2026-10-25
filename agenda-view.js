"use strict";
// The Agenda tab: Days and Month, the event sheet, your usual week and Add
// from file, over agenda.js. Full app only.

let agView = "d", agSel = null, agMonth = null;
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
  return `<header class="ph"><p class="eyebrow mono">${blk ? `Block ${blk.num} · ${esc(blk.name)}` : "GI Hub"}</p><h1 class="title">Agenda</h1></header>` +
    `<div class="segtabs ag-seg" role="group" aria-label="Agenda views">${seg("d", "Days")}${seg("m", "Month")}</div>` +
    (agView === "m" ? agMonthHTML(ctx) : agDaysHTML(ctx));
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
  return true;
}
