"use strict";
// GI Hub coach: the Year 1 block calendar, the July plan, and the math that
// recalculates it from what has been logged. Pure functions only: no DOM and
// no Store. Loaded after EPA_DATA and before the main app script; its
// top-level names are shared with index.html, so none may be declared there.

const DAY_MS = 86400000;
const YEAR1_START = new Date(2026, 6, 2);   // Block 1 day 1 (a Thursday)
const YEAR1_END = new Date(2027, 5, 30);    // Block 13 last day (a Wednesday)
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const BLOCK_NAMES = {1:"Consults HSC",2:"Consults SBH",3:"Hepatology",4:"Motility/Nutrition",5:"Consults SBH",6:"Radiology",7:"Consults SBH",8:"Advanced Endoscopy",9:"Pathology",10:"Consults HSC",11:"Consults Grace",12:"Hepatology",13:"Consults HSC"};
// Rotation type per block. A missed observation only moves to a block whose
// type the July plan ever gave that part.
const BLOCK_FAMILY = {1:"consults",2:"consults",3:"hepatology",4:"motility",5:"consults",6:"radiology",7:"consults",8:"endoscopy",9:"pathology",10:"consults",11:"consults",12:"hepatology",13:"consults"};
// The July plan: the most each block should carry per part.
// Column sums per part MUST equal that part's required count (tested).
const PLAN = {
  1:{d1:2, d2a:1, d2b:1, f1a:2, f1b:3},
  2:{d1:2, d2a:1, d2b:2, f1b:4, f2:1, f3a:1},
  3:{c2:3, c3:2, c1:1, f1b:2},
  4:{f2:1, c5:2, c2:2, f1b:2, c4:1},
  5:{d2b:1, f1b:1, f3a:2, f4:2, c1:2, c3:2, c7:1},
  6:{f3b:2, c8b:1, c4:1},
  7:{c1:2, c3:2, c7:1, f3a:2, f4:2, c8a:2},
  8:{f3a:1, f4:2, c6:6, c7:3, c8a:8, c8b:1},
  9:{f3b:1, c8b:1, c7:1},
  10:{c3:2, c6:2, c8a:5, c9a:2, c9b:3, c7:2},
  11:{c2:6, c3:1, c4:1, c6:2, c8a:4},
  12:{c2:3, c3:1, c6:2, c8a:6, c8b:1, c9a:2, c9b:3},
  13:{p1:5}
};
const BLOCK_HINTS = {
  1:"TTD first: emergencies, consent and prep, observed H&P.",
  2:"Close out D1/D2; stack F1-B assessments; start F2 nutrition.",
  3:"Liver block: chronic-liver C2s and liver C3s are hardest to get elsewhere.",
  4:"Nutrition block: finish F2, both C5s, functional/refractory C2 lines.",
  5:"Finish Foundations; complex consults; forms on every scope day.",
  6:"Light block: procedure notes, and mop up anything behind plan.",
  7:"Complex consults and therapeutic scope cases (holiday bleeds count).",
  8:"Endo block: a form on every list (colonoscopies, therapeutics, findings).",
  9:"Light block: last procedure notes; book assessors for Block 10.",
  10:"Junior-attending block: C9 observations and colonoscopy volume.",
  11:"Clinic-heavy: C2 forms every clinic; keep scoping.",
  12:"Big finish: close C2/C3, remaining scopes, C9. Varices count as C8 variceal ticks.",
  13:"P1 wrap-up: run the endoscopy list; buffer for anything left."
};
// One short name per part, for the week list and the log sheet.
const PART_SHORT = {d1:"GI emergencies", d2a:"Consent", d2b:"Scope preparation", f1a:"History and physical",
  f1b:"Assessment and plan", f2:"Nutrition", f3a:"EGD", f3b:"EGD note", f4:"Flex sig", c1:"Complex patients",
  c2:"Chronic care", c3:"Exacerbations", c4:"Referrals", c5:"Complex nutrition", c6:"Colonoscopy",
  c7:"Endoscopic findings", c8a:"Therapeutics", c8b:"Therapeutic note", c9a:"Inpatient lead",
  c9b:"Interprofessional care", p1:"Endoscopy list"};
// Every part in EPA order: {id, code, label, stage, required, items}.
const PARTS = [];
const PART_BY_ID = {};
for (const e of EPA_DATA) {
  e.parts.forEach((p, i) => {
    const P = {id: p.id, code: e.code, label: e.code + (e.parts.length > 1 ? ["-A", "-B"][i] : ""),
      stage: e.stage, required: p.required, items: p.items};
    PARTS.push(P);
    PART_BY_ID[p.id] = P;
  });
}

function fmtDate(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
// Whole calendar days from Block 1 day 1, ignoring clock time and DST.
function dayIndex(date) {
  return Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(2026, 6, 2)) / DAY_MS);
}
function blockFor(date) {
  let days = dayIndex(date);
  if (days === -1) days = 0;   // 2026-07-01 counts as Block 1
  if (days < 0 || days >= 13 * 28) return null;
  const num = Math.floor(days / 28) + 1;
  return {num, name: BLOCK_NAMES[num], week: Math.floor((days % 28) / 7) + 1};
}
function blockStart(num) { return new Date(2026, 6, 2 + (num - 1) * 28); }
function blockEnd(num) { return new Date(2026, 6, 2 + (num - 1) * 28 + 27); }
function weekEnd(num, week) { return new Date(2026, 6, 2 + (num - 1) * 28 + week * 7 - 1); }
function blockDates(num) {
  const s = blockStart(num), e = blockEnd(num);
  return `${MONTHS[s.getMonth()]} ${s.getDate()} – ${MONTHS[e.getMonth()]} ${e.getDate()}`;
}
// The day an observation counts for: its date field, else the day it was
// logged, else null (it still counts toward totals, never toward a block).
function attrDate(o) {
  if (o && typeof o.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.d)) {
    const [y, m, d] = o.d.split("-").map(Number);
    return new Date(y, m - 1, d, 12);
  }
  if (o && o.ts) {
    const t = new Date(o.ts);
    if (!isNaN(t)) return new Date(t.getFullYear(), t.getMonth(), t.getDate(), 12);
  }
  return null;
}

// Stages the coach works through, in order. Each opens once every observation
// of the stage before it is logged (pending counts). Transition to Discipline
// (D1, D2) came before Foundations and is behind the user, so the coach never
// plans or suggests it; it can still be logged on the EPAs tab.
const COACH_STAGES = ["f", "core", "ttp"];
// A procedure note can happen wherever its procedure happens.
const NOTE_OF = {f3b: "f3a", c8b: "c8a"};

// Rotation types where the July plan ever placed this part (or its procedure).
function feasibleFamilies(pid) {
  const ids = NOTE_OF[pid] ? [pid, NOTE_OF[pid]] : [pid];
  const out = [];
  for (const b in PLAN) for (const id of ids)
    if (PLAN[b][id] > 0 && !out.includes(BLOCK_FAMILY[b])) out.push(BLOCK_FAMILY[b]);
  return out;
}
// First block from `from` whose rotation suits the part; `from` if none is left.
function firstFeasible(pid, from) {
  const fams = feasibleFamilies(pid);
  for (let b = from; b <= 13; b++) if (fams.includes(BLOCK_FAMILY[b])) return b;
  return from;
}

// The recalculated plan on `today`. Per part: logged (all of it, or only up to
// opts.asOf), inCur and inWeek (logged in the current block and week) and
// planned[b] (how many to log in block b). active is the stage being worked
// on: everything it still needs is due at the first block where each part can
// happen (as soon as possible). Later stages start the block after the stage
// before them is due to finish: the July plan's share from there on, with the
// rest spread over blocks whose rotation suits them. Null outside Year 1.
function coachPlan(obsByPart, today, opts) {
  const blk = blockFor(today);
  if (!blk) return null;
  const cur = blk.num;
  const cutoff = opts && opts.asOf ? dayIndex(opts.asOf) : null;
  const parts = {}, left = {};
  for (const P of PARTS) {
    const list = (obsByPart[P.id] || []).filter(o => {
      if (cutoff === null) return true;
      const d = attrDate(o);
      return !d || dayIndex(d) <= cutoff;
    });
    let inCur = 0, inWeek = 0;
    for (const o of list) {
      const d = attrDate(o), b = d && blockFor(d);
      if (b && b.num === cur) { inCur++; if (b.week === blk.week) inWeek++; }
    }
    left[P.id] = COACH_STAGES.includes(P.stage) ? Math.max(0, P.required - list.length) : 0;
    parts[P.id] = {logged: list.length, inCur, inWeek, planned: {}};
  }
  const open = st => PARTS.filter(P => P.stage === st && left[P.id] > 0);
  const active = COACH_STAGES.find(st => open(st).length) || null;
  let start = cur;
  for (const st of COACH_STAGES) {
    const todo = open(st);
    if (!todo.length) continue;
    const from = Math.min(start, 13);
    let last = from;
    for (const P of todo) {
      const planned = parts[P.id].planned;
      let need = left[P.id];
      if (st === active) {
        const b = firstFeasible(P.id, cur);
        planned[b] = need;
        last = Math.max(last, b);
        continue;
      }
      for (let b = from; b <= 13 && need > 0; b++) {
        const take = Math.min(PLAN[b][P.id] || 0, need);
        if (take > 0) { planned[b] = take; need -= take; last = Math.max(last, b); }
      }
      if (need > 0) {
        const fams = feasibleFamilies(P.id), slots = [];
        for (let b = from; b <= 13; b++) if (fams.includes(BLOCK_FAMILY[b])) slots.push(b);
        if (!slots.length) for (let b = from; b <= 13; b++) slots.push(b);
        for (let k = 0; need > 0; k++, need--) {
          const b = slots[k % slots.length];
          planned[b] = (planned[b] || 0) + 1;
          last = Math.max(last, b);
        }
      }
    }
    start = last + 1;
  }
  return {block: blk, parts, active};
}


// This week's list for a coachPlan result: parts of the active stage with
// something due by the end of this block week (the block's share is spread
// over its 4 weeks), plus ones finished this week. prevRows is last week's
// list; anything still outstanding from it is marked carried.
function weekList(cp, prevRows) {
  const cur = cp.block.num, week = cp.block.week, rows = [];
  for (const P of PARTS) {
    if (P.stage !== cp.active) continue;
    const s = cp.parts[P.id];
    const total = s.inCur + (s.planned[cur] || 0);
    const outstanding = Math.max(0, Math.min(total, Math.ceil(total * week / 4)) - s.inCur);
    if (outstanding === 0 && s.inWeek === 0) continue;
    const wasDue = !!prevRows && prevRows.some(r => r.pid === P.id && r.outstanding > 0);
    rows.push({pid: P.id, label: P.label, short: PART_SHORT[P.id], outstanding, carried: outstanding > 0 && wasDue});
  }
  return rows.sort((a, b) => (b.outstanding > 0) - (a.outstanding > 0) || b.carried - a.carried || b.outstanding - a.outstanding);
}
// This week's list on `today`, with carried marks from last week.
function weekRows(obsByPart, today) {
  const cp = coachPlan(obsByPart, today);
  if (!cp) return [];
  const prev = prevBlockWeek(cp.block);
  const end = prev && weekEnd(prev.num, prev.week);
  return weekList(cp, end ? weekList(coachPlan(obsByPart, end, {asOf: end})) : null);
}

function prevBlockWeek(blk) {
  if (blk.week > 1) return {num: blk.num, week: blk.week - 1};
  return blk.num > 1 ? {num: blk.num - 1, week: 4} : null;
}
// Last block week in review: what was logged in it, and what slipped (still
// due when it ended). key names the current block week, e.g. "4-1".
function recapFor(obsByPart, today) {
  const blk = blockFor(today);
  const prev = blk && prevBlockWeek(blk);
  if (!prev) return null;
  const end = weekEnd(prev.num, prev.week), hi = dayIndex(end), lo = hi - 6;
  const got = [];
  for (const P of PARTS) {
    const n = (obsByPart[P.id] || []).filter(o => {
      const d = attrDate(o);
      return d && dayIndex(d) >= lo && dayIndex(d) <= hi;
    }).length;
    if (n) got.push({pid: P.id, label: P.label, n});
  }
  const slipped = weekList(coachPlan(obsByPart, end, {asOf: end}))
    .filter(r => r.outstanding > 0).map(r => ({pid: r.pid, label: r.label, n: r.outstanding}));
  return {key: blk.num + "-" + blk.week, got, slipped};
}

// Observations the coach still has to find (Transition to Discipline excluded).
function remainingTotal(obsByPart) {
  return PARTS.reduce((a, P) => a + (COACH_STAGES.includes(P.stage) ?
    Math.max(0, P.required - (obsByPart[P.id] || []).length) : 0), 0);
}
// Finish date at the pace of the last 8 weeks (fewer early in the year).
function paceFinish(obsByPart, today) {
  const remaining = remainingTotal(obsByPart);
  if (!remaining) return {done: true};
  const t = dayIndex(today), weeks = Math.max(1, Math.min(8, (t + 1) / 7));
  let n = 0;
  for (const pid in obsByPart) for (const o of obsByPart[pid]) {
    const d = attrDate(o);
    if (d && dayIndex(d) <= t && dayIndex(d) > t - weeks * 7) n++;
  }
  if (!n) return {date: null};
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + Math.ceil(remaining / (n / weeks) * 7));
  return {date, onTrack: dayIndex(date) <= dayIndex(YEAR1_END), n, weeks: Math.round(weeks)};
}
// Finish date if every block hits its recalculated targets.
function planFinish(cp) {
  let last = 0;
  for (const pid in cp.parts) {
    const s = cp.parts[pid];
    for (const b of Object.keys(s.planned)) last = Math.max(last, +b);
  }
  if (!last) return {done: true};
  const date = blockEnd(last);
  return {date, block: last, onTrack: dayIndex(date) <= dayIndex(YEAR1_END)};
}

// Pending observations more than 14 days old, oldest first.
function chaseList(obsByPart, today) {
  const t = dayIndex(today), out = [];
  for (const P of PARTS) (obsByPart[P.id] || []).forEach((o, i) => {
    const d = attrDate(o);
    if (o.status === "approved" || !d || t - dayIndex(d) <= 14) return;
    out.push({pid: P.id, i, label: P.label, date: fmtDate(d), a: o.a || "", age: t - dayIndex(d)});
  });
  return out.sort((x, y) => y.age - x.age);
}

// Context lines that say who assessed, not what case to find.
const NOT_A_CASE = /(assessor|observer|direct observation|dops|physician|other health care professional)$|^other( significant)?$/i;
// Up to `max` case types still needed for this week's outstanding parts, in
// row order. Numbered series ("1 polypectomy", "2 polypectomy") are grouped.
function lookFor(rows, lineVal, max) {
  const out = [], limit = max || 3;
  for (const r of rows) {
    if (!(r.outstanding > 0)) continue;
    const groups = [];
    for (const it of PART_BY_ID[r.pid].items) {
      if (!it.id) continue;
      const name = it.label.replace(/^\d+\s+/, "");
      const left = it.target - lineVal(it.id);
      if (NOT_A_CASE.test(name) || left <= 0) continue;
      const g = groups.find(x => x.name === name);
      if (g) g.left += left;
      else groups.push({pid: r.pid, part: r.label, name, left});
    }
    for (const g of groups) {
      if (out.length >= limit) return out;
      out.push(g);
    }
  }
  return out;
}

function loggedInBlock(obsByPart, pid, num) {
  return (obsByPart[pid] || []).filter(o => {
    const d = attrDate(o), b = d && blockFor(d);
    return b && b.num === num;
  }).length;
}
// Chips for one block on the Plan tab. curNum is the current block number,
// 0 before Year 1 (show the July plan) or 14 after it (everything is past).
function blockTargets(num, obsByPart, cp, curNum) {
  const out = [];
  for (const P of PARTS) {
    const past = num < curNum;
    const n = past ? loggedInBlock(obsByPart, P.id, num) : cp ? (cp.parts[P.id].planned[num] || 0) : (PLAN[num][P.id] || 0);
    if (n) out.push({pid: P.id, label: P.label, code: P.code, n, past});
  }
  return out;
}
// EPA codes with anything due in the current block.
function blockFocus(cp) {
  const cur = cp.block.num, out = [];
  for (const P of PARTS) {
    const s = cp.parts[P.id];
    if ((s.planned[cur] || 0) > 0 && !out.includes(P.code)) out.push(P.code);
  }
  return out;
}
