"use strict";
// Which reminders fall due in a window of time. Pure: wall times are read in
// the process's time zone, which send.js sets to America/Winnipeg.
const HOUR = 3600000;
const WEEKLY = {day: 4, hour: 8};     // Thursday 08:00, the first day of each block week
const CALL_LEAD = HOUR;               // an hour before each call starts

// "2026-10-07T17:00" (Winnipeg wall time) to epoch ms.
function wallMs(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(s));
  if (!m) return null;
  return new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]).getTime();
}
function wallString(t) {
  const d = new Date(t), p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
// The CALL_TIMES secret: {"v":1,"starts":["2026-10-07T17:00", ...]}, one per
// stretch (a weekend is one). Times only; never names.
function parseCallTimes(json) {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return (Array.isArray(v.starts) ? v.starts : []).map(wallMs).filter(t => t !== null).sort((a, b) => a - b);
  } catch (e) { return []; }
}
// Reminders with lo < t <= hi, oldest first. Each says only what kind it is
// and when; the phone writes the words.
function dueReminders(lo, hi, callStarts) {
  const out = [];
  const d = new Date(lo);
  for (let day = new Date(d.getFullYear(), d.getMonth(), d.getDate()); day.getTime() <= hi; day.setDate(day.getDate() + 1)) {
    if (day.getDay() !== WEEKLY.day) continue;
    const t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), WEEKLY.hour).getTime();
    if (t > lo && t <= hi) out.push({kind: "week", t});
  }
  for (const s of callStarts) {
    const t = s - CALL_LEAD;
    if (t > lo && t <= hi) out.push({kind: "call", t, s});
  }
  return out.sort((a, b) => a.t - b.t);
}
// The window a run covers: from the last run that actually ran to this one's
// start, so a late run neither misses nor repeats a reminder. Capped at three
// hours, so a schedule that was paused doesn't fire a backlog.
function windowFor(prevStart, thisStart) {
  const hi = thisStart, cap = hi - 3 * HOUR;
  const lo = prevStart && prevStart < hi ? Math.max(prevStart, cap) : hi - 20 * 60000;
  return {lo, hi};
}

module.exports = {HOUR, WEEKLY, CALL_LEAD, wallMs, wallString, parseCallTimes, dueReminders, windowFor};
