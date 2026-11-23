"use strict";
// The Agenda tab: Day, Week and Month, the event sheet, your usual week, Add from
// file and call requests, over agenda.js. Full app only.

let agView = "d", agWd = 7, agSel = null, agMonth = null, agSheet = null, agSheetFresh = false, agUsual = null, agError = null, agReq = null;
const agToday = () => fmtDate(getToday());
const agDayWords = iso => { const d = agDate(iso); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const agHeading = iso => { const t = agToday();
  return iso === t ? "Today · " + agDayWords(iso) : iso === agAddDays(t, 1) ? "Tomorrow · " + agDayWords(iso) : agDayWords(iso); };

// ---- Rows ------------------------------------------------------------------------------------
// One row of a day: the time, a dot in its colour, what it is and a line under it.
function agRowHTML(r) {
  const time = r.from || (r.allDay ? "All day" : "");
  const sub = r.k === "work" ? `until ${r.to}` : r.k === "ev" || r.k === "all"
    ? [r.to && r.k === "ev" ? `until ${r.to}` : r.more ? "continues tomorrow" : "", r.sub].filter(Boolean).join(" · ")
    : r.k === "todo" ? [r.done ? "Done" : "To-do", r.sub].filter(Boolean).join(" · ") : r.sub;
  const inner = `<span class="ct mono">${time}</span><i class="cdot"></i><span class="cm"><b>${esc(r.t)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}</span>`;
  const cls = `ag-row k-${r.k}${r.c ? " c-" + r.c : ""}${r.off ? " off" : ""}${r.done ? " done" : ""}`;
  if (r.k === "ev" || r.k === "all" || r.k === "todo") return `<button class="${cls}" data-action="agopen" data-id="${esc(r.id)}"${r.on ? ` data-on="${r.on}"` : ""}>${inner}</button>`;
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

// ---- Day, Week and Month -----------------------------------------------------------------------
// Day: the week strip, then the day's hours drawn to scale. Week: the hours of
// 7 days from Monday, or of 3 from the chosen day. Month: each day with what's
// on it by name, and the chosen day's rows under it. Each kind has its colour:
// call in blue stripes, reading an amber outline, holidays red, to-dos an
// outline, work hours grey, your own events the colour picked in their sheet.
const agMins = hm => typeof hm === "string" && AG_HM.test(hm) ? agMin(hm) : null;
const agMinsHM = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const agRange = (a, b) => { const A = agDate(a), B = agDate(b);
  return A.getMonth() === B.getMonth() ? `${A.getDate()} – ${B.getDate()} ${LONG_MONTHS[B.getMonth()]}`
    : `${A.getDate()} ${MONTHS[A.getMonth()]} – ${B.getDate()} ${MONTHS[B.getMonth()]}`; };
// The days Week shows: from Monday, or 3 from the chosen day.
const agWeekStart = () => agWd === 7 ? agMonday(agSel) : agSel;
// What's drawn as a block: your events, to-dos and the night's reading, at a time.
const agTimed = r => (r.k === "ev" || r.k === "todo" || (r.k === "read" && !r.off)) && !r.allDay;
// Where a block ends, in minutes from midnight: midnight when it runs on; a
// to-do takes half an hour, a time with no end 45 minutes.
const agEndMins = (r, a) => { const e = agMins(r.to); return r.more ? 1440 : e !== null && e > a ? e : a + (r.k === "todo" ? 30 : 45); };
const agAlertCount = id => { const it = agState().items.find(x => x.id === id); return it ? agAlerts(it).length : 0; };

// Back, the day, week or month shown, on, and Today.
function agNavHTML() {
  const t = agToday();
  let title, here;
  if (agView === "d") { title = agHeading(agSel); here = agSel === t; }
  else if (agView === "w") { const a = agWeekStart(), b = agAddDays(a, agWd - 1); title = agRange(a, b); here = t >= a && t <= b; }
  else { const [y, m] = agMonth.split("-").map(Number); title = `${LONG_MONTHS[m - 1]} ${y}`; here = t.slice(0, 7) === agMonth; }
  const unit = agView === "d" ? "day" : agView === "w" ? (agWd === 7 ? "week" : "3 days") : "month";
  return `<div class="kal-nav"><button class="iconbtn ag-step" data-action="agstep" data-step="-1" aria-label="Previous ${unit}">${ic("back", "sm")}</button>` +
    `<b class="kal-title">${esc(title)}</b>` +
    `<button class="iconbtn ag-step fwd" data-action="agstep" data-step="1" aria-label="Next ${unit}">${ic("back", "sm")}</button>` +
    `<button class="pick ghost kal-today${here ? " here" : ""}" data-action="agtoday">Today</button></div>`;
}

function agDayViewHTML(ctx) {
  const mon = agMonday(agSel), today = agToday();
  let strip = "";
  for (let k = 0; k < 7; k++) {
    const iso = agAddDays(mon, k), d = agDate(iso), cls = [iso === today ? "today" : "", iso === agSel ? "sel" : ""].filter(Boolean).join(" ");
    strip += `<button class="ws${cls ? " " + cls : ""}" data-action="agday" data-day="${iso}"><span class="mono">${DAYS[d.getDay()]}</span>` +
      `<b>${d.getDate()}</b>${agMarksHTML(agMarks(iso, ctx))}</button>`;
  }
  return `<div class="ag-strip"><div class="wstrip">${strip}</div></div>` + agGridHTML([agSel], ctx, 54);
}

function agWeekHTML(ctx) {
  const a = agWeekStart(), days = [];
  for (let k = 0; k < agWd; k++) days.push(agAddDays(a, k));
  const wd = (n, label) => `<button class="pick ghost${agWd === n ? " on" : ""}" data-action="agwd" data-n="${n}" aria-pressed="${agWd === n}">${label}</button>`;
  return `<div class="pickrow kal-wd">${wd(7, "7 days")}${wd(3, "3 days")}</div>` + agGridHTML(days, ctx, agWd === 7 ? 34 : 46);
}

// The hours of one day or several, H pixels to the hour: 07:00 to 22:00, wider
// for anything earlier or later.
function agGridHTML(days, ctx, H) {
  const rowsBy = days.map(iso => agDay(iso, ctx)), n = days.length;
  let lo = 7 * 60, hi = 22 * 60;
  for (const rows of rowsBy) for (const r of rows) {
    if (!agTimed(r)) continue;
    const a = r.cont ? 0 : agMins(r.from);
    if (a === null) continue;
    lo = Math.min(lo, Math.floor(a / 60) * 60);
    hi = Math.max(hi, Math.min(1440, Math.ceil(agEndMins(r, a) / 60) * 60));
  }
  const px = m => (m - lo) / 60 * H, g = {lo, hi, px, H, n};
  let gut = "";
  for (let m = lo; m <= hi; m += 60) gut += `<span style="top:${px(m)}px">${m === 1440 ? "00:00" : agMinsHM(m)}</span>`;
  const heads = n > 1 ? `<div class="kal-heads" style="--n:${n}"><i></i>${days.map(agHeadHTML).join("")}</div>` : "";
  return `<div class="card kal-grid${n > 1 ? " multi" : ""}${n > 3 ? " narrow" : ""}" lang="en" style="--n:${n};--h:${H}px">${heads}${agAllDayHTML(days, rowsBy)}` +
    `<div class="kal-body" style="height:${px(hi)}px"><div class="kal-gut mono">${gut}</div>` +
    days.map((iso, i) => agColHTML(iso, rowsBy[i], g)).join("") + `</div></div>`;
}

// A day's head in Week: it opens the day.
function agHeadHTML(iso) {
  const d = agDate(iso), cls = [iso === agToday() ? "today" : "", iso === agSel ? "sel" : "", agHoliday(iso) ? "hol" : ""].filter(Boolean).join(" ");
  return `<button class="kal-head${cls ? " " + cls : ""}" data-action="agview" data-view="d" data-day="${iso}" aria-label="Open ${agDayWords(iso)}">` +
    `<span class="mono">${DAYS[d.getDay()]}</span><b>${d.getDate()}</b></button>`;
}

// Bars across days, each in the first lane it overlaps nothing in; how many lanes.
function agBarLanes(spans) {
  const lanes = [];
  for (const s of spans.slice().sort((p, q) => p.a - q.a || (q.b - q.a) - (p.b - p.a))) {
    let l = 0;
    while ((lanes[l] || []).some(o => !(s.b < o.a || s.a > o.b))) l++;
    (lanes[l] = lanes[l] || []).push(s); s.lane = l;
  }
  return lanes.length;
}

// Holidays, all-day events and whole days on call, as bars over the hours.
function agAllDayHTML(days, rowsBy) {
  const spans = [];
  days.forEach((iso, i) => {
    for (const r of rowsBy[i]) {
      const call = r.k === "call" && r.allDay;
      if (r.k !== "hol" && r.k !== "all" && !call) continue;
      const key = r.k === "hol" ? "hol" + iso : call ? "call" : r.id;
      const prev = spans.find(x => x.key === key && x.b === i - 1);
      if (prev) { prev.b = i; continue; }
      spans.push({key, k: call ? "call" : r.k, t: call ? "On call" : r.t, id: r.id, on: r.on, c: r.c, a: i, b: i, cont: !!r.cont});
    }
  });
  if (!spans.length) return "";
  agBarLanes(spans);
  const bars = spans.map(x => {
    const act = x.k === "all" ? ` data-action="agopen" data-id="${esc(x.id)}"${x.on ? ` data-on="${x.on}"` : ""}` : x.k === "call" ? ` data-action="agcall"` : "";
    const tag = act ? "button" : "div";
    return `<${tag} class="kal-bar k-${x.k}${x.c ? " c-" + x.c : ""}${x.cont ? " cont" : ""}"${act} style="grid-column:${x.a + 1} / span ${x.b - x.a + 1};grid-row:${x.lane + 1}">${esc(x.t)}</${tag}>`;
  }).join("");
  return `<div class="kal-allday" style="--n:${days.length}"><span class="mono">all day</span><div class="kal-lanes">${bars}</div></div>`;
}

// One day's column: an hour to tap for a new event, work hours and call as
// bands under your events, to-dos and reading, and a line at now.
function agColHTML(iso, rows, g) {
  const {lo, hi, px, H, n} = g, today = iso === agToday();
  let slots = "", bands = "";
  const blocks = [];
  for (let m = lo; m < hi; m += 60)
    slots += `<button class="kal-slot" data-action="agslot" data-day="${iso}" data-at="${agMinsHM(m)}" style="top:${px(m)}px;height:${H}px" aria-label="New event ${agDayWords(iso)} at ${agMinsHM(m)}"></button>`;
  for (const r of rows) {
    if (r.k === "work") {
      const a = Math.max(lo, agMins(r.from)), b = Math.min(hi, agMins(r.to));
      if (b > a) bands += `<div class="kal-band work" style="top:${px(a)}px;height:${px(b) - px(a)}px">${n === 1 ? `<span class="mono">${esc(r.t)}</span>` : ""}</div>`;
    } else if (r.k === "call") {
      // A call to midnight ends at the bottom, not the top.
      const a = Math.max(lo, r.cont ? 0 : agMins(r.from)), b = Math.min(hi, r.more ? 1440 : agMins(r.to) || 1440);
      const words = n > 3 ? "Call" : "On call" + (n === 1 && r.sub ? " · " + r.sub.split(" · ")[0] : "");
      if (b > a) bands += `<div class="kal-band call" style="top:${px(a)}px;height:${px(b) - px(a)}px">` +
        (r.allDay || r.cont ? "" : `<button class="kal-calllbl mono" data-action="agcall">${esc(words)}</button>`) + `</div>`;
    } else if (agTimed(r)) {
      const a = r.cont ? lo : agMins(r.from);
      if (a === null) continue;
      blocks.push({r, a: Math.max(lo, a), b: Math.min(hi, Math.max(agEndMins(r, a), a + 25))});
    }
  }
  agLanes(blocks);
  let now = "";
  if (today) { const m = agMins(agHM(callNow())); if (m !== null && m >= lo && m <= hi) now = `<div class="kal-now" style="top:${px(m)}px"></div>`; }
  return `<div class="kal-col${today ? " today" : ""}">${slots}${bands}${blocks.map(x => agBlockHTML(x, g)).join("")}${now}</div>`;
}

// Overlaps: one that starts half an hour or more after another lies over it,
// set in; ones that start within half an hour of each other sit side by side.
function agLanes(list) {
  list.sort((p, q) => p.a - q.a || q.b - p.b);
  const placed = [];
  for (const x of list) {
    const over = placed.filter(y => y.b > x.a && y.a < x.b);
    x.col = 0; x.cols = 1; x.ind = 0; x.top = false;
    if (over.length && over.every(y => x.a - y.a >= 30)) { x.ind = Math.max(...over.map(y => y.ind)) + 1; x.top = true; }
    else if (over.length) {
      const sib = over.filter(y => x.a - y.a < 30), group = sib.concat(x);
      group.forEach((y, i) => { y.col = i; y.cols = group.length; y.ind = sib[0].ind; });
    }
    placed.push(x);
  }
}

// One block: its name, its time when there's room, and its alerts in Day.
function agBlockHTML(x, g) {
  const r = x.r, top = g.px(x.a) + 1, h = Math.max(16, g.px(x.b) - g.px(x.a) - 2), ind = x.ind * (g.n === 1 ? 28 : g.n === 3 ? 12 : 7);
  const left = `calc(${ind}px + ${x.col} * (100% - ${ind}px - 3px) / ${x.cols} + 2px)`, width = `calc((100% - ${ind}px - 3px) / ${x.cols} - 2px)`;
  const time = r.cont ? "" : r.from + (r.to && !r.more ? "–" + r.to : "");
  const title = r.k === "read" ? (g.n === 1 ? "Reading · " + r.t : g.n > 3 ? "Read" : "Reading") : r.t;
  const al = r.k === "ev" && g.n === 1 ? agAlertCount(r.id) : 0;
  const inner = `<b>${esc(title)}</b>` + (h >= 34 && time && g.n < 7 ? `<span class="mono">${time}</span>` : "") +
    (al ? `<i class="kal-bell" aria-label="${al} alert${al === 1 ? "" : "s"}">${ic("bell")}${al}</i>` : "");
  const act = r.k === "read" ? `data-action="agstudy"` : `data-action="agopen" data-id="${esc(r.id)}"${r.on ? ` data-on="${r.on}"` : ""}`;
  return `<button class="kal-ev k-${r.k}${r.c ? " c-" + r.c : ""}${r.done ? " done" : ""}${h < 30 ? " short" : ""}${x.top ? " over" : ""}" ${act} ` +
    `style="top:${top}px;height:${h}px;left:${left};width:${width}">${inner}</button>`;
}

// Month: each week a grid row, its all-day events as bars, then up to three
// names a day and how many more; the chosen day's rows under it.
function agMonthHTML(ctx) {
  const [y, m] = agMonth.split("-").map(Number), first = agMonday(agMonth + "-01");
  const count = new Date(y, m, 0).getDate(), weeks = Math.ceil((agDiff(first, agMonth + "-01") + count) / 7), today = agToday();
  let h = "";
  for (let w = 0; w < weeks; w++) {
    const isos = [];
    for (let k = 0; k < 7; k++) isos.push(agAddDays(first, w * 7 + k));
    const rowsBy = isos.map(iso => agDay(iso, ctx)), spans = [];
    isos.forEach((iso, i) => {
      for (const r of rowsBy[i]) {
        if (r.k !== "all") continue;
        const prev = spans.find(x => x.id === r.id && x.b === i - 1);
        if (prev) prev.b = i; else spans.push({id: r.id, t: r.t, c: r.c, a: i, b: i, cont: !!r.cont});
      }
    });
    const L = agBarLanes(spans), room = Math.max(1, 3 - L);
    let cells = "", top = "", stacks = "";
    isos.forEach((iso, i) => {
      const out = iso.slice(0, 7) !== agMonth, cls = [out ? "out" : "", iso < today ? "past" : "", iso === today ? "today" : "", iso === agSel ? "sel" : ""].filter(Boolean).join(" ");
      cells += `<button class="kal-mc${cls ? " " + cls : ""}" data-action="agday" data-day="${iso}" style="grid-column:${i + 1}" aria-label="${agDayWords(iso)}"></button>`;
      top += `<span class="kal-dn${cls ? " " + cls : ""}" style="grid-column:${i + 1}"><b>${agDate(iso).getDate()}</b>${agMarks(iso, ctx).read ? `<i class="m-read"></i>` : ""}</span>`;
      const chips = [];
      for (const r of rowsBy[i]) {
        if (r.k === "hol") chips.push(["k-hol", r.t]);
        else if (r.k === "call" && (!r.cont || r.allDay)) chips.push(["k-call", "Call"]);
        else if (r.k === "ev" && !r.cont) chips.push(["k-ev" + (r.c ? " c-" + r.c : ""), r.t]);
        else if (r.k === "todo" && !r.done) chips.push(["k-todo", r.t]);
      }
      const shown = chips.slice(0, room), more = chips.length - shown.length;
      stacks += `<div class="kal-stack${out ? " out" : ""}" style="grid-column:${i + 1};grid-row:${L + 2}">` +
        shown.map(([c, t]) => `<span class="kal-chip ${c}">${esc(t)}</span>`).join("") + (more ? `<span class="kal-more mono">+${more}</span>` : "") + `</div>`;
    });
    const bars = spans.map(x => `<span class="kal-span${x.c ? " c-" + x.c : ""}${x.cont ? " cont" : ""}" style="grid-column:${x.a + 1} / span ${x.b - x.a + 1};grid-row:${x.lane + 2}">${esc(x.t)}</span>`).join("");
    h += `<div class="kal-week" style="grid-template-rows:auto${" auto".repeat(L)} 1fr">${cells}${top}${bars}${stacks}</div>`;
  }
  return `<div class="card kal-month"><div class="cm-days mono">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => `<span>${d}</span>`).join("")}</div>` +
    `<div class="kal-weeks">${h}</div>${agLegendHTML()}</div>` +
    `<section class="sec"><div class="sec-head"><h2>${agHeading(agSel)}</h2><button class="textbtn sm" data-action="agview" data-view="d" data-day="${agSel}">Open the day</button></div>` +
    agListHTML(agSel, ctx) + `</section>`;
}
const agLegendHTML = () =>
  `<div class="cm-leg kal-leg mono"><span><i class="m-call"></i>Call</span><span><i class="m-read"></i>Reading</span><span><i class="m-hol"></i>Holiday</span><span><i class="kal-lt"></i>To-do</span></div>` +
  `<div class="cm-leg kal-leg mono">${AG_COLOUR_CHIPS.map(([k, label]) => `<span><i class="kal-sw c-${k}"></i>${label}</span>`).join("")}</div>`;

// ---- The page --------------------------------------------------------------------------------
function viewAgenda() {
  if (!agSel) agSel = agToday();
  if (!agMonth) agMonth = agSel.slice(0, 7);
  const blk = blockFor(getToday()), ctx = agCtx(), seg = (v, label) =>
    `<button class="${agView === v ? "on" : ""}" data-action="agview" data-view="${v}"${agView === v ? ` aria-current="page"` : ""}>${label}</button>`;
  return `<header class="ph has-gear"><button class="iconbtn phgear phadd" data-action="agnew">${ic("plus")}Event</button>` +
    `<p class="eyebrow mono">${blk ? `Block ${blk.num} · ${esc(blk.name)}` : "GI Hub"}</p><h1 class="title">Agenda</h1></header>` +
    `<div class="segtabs three ag-seg" role="group" aria-label="Agenda views">${seg("d", "Day")}${seg("w", "Week")}${seg("m", "Month")}</div>` +
    agNavHTML() + (agView === "m" ? agMonthHTML(ctx) : agView === "w" ? agWeekHTML(ctx) : agDayViewHTML(ctx)) + agNotesHTML() +
    `<section class="sec"><div class="card ag-links">` +
    `<button class="ag-link" data-action="agfilepick">${ic("download")}<span><b>Add from file</b><span>An invite or a calendar export (.ics)</span></span></button>` +
    `<button class="ag-link" data-action="agusual">${ic("clock")}<span><b>Your usual week</b><span>The work hours shown on each day</span></span></button>` +
    agReqLinkHTML() + `</div>` +
    (agError ? `<div class="err" role="alert">${esc(agError)}</div>` : "") + `<input type="file" id="agfile" hidden></section>`;
}

// Notes, newest first, each with Event, To-do and Delete; nothing when there are none.
function agNotesHTML() {
  const notes = agState().notes;
  if (!notes.length) return "";
  const b = (act, id, label) => `<button class="pick ghost" data-action="${act}" data-id="${esc(id)}">${label}</button>`;
  return `<section class="sec"><div class="sec-head"><h2>Notes</h2></div><div class="card ag-notes">` + notes.slice().reverse().map(n =>
    `<div class="agnote"><p>${esc(n.t)}</p><div class="agtodo-a">${b("agnoteev", n.id, "Event")}${b("agnotetodo", n.id, "To-do")}${b("agnotedel", n.id, "Delete")}</div></div>`).join("") +
    `</div></section>`;
}
// A note opens a new event or to-do sheet with its words as What (and in Note
// when they run past a title); saving it takes the note off the list, unless
// it's too long for Note, so no word is lost.
function agOpenNote(id, kind) {
  const note = agState().notes.find(x => x.id === id);
  if (!note) return;
  agOpen(null);
  const long = note.t.length > AG_T_MAX;
  Object.assign(agSheet, {kind, t: long ? note.t.slice(0, AG_T_MAX).trim() : note.t, n: long ? note.t.slice(0, AG_N_MAX) : "", from: id});
}
function agNoteUsed(id) {
  const note = id && agState().notes.find(x => x.id === id);
  if (note && note.t.length <= AG_N_MAX) agRemoveNote(id);
}

// ---- The event sheet -----------------------------------------------------------------------------
// on: the day of the time tapped, for a repeating event.
function agOpen(id, on) {
  const it = id ? agState().items.find(x => x.id === id) : null;
  agSheet = it && it.todo ? {mode: "edit", kind: "todo", id, t: it.t, d: it.d, s: it.s, n: it.n, err: null}
    : it ? {mode: "edit", kind: "event", id, t: it.t, d: it.d, d2: it.d2, s: it.s || "09:00", e: it.e || "", allDay: !it.s, multi: !!it.d2, rep: it.rep, n: it.n, uid: it.uid, al: it.al, c: it.c || "pers", err: null,
      every: it.every || 1, until: it.until || "", days: it.days || null, nth: it.nth || null, skip: it.skip || [], on: it.rep && agValidIso(on) ? on : null}
    : {mode: "new", kind: "event", t: "", d: agSel || agToday(), d2: null, s: "09:00", e: "10:00", allDay: false, multi: false, rep: null, n: "", uid: null, al: null, c: "pers", err: null,
      every: 1, until: "", days: null, nth: null, skip: [], on: null};
  agSheetFresh = true;
}
// The repeat chips: Never, Weekly, Every 2 weeks, Monthly, Yearly; a repeat
// from a calendar file that none of them is ("Mon, Wed and Fri") shows as its own.
const AG_REP_CHIPS = [["", "Never"], ["w", "Weekly"], ["w2", "Every 2 weeks"], ["m", "Monthly"], ["y", "Yearly"]];
function agRepChip(s) {
  if (!s.rep) return "";
  if (s.days || s.nth || s.rep === "d") return "keep";
  if (s.rep === "w" && (s.every || 1) === 2) return "w2";
  return (s.every || 1) === 1 ? s.rep : "keep";
}
// A new sheet makes an event or a to-do; an open one stays what it is.
function agKindHTML(s) {
  if (s.mode !== "new") return "";
  return `<div class="segtabs ag-kind" role="group" aria-label="Event or to-do">` + [["event", "Event"], ["todo", "To-do"]].map(([k, label]) =>
    `<button class="${s.kind === k ? "on" : ""}" data-action="agkind" data-kind="${k}" aria-pressed="${s.kind === k}">${label}</button>`).join("") + `</div>`;
}
// A to-do: what, its day and the time it asks. Open, it answers like Week does.
function agTodoSheetHTML() {
  const s = agSheet, edit = s.mode === "edit", title = edit ? "Edit to-do" : "New to-do", fresh = agSheetFresh ? " fresh" : "";
  const how = (h, label) => `<button class="pick ghost" data-action="agtodo" data-id="${esc(s.id)}" data-how="${h}">${label}</button>`;
  return `<div class="scrim${fresh}" data-action="agclose"></div><div class="sheet agsheet${fresh}" role="dialog" aria-modal="true" aria-label="${title}">` +
    `<div class="grab"></div><div class="shead"><b>${title}</b><button class="iconbtn" data-action="agclose" aria-label="Close">${ic("x")}</button></div>` +
    agKindHTML(s) + (s.restored ? draftStripHTML("ag", s.restored) : "") +
    `<label class="lbl mono">What<input type="text" value="${esc(s.t)}" data-ag="t" placeholder="Reply to the email, renew the pass" autocapitalize="sentences"></label>` +
    `<div class="ag-times"><label class="lbl mono">Day<input type="date" value="${esc(s.d)}" data-ag="d"></label>` +
    `<label class="lbl mono">Time<input type="time" value="${esc(s.s)}" data-ag="s"></label></div>` +
    `<label class="lbl mono">Note<input type="text" value="${esc(s.n || "")}" data-ag="n" placeholder="Anything to remember"></label>` +
    `<p class="ssub">It asks once at this time: Done, Tomorrow or Drop it.</p>` +
    (edit ? `<div class="agtodo-a">${how("done", "Done")}${how("tomorrow", "Tomorrow")}${how("drop", "Drop it")}</div>` : "") +
    (s.err ? `<div class="err" role="alert">${esc(s.err)}</div>` : "") +
    `<div class="sactions"><button class="btn primary" data-action="agsave">${edit ? "Save" : "Add to-do"}</button></div></div>`;
}
function agSheetHTML() {
  if (agSheet.kind === "todo") return agTodoSheetHTML();
  const s = agSheet, edit = s.mode === "edit", title = edit ? "Edit event" : "New event", fresh = agSheetFresh ? " fresh" : "";
  const chip = (act, on, label, extra = "") => `<button class="pick ghost${on ? " on" : ""}" data-action="${act}"${extra} aria-pressed="${on}">${label}</button>`;
  return `<div class="scrim${fresh}" data-action="agclose"></div><div class="sheet agsheet${fresh}" role="dialog" aria-modal="true" aria-label="${title}">` +
    `<div class="grab"></div><div class="shead"><b>${title}</b><button class="iconbtn" data-action="agclose" aria-label="Close">${ic("x")}</button></div>` +
    agKindHTML(s) + (s.restored ? draftStripHTML("ag", s.restored) : "") +
    (edit && s.uid ? `<p class="ssub">From a calendar file. Adding that file again updates it.</p>` : "") +
    `<label class="lbl mono">What<input type="text" value="${esc(s.t)}" data-ag="t" placeholder="Dentist, soccer, a flight" autocapitalize="sentences"></label>` +
    `<label class="lbl mono">${s.multi ? "First day" : "Day"}<input type="date" value="${esc(s.d)}" data-ag="d"></label>` +
    (s.multi ? `<label class="lbl mono">Last day<input type="date" value="${esc(s.d2 || "")}" data-ag="d2"></label>` : "") +
    `<div class="pickrow">${chip("agallday", s.allDay, "All day")}${chip("agmulti", s.multi, "Ends another day")}</div>` +
    (s.allDay ? "" : `<div class="ag-times"><label class="lbl mono">Starts<input type="time" value="${esc(s.s)}" data-ag="s"></label>` +
      `<label class="lbl mono">Ends<input type="time" value="${esc(s.e)}" data-ag="e"></label></div>`) +
    `<div class="lbl mono">Repeats</div><div class="pickrow">` +
      (agRepChip(s) === "keep" ? [["keep", agRepWords(s)]] : []).concat(AG_REP_CHIPS)
      .map(([r, label]) => chip("agrep", agRepChip(s) === r, esc(label), ` data-rep="${r}"`)).join("") + `</div>` +
    (s.rep ? `<label class="lbl mono">Until<input type="date" value="${esc(s.until || "")}" data-ag="until"></label>` +
      (s.until ? "" : `<p class="ssub">Blank keeps it repeating.</p>`) : "") +
    (edit && s.rep && s.on ? `<button class="btn" data-action="agskip">Skip ${esc(agDayWords(s.on))} only</button>` : "") +
    (s.rep && s.skip && s.skip.length ? `<p class="ssub">${s.skip.length === 1 ? "One day" : s.skip.length + " days"} left out ` +
      `<button class="textbtn sm" data-action="agunskip">Bring back</button></p>` : "") +
    agColourHTML(s) + agAlertsHTML(s, chip) +
    `<label class="lbl mono">Note<input type="text" value="${esc(s.n)}" data-ag="n" placeholder="Where, who, what to bring"></label>` +
    (s.err ? `<div class="err" role="alert">${esc(s.err)}</div>` : "") +
    `<div class="sactions">${edit ? `<button class="btn danger" data-action="agdelete">Delete</button>` : ""}` +
    `<button class="btn primary" data-action="agsave">${edit ? "Save" : "Add event"}</button></div></div>`;
}
// ---- An event's colour in its sheet ---------------------------------------------------------------
// Work, Personal (the default, never stored), Social or Travel.
const AG_COLOUR_CHIPS = [["work", "Work"], ["pers", "Personal"], ["soc", "Social"], ["trav", "Travel"]];
function agColourHTML(s) {
  const on = AG_COLOURS.includes(s.c) ? s.c : "pers";
  return `<div class="lbl mono">Colour</div><div class="pickrow kal-cats">` + AG_COLOUR_CHIPS.map(([k, label]) =>
    `<button class="pick ghost kal-cat c-${k}${on === k ? " on" : ""}" data-action="agcolour" data-c="${k}" aria-pressed="${on === k}"><i class="kal-sw"></i>${label}</button>`).join("") + `</div>`;
}
// ---- An event's alerts in its sheet ------------------------------------------------------------
// A chip for each usual alert (minutes before only for a timed event), then
// one for any other the event has (one Claude filed, from what you said), to
// turn it off. Under them a line for each alert that's on: when it goes, and for
// one a day or more before, its own time.
const AG_ALERT_CHIPS = [["30", "30 min"], ["60", "1 hour"], ["0d", "Day of"], ["1d", "Day before"], ["1w", "1 week"], ["2w", "2 weeks"], ["1m", "1 month"]];
const AG_ALERT_AT = {"0d": "07:00"};   // the time a chip's alert starts at: 19:00 for the rest
// The sheet's alerts as chosen, or the usual two when none was, in the order of their lines.
const agSheetAlerts = s => Array.isArray(s.al) ? s.al : AG_ALERT_DEFAULT;
function agAlertsHTML(s, chip) {
  const list = agSheetAlerts(s), timed = !s.allDay, shown = c => timed || agAlertDay(c);
  const on = new Set(list.filter(shown).map(agAlertBase));
  const chips = AG_ALERT_CHIPS.filter(([b]) => timed || /[dwm]$/.test(b))
    .concat([...on].filter(b => !AG_ALERT_CHIPS.some(x => x[0] === b))
      .map(b => [b, agAlertWords(list.find(c => agAlertBase(c) === b)).replace(/ before$/, "")]));
  const lines = list.map((c, i) => {
    if (!shown(c)) return "";
    const w = agAlertWhen(s, c), words = agAlertWords(c);
    return `<div class="agal-r"><span class="agal-l">${words}</span><span id="agw${i}" class="agal-w${w.past ? " past" : ""}">${esc(w.txt)}</span>` +
      (agAlertDay(c) ? `<input type="time" value="${c.slice(-5)}" data-agal="${i}" aria-label="${words}, its time">` : "") + `</div>`;
  }).join("");
  return `<div class="lbl mono">Alerts</div><div class="pickrow">` +
    chips.map(([b, label]) => chip("agalert", on.has(b), label, ` data-al="${b}"`)).join("") + `</div>` +
    (lines ? `<div class="agal">${lines}</div>` : "");
}
// When an alert goes, for its line: the day, and the time for one minutes
// before; for a repeating event only the time. Struck through once it's past,
// or when one a day or more before would come at or after the start.
function agAlertWhen(s, c) {
  const start = s.allDay ? null : AG_HM.test(s.s) ? s.s : undefined, none = {txt: "", past: false}, late = {txt: "After it starts", past: true};
  if (start === undefined) return none;
  if (s.rep) {
    if (!agAlertDay(c)) return start ? {txt: agHM(agStamp("2026-01-01", start) - +c * 60000), past: false} : none;
    return start && agAlertBase(c) === "0d" && c.slice(-5) >= start ? late : none;
  }
  if (!agValidIso(s.d)) return none;
  const t = agAlertAt(c, s.d, start);
  if (t === null) return none;
  if (agAlertDay(c) && t >= agAlertBy(s.d, start)) return late;
  return {txt: agDayWords(fmtDate(new Date(t))) + (agAlertDay(c) ? "" : ", " + agHM(t)), past: t <= callNow()};
}
// A new day, start or alert time relabels the lines where they are: a redraw could lose a tap.
function agAlertsRelabel() {
  if (!agSheet || agSheet.kind !== "event" || typeof document === "undefined") return;
  agSheetAlerts(agSheet).forEach((c, i) => {
    const el = document.getElementById("agw" + i);
    if (!el) return;
    const w = agAlertWhen(agSheet, c);
    el.textContent = w.txt;
    el.className = "agal-w" + (w.past ? " past" : "");
  });
}
// One alert's own time, for one a day or more before; a cleared time keeps the one it had.
function agAlertTime(i, hm) {
  const list = [...agSheetAlerts(agSheet)], c = list[i];
  if (!c || !agAlertDay(c) || !AG_HM.test(hm)) return;
  list[i] = agAlertBase(c) + "@" + hm;
  agSheet.al = list;
}

// Checks the sheet, then saves it; the sheet stays open with a message when something's missing.
function agSave() {
  if (agSheet.kind === "todo") return agTodoSave();
  const s = agSheet, t = s.t.trim(), timed = !s.allDay;
  const err = !t ? "Give it a name first." : !agValidIso(s.d) ? "Pick a day." : s.multi && !(agValidIso(s.d2) && s.d2 > s.d) ? "The last day is before the first." :
    timed && !AG_HM.test(s.s) ? "Pick a start time." : timed && !s.multi && s.e && AG_HM.test(s.e) && s.e <= s.s ? "It ends before it starts." :
    s.rep && s.until && agValidIso(s.until) && s.until < s.d ? "It stops repeating before it starts." : null;
  if (err) { s.err = err; return; }
  const f = {t, d: s.d, d2: s.multi ? s.d2 : null, s: timed ? s.s : null, e: timed && AG_HM.test(s.e) ? s.e : null, rep: s.rep, n: s.n, al: s.al, c: AG_COLOURS.includes(s.c) ? s.c : null,
    every: s.rep ? s.every || 1 : undefined, until: s.rep && agValidIso(s.until) ? s.until : undefined,
    days: s.rep ? s.days || undefined : undefined, nth: s.rep ? s.nth || undefined : undefined, skip: s.rep ? s.skip : undefined};
  const before = agSnapshot();
  if (s.mode === "new") { if (agAdd(f)) agNoteUsed(s.from); draftsLetGo("ag", s); showToast(`${t} added`, () => agRestore(before)); }
  else { agUpdate(s.id, f); showToast("Changes saved", () => agRestore(before)); }
  agSheet = null;
}
// A day or time you set yourself is a fresh start: it asks again there.
function agTodoSave() {
  const s = agSheet, t = s.t.trim();
  const err = !t ? "Give it a name first." : !agValidIso(s.d) ? "Pick a day." : !AG_HM.test(s.s) ? "Pick a time." : null;
  if (err) { s.err = err; return; }
  const before = agSnapshot();
  if (s.mode === "new") {
    if (agAdd({t, d: s.d, s: s.s, n: s.n || "", todo: {q: "", tom: 0, done: null}})) agNoteUsed(s.from);
    draftsLetGo("ag", s);
    showToast(`${t} added`, () => agRestore(before));
  } else {
    const it = agState().items.find(x => x.id === s.id), moved = it && it.todo && (it.d !== s.d || it.s !== s.s);
    agUpdate(s.id, {t, d: s.d, s: s.s, n: s.n || "", ...(moved ? {todo: {...it.todo, tom: 0}} : {})});
    showToast("Changes saved", () => agRestore(before));
  }
  agSheet = null;
}
// Typing keeps a sheet in step without a redraw (which would drop the keyboard).
function agField(t) {
  const ds = t && t.dataset;
  if (ds && ds.agal !== undefined && agSheet) { agAlertTime(+ds.agal, t.value); agAlertsRelabel(); return true; }
  if (ds && ds.ag && agSheet) { agSheet[ds.ag] = t.value; if (ds.ag === "d" || ds.ag === "s") agAlertsRelabel(); return true; }
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
  const n = r.added + r.changed + r.removed, odd = r.odd || [];
  // A repeat GI Hub can't follow is said, never imported wrong without a word.
  const oddWords = !odd.length ? "" : odd.length === 1 ? `. “${odd[0]}” has only its first day: its repeat is one GI Hub can't follow`
    : `. ${odd.length} have only their first day: their repeats are ones GI Hub can't follow`;
  showToast((!n ? "Already up to date" : r.added && !r.changed && !r.removed ? `Added ${r.added} event${r.added === 1 ? "" : "s"}` :
    "Updated: " + [r.added && `${r.added} new`, r.changed && `${r.changed} changed`, r.removed && `${r.removed} removed`].filter(Boolean).join(", ")) + oddWords,
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

// ---- Call requests -------------------------------------------------------------------------------
// The blocks a request can still be for: the next two.
function agReqBlocks() {
  const b = blockFor(getToday());
  return b ? [b.num + 1, b.num + 2].filter(n => blockFor(blockStart(n))) : [];
}
function agReqLinkHTML() {
  const nums = FELLOWS ? [] : agReqBlocks();
  return nums.length ? `<button class="ag-link" data-action="agreq">${ic("phone")}<span><b>Call requests</b><span>Block ${nums[0]}, ready to paste</span></span></button>` : "";
}
// The weekends with why each won't do, Thursdays, days off (an all-day event
// offered as days away with one tap), and the request to paste.
function agReqHTML() {
  const r = agRequest(agReq.num), nums = agReqBlocks(), fresh = agSheetFresh ? " fresh" : "", off = agState().off;
  const away = agAwayIn(r.num), todo = away.filter(a => a.days.some(x => !off.includes(x)));
  const seg = nums.length > 1 ? `<div class="segtabs rq-seg" role="group" aria-label="Which block">` + nums.map(n =>
    `<button class="${n === r.num ? "on" : ""}" data-action="agreqblock" data-num="${n}" aria-pressed="${n === r.num}">Block ${n}</button>`).join("") + `</div>` : "";
  const wk = w => `<div class="rq ${w.why ? "bad" : "ok"}">${ic(w.why ? "x" : "check")}<b>${agSpanWords(w.fri, w.mon)}</b><span>${w.why || "Clear"}</span></div>`;
  const days = r.runs.map(run => { const w = agRunWords(run);
    return `<button class="rq-chip on" data-action="agreqoff" data-day="${run[0]}" aria-label="Remove ${w}">${w}${ic("x", "sm")}</button>`; }).join("") +
    todo.map(a => `<button class="rq-chip add" data-action="agreqaway" data-id="${esc(a.id)}">+ ${esc(a.t)} · ${agRunWords([a.days[0], a.days[a.days.length - 1]])}</button>`).join("") +
    `<label class="rq-chip add">+ Add a day<input type="date" data-agreq="add" min="${r.start}" max="${r.end}" aria-label="Add a day off"></label>` +
    (away.length ? "" : `<span class="rq-chip none">Away in Agenda: none</span>`);
  return `<div class="scrim${fresh}" data-action="agreqclose"></div><div class="sheet agreq${fresh}" role="dialog" aria-modal="true" aria-label="Call requests">` +
    `<div class="grab"></div><div class="shead"><b>Call requests</b><button class="iconbtn" data-action="agreqclose" aria-label="Close">${ic("x")}</button></div>` +
    seg + `<p class="rq-sub mono">Block ${r.num} · ${esc(r.name)} · ${agMD(r.start)} to ${agMD(r.end)}</p>` +
    `<div class="set-h mono"><span>Weekend</span><span>Settle with your co-fellow</span></div><div class="card rq-list">${r.weekends.map(wk).join("")}</div>` +
    `<div class="setgrp"><div class="set-h mono"><span>No call</span><span>Thursdays</span></div>` +
    `<div class="rq-chips">${r.thursdays.map(t => `<span class="rq-chip">${agMD(t)}</span>`).join("")}</div></div>` +
    `<div class="setgrp"><div class="set-h mono"><span>Days off</span><span>Mon to Wed fits best</span></div><div class="rq-chips">${days}</div></div>` +
    `<div class="setgrp"><div class="set-h mono"><span>Ready to paste</span></div><p class="rq-txt">${esc(r.text)}</p></div>` +
    `<div class="setgrp"><button class="btn flu" data-action="agreqcopy">${ic("copy")}Copy request</button></div></div>`;
}
function agReqCopy() {
  const text = agRequest(agReq.num).text;
  const done = ok => { showToast(ok ? "Request copied" : "Copy isn't available here"); route.keepScroll = true; render(); };
  if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText)
    navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
  else done(false);
}
// A day picked in + Add a day.
function agReqField(t) {
  if (!(t && t.dataset && t.dataset.agreq === "add")) return false;
  if (agReq) agOffAdd(agReq.num, [t.value]);
  route.keepScroll = true; render();
  return true;
}

// ---- Week's Next line ----------------------------------------------------------------------------
function agNextHTML() {
  const nx = agNext(callNow());
  if (!nx) return "";
  const t = agToday(), day = nx.iso === t ? "Today" : nx.iso === agAddDays(t, 1) ? "Tomorrow" : agDayWords(nx.iso);
  return `<button class="card agnext" data-action="agshow" data-day="${nx.iso}"><span class="mono">Next</span><b>${esc(nx.t)}</b>` +
    `<span class="mono">${day} · ${nx.from || "All day"}</span>${ic("chev", "sm")}</button>`;
}

// ---- Week's to-dos ----------------------------------------------------------------------------
// Today's to-dos whose time has come, each with its three answers; nothing when none.
function agTodoDueHTML() {
  const due = agTodosDue(callNow());
  if (!due.length) return "";
  return `<section class="sec"><div class="card agtodos">` + due.map(it => {
    const b = (how, label) => `<button class="pick ghost" data-action="agtodo" data-id="${esc(it.id)}" data-how="${how}">${label}</button>`;
    return `<div class="agtodo"><span class="mono">To-do · ${it.s}</span><b>${esc(it.t)}</b>${it.todo.q ? `<span>${esc(it.todo.q)}</span>` : ""}` +
      `<div class="agtodo-a">${b("done", "Done")}${b("tomorrow", "Tomorrow")}${b("drop", "Drop it")}</div></div>`;
  }).join("") + `</div></section>`;
}

// ---- Taps --------------------------------------------------------------------------------------
// Returns false when it redraws by itself.
function agDispatch(act, d) {
  // Day, Week or Month, on a day when one is given (a head in Week, Open the day).
  if (act === "agview") {
    agView = ["d", "w", "m"].includes(d.view) ? d.view : "d";
    if (agValidIso(d.day)) agSel = d.day;
    agMonth = agSel.slice(0, 7);
  }
  // A day picked in the strip or in Month; Month stays on its month.
  else if (act === "agday" && agValidIso(d.day)) { agSel = d.day; if (agView !== "m") agMonth = agSel.slice(0, 7); }
  // Back or on a day, a week (or 3 days) or a month.
  else if (act === "agstep") {
    const k = Math.trunc(+d.step) || 0;
    if (agView === "m") {
      const [y, m] = agMonth.split("-").map(Number), t = new Date(y, m - 1 + k, 1);
      agMonth = fmtDate(t).slice(0, 7);
      agSel = agToday().slice(0, 7) === agMonth ? agToday() : agMonth + "-01";
    } else { agSel = agAddDays(agSel, k * (agView === "w" ? agWd : 1)); agMonth = agSel.slice(0, 7); }
  }
  else if (act === "agtoday") { agSel = agToday(); agMonth = agSel.slice(0, 7); }
  else if (act === "agwd") agWd = d.n === "3" ? 3 : 7;
  // An empty hour tapped: a new event there, for an hour.
  else if (act === "agslot") {
    agOpen(null);
    if (agValidIso(d.day)) agSheet.d = d.day;
    if (AG_HM.test(d.at || "")) { agSheet.s = d.at; agSheet.e = agMinsHM(Math.min(23 * 60 + 59, agMin(d.at) + 60)); }
  }
  else if (act === "agshow") { agSel = d.day; agView = "d"; go({page: "agenda"}); return false; }
  else if (act === "agcall") { go({page: "call", from: "agenda"}); return false; }
  else if (act === "agstudy") { studyTab = "t"; go({page: "study"}); return false; }
  else if (act === "agnew") { agOpen(null); draftsInto("ag", agSheet); }
  else if (act === "agopen") agOpen(d.id, d.on);
  else if (act === "agkind" && agSheet && agSheet.mode === "new") { agSheet.kind = d.kind === "todo" ? "todo" : "event"; agSheet.err = null; }
  // A to-do answered, from Week or its sheet: a toast with Undo.
  else if (act === "agtodo") {
    const before = agSnapshot();
    if (agTodoAnswer(d.id, d.how, callNow())) {
      showToast(d.how === "done" ? "Marked done" : d.how === "tomorrow" ? "Moved to tomorrow" : "To-do dropped", () => agRestore(before));
      if (agSheet && agSheet.id === d.id) agSheet = null;
    }
  }
  // A note: into a new event or to-do sheet, or deleted with Undo.
  else if (act === "agnoteev" || act === "agnotetodo") agOpenNote(d.id, act === "agnotetodo" ? "todo" : "event");
  else if (act === "agnotedel") {
    const before = agSnapshot();
    if (agRemoveNote(d.id)) showToast("Note deleted", () => agRestore(before));
  }
  else if (act === "agclose") { draftsLetGo("ag", agSheet); agSheet = null; }
  else if (act === "agsave" && agSheet) agSave();
  else if (act === "agdelete" && agSheet) {
    const before = agSnapshot();
    agRemove(agSheet.id); agSheet = null;
    showToast("Event deleted", () => agRestore(before)); }
  else if (act === "agallday" && agSheet) agSheet.allDay = !agSheet.allDay;
  else if (act === "agmulti" && agSheet) { agSheet.multi = !agSheet.multi; if (agSheet.multi && !(agSheet.d2 > agSheet.d)) agSheet.d2 = agAddDays(agSheet.d, 1); }
  // A chip sets a plain repeat; the calendar file's own pattern stays only on its own chip.
  else if (act === "agrep" && agSheet && d.rep !== "keep") {
    const r = d.rep || "";
    Object.assign(agSheet, {rep: r === "w2" ? "w" : r || null, every: r === "w2" ? 2 : 1, days: null, nth: null});
  }
  // Skip one time of a repeating event: saved at once, with Undo.
  else if (act === "agskip" && agSheet && agSheet.on) {
    const before = agSnapshot(), it = agState().items.find(x => x.id === agSheet.id), on = agSheet.on;
    if (it) { agUpdate(it.id, {skip: [...(it.skip || []), on]}); showToast(`${agDayWords(on)} skipped`, () => agRestore(before)); }
    agSheet = null;
  }
  else if (act === "agunskip" && agSheet) agSheet.skip = [];
  else if (act === "agcolour" && agSheet && AG_COLOUR_CHIPS.some(([k]) => k === d.c)) agSheet.c = d.c;
  // One kind of alert on, at its usual time, or off (however many of it there
  // are); the rest stay as they were (the usual two, when none was chosen).
  else if (act === "agalert" && agSheet && typeof d.al === "string" && d.al) {
    const cur = agSheetAlerts(agSheet), b = d.al;
    agSheet.al = cur.some(c => agAlertBase(c) === b) ? cur.filter(c => agAlertBase(c) !== b)
      : agAlertsClean([...cur, /[dwm]$/.test(b) ? b + "@" + (AG_ALERT_AT[b] || "19:00") : b]);
  }
  else if (act === "agusual") { agUsual = JSON.parse(JSON.stringify(agState().usual)); agSheetFresh = true; }
  else if (act === "agusualclose") agUsual = null;
  else if (act === "agusualsave" && agUsual) agUsualSave();
  else if (act === "agblockadd" && agUsual) agUsual.days[d.day].push({a: "08:00", b: "17:00", t: "Work"});
  else if (act === "agblockdel" && agUsual) agUsual.days[d.day].splice(+d.i, 1);
  else if (act === "agfilepick") { agError = null; const f = document.getElementById("agfile"); if (f) f.click(); return false; }
  else if (act === "agreq") { const n = agReqBlocks()[0]; if (n && !FELLOWS) { agReq = {num: n}; agSheetFresh = true; } }
  else if (act === "agreqclose") agReq = null;
  else if (act === "agreqblock" && agReq && agReqBlocks().includes(+d.num)) agReq.num = +d.num;
  else if (act === "agreqoff" && agReq) agOffDrop(agReq.num, d.day);
  else if (act === "agreqaway" && agReq) { const a = agAwayIn(agReq.num).find(x => x.id === d.id); if (a) agOffAdd(agReq.num, a.days); }
  else if (act === "agreqcopy" && agReq) { agReqCopy(); return false; }
  return true;
}
