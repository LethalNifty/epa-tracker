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
