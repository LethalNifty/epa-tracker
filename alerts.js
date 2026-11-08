"use strict";
// GI Hub's reminders, sent by the reminder sender (tools/agenda/worker.mjs):
// every reminder this phone wants over the next five weeks, as kinds and times
// only. The words stay on the phone, in the brief remind.js saves, so no
// titles, names or notes leave it. Loaded after remind.js; reads agenda.js,
// call.js and study.js when it runs. Full app only.

const ALERT_DAYS = 35;                // how far ahead the sender is told: five weeks
const ALERT_EVE = 19;                 // 19:00 the evening before an event
const ALERT_SOON = 30 * 60000;        // and 30 minutes before it starts

const alertDay = (d0, k, h = 0) => new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + k, h);
const alertMidnight = now => { const d = new Date(now); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };

// Each time an event starts in the plan's days (and the day after, whose
// evening reminder falls inside them) with an alert on: its id with the day,
// the day, the start ("HH:MM", null all day), title, note, and which alerts.
// The service worker writes an event's notification from this.
function alertOccurrences(now) {
  const d0 = alertMidnight(now), out = [];
  for (let k = 0; k <= ALERT_DAYS; k++) {
    const iso = fmtDate(alertDay(d0, k));
    for (const it of agState().items) {
      if (!agStartsOn(it, iso)) continue;
      const al = agAlerts(it);
      if (al.length) out.push({id: it.id + "@" + iso, d: iso, s: it.s, t: it.t, n: it.n, eve: al.includes("eve"), soon: al.includes("30")});
    }
  }
  return out;
}

// Every reminder from local midnight today for ALERT_DAYS days, soonest
// first: Monday and Wednesday at 08:00, Sunday at 17:00, 20:00 on reading
// nights to the plan's last day, an hour before each call, and each event's.
// The same all day, so redrawing the app never sends it again.
function alertPlan(now) {
  const d0 = alertMidnight(now), from = d0.getTime(), to = alertDay(d0, ALERT_DAYS).getTime(), out = [];
  const str = callStretches(CallStore.list());
  for (let k = 0; k < ALERT_DAYS; k++) {
    const day = alertDay(d0, k), wd = day.getDay();
    if (wd === 1) out.push({t: alertDay(d0, k, 8).getTime(), kind: "week"});
    if (wd === 3) out.push({t: alertDay(d0, k, 8).getTime(), kind: "ask"});
    if (wd === 0) out.push({t: alertDay(d0, k, 17).getTime(), kind: "pearls"});
    if (fmtDate(day) <= fmtDate(STUDY_END) && studyNightKind(day, str, []) === "read") out.push({t: studyEveningMs(day), kind: "study"});
  }
  for (const st of str) out.push({t: st.s - HOUR_MS, kind: "call", s: st.s});
  const eves = new Set();
  for (const o of alertOccurrences(now)) {
    const day = agDate(o.d);
    if (o.soon) {
      const s = new Date(day.getFullYear(), day.getMonth(), day.getDate(), +o.s.slice(0, 2), +o.s.slice(3)).getTime();
      out.push({t: s - ALERT_SOON, kind: "ev", s, id: o.id});
    }
    // One evening reminder for a day, however many events it has.
    if (o.eve && !eves.has(o.d)) { eves.add(o.d); out.push({t: alertDay(day, -1, ALERT_EVE).getTime(), kind: "eve", d: o.d}); }
  }
  return out.filter(a => a.t >= from && a.t < to).sort((a, b) => a.t - b.t);
}
