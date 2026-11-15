"use strict";
// Agenda: one calendar for call, reading nights, work and your own events.
// The model: saved events made whole, which days an event covers (repeats,
// several days, past midnight), Manitoba's general holidays, your usual week,
// call requests, a day's rows and .ics files. Events and days off live in the
// EPA store (Store.state.agenda), so they go in the backup. Full app only. Reads
// call.js and study.js when it runs, never while this file loads.

const AG_ISO = /^\d{4}-\d{2}-\d{2}$/, AG_HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const AG_T_MAX = 120, AG_N_MAX = 500;
// Repeats: daily, weekly, monthly, yearly; with every (every 2 weeks), until
// (the last day it can start), days (weekly on these weekdays, 0 Sunday),
// nth (monthly on the nth weekday, -1 the last) and skip (days left out).
const AG_REPS = ["d", "w", "m", "y"];
const AG_WD = {SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6};
// An event's alerts: at 19:00 the evening before, and 30 minutes before it starts.
const AG_ALERTS = ["eve", "30"];

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
// A to-do is an item with a todo part: one day, a time (08:00 when none), no
// end, repeat or alerts of its own.
function agItemClean(x) {
  if (!x || typeof x !== "object" || typeof x.t !== "string" || !x.t.trim() || !agValidIso(x.d)) return null;
  const todo = agTodoClean(x.todo);
  const s = typeof x.s === "string" && AG_HM.test(x.s) ? x.s : todo ? "08:00" : null;
  let e = !todo && s && typeof x.e === "string" && AG_HM.test(x.e) ? x.e : null;
  let d2 = !todo && agValidIso(x.d2) && x.d2 > x.d ? x.d2 : null;
  if (s && e && !d2 && e <= s) { if (e === s) e = null; else d2 = agAddDays(x.d, 1); }
  const rep = !todo && AG_REPS.includes(x.rep) ? x.rep : null;
  const it = {id: typeof x.id === "string" && /^a[a-z0-9]{1,24}$/.test(x.id) ? x.id : "", t: x.t.trim().slice(0, AG_T_MAX), d: x.d, d2, s, e,
    rep, n: typeof x.n === "string" ? x.n.trim().slice(0, AG_N_MAX) : "",
    uid: typeof x.uid === "string" && x.uid ? x.uid.slice(0, 200) : null, ts: typeof x.ts === "string" ? x.ts : "",
    al: !todo && Array.isArray(x.al) ? AG_ALERTS.filter(k => x.al.includes(k)) : null};
  if (rep) Object.assign(it, agRepClean(x, rep));
  if (todo) it.todo = todo;
  return it;
}
// A repeat's extras, only those that say something.
function agRepClean(x, rep) {
  const out = {};
  if (Number.isInteger(x.every) && x.every > 1 && x.every <= 99) out.every = x.every;
  if (agValidIso(x.until) && x.until >= x.d) out.until = x.until;
  if (rep === "w" && Array.isArray(x.days)) {
    const ds = [...new Set(x.days.filter(n => Number.isInteger(n) && n >= 0 && n <= 6))].sort();
    if (ds.length && !(ds.length === 1 && ds[0] === agDate(x.d).getDay())) out.days = ds;
  }
  const nth = x.nth;
  if (rep === "m" && nth && Number.isInteger(nth.wd) && nth.wd >= 0 && nth.wd <= 6 && (nth.n === -1 || (Number.isInteger(nth.n) && nth.n >= 1 && nth.n <= 5)))
    out.nth = {n: nth.n, wd: nth.wd};
  if (Array.isArray(x.skip)) { const sk = [...new Set(x.skip.filter(agValidIso))].sort().slice(-200); if (sk.length) out.skip = sk; }
  return out;
}
// A to-do's part: the question it asks at its time (or none), how many times
// Tomorrow moved it (after two it asks no more), and when it was done.
const AG_Q_MAX = 140;
function agTodoClean(x) {
  if (!x || typeof x !== "object") return null;
  return {q: typeof x.q === "string" ? x.q.trim().slice(0, AG_Q_MAX) : "", tom: Number.isInteger(x.tom) ? Math.min(2, Math.max(0, x.tom)) : 0,
    done: typeof x.done === "string" && !isNaN(Date.parse(x.done)) ? x.done : null};
}
// The alerts an event gets: its own choice, or both when none was made; never
// 30 minutes before an all-day event.
const agAlerts = it => AG_ALERTS.filter(k => (Array.isArray(it.al) ? it.al : AG_ALERTS).includes(k) && (k !== "30" || !!it.s));
function agNewId(taken) {
  let id;
  do id = "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); while (taken.has(id));
  return id;
}
const agBlank = () => ({items: [], usual: agDefaultUsual(), off: [], notes: []});
// The saved agenda made whole: blanks dropped, every id present and unique.
function agClean(raw) {
  const items = [], taken = new Set();
  for (const x of raw && Array.isArray(raw.items) ? raw.items : []) {
    const it = agItemClean(x);
    if (!it) continue;
    if (!it.id || taken.has(it.id)) it.id = agNewId(taken);
    taken.add(it.id); items.push(it);
  }
  return {items, usual: agUsualClean(raw && raw.usual), off: agOffClean(raw && raw.off), notes: agNotesClean(raw && raw.notes)};
}

// ---- Notes ---------------------------------------------------------------------------------
// Things in your own words (from Tell GI Hub, or the + box) that wait on the
// Agenda page to become an event or a to-do: [{id, t, ts}], oldest first, the
// newest 100. As long as anything said can be (4000), since Claude files what
// it can't place as a note in your words. A second note with an id already
// there is the same note again.
const AG_NOTES_MAX = 100, AG_NOTE_T = 4000, AG_NOTE_ID = /^n[a-z0-9]{1,24}$/;
function agNoteNewId(taken) {
  let id;
  do id = "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); while (taken.has(id));
  return id;
}
function agNotesClean(raw) {
  const out = [], taken = new Set();
  for (const x of Array.isArray(raw) ? raw : []) {
    const t = x && typeof x.t === "string" ? x.t.trim().slice(0, AG_NOTE_T) : "";
    if (!t) continue;
    const ok = typeof x.id === "string" && AG_NOTE_ID.test(x.id);
    if (ok && taken.has(x.id)) continue;
    const id = ok ? x.id : agNoteNewId(taken);
    taken.add(id); out.push({id, t, ts: typeof x.ts === "string" ? x.ts : ""});
  }
  return out.slice(-AG_NOTES_MAX);
}
// Whether an occurrence of the event starts on day o. Every 2 weeks counts
// weeks Monday to Sunday from the first one; a month without the day (the
// 31st) has none, as calendars do.
function agStartsOn(it, o) {
  if (it.skip && it.skip.includes(o)) return false;
  if (o === it.d) return true;
  if (!it.rep || o < it.d || (it.until && o > it.until)) return false;
  const k = it.every || 1;
  if (it.rep === "d") return agDiff(it.d, o) % k === 0;
  if (it.rep === "w") {
    if (!(it.days || [agDate(it.d).getDay()]).includes(agDate(o).getDay())) return false;
    return Math.round(agDiff(agMonday(it.d), agMonday(o)) / 7) % k === 0;
  }
  if (it.rep === "m") {
    const months = (+o.slice(0, 4) - +it.d.slice(0, 4)) * 12 + (+o.slice(5, 7) - +it.d.slice(5, 7));
    if (months % k) return false;
    return it.nth ? agNthWeekday(o, it.nth) : o.slice(8) === it.d.slice(8);
  }
  return (+o.slice(0, 4) - +it.d.slice(0, 4)) % k === 0 && o.slice(5) === it.d.slice(5);
}
// Whether a day is the nth weekday of its month ("the 2nd Tuesday"; n -1: the last).
function agNthWeekday(iso, nth) {
  const d = agDate(iso);
  if (d.getDay() !== nth.wd) return false;
  if (nth.n > 0) return Math.ceil(d.getDate() / 7) === nth.n;
  return d.getDate() > new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - 7;
}
const AG_ORD = ["", "1st", "2nd", "3rd", "4th", "5th"];
// A repeat in words: "Weekly", "Every 2 weeks", "Mon, Wed and Fri", "2nd Tuesday monthly".
function agRepWords(it) {
  if (!it || !it.rep) return "Never";
  const k = it.every || 1, unit = {d: "day", w: "week", m: "month", y: "year"}[it.rep];
  let w = k > 1 ? `Every ${k} ${unit}s` : {d: "Daily", w: "Weekly", m: "Monthly", y: "Yearly"}[it.rep];
  const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  if (it.rep === "w" && it.days) w = agOr(it.days.map(n => DAY[n].slice(0, 3))).replace(/ or /, " and ") + (k > 1 ? `, every ${k} weeks` : "");
  if (it.rep === "m" && it.nth) w = `${it.nth.n === -1 ? "Last" : AG_ORD[it.nth.n]} ${DAY[it.nth.wd]} ${k > 1 ? `every ${k} months` : "monthly"}`;
  return w;
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
  const list = [[new Date(y, 0, 1), "New Year's Day"], [agNthMonday(y, 1, 3), "Louis Riel Day"], [good, "Good Friday"], [vic, "Victoria Day"],
    [new Date(y, 6, 1), "Canada Day"], [agNthMonday(y, 8, 1), "Labour Day"], [new Date(y, 8, 30), "Truth and Reconciliation Day"],
    [agNthMonday(y, 9, 2), "Thanksgiving"], [new Date(y, 10, 11), "Remembrance Day"], [new Date(y, 11, 25), "Christmas Day"]]
    .map(([d, name]) => ({d: fmtDate(d), name}));
  // One on a Saturday or Sunday is kept on the next free weekday (Christmas on a
  // Saturday: the Monday). Remembrance Day isn't moved.
  const taken = new Set(list.map(h => h.d).concat([`${y}-12-26`]));
  for (const h of list.filter(x => AG_IN_LIEU.includes(x.name))) {
    if (agDate(h.d).getDay() % 6) continue;
    const d = agNextWeekday(h.d, taken);
    taken.add(d); list.push({d, name: h.name + " (observed)"});
  }
  return list.sort((p, q) => p.d < q.d ? -1 : 1);
}
const AG_IN_LIEU = ["New Year's Day", "Canada Day", "Truth and Reconciliation Day", "Christmas Day"];
// The first weekday after a day that isn't already taken.
function agNextWeekday(iso, taken) {
  let d = iso;
  do d = agAddDays(d, 1); while (agDate(d).getDay() % 6 === 0 || taken.has(d));
  return d;
}
// Boxing Day on a weekend: the next free weekday after the holidays (Monday Dec 28, 2026).
function agBoxingObserved(y) {
  const box = `${y}-12-26`;
  if (agDate(box).getDay() % 6) return null;
  const list = agHolidayMemo[y] || (agHolidayMemo[y] = agHolidays(y));
  return agNextWeekday(box, new Set(list.map(h => h.d)));
}
const agHolidayMemo = {};
function agHoliday(iso) {
  const y = iso.slice(0, 4), list = agHolidayMemo[y] || (agHolidayMemo[y] = agHolidays(+y));
  const h = list.find(x => x.d === iso);
  return h ? h.name : null;
}
// Stats as the call schedule keeps them: the general holidays, then Boxing Day
// and Terry Fox Day (the first Monday in August), which the hospitals keep too.
function agStat(iso) {
  const d = agDate(iso);
  return agHoliday(iso) || (iso.slice(5) === "12-26" ? "Boxing Day" : iso === agBoxingObserved(+iso.slice(0, 4)) ? "Boxing Day (observed)" :
    d.getMonth() === 7 && d.getDay() === 1 && d.getDate() <= 7 ? "Terry Fox Day" : null);
}

// ---- Call requests ------------------------------------------------------------------------------
// A block's call requests (blocks run Thursday to Wednesday): no call on
// Thursday evenings, one weekend settled with the co-fellow, none that a
// Friday or Monday stat stretches to three days on, and days off.
const AG_OFF_MAX = 400;
// Days off: real days, each once, in order.
function agOffClean(raw) { return [...new Set(Array.isArray(raw) ? raw.filter(agValidIso) : [])].sort().slice(-AG_OFF_MAX); }
// Dates as a request reads them: "Dec 17", "Wed Nov 25", "Dec 18 to 21", "Dec 30 to Jan 2".
const agMD = iso => { const d = agDate(iso); return MONTHS[d.getMonth()] + " " + d.getDate(); };
const agSpanWords = (a, b) => agMD(a) + " to " + (a.slice(0, 7) === b.slice(0, 7) ? agDate(b).getDate() : agMD(b));
const agRunWords = ([a, b]) => a === b ? DAYS[agDate(a).getDay()] + " " + agMD(a) : agSpanWords(a, b);
// Days in a row as runs, each [first, last].
function agRuns(days) {
  const runs = [];
  for (const x of days) { const r = runs[runs.length - 1]; if (r && agAddDays(r[1], 1) === x) r[1] = x; else runs.push([x, x]); }
  return runs;
}
// "a", "a or b", "a, b or c".
const agOr = xs => xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " or " + xs[xs.length - 1];
const agBlockDays = num => [fmtDate(blockStart(num)), fmtDate(blockEnd(num))];

// Block num's request: its Thursdays; its four weekends, Friday evening to
// Monday morning, each with why it won't do (a stat on the Friday or Monday,
// a day off Friday to Sunday) or null; its runs of days off; the text to paste.
function agRequest(num) {
  const [start, end] = agBlockDays(num), mine = agState().off.filter(x => x >= start && x <= end);
  const days = Array.from({length: 28}, (_, k) => agAddDays(start, k));
  const weekends = days.filter((_, k) => k % 7 === 1).map(fri => {
    const mon = agAddDays(fri, 3), st = agStat(fri) ? [agStat(fri), "Friday"] : agStat(mon) ? [agStat(mon), "Monday"] : null;
    const name = st && st[0].replace(/^(Christmas|New Year's) Day$/, "$1"), offs = [0, 1, 2].filter(k => mine.includes(agAddDays(fri, k))).length;
    const why = st ? (name.endsWith(st[1]) ? name : name + " " + st[1]) + " · 3 days on" : offs > 1 ? "Days off" : offs ? "Day off" : null;
    return {fri, mon, why};
  });
  const thursdays = days.filter((_, k) => k % 7 === 0), runs = agRuns(mine), clear = weekends.filter(w => !w.why).map(w => agSpanWords(w.fri, w.mon));
  const text = `Block ${num} (${agMD(start)} to ${agMD(end)}) call requests:\n` +
    `- No call Thursday evenings: ${thursdays.map(agMD).join(", ")}.\n` +
    `- Weekend: ${clear.length ? agOr(clear) + ", confirming with my co-fellow" : "to settle with my co-fellow"}.\n` +
    (runs.length ? `- ${mine.length > 1 ? "Days" : "Day"} off: ${runs.map(agRunWords).join(", ")}.` : "- No days off this block.");
  return {num, name: BLOCK_NAMES[num], start, end, thursdays, weekends, runs, text};
}
// All-day events that don't repeat, as the days of block num they cover: [{id, t, days}].
function agAwayIn(num) {
  const [start, end] = agBlockDays(num), out = [];
  for (const it of agState().items) {
    if (it.s || it.rep) continue;
    const days = [];
    for (let x = it.d < start ? start : it.d; x <= (it.d2 || it.d) && x <= end; x = agAddDays(x, 1)) days.push(x);
    if (days.length) out.push({id: it.id, t: it.t, days});
  }
  return out;
}
// Days off go in one at a time, or a run from an event; a run inside the block comes out whole.
function agOffAdd(num, days) {
  const [start, end] = agBlockDays(num), a = agState(), keep = days.filter(x => agValidIso(x) && x >= start && x <= end);
  if (!keep.length) return;
  a.off = agOffClean(a.off.concat(keep)); Store.save();
}
function agOffDrop(num, day) {
  const [start, end] = agBlockDays(num), a = agState();
  const run = agRuns(a.off.filter(x => x >= start && x <= end)).find(([x, y]) => day >= x && day <= y);
  if (!run) return;
  a.off = a.off.filter(x => x < run[0] || x > run[1]); Store.save();
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
// A to-do answered: Done (now), Tomorrow (the day after today, or after its own
// day when that's later; it asks once more, then sits quietly) or Drop it.
function agTodoAnswer(id, how, now) {
  const a = agState(), it = a.items.find(x => x.id === id && x.todo);
  if (!it || !["done", "tomorrow", "drop"].includes(how)) return false;
  if (how === "done") it.todo.done = new Date(now).toISOString();
  else if (how === "tomorrow") {
    const today = fmtDate(new Date(now));
    it.d = agAddDays(it.d > today ? it.d : today, 1);
    it.todo.tom = Math.min(2, it.todo.tom + 1);
  } else a.items = a.items.filter(x => x !== it);
  Store.save();
  return true;
}
// Today's to-dos whose time has come and that aren't done, soonest first: Week asks them.
function agTodosDue(now) {
  const today = fmtDate(new Date(now)), hm = agHM(now);
  return agState().items.filter(it => it.todo && !it.todo.done && it.d === today && it.s <= hm).sort((p, q) => p.s < q.s ? -1 : p.s > q.s ? 1 : 0);
}
// A note in your words; with an id already there, no second note. Returns its id, or null with no words.
function agAddNote(t, id) {
  const a = agState(), words = typeof t === "string" ? t.trim().slice(0, AG_NOTE_T) : "";
  if (typeof id === "string" && a.notes.some(x => x.id === id)) return id;
  if (!words) return null;
  const nid = typeof id === "string" && AG_NOTE_ID.test(id) ? id : agNoteNewId(new Set(a.notes.map(x => x.id)));
  a.notes.push({id: nid, t: words, ts: new Date().toISOString()});
  if (a.notes.length > AG_NOTES_MAX) a.notes.splice(0, a.notes.length - AG_NOTES_MAX);
  Store.save();
  return nid;
}
function agRemoveNote(id) {
  const a = agState(), n = a.notes.length;
  a.notes = a.notes.filter(x => x.id !== id);
  if (a.notes.length === n) return false;
  Store.save();
  return true;
}
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
// Your own events and to-dos on the day (a to-do's row says whether it's done).
function agEventRows(iso) {
  const out = [];
  for (const it of agState().items) {
    const sp = agSpan(it, iso);
    if (!sp) continue;
    const r = {k: it.todo ? "todo" : sp.allDay ? "all" : "ev", t: it.t, sub: it.n, id: it.id, from: sp.from, to: sp.to === "24:00" ? null : sp.to,
      cont: sp.cont, more: sp.more, allDay: sp.allDay};
    // A repeating event's row knows its day, so its sheet can skip just that one.
    if (it.rep && !sp.cont) r.on = iso;
    if (it.todo) r.done = !!it.todo.done;
    out.push(r);
  }
  return out;
}
const AG_KIND_ORDER = {hol: 0, all: 1, work: 2, call: 3, ev: 4, todo: 4, read: 5};
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
    ev: rows.filter(r => r.k === "ev" || r.k === "all" || (r.k === "todo" && !r.done)).length};
}
// Your next event or to-do (not one that's done) in the coming week, or null: for Week's Next line.
function agNext(now) {
  const today = fmtDate(new Date(now)), hm = agHM(now);
  for (let k = 0; k <= 7; k++) {
    const iso = agAddDays(today, k);
    const list = agEventRows(iso).filter(r => !r.cont && !r.done && (k > 0 || !r.from || r.from >= hm)).sort((p, q) => (p.from || "") < (q.from || "") ? -1 : 1);
    if (list.length) return {iso, from: list[0].from, t: list[0].t, id: list[0].id};
  }
  return null;
}

// ---- Add from file (.ics) -----------------------------------------------------------------------
// A wall time in a named zone (America/New_York) as epoch ms, or null for a
// zone this phone doesn't know (Outlook's "Central Standard Time").
function agZonedMs(y, mo, d, h, mi, tz) {
  let fmt;
  try { fmt = new Intl.DateTimeFormat("en-US", {timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric"}); }
  catch (e) { return null; }
  const want = Date.UTC(y, mo - 1, d, h, mi);
  let t = want;
  for (let i = 0; i < 3; i++) {
    const p = {};
    for (const x of fmt.formatToParts(new Date(t))) p[x.type] = +x.value;
    t += want - Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute);
  }
  return t;
}
// DTSTART or DTEND as this phone's day and time (hm null for a whole day).
// UTC and known zones convert; a floating time or an unknown zone is read as written.
function agIcsWhen(p) {
  const m = p && /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/i.exec(p.value.trim());
  if (!m) return null;
  const day = `${m[1]}-${m[2]}-${m[3]}`;
  if (m[4] === undefined) return agValidIso(day) ? {d: day, hm: null} : null;
  const [y, mo, d, h, mi] = m.slice(1, 6).map(Number);
  const t = m[7] ? Date.UTC(y, mo - 1, d, h, mi) : p.params.TZID ? agZonedMs(y, mo, d, h, mi, p.params.TZID) : null;
  return t === null ? {d: day, hm: `${m[4]}:${m[5]}`} : {d: fmtDate(new Date(t)), hm: agHM(t)};
}
const AG_FREQ = {DAILY: "d", WEEKLY: "w", MONTHLY: "m", YEARLY: "y"};
// An RRULE as GI Hub keeps a repeat ({rep, every, until, days, nth}), null for
// none, or {odd: true} for one it can't follow (hourly, a list of month days,
// "the last weekday"). COUNT becomes the day of the last time. d: its first day.
function agRrule(rule, d) {
  if (!rule) return null;
  const p = {};
  for (const part of rule.split(";")) { const i = part.indexOf("="); if (i > 0) p[part.slice(0, i).trim().toUpperCase()] = part.slice(i + 1).trim().toUpperCase(); }
  const rep = AG_FREQ[p.FREQ], every = p.INTERVAL ? +p.INTERVAL : 1;
  if (!rep || Object.keys(p).some(k => !["FREQ", "INTERVAL", "UNTIL", "COUNT", "BYDAY", "WKST", "BYMONTHDAY", "BYMONTH"].includes(k)) ||
      !Number.isInteger(every) || every < 1 || every > 99) return {odd: true};
  const out = {rep};
  if (p.BYDAY) {
    const parts = p.BYDAY.split(",").map(s => /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(s.trim()));
    if (parts.some(m => !m)) return {odd: true};
    if (rep === "m") {
      const n = parts.length === 1 && parts[0][1] ? +parts[0][1] : 0;
      if (!(n === -1 || (n >= 1 && n <= 5))) return {odd: true};
      out.nth = {n, wd: AG_WD[parts[0][2]]};
    } else if ((rep === "w" || (rep === "d" && every === 1)) && !parts.some(m => m[1])) {
      // Daily on weekdays is weekly on those days.
      out.rep = "w"; out.days = [...new Set(parts.map(m => AG_WD[m[2]]))].sort();
    } else return {odd: true};
  }
  if (p.BYMONTHDAY && !(rep === "m" && !out.nth && +p.BYMONTHDAY === +d.slice(8))) return {odd: true};
  if (p.BYMONTH && !(rep === "y" && +p.BYMONTH === +d.slice(5, 7))) return {odd: true};
  if (every > 1) out.every = every;
  if (p.UNTIL) { const u = agIcsWhen({value: p.UNTIL, params: {}}); if (!u) return {odd: true}; out.until = u.d; }
  if (p.COUNT) {
    const n = +p.COUNT;
    if (!Number.isInteger(n) || n < 1) return {odd: true};
    for (let k = 0, seen = 0; k < 4000; k++) {
      const day = agAddDays(d, k);
      if (out.until && day > out.until) break;
      if (agStartsOn({d, ...out}, day) && ++seen === n) { out.until = day; break; }
    }
  }
  return out;
}
// A calendar file's events, or a call file (handed to Call), or why not.
// moved: one time of a repeating event changed or cancelled on its own
// (RECURRENCE-ID), which the series then leaves out. odd: titles of repeats
// GI Hub can't follow, kept to their first day.
function agParseICS(text) {
  const cal = parseICS(text);
  if (!cal.calendar) return {ok: false, error: "That file isn't a calendar. Pick an .ics file."};
  if (cal.events.some(ev => Object.keys(ev).some(k => k.startsWith("X-GI-CALL-")))) return {ok: true, call: true, items: [], cancelled: [], moved: [], odd: []};
  const items = [], cancelled = [], moved = [], odd = [];
  for (const ev of cal.events) {
    const txt = k => ev[k] ? icsUnescape(ev[k].value).replace(/\s+/g, " ").trim() : "";
    const uid = txt("UID") || null, rid = ev["RECURRENCE-ID"] ? agIcsWhen(ev["RECURRENCE-ID"]) : null;
    if (rid && uid) moved.push({uid, d: rid.d});
    if (/^cancel/i.test(txt("STATUS"))) { if (uid && !rid) cancelled.push(uid); continue; }
    const a = agIcsWhen(ev.DTSTART);
    if (!a) continue;
    let z = ev.DTEND ? agIcsWhen(ev.DTEND) : null;
    if (!z && ev.DURATION) {
      const t = icsEnd(agDate(a.d).getTime() + (a.hm ? agMin(a.hm) * 60000 : 0), ev.DURATION.value);
      if (t !== null) z = {d: fmtDate(new Date(t)), hm: a.hm ? agHM(t) : null};
    }
    // A whole-day event's DTEND is the day after its last day.
    let d2 = null, e = null;
    if (!a.hm) { const last = z && !z.hm ? agAddDays(z.d, -1) : a.d; d2 = last > a.d ? last : null; }
    else if (z && z.hm) { e = z.hm; d2 = z.d > a.d ? z.d : null; }
    const t = txt("SUMMARY") || "Event";
    let rr = rid ? null : agRrule(ev.RRULE ? String(ev.RRULE.value).trim() : "", a.d);
    if (rr && rr.odd) { odd.push(t); rr = null; }
    const skip = [];
    for (const x of ev.EXDATES || []) for (const v of String(x.value).split(",")) { const w = agIcsWhen({value: v, params: x.params}); if (w) skip.push(w.d); }
    items.push({t, d: a.d, d2, s: a.hm, e, rep: rr ? rr.rep : null, ...(rr || {}), ...(skip.length ? {skip} : {}),
      n: [txt("LOCATION"), txt("DESCRIPTION")].filter(Boolean).join(" · "), uid: rid && uid ? uid + "@" + rid.d : uid});
  }
  if (!items.length && !cancelled.length && !moved.length) return {ok: false, error: "No events in that file."};
  return {ok: true, call: false, items, cancelled, moved, odd};
}
// Adds a file's events, matched by UID so a second import updates them; a
// cancelled one goes. before: the agenda as it was, for Undo.
function agImport(text, name) {
  const p = agParseICS(text);
  if (!p.ok) return p;
  if (p.call) { const r = callImport(text, name); return {ok: r.ok, call: true, error: r.error}; }
  const before = agSnapshot(), a = agState(), taken = new Set(a.items.map(x => x.id)), ts = new Date().toISOString();
  let added = 0, changed = 0, removed = 0;
  for (const x of p.items) {
    const i = x.uid ? a.items.findIndex(it => it.uid === x.uid) : -1;
    if (i >= 0) {
      // The file's repeat replaces the old one; days left out (by the file or by hand) stay left out.
      const old = a.items[i], skip = [...(old.skip || []), ...(x.skip || [])];
      const it = agItemClean({...old, every: undefined, until: undefined, days: undefined, nth: undefined, ...x, skip, id: old.id});
      if (it && JSON.stringify(it) !== JSON.stringify(a.items[i])) { a.items[i] = it; changed++; }
    } else {
      const it = agItemClean({...x, id: agNewId(taken), ts});
      if (it) { taken.add(it.id); a.items.push(it); added++; }
    }
  }
  for (const uid of p.cancelled) { const n = a.items.length; a.items = a.items.filter(it => it.uid !== uid); removed += n - a.items.length; }
  // A time moved or cancelled on its own: the series leaves that day out.
  for (const m of p.moved) {
    const i = a.items.findIndex(it => it.uid === m.uid && it.rep);
    if (i < 0 || (a.items[i].skip || []).includes(m.d)) continue;
    const it = agItemClean({...a.items[i], skip: [...(a.items[i].skip || []), m.d]});
    if (it) { a.items[i] = it; changed++; }
  }
  Store.save();
  return {ok: true, call: false, added, changed, removed, before, ...(p.odd.length ? {odd: p.odd} : {})};
}
