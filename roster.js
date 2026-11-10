"use strict";
// GI Hub's call roster: the whole block as Claude read it from the shared call
// sheets. Both sites' day and night teams every day, each note and whose it
// is, the footers' full names and rules, the sheets' pictures and the swaps
// since. Your shifts come from it into Call: every night you're the night
// fellow at either site, and Saturdays, Sundays and stats you're a day fellow.
// It stays on this phone, under its own key (the pictures in IndexedDB), never
// in the EPA backup, the code or the repository. Owner only: the fellows'
// edition has no roster, and the shared files check it's there before calling in.
// Loaded after tell.js. Uses call.js, agenda.js and app.js helpers when it
// runs, never while this file loads.

const ROSTER_KEY = "gi-roster-v1";
const ROSTER_SITES = ["hsc", "stb"], ROSTER_SLOTS = ["day", "night"];
const ROSTER_SITE = {hsc: "HSC", stb: "St. Boniface"}, ROSTER_SHORT = {hsc: "HSC", stb: "St B"};
// Each slot's roles, in the order a change lists them.
const ROSTER_ROLES = {day: ["fellows", "res", "att", "tpn"], night: ["fellow", "res", "att"]};
// What Undo can put back (the last 3 changes), and how long a block is kept after its last day.
const ROSTER_UNDO = 3, ROSTER_KEEP = 28, ROSTER_DAYS_MAX = 62;
const ROSTER_DATA = ["days", "notes", "people", "rules", "sheets", "swaps"];

// ---- Saved on this phone ----------------------------------------------------------------
// me: which fellow is you, as the sheets write it. days: {date: {hsc, stb}},
// each site {day: {fellows, res, att, tpn?}, night: {fellow, res, att}}.
// sheets: each sheet's site, dates, picture and when it came. swaps: each
// slot a swap moved, without names. pend: results waiting for a check.
// undo: what each change replaced.
const rosterBlank = () => ({v: 1, me: "", days: {}, notes: [], people: [], rules: [], sheets: [], swaps: [], pend: {}, undo: {}});
const RosterStore = {
  state: rosterBlank(),
  load() {
    try {
      const s = JSON.parse(localStorage.getItem(ROSTER_KEY));
      if (s && s.v === 1 && s.days && typeof s.days === "object") this.state = {...rosterBlank(), ...s};
    } catch (e) {}
  },
  save() { try { localStorage.setItem(ROSTER_KEY, JSON.stringify(this.state)); } catch (e) {} },
  snapshot() { return JSON.parse(JSON.stringify(this.state)); },
  // Clearing removes the key itself; the pictures go with the next tidy.
  clear() { this.state = rosterBlank(); try { localStorage.removeItem(ROSTER_KEY); } catch (e) {} },
  restore(s) { this.state = {...rosterBlank(), ...s}; this.save(); },
};

// The sheets' pictures, megabytes each: IndexedDB as ArrayBuffers, or a Map
// where there's no IndexedDB (the tests). Every call answers a promise.
const rosterPics = (() => {
  const mem = new Map(), idb = () => typeof indexedDB !== "undefined" && indexedDB ? indexedDB : null;
  let open = null;
  const db = () => open || (open = new Promise((ok, no) => {
    const rq = idb().open("gi-roster-pics", 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore("pics");
    rq.onsuccess = () => ok(rq.result);
    rq.onerror = () => { open = null; no(rq.error); };
  }));
  const run = (mode, fn) => db().then(d => new Promise((ok, no) => {
    const t = d.transaction("pics", mode), rq = fn(t.objectStore("pics"));
    t.oncomplete = () => ok(rq.result);
    t.onerror = t.onabort = () => no(t.error);
  }));
  return {
    put(id, v) {
      const x = {type: String((v && v.type) || ""), bytes: v && v.bytes};
      return idb() ? run("readwrite", s => s.put(x, id)).then(() => {}) : Promise.resolve(void mem.set(id, x));
    },
    get(id) { return idb() ? run("readonly", s => s.get(id)).then(v => v || null) : Promise.resolve(mem.get(id) || null); },
    del(id) { return idb() ? run("readwrite", s => s.delete(id)).then(() => {}) : Promise.resolve(void mem.delete(id)); },
    keys() { return idb() ? run("readonly", s => s.getAllKeys()).then(k => (k || []).map(String)) : Promise.resolve([...mem.keys()]); },
  };
})();

// ---- Small helpers ------------------------------------------------------------------------
const rosterSame = (a, b) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const rosterAt = (iso, h) => { const d = agDate(iso); d.setHours(h); return d.getTime(); };
const rosterDay = iso => callDay(agDate(iso).getTime());   // "Fri 20 Nov"
const rosterWeekend = iso => { const g = agDate(iso).getDay(); return g === 0 || g === 6 || !!agStat(iso); };
const rosterWords = v => Array.isArray(v) ? v.join(", ") : v || "";
const rosterCopy = v => JSON.parse(JSON.stringify(v));
function rosterDates(from, to) { const out = []; for (let d = from; d <= to && out.length < 400; d = agAddDays(d, 1)) out.push(d); return out; }
// Whether you have that slot: a night at either site; a day only on a weekend or stat.
function rosterMine(x, d, slot, me) {
  if (!x || !me) return false;
  if (slot === "night") return ROSTER_SITES.some(k => x[k] && rosterSame(x[k].night.fellow, me));
  return rosterWeekend(d) && ROSTER_SITES.some(k => x[k] && x[k].day.fellows.some(n => rosterSame(n, me)));
}
// Whether you're anywhere on that day: a fellow by day or night, or TPN consults.
const rosterOn = (x, me) => ROSTER_SITES.some(k => x && x[k] && [...x[k].day.fellows, ...(x[k].day.tpn || []), x[k].night.fellow].some(n => rosterSame(n, me)));

// ---- The phone's own check --------------------------------------------------------------
// The same shape and caps the sender keeps (tools/agenda/tell.mjs): the phone
// never trusts what comes over the network.
const ROSTER_ID = /^i[a-z0-9]{10}$/;
const rosterStr = (v, max) => typeof v === "string" ? v.trim().slice(0, max) : "";
const rosterRec = v => v && typeof v === "object" ? v : {};
const rosterList = v => Array.isArray(v) ? v : [];
const rosterName = v => rosterStr(v, 40);
const rosterNames = v => (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).map(rosterName).filter(Boolean).slice(0, 4);
function rosterSiteDay(x) {
  const dy = rosterRec(x.day), nt = rosterRec(x.night), tpn = rosterNames(dy.tpn);
  const day = {fellows: rosterNames(dy.fellows), res: rosterNames(dy.res), att: rosterName(dy.att)};
  if (tpn.length) day.tpn = tpn;
  return {day, night: {fellow: rosterName(nt.fellow), res: rosterNames(nt.res), att: rosterName(nt.att)}};
}
function rosterClean(raw, now = callNow()) {
  if (!raw || typeof raw !== "object") return null;
  const said = typeof raw.said === "string" && agValidIso(raw.said.slice(0, 10)) ? raw.said.slice(0, 10) : fmtDate(new Date(now));
  const near = v => agValidIso(v) && v >= agAddDays(said, -60) && v <= agAddDays(said, 400);
  if (raw.kind === "callswap") {
    const slots = [];
    for (const x of rosterList(raw.slots).map(rosterRec)) {
      const site = x.site == null ? "both" : x.site, from = rosterName(x.from), to = rosterName(x.to);
      if (!near(x.d) || !["both", ...ROSTER_SITES].includes(site) || !["night", "day"].includes(x.slot) || !from || !to ||
        from.toLowerCase() === to.toLowerCase()) return null;
      slots.push({d: x.d, site, slot: x.slot, from, to});
    }
    return slots.length && slots.length <= 8 ? {kind: "callswap", slots} : null;
  }
  if (raw.kind !== "call") return null;
  const sheets = rosterList(raw.sheets).map(rosterRec).filter(x => ROSTER_SITES.includes(x.site) && near(x.from) && near(x.to) &&
    x.from <= x.to && agDiff(x.from, x.to) < ROSTER_DAYS_MAX).slice(0, 6)
    .map(x => ({site: x.site, from: x.from, to: x.to, ...(typeof x.file === "string" && ROSTER_ID.test(x.file) ? {file: x.file} : {})}));
  const covers = (site, d) => sheets.some(x => x.site === site && x.from <= d && d <= x.to);
  const days = [];
  for (const x of rosterList(raw.days).map(rosterRec)) {
    if (!near(x.d) || days.some(y => y.d === x.d)) continue;
    const e = {d: x.d};
    for (const site of ROSTER_SITES) if (x[site] && typeof x[site] === "object" && covers(site, x.d)) e[site] = rosterSiteDay(x[site]);
    if (e.hsc || e.stb) days.push(e);
  }
  days.sort((a, b) => a.d < b.d ? -1 : 1).splice(ROSTER_DAYS_MAX);
  if (!sheets.length || !days.length) return null;
  const notes = rosterList(raw.notes).map(rosterRec).filter(x => ROSTER_SITES.includes(x.site) && near(x.d) && covers(x.site, x.d) &&
    rosterName(x.who) && rosterStr(x.t, 120)).slice(0, 100).map(x => ({d: x.d, site: x.site, who: rosterName(x.who), t: rosterStr(x.t, 120)}));
  const people = [];
  for (const x of rosterList(raw.people).map(rosterRec)) {
    const n = rosterName(x.n), full = rosterStr(x.full, 80);
    if (n && full && people.length < 80 && !people.some(y => y.n === n)) people.push({n, full});
  }
  const rules = rosterList(raw.rules).map(rosterRec).filter(x => ROSTER_SITES.includes(x.site) && rosterStr(x.t, 300)).slice(0, 6)
    .map(x => ({site: x.site, t: rosterStr(x.t, 300)}));
  const look = rosterList(raw.look).map(x => rosterStr(x, 200)).filter(Boolean).slice(0, 20);
  return {kind: "call", sheets, days, notes, people, rules, look};
}

// ---- Your shifts ------------------------------------------------------------------------------
// A note saying no call through the 17:00 sign-out: no times, or a range ending at 1700 or later.
function rosterNoCall(notes, d, site, who) {
  return notes.some(x => x.d === d && x.site === site && rosterSame(x.who, who) && /no call/i.test(x.t) && (() => {
    const m = /(\d{1,2}):?(\d{2})\s*(?:-|to)\s*(\d{1,2}):?(\d{2})/i.exec(x.t);
    return !m || +m[3] * 100 + +m[4] >= 1700;
  })());
}
const rosterPart = (t, slot) => t ? {att: t[slot].att, res: t[slot].res.join(", ")} : {att: "", res: ""};
// Your shifts in from..to, in CallStore's shape. A night is 17:00 to 08:00 with
// both sites' night teams; a site whose day attending isn't the night one also
// keeps the day one. Its sign-out is the day fellows at each site, without you
// and without anyone with no call through 17:00.
function rosterShifts(days, me, from, to, notes = RosterStore.state.notes) {
  const out = [];
  if (!me) return out;
  for (const d of rosterDates(from, to)) {
    const x = days[d];
    if (!x) continue;
    if (rosterMine(x, d, "day", me)) {
      out.push({uid: `gi-roster-${d}-d`, s: rosterAt(d, 8), e: rosterAt(d, 17), hsc: rosterPart(x.hsc, "day"), stb: rosterPart(x.stb, "day"), so: ""});
    }
    if (rosterMine(x, d, "night", me)) {
      const night = {uid: `gi-roster-${d}-n`, s: rosterAt(d, 17), e: rosterAt(agAddDays(d, 1), 8)};
      for (const k of ROSTER_SITES) {
        night[k] = rosterPart(x[k], "night");
        if (x[k] && x[k].day.att && x[k].night.att && !rosterSame(x[k].day.att, x[k].night.att)) night[k].day = x[k].day.att;
      }
      night.so = ROSTER_SITES.flatMap(k => x[k] ? x[k].day.fellows.filter(n => !rosterSame(n, me) && !rosterNoCall(notes, d, k, n))
        .map(n => `${n} (${ROSTER_SHORT[k]})`) : []).join(" + ");
      out.push(night);
    }
  }
  return out;
}
// Call's shifts from the roster, over from..to: every shift starting from 08:00
// on the first day to 08:00 the day after the last goes (an .ics one too), and
// yours from the roster come in. Before you've said which fellow is you, Call
// is left as it is. Returns how many are yours.
function rosterApplyShifts(lo, hi) {
  const st = RosterStore.state;
  if (!st.me) return 0;
  const a = rosterAt(lo, 8), b = rosterAt(agAddDays(hi, 1), 8), shifts = CallStore.state.shifts;
  for (const uid of Object.keys(shifts)) if (shifts[uid].s >= a && shifts[uid].s < b) delete shifts[uid];
  const mine = rosterShifts(st.days, st.me, lo, hi);
  for (const x of mine) shifts[x.uid] = x;
  return mine.length;
}

// ---- Changes ------------------------------------------------------------------------------------
// A sheet's days replace that site's days in its dates.
function rosterPutSheet(days, sh, from) {
  for (const d of Object.keys(days)) if (d >= sh.from && d <= sh.to && days[d][sh.site]) {
    delete days[d][sh.site];
    if (!days[d].hsc && !days[d].stb) delete days[d];
  }
  for (const x of from) if (x.d >= sh.from && x.d <= sh.to && x[sh.site]) (days[x.d] = days[x.d] || {})[sh.site] = rosterCopy(x[sh.site]);
}
// A swap's slots on these days ("me" is you): only where the person it names
// has the slot. Returns the slots that moved.
function rosterPutSwap(days, slots, me) {
  const who = n => n === "me" ? me : n, moved = [];
  for (const x of slots) {
    const day = days[x.d], from = who(x.from), to = who(x.to);
    if (!day || !from || !to) continue;
    let did = false;
    for (const k of x.site === "both" ? ROSTER_SITES : [x.site]) {
      const t = day[k];
      if (!t) continue;
      if (x.slot === "night" && rosterSame(t.night.fellow, from)) { t.night.fellow = to; did = true; }
      if (x.slot === "day") t.day.fellows = t.day.fellows.map(n => rosterSame(n, from) ? (did = true, to) : n);
    }
    if (did) moved.push(x);
  }
  return moved;
}
// The days after a call result or a swap, on a copy.
function rosterNextDays(r) {
  const out = rosterCopy(RosterStore.state.days);
  if (r.kind === "call") for (const sh of r.sheets) rosterPutSheet(out, sh, r.days);
  else rosterPutSwap(out, r.slots, RosterStore.state.me);
  return out;
}
// The dates a result covers, each with the sites it speaks for.
function rosterSpan(r) {
  const m = new Map();
  const mark = (d, sites) => m.set(d, [...new Set([...(m.get(d) || []), ...sites])]);
  if (r.kind === "call") for (const sh of r.sheets) for (const d of rosterDates(sh.from, sh.to)) mark(d, [sh.site]);
  else for (const x of r.slots) mark(x.d, x.site === "both" ? ROSTER_SITES : [x.site]);
  return [...m.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([d, sites]) => ({d, sites: ROSTER_SITES.filter(k => sites.includes(k))}));
}
function rosterSnap() {
  const st = RosterStore.state;
  return {roster: rosterCopy(Object.fromEntries(ROSTER_DATA.map(k => [k, st[k]]))), call: CallStore.snapshot()};
}
function rosterKeepUndo(id, snap) {
  const u = RosterStore.state.undo;
  delete u[id];
  u[id] = snap;
  const ks = Object.keys(u);
  for (const k of ks.slice(0, Math.max(0, ks.length - ROSTER_UNDO))) delete u[k];
}
// A call result in: each sheet replaces its site's days, notes and rules in
// its dates, and the site's sheets there. A sheet with no picture (a file made
// in chat) keeps the picture of the sheet it replaces. Then your shifts.
function rosterAddCall(id, r, now) {
  const st = RosterStore.state, before = rosterSnap();
  for (const sh of r.sheets) {
    rosterPutSheet(st.days, sh, r.days);
    const inside = x => x.site === sh.site && x.d >= sh.from && x.d <= sh.to;
    st.notes = st.notes.filter(x => !inside(x)).concat(r.notes.filter(inside).map(x => ({...x})));
    const old = st.sheets.filter(x => x.site === sh.site && x.from <= sh.to && sh.from <= x.to);
    const pic = sh.file || (old.find(x => x.pic) || {}).pic || "";
    st.sheets = st.sheets.filter(x => !old.includes(x)).concat({site: sh.site, from: sh.from, to: sh.to, pic, at: now});
  }
  for (const site of new Set(r.sheets.map(x => x.site))) st.rules = st.rules.filter(x => x.site !== site).concat(r.rules.filter(x => x.site === site).map(x => ({...x})));
  for (const p of r.people) { const i = st.people.findIndex(x => x.n === p.n); if (i >= 0) st.people[i] = {...p}; else st.people.push({...p}); }
  st.sheets.sort((a, b) => a.from < b.from ? -1 : a.from > b.from ? 1 : ROSTER_SITES.indexOf(a.site) - ROSTER_SITES.indexOf(b.site));
  const lo = r.sheets.map(x => x.from).sort()[0], hi = r.sheets.map(x => x.to).sort().pop();
  const n = rosterApplyShifts(lo, hi);
  if (st.me) CallStore.state.last = {at: new Date(now).toISOString(), file: "Shared sheets", n};
  rosterKeepUndo(id, before);
  RosterStore.save(); CallStore.save();
  return {n};
}
// A swap in: each slot moves to its new person, and your shifts on those days
// follow. Returns how many slots moved.
function rosterSwap(id, r, now) {
  const st = RosterStore.state, before = rosterSnap(), moved = rosterPutSwap(st.days, r.slots, st.me);
  for (const x of moved) st.swaps.push({d: x.d, site: x.site, slot: x.slot, at: now});
  for (const d of new Set(moved.map(x => x.d))) rosterApplyShifts(d, d);
  rosterKeepUndo(id, before);
  RosterStore.save(); CallStore.save();
  return {n: moved.length};
}
// Puts the roster and Call back as they were before that change.
function rosterUndo(id) {
  const st = RosterStore.state, u = st.undo[id];
  if (!u) return false;
  Object.assign(st, rosterCopy(u.roster));
  delete st.undo[id];
  CallStore.restore(rosterCopy(u.call));
  RosterStore.save();
  return true;
}

// ---- What changed, and what's worth a look -----------------------------------------------
// Against the stored days: your slots now yours and no longer yours, and every
// other change, role by role.
function rosterDiff(r) {
  const st = RosterStore.state, me = st.me, next = rosterNextDays(r), out = {now: [], gone: [], other: []};
  for (const {d, sites} of rosterSpan(r)) {
    const a = st.days[d], b = next[d], told = new Set();
    for (const slot of ROSTER_SLOTS) {
      const was = rosterMine(a, d, slot, me), is = rosterMine(b, d, slot, me);
      if (is && !was) out.now.push({d, slot});
      if (was && !is) out.gone.push({d, slot});
      if (is !== was) told.add(slot);
    }
    for (const site of sites) {
      if (!a || !b || !a[site] || !b[site]) continue;
      for (const slot of ROSTER_SLOTS) for (const role of ROSTER_ROLES[slot]) {
        const was = rosterWords(a[site][slot][role]), now = rosterWords(b[site][slot][role]);
        if (was.toLowerCase() === now.toLowerCase() || (role.startsWith("fellow") && told.has(slot))) continue;
        out.other.push({d, site, slot, role, was, now});
      }
    }
  }
  return out;
}
// Lines worth a look before the change goes in: a night fellow that differs
// between the sites or is blank at one; on your shifts, a Thursday night, a
// day off and an attending who changes at 17:00; for a swap, a person the
// roster doesn't have there, or a day with no roster; and Claude's own lines.
function rosterLook(r, now) {
  const st = RosterStore.state, me = st.me, next = rosterNextDays(r), off = new Set(agState().off), out = [], nights = new Set();
  if (r.kind === "call" && me && !rosterSpan(r).some(({d}) => rosterOn(next[d], me))) out.push("You're not on these sheets");
  if (r.kind === "callswap") for (const x of r.slots) {
    const day = st.days[x.d], from = x.from === "me" ? me : x.from;
    if (!day) { out.push(`${rosterDay(x.d)}: no call schedule for that day yet`); continue; }
    const sites = (x.site === "both" ? ROSTER_SITES : [x.site]).filter(k => day[k]);
    const has = sites.flatMap(k => x.slot === "night" ? [day[k].night.fellow] : day[k].day.fellows).filter(Boolean);
    if (!has.some(n => rosterSame(n, from)))
      out.push(`${rosterDay(x.d)}: the roster has ${[...new Set(has)].join(" and ") || "no one"} that ${x.slot}, not ${x.from === "me" ? "you" : x.from}`);
  }
  for (const {d} of rosterSpan(r)) {
    const x = next[d];
    if (!x) continue;
    if (x.hsc && x.stb) {
      const a = x.hsc.night.fellow, b = x.stb.night.fellow, line = !a && b ? `no night fellow at HSC, ${b} at St. Boniface` :
        a && !b ? `no night fellow at St. Boniface, ${a} at HSC` : a && b && !rosterSame(a, b) ? `the night fellow is ${a} at HSC but ${b} at St. Boniface` : "";
      if (line) { out.push(`${rosterDay(d)}: ${line}`); nights.add(rosterDay(d)); }
    }
    const night = rosterMine(x, d, "night", me), mine = night || rosterMine(x, d, "day", me);
    if (night && agDate(d).getDay() === 4) out.push(`${rosterDay(d)}: your night is on a Thursday`);
    if (mine && off.has(d)) out.push(`${rosterDay(d)}: you're on call on a day off`);
    if (night) for (const k of ROSTER_SITES) if (x[k] && x[k].day.att && x[k].night.att && !rosterSame(x[k].day.att, x[k].night.att))
      out.push(`${ROSTER_SITE[k]} attending changes from ${x[k].day.att} to ${x[k].night.att} at 17:00 on ${rosterDay(d)}`);
  }
  // Claude's lines, less any saying what's already here about a night fellow.
  for (const t of r.look || []) {
    const day = (/^(\w{3} \d{1,2} \w{3}):/.exec(t) || [])[1];
    if (!out.includes(t) && !(day && nights.has(day) && /night/i.test(t))) out.push(t);
  }
  return out;
}
// The slot on now: before 08:00 still last night.
function rosterNow(now) {
  const t = new Date(now), d = fmtDate(t), h = t.getHours();
  return h < 8 ? {d: agAddDays(d, -1), slot: "night"} : {d, slot: h < 17 ? "day" : "night"};
}

// ---- Picking up -----------------------------------------------------------------------------------
// A call schedule or swap Claude filed, held for a check with the pictures it
// keeps: the entry for the Claude added card. undefined when a picture didn't
// come (no signal, or trouble at the sender): the result waits for the next
// pickup, unconfirmed, so the sender keeps the pictures. A picture already
// gone (its 3 days are up) doesn't stop the check. null when the phone can't
// use it, or it's here already.
async function rosterTake(res, now) {
  const st = RosterStore.state, r = rosterClean(res, now);
  if (!r || st.pend[res.id] || st.undo[res.id]) return null;
  let lost = 0;
  for (const id of r.kind === "call" ? [...new Set(r.sheets.map(x => x.file).filter(Boolean))] : []) {
    if (await rosterPics.get(id)) continue;
    const b = await alertsBytes("/file/" + id);
    if (b.status === 404) { lost++; continue; }
    if (b.status !== 200 || !b.bytes) return undefined;
    try { await rosterPics.put(id, {type: b.type, bytes: b.bytes}); } catch (e) { return undefined; }
  }
  st.pend[res.id] = lost ? {r, at: now, lost} : {r, at: now};
  RosterStore.save();
  return {id: res.id, kind: r.kind, line: typeof res.line === "string" ? res.line : "", at: now, call: res.id};
}

// ---- Tidying ------------------------------------------------------------------------------------
// A sheet's picture goes once its last night is over (08:00 the day after its
// last day); the sheet, its days and notes 4 weeks after that; and any picture
// that no sheet and no waiting check points to.
async function rosterTidy(now) {
  const st = RosterStore.state, today = fmtDate(new Date(now));
  let changed = false;
  for (const sh of st.sheets.slice()) {
    if (agDiff(sh.to, today) <= ROSTER_KEEP) continue;
    if (!sh.unread) {
      for (const d of Object.keys(st.days)) if (d >= sh.from && d <= sh.to && st.days[d][sh.site]) {
        delete st.days[d][sh.site];
        if (!st.days[d].hsc && !st.days[d].stb) delete st.days[d];
      }
      st.notes = st.notes.filter(x => !(x.site === sh.site && x.d >= sh.from && x.d <= sh.to));
    }
    st.sheets.splice(st.sheets.indexOf(sh), 1);
    changed = true;
  }
  const swaps = st.swaps.filter(x => st.days[x.d]);
  if (swaps.length !== st.swaps.length) { st.swaps = swaps; changed = true; }
  for (const sh of st.sheets) if (sh.pic && now >= rosterAt(agAddDays(sh.to, 1), 8)) { sh.pic = ""; changed = true; }
  if (changed) RosterStore.save();
  const keep = new Set(st.sheets.map(x => x.pic).filter(Boolean));
  for (const p of Object.values(st.pend)) for (const sh of rosterList(p && p.r && p.r.sheets)) if (sh.file) keep.add(sh.file);
  for (const id of await rosterPics.keys()) if (!keep.has(id)) await rosterPics.del(id);
}
// After Clear call data: once Undo has had its chance, the pictures go too.
function rosterTidySoon() { setTimeout(() => { rosterTidy(callNow()).catch(() => {}); }, 6000); }
