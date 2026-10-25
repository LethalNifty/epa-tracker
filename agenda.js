"use strict";
// Agenda: one calendar for call, reading nights, work and your own events.
// The model: saved events made whole, which days an event covers (repeats,
// several days, past midnight), Manitoba's general holidays, your usual week,
// a day's rows and .ics files. Events live in the EPA store
// (Store.state.agenda), so they go in the backup. Full app only. Reads
// call.js and study.js when it runs, never while this file loads.

const AG_ISO = /^\d{4}-\d{2}-\d{2}$/, AG_HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const AG_T_MAX = 120, AG_N_MAX = 500;
const AG_REPS = ["w", "m", "y"];

// ---- Days ---------------------------------------------------------------------------
const agDate = iso => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const agAddDays = (iso, k) => { const t = agDate(iso); t.setDate(t.getDate() + k); return fmtDate(t); };
// Whole days from a to b, by the calendar, ignoring the clock.
const agDiff = (a, b) => { const x = agDate(a), y = agDate(b);
  return Math.round((Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()) - Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())) / 864e5); };
const agValidIso = iso => typeof iso === "string" && AG_ISO.test(iso) && fmtDate(agDate(iso)) === iso;
const agMin = hm => +hm.slice(0, 2) * 60 + +hm.slice(3);
// Monday on or before a day.
const agMonday = iso => agAddDays(iso, -((agDate(iso).getDay() + 6) % 7));

// ---- Your usual week ------------------------------------------------------------------
// Monday to Friday 8 to 6; Thursday work until noon, then half day until 5.
function agDefaultUsual() {
  const work = () => [{a: "08:00", b: "18:00", t: "Work"}];
  return {days: {"0": [], "1": work(), "2": work(), "3": work(), "4": [{a: "08:00", b: "12:00", t: "Work"}, {a: "12:00", b: "17:00", t: "Half day"}],
    "5": work(), "6": []}, early: "07:00", late: "22:00"};
}
// A day's blocks, each a start before its end; a day the saved week doesn't name keeps its default.
function agUsualClean(u) {
  const def = agDefaultUsual(), days = {};
  for (let k = 0; k < 7; k++) {
    const raw = u && u.days && u.days[k];
    days[k] = Array.isArray(raw) ? raw.filter(b => b && AG_HM.test(b.a) && AG_HM.test(b.b) && b.a < b.b)
      .map(b => ({a: b.a, b: b.b, t: typeof b.t === "string" && b.t.trim() ? b.t.trim().slice(0, 40) : "Work"})) : def.days[k];
  }
  const hm = (v, d) => typeof v === "string" && AG_HM.test(v) ? v : d;
  return {days, early: hm(u && u.early, def.early), late: hm(u && u.late, def.late)};
}

// ---- Events -------------------------------------------------------------------------------
// One saved event made whole, or null with no title or date. d2: the last day
// when it runs over several (inclusive). s and e: "HH:MM", or null for all day;
// an end before the start runs past midnight into the next day.
function agItemClean(x) {
  if (!x || typeof x !== "object" || typeof x.t !== "string" || !x.t.trim() || !agValidIso(x.d)) return null;
  const s = typeof x.s === "string" && AG_HM.test(x.s) ? x.s : null;
  let e = s && typeof x.e === "string" && AG_HM.test(x.e) ? x.e : null;
  let d2 = agValidIso(x.d2) && x.d2 > x.d ? x.d2 : null;
  if (s && e && !d2 && e <= s) { if (e === s) e = null; else d2 = agAddDays(x.d, 1); }
  return {id: typeof x.id === "string" && /^a[a-z0-9]{1,24}$/.test(x.id) ? x.id : "", t: x.t.trim().slice(0, AG_T_MAX), d: x.d, d2, s, e,
    rep: AG_REPS.includes(x.rep) ? x.rep : null, n: typeof x.n === "string" ? x.n.trim().slice(0, AG_N_MAX) : "",
    uid: typeof x.uid === "string" && x.uid ? x.uid.slice(0, 200) : null, ts: typeof x.ts === "string" ? x.ts : ""};
}
function agNewId(taken) {
  let id;
  do id = "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); while (taken.has(id));
  return id;
}
const agBlank = () => ({items: [], usual: agDefaultUsual()});
// The saved agenda made whole: blanks dropped, every id present and unique.
function agClean(raw) {
  const items = [], taken = new Set();
  for (const x of raw && Array.isArray(raw.items) ? raw.items : []) {
    const it = agItemClean(x);
    if (!it) continue;
    if (!it.id || taken.has(it.id)) it.id = agNewId(taken);
    taken.add(it.id); items.push(it);
  }
  return {items, usual: agUsualClean(raw && raw.usual)};
}
// Whether an occurrence of the event starts on day o.
function agStartsOn(it, o) {
  if (o === it.d) return true;
  if (!it.rep || o < it.d) return false;
  if (it.rep === "w") return agDiff(it.d, o) % 7 === 0;
  if (it.rep === "m") return o.slice(8) === it.d.slice(8);
  return o.slice(5) === it.d.slice(5);
}
// How the event covers a day, or null: from and to ("24:00" when it runs on
// past midnight), cont when it started on an earlier day, more when it goes on.
function agSpan(it, iso) {
  const len = it.d2 ? agDiff(it.d, it.d2) : 0;
  for (let k = 0; k <= len; k++) {
    const o = agAddDays(iso, -k);
    if (o < it.d || !agStartsOn(it, o)) continue;
    const allDay = !it.s;
    return {allDay, from: allDay || k > 0 ? null : it.s, to: allDay ? null : k < len ? "24:00" : it.e, cont: k > 0, more: k < len};
  }
  return null;
}

// ---- Holidays -------------------------------------------------------------------------------
// Easter Sunday (the anonymous Gregorian computus), for Good Friday.
function agEaster(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), n = h + l - 7 * m + 114;
  return new Date(y, Math.floor(n / 31) - 1, n % 31 + 1);
}
// The nth Monday of a month (0-based month).
const agNthMonday = (y, m, n) => { const d = new Date(y, m, 1); d.setDate(1 + (8 - d.getDay()) % 7 + 7 * (n - 1)); return d; };
// Manitoba's general holidays.
function agHolidays(y) {
  const good = agEaster(y); good.setDate(good.getDate() - 2);
  const vic = new Date(y, 4, 24); vic.setDate(24 - (vic.getDay() + 6) % 7);
  return [[new Date(y, 0, 1), "New Year's Day"], [agNthMonday(y, 1, 3), "Louis Riel Day"], [good, "Good Friday"], [vic, "Victoria Day"],
    [new Date(y, 6, 1), "Canada Day"], [agNthMonday(y, 8, 1), "Labour Day"], [new Date(y, 8, 30), "Truth and Reconciliation Day"],
    [agNthMonday(y, 9, 2), "Thanksgiving"], [new Date(y, 10, 11), "Remembrance Day"], [new Date(y, 11, 25), "Christmas Day"]]
    .map(([d, name]) => ({d: fmtDate(d), name})).sort((p, q) => p.d < q.d ? -1 : 1);
}
const agHolidayMemo = {};
function agHoliday(iso) {
  const y = iso.slice(0, 4), list = agHolidayMemo[y] || (agHolidayMemo[y] = agHolidays(+y));
  const h = list.find(x => x.d === iso);
  return h ? h.name : null;
}

// ---- Saving ----------------------------------------------------------------------------------
const agState = () => Store.state.agenda;
function agAdd(f) {
  const it = agItemClean({...f, id: agNewId(new Set(agState().items.map(x => x.id))), ts: new Date().toISOString()});
  if (!it) return null;
  agState().items.push(it); Store.save();
  return it.id;
}
function agUpdate(id, f) {
  const a = agState(), i = a.items.findIndex(x => x.id === id);
  const it = i < 0 ? null : agItemClean({...a.items[i], ...f, id});
  if (!it) return false;
  a.items[i] = it; Store.save();
  return true;
}
function agRemove(id) { const a = agState(); a.items = a.items.filter(x => x.id !== id); Store.save(); }
const agSnapshot = () => JSON.parse(JSON.stringify(agState()));
function agRestore(snap) { Store.state.agenda = agClean(snap); Store.save(); }
function agSetUsual(u) { agState().usual = agUsualClean(u); Store.save(); }

// ---- A day ------------------------------------------------------------------------------------
// What a day's rows read from: call, the study plan and today. One per
// redraw, so each block's reading plan is worked out once.
function agCtx() {
  return {stretches: callStretches(CallStore.list()), study: Store.state.study, today: getToday(), nights: {}};
}
const agHM = t => { const d = new Date(t); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
// Usual-week blocks, named for the rotation ("Consults SBH"); none on a holiday.
function agWorkRows(iso) {
  if (agHoliday(iso)) return [];
  const blk = blockFor(agDate(iso)), name = blk ? blk.name : "Work";
  return (agState().usual.days[agDate(iso).getDay()] || []).map(b => ({k: "work", t: b.t === "Work" ? name : b.t, sub: "", from: b.a, to: b.b}));
}
// Call that touches the day: from its start, until its end, or all day.
function agCallRows(iso, ctx) {
  const a = agDate(iso).getTime(), z = agDate(agAddDays(iso, 1)).getTime(), out = [];
  for (const st of ctx.stretches) {
    if (st.e <= a || st.s >= z) continue;
    const seg = st.segs.find(x => x.e > Math.max(a, st.s)) || st.segs[0], cont = st.s < a, more = st.e > z;
    const staff = CALL_SITES.map(([k, short]) => seg[k] && seg[k].att ? short + " " + seg[k].att : "").filter(Boolean).join(" · ");
    const when = more ? `to ${DAYS[new Date(st.e).getDay()]} ${agHM(st.e)}` : cont ? `until ${agHM(st.e)}` : `to ${agHM(st.e)}`;
    out.push({k: "call", t: "On call", sub: [when, staff].filter(Boolean).join(" · "), from: cont ? null : agHM(st.s), to: more ? null : agHM(st.e),
      cont, more, allDay: cont && more});
  }
  return out;
}
// The night's reading: its pages ahead, done once read, or why there's none.
function agReadRow(iso, ctx) {
  const s = ctx.study, d = agDate(iso), today = fmtDate(ctx.today), b = studyBlockOf(d);
  if (b === null) return null;
  const nights = ctx.nights[b] || (ctx.nights[b] = studyNights(Math.min(13, b), ctx.today, s, ctx.stretches));
  const x = nights.find(n => n.key === iso);
  if (!x) return null;
  const row = (t, sub, more) => ({k: "read", t, sub, from: "20:00", to: null, ...more});
  if (x.state === "done" || x.state === "extra") return row("Reading done", "", {done: true});
  if (iso === today && x.kind === "read" && studyTonight(ctx.today, s, ctx.stretches).done) return row("Reading done", "", {done: true});
  // A night off says why only when it would have been a reading night.
  if (iso < today || (x.kind !== "read" && !STUDY_NIGHTS.includes(d.getDay()))) return null;
  if (x.kind === "call") return row("No reading tonight", "On call", {off: true});
  if (x.kind === "pause" || x.kind === "skip") return row("No reading tonight", x.kind === "skip" ? "Not tonight" : "Paused", {off: true});
  if (x.kind !== "read" || !x.run) return null;
  const pcs = studyPieces(x.run[0], x.run[1]);
  return row(pcs.map(p => studyShort(p.item) + " · " + (p.a === p.z ? "p. " + p.a : "pp. " + p.a + "–" + p.z)).join(", "),
    pcs.length === 1 ? studyTitle(pcs[0].item) : x.pages + " pages");
}
// Your own events on the day.
function agEventRows(iso) {
  const out = [];
  for (const it of agState().items) {
    const sp = agSpan(it, iso);
    if (sp) out.push({k: sp.allDay ? "all" : "ev", t: it.t, sub: it.n, id: it.id, from: sp.from, to: sp.to === "24:00" ? null : sp.to,
      cont: sp.cont, more: sp.more, allDay: sp.allDay});
  }
  return out;
}
const AG_KIND_ORDER = {hol: 0, all: 1, work: 2, call: 3, ev: 4, read: 5};
// A day's rows: the holiday, then all-day things, then the rest by time
// (what carries on from the night before first).
function agDay(iso, ctx) {
  ctx = ctx || agCtx();
  const hol = agHoliday(iso), rd = agReadRow(iso, ctx);
  const rows = [...agWorkRows(iso), ...agCallRows(iso, ctx), ...agEventRows(iso), ...(rd ? [rd] : [])];
  const rank = r => r.allDay ? 1 : 2, at = r => r.from || (r.cont ? "00:00" : "99:99");
  rows.sort((p, q) => rank(p) - rank(q) || (at(p) < at(q) ? -1 : at(p) > at(q) ? 1 : 0) || AG_KIND_ORDER[p.k] - AG_KIND_ORDER[q.k]);
  return (hol ? [{k: "hol", t: hol, sub: "", from: null, to: null}] : []).concat(rows);
}
// What the strip and the month mark on a day.
function agMarks(iso, ctx) {
  const rows = agDay(iso, ctx);
  return {hol: agHoliday(iso), call: rows.some(r => r.k === "call"), read: rows.some(r => r.k === "read" && !r.off),
    ev: rows.filter(r => r.k === "ev" || r.k === "all").length};
}
// Your next event in the coming week, or null: for Week's Next line.
function agNext(now) {
  const today = fmtDate(new Date(now)), hm = agHM(now);
  for (let k = 0; k <= 7; k++) {
    const iso = agAddDays(today, k);
    const list = agEventRows(iso).filter(r => !r.cont && (k > 0 || !r.from || r.from >= hm)).sort((p, q) => (p.from || "") < (q.from || "") ? -1 : 1);
    if (list.length) return {iso, from: list[0].from, t: list[0].t, id: list[0].id};
  }
  return null;
}
