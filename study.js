"use strict";
// GI Hub study: the Mayo Board Review reading plan (pass 1, Blocks 4 to 12) and
// the math that turns it into tonight's pages. Pure: no DOM and no Store.
// Loaded after coach.js (dates and blocks) and before notify.js; the views
// are in study-view.js.
//
// Progress is a bookmark: the plan is one run of pages in reading order, and
// the saved log maps each day to how far through that run you were at the
// end of it. Page numbers are the printed ones (the PDF page is printed + 15).
// Only table-of-contents facts live here, never the book's text.

const STUDY_START = new Date(2026, 8, 30);   // the first reading night, a Wednesday
const STUDY_END = new Date(2027, 5, 2);      // the plan's finish: the last day of Block 12
const STUDY_LAST = new Date(2027, 5, 30);    // Block 13 is spare: catch-up, then questions
const STUDY_NIGHTS = [1, 2, 3, 5];           // Mon, Tue, Wed and Fri; Thursday is soccer
const STUDY_CAP = 10;                        // the most pages one night is given
const STUDY_SNAP = 2;                        // finish on a chapter when one ends this close
const STUDY_EVENING = 20;                    // 20:00: the reminder, and the call-night test
const STUDY_PDF = 15;                        // PDF page = printed page + 15
const STUDY_KEEP = 4;                        // pages offered when you're ahead

// The book's seven sections, with their question counts and tract glyphs.
const STUDY_SECTIONS = [
  {n: 1, name: "Esophagus", glyph: "esoph", q: 14},
  {n: 2, name: "Stomach", glyph: "stomach", q: 16},
  {n: 3, name: "Small Bowel and Nutrition", glyph: "duod", q: 8},
  {n: 4, name: "Miscellaneous", glyph: "scope", q: 20},
  {n: 5, name: "Colon", glyph: "colon", q: 32},
  {n: 6, name: "Liver", glyph: "liver", q: 61},
  {n: 7, name: "Pancreas and Biliary", glyph: "panc", q: 16},
];
const STUDY_ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII"];
// Chapter: [title, first printed page, last printed page]. Trailing blank
// pages are left out.
const STUDY_CH = {
  1: ["Gastroesophageal Reflux Disease", 3, 21],
  2: ["Barrett Esophagus and Esophageal Cancer", 23, 33],
  3: ["Esophageal Motility", 35, 44],
  4: ["Peptic Ulcer Disease", 51, 56],
  5: ["Gastritis and Gastropathy", 57, 64],
  6: ["Gastric Neoplasms and Neuroendocrine Tumors", 65, 81],
  7: ["Gastrointestinal Motility Disorders", 83, 95],
  8: ["Malabsorption, Small-Bowel Disease and Bacterial Overgrowth", 105, 117],
  9: ["Nutritional Disorders: Vitamins and Minerals", 119, 122],
  10: ["Nonvariceal Gastrointestinal Bleeding", 127, 132],
  11: ["Vascular Disorders of the GI Tract", 133, 141],
  12: ["GI Manifestations of Systemic Disease", 143, 157],
  13: ["Complications After Roux-en-Y Surgery", 159, 165],
  14: ["Endoscopy for the Board Examination", 167, 174],
  15: ["IBD: Clinical Aspects", 185, 190],
  16: ["IBD: Therapy", 191, 198],
  17: ["IBD: Extraintestinal Manifestations and Colorectal Cancer", 199, 205],
  18: ["Intestinal Infections", 207, 220],
  19: ["Colorectal Neoplasms", 221, 230],
  20: ["Irritable Bowel Syndrome", 231, 236],
  21: ["Constipation and Fecal Incontinence", 237, 249],
  22: ["GI Disease and Pregnancy", 251, 267],
  23: ["Abnormal Liver Tests and Acute Liver Failure", 279, 285],
  24: ["Viral Hepatitis", 287, 296],
  25: ["Liver Mass Lesions", 297, 313],
  26: ["Alcohol-Related Liver Disease", 315, 323],
  27: ["Vascular Diseases of the Liver", 325, 330],
  28: ["Portal Hypertension–Related Bleeding", 331, 334],
  29: ["Ascites, Hepatorenal Syndrome and Encephalopathy", 335, 343],
  30: ["Metabolic Liver Diseases", 345, 355],
  31: ["Cholestatic Liver Disease", 357, 362],
  32: ["Drug-Induced Liver Injury", 363, 373],
  33: ["Autoimmune Hepatitis", 375, 380],
  34: ["Nonalcoholic Fatty Liver Disease", 381, 389],
  35: ["Liver Disease in Pregnancy", 391, 399],
  36: ["Liver Transplantation", 401, 405],
  37: ["Acute Pancreatitis", 427, 435],
  38: ["Chronic Pancreatitis", 437, 442],
  39: ["Pancreatic Neoplasms", 443, 453],
  40: ["Gallstones", 455, 466],
};
// Each section's questions and answers: [first, last].
const STUDY_QA = {1: [45, 48], 2: [97, 101], 3: [123, 124], 4: [175, 181], 5: [269, 276], 6: [407, 423], 7: [467, 470]};
// Reading order, block by block. Blocks 1 to 3 went by before the plan
// started; their chapters were moved to blocks whose rotation suits them.
// A question set always follows every chapter it covers.
const STUDY_PLAN = {
  4: ["c3", "c7", "c21", "c20"],
  5: ["c8", "c9", "q3", "c15", "c16", "c17", "c18"],
  6: ["c37", "c38", "c39", "c40", "q7", "c25"],
  7: ["c19", "c22", "q5"],
  8: ["c14", "c1", "c2", "c10", "q1"],
  9: ["c4", "c5", "c6", "q2", "c31", "c33"],
  10: ["c23", "c24", "c26", "c28", "c29", "c30"],
  11: ["c11", "c12", "c13", "q4", "c32"],
  12: ["c27", "c34", "c35", "c36", "q6"],
};
const studySecOf = ch => ch <= 3 ? 1 : ch <= 7 ? 2 : ch <= 9 ? 3 : ch <= 14 ? 4 : ch <= 22 ? 5 : ch <= 36 ? 6 : 7;
const STUDY_ITEMS = [];
for (const b of Object.keys(STUDY_PLAN).map(Number).sort((x, y) => x - y))
  for (const id of STUDY_PLAN[b]) {
    const k = +id.slice(1);
    if (id[0] === "c") {
      const [title, a, z] = STUDY_CH[k];
      STUDY_ITEMS.push({id, block: b, sec: studySecOf(k), ch: k, title, p: [a, z], n: z - a + 1});
    } else {
      const [a, z] = STUDY_QA[k], s = STUDY_SECTIONS[k - 1];
      STUDY_ITEMS.push({id, block: b, sec: k, ch: null, title: s.name + " questions", p: [a, z], n: z - a + 1, q: s.q});
    }
  }
const STUDY_BY_ID = {};
for (const it of STUDY_ITEMS) STUDY_BY_ID[it.id] = it;

// ---- The run of pages --------------------------------------------------------------
let studySeqMemo = null;
// start[j]: the run index of item j's first page; blockEnd[b]: pages due by
// the end of block b (cumulative); total: every page in the plan.
function studySeq() {
  if (studySeqMemo) return studySeqMemo;
  const start = [], ends = [], bStart = {}, bEnd = {};
  let k = 0;
  for (const it of STUDY_ITEMS) {
    if (!(it.block in bStart)) bStart[it.block] = k;
    start.push(k); k += it.n; ends.push(k); bEnd[it.block] = k;
  }
  return (studySeqMemo = {start, ends, blockStart: bStart, blockEnd: bEnd, total: k});
}
// Pages that should be read by the end of block b.
function studyDue(b) {
  const S = studySeq();
  if (b < 4) return 0;
  if (b > 12) return S.total;
  return S.blockEnd[b];
}
// The item holding run index i (0-based), and that page's printed number.
function studyAt(i) {
  const S = studySeq();
  let j = 0;
  while (j < STUDY_ITEMS.length - 1 && S.ends[j] <= i) j++;
  const it = STUDY_ITEMS[j];
  return {item: it, j, page: it.p[0] + Math.min(i, S.ends[j] - 1) - S.start[j]};
}
// The run index of a printed page, or -1 if the plan doesn't read it.
function studyPageIndex(page) {
  const S = studySeq();
  for (let j = 0; j < STUDY_ITEMS.length; j++) {
    const it = STUDY_ITEMS[j];
    if (page >= it.p[0] && page <= it.p[1]) return S.start[j] + page - it.p[0];
  }
  return -1;
}
const studyItemEnd = it => { const S = studySeq(); return S.ends[STUDY_ITEMS.indexOf(it)]; };
const studyItemStart = it => { const S = studySeq(); return S.start[STUDY_ITEMS.indexOf(it)]; };
// Printed pages for run indices [from, to), in pieces where the run jumps
// between chapters: [{item, a, z}].
function studyPieces(from, to) {
  const out = [];
  for (let i = from; i < to; i++) {
    const at = studyAt(i), last = out[out.length - 1];
    if (last && last.item === at.item) last.z = at.page;
    else out.push({item: at.item, a: at.page, z: at.page});
  }
  return out;
}
// "35–38", or "43–44, 83–84" across a chapter change.
function studyPP(from, to) {
  return studyPieces(from, to).map(x => x.a === x.z ? String(x.a) : x.a + "–" + x.z).join(", ");
}
const studyPdfPP = (from, to) => studyPieces(from, to).map(x => x.a === x.z ? String(x.a + STUDY_PDF) : (x.a + STUDY_PDF) + "–" + (x.z + STUDY_PDF)).join(", ");
const studyItemLabel = it => it.ch ? "Ch " + it.ch : "Q " + STUDY_ROMAN[it.sec];

// ---- Days and nights ---------------------------------------------------------------
const studyMidnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const studyAddDays = (d, k) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + k);
const studyEveningMs = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), STUDY_EVENING).getTime();
// On call at 20:00 that day.
function studyCallNight(day, stretches) {
  const t = studyEveningMs(day);
  return (stretches || []).some(st => st.s <= t && t < st.e);
}
function studyPaused(day, pauses) {
  const k = fmtDate(day);
  return (pauses || []).some(p => p.a <= k && k <= p.b);
}
// What kind of night a day is: "read", or why it isn't.
function studyNightKind(day, stretches, pauses) {
  const k = fmtDate(day);
  if (k < fmtDate(STUDY_START)) return "before";
  if (k > fmtDate(STUDY_LAST)) return "after";
  if (studyPaused(day, pauses)) return "pause";
  if (studyCallNight(day, stretches)) return "call";
  const wd = day.getDay();
  if (wd === 4) return "thu";
  if (!STUDY_NIGHTS.includes(wd)) return "weekend";
  return "read";
}
// Reading nights from `from` through `to`, both days included.
function studyCountNights(from, to, stretches, pauses) {
  let n = 0;
  for (let d = studyMidnight(from); d <= to; d = studyAddDays(d, 1))
    if (studyNightKind(d, stretches, pauses) === "read") n++;
  return n;
}
// The block a day's reading counts toward (4 to 13), or null outside Year 1.
function studyBlockOf(day) {
  if (fmtDate(day) < fmtDate(STUDY_START)) return 4;
  const blk = blockFor(day);
  return blk ? Math.max(4, blk.num) : null;
}

// ---- The bookmark ------------------------------------------------------------------
const studyBlank = () => ({log: {}, q: {}, pauses: []});
// How far through the run you were at the end of the last day before `day`.
function studyCursorBefore(log, day) {
  const k = fmtDate(day);
  let best = null, c = 0;
  for (const d in log || {}) if (d < k && (best === null || d > best)) { best = d; c = log[d]; }
  return c;
}
function studyCursorNow(log) {
  let best = null, c = 0;
  for (const d in log || {}) if (best === null || d > best) { best = d; c = log[d]; }
  return c;
}

// ---- Tonight -----------------------------------------------------------------------
// End a range on a chapter boundary when one is within STUDY_SNAP pages.
function studySnap(from, n) {
  const S = studySeq(), end = Math.min(from + n, S.total);
  let best = end, gap = STUDY_SNAP + 1;
  for (const e of S.ends) {
    if (e <= from) continue;
    const g = Math.abs(e - end);
    if (g < gap || (g === gap && e > best)) { best = e; gap = g; }
  }
  return {from, to: gap <= STUDY_SNAP ? best : end};
}
// A reading night's share, starting at `cursor`: what's due by the end of
// the block, spread over the reading nights left in it, tonight included.
// Null when nothing is due (you're ahead) or the plan is read.
function studyShare(day, cursor, stretches, pauses) {
  const S = studySeq(), b = studyBlockOf(day);
  if (b === null || cursor >= S.total) return null;
  const due = studyDue(Math.min(b, 13)) - cursor;
  if (due <= 0) return null;
  const nights = Math.max(1, studyCountNights(day, blockEnd(b), stretches, pauses));
  const n = Math.min(Math.ceil(due / nights), STUDY_CAP, S.total - cursor);
  return studySnap(cursor, n);
}
// The first reading night after `day`, within the next 60 days, or null.
function studyNextNight(day, stretches, pauses) {
  for (let k = 1; k <= 60; k++) {
    const d = studyAddDays(day, k);
    if (studyNightKind(d, stretches, pauses) === "read") return d;
    if (fmtDate(d) > fmtDate(STUDY_LAST)) return null;
  }
  return null;
}
const studyKeepGoing = cursor => { const S = studySeq(); return cursor >= S.total ? null : studySnap(cursor, Math.min(STUDY_KEEP, S.total - cursor)); };
// Everything the Study tab and the Week card say about tonight.
// kind: "read" | "before" | "after" | "pause" | "call" | "thu" | "weekend" | "complete"
function studyTonight(day, st, stretches) {
  const S = studySeq(), s = st || studyBlank(), pauses = s.pauses;
  const now = studyCursorNow(s.log), c0 = Math.min(studyCursorBefore(s.log, day), now);
  let kind = studyNightKind(day, stretches, pauses);
  const out = {kind, day: studyMidnight(day), block: studyBlockOf(day), now, total: S.total,
    from: c0, to: c0, n: 0, done: false, partial: false, ahead: false, keep: null, next: null};
  if (now >= S.total) { out.kind = "complete"; out.done = true; return out; }
  if (kind === "read") {
    const sh = studyShare(day, c0, stretches, pauses);
    if (!sh) { out.ahead = true; out.keep = studyKeepGoing(now); }
    else {
      Object.assign(out, sh, {n: sh.to - sh.from});
      out.done = now >= sh.to;
      out.partial = now > sh.from && now < sh.to;
    }
  }
  // The next reading night, as if tonight goes to plan.
  const after = kind === "before" ? studyAddDays(STUDY_START, -1) : day;
  const nd = studyNextNight(after, stretches, pauses);
  if (nd) {
    const from = Math.max(now, out.kind === "read" && !out.ahead ? out.to : now);
    const sh = studyShare(nd, from, stretches, pauses) || studyKeepGoing(from);
    if (sh) out.next = {day: nd, from: sh.from, to: sh.to};
  }
  // Off nights and the ahead state offer the next pages to read anyway.
  if (kind !== "read" && !out.keep) out.keep = out.next ? {from: out.next.from, to: out.next.to} : studyKeepGoing(now);
  return out;
}

// ---- Where you stand ---------------------------------------------------------------
// Pages ahead of (+) or behind (-) an even spread over the block's nights.
// Tonight counts as expected once tonight's pages are done.
function studyPlanDelta(day, st, stretches) {
  const s = st || studyBlank(), b = studyBlockOf(day);
  if (b === null || fmtDate(day) < fmtDate(STUDY_START)) return 0;
  const now = studyCursorNow(s.log);
  const bb = Math.min(b, 13), first = new Date(Math.max(blockStart(bb), STUDY_START));
  const total = studyCountNights(first, blockEnd(bb), stretches, s.pauses);
  const t = studyTonight(day, s, stretches);
  const upTo = t.kind === "read" && t.done ? day : studyAddDays(day, -1);
  const done = studyCountNights(first, upTo, stretches, s.pauses);
  const lo = studyDue(bb - 1), hi = studyDue(bb);
  const expected = total ? lo + (hi - lo) * Math.min(done, total) / total : hi;
  return Math.round(now - expected);
}
// Pages a week over the last four weeks, and where that finishes the book.
function studyPace(day, st) {
  const s = st || studyBlank(), S = studySeq(), now = studyCursorNow(s.log);
  if (now >= S.total) return {done: true, rate: null, date: null, onTrack: true};
  const days = Math.round((studyMidnight(day) - STUDY_START) / DAY_MS);
  if (days < 7) return {done: false, rate: null, date: null, onTrack: true};
  const span = Math.min(28, days + 1), from = studyAddDays(day, -(span - 1));
  const read = now - studyCursorBefore(s.log, from);
  const rate = read / span * 7;
  if (rate <= 0) return {done: false, rate: 0, date: null, onTrack: false};
  const date = studyAddDays(day, Math.ceil((S.total - now) / rate * 7));
  return {done: false, rate: Math.round(rate * 10) / 10, date, onTrack: date <= STUDY_END};
}
// The block as 28 days, Thursday to Wednesday. state: "done" (read on a
// reading night), "missed", "extra" (read on an off night), "today",
// "future" or "past"; pages: the plan for tonight and nights to come, as if
// each goes to plan.
function studyNights(b, day, st, stretches) {
  const s = st || studyBlank(), log = s.log || {}, today = fmtDate(day);
  const t = studyTonight(day, s, stretches);
  let sim = t.kind === "read" && !t.ahead ? Math.max(t.now, t.to) : t.now;
  const out = [];
  for (let k = 0; k < 28; k++) {
    const d = studyAddDays(blockStart(b), k), key = fmtDate(d), kind = studyNightKind(d, stretches, s.pauses);
    const moved = key in log && log[key] > studyCursorBefore(log, d);
    let state, pages = 0;
    if (key < today) state = moved ? (kind === "read" ? "done" : "extra") : kind === "read" ? "missed" : "past";
    else if (key === today) { state = "today"; pages = t.kind === "read" ? t.n : 0; }
    else {
      state = "future";
      if (kind === "read") { const sh = studyShare(d, sim, stretches, s.pauses); if (sh) { pages = sh.to - sh.from; sim = sh.to; } }
    }
    out.push({date: d, key, kind, state, pages, moved});
  }
  return out;
}
// Items read to their last page.
function studyDoneIds(st) {
  const now = studyCursorNow((st || studyBlank()).log), S = studySeq();
  return STUDY_ITEMS.filter((it, j) => S.ends[j] <= now).map(it => it.id);
}
// The first question set read to the end with no score yet, or null.
function studyNeedsScore(st) {
  const s = st || studyBlank(), done = studyDoneIds(s);
  return STUDY_ITEMS.find(it => it.q && done.includes(it.id) && !(s.q && s.q[it.id])) || null;
}
// Last block week (Thursday to Wednesday before this one): pages read, and
// the even-spread share of the plan for its reading nights.
function studyLastWeek(day, st, stretches) {
  const s = st || studyBlank(), d = studyMidnight(day);
  const thu = studyAddDays(d, -((d.getDay() + 3) % 7) - 7), wed = studyAddDays(thu, 6);
  const read = Math.max(0, studyCursorBefore(s.log, studyAddDays(wed, 1)) - studyCursorBefore(s.log, thu));
  const b = studyBlockOf(thu);
  if (b === null || b > 12 || fmtDate(wed) < fmtDate(STUDY_START)) return {read, planned: 0};
  const first = new Date(Math.max(blockStart(b), STUDY_START));
  const nights = studyCountNights(first, blockEnd(b), stretches, s.pauses);
  const inWeek = studyCountNights(new Date(Math.max(thu, STUDY_START)), wed, stretches, s.pauses);
  const planned = nights ? Math.round((studyDue(b) - studyDue(b - 1)) * inWeek / nights) : 0;
  return {read, planned};
}
// For the reminder brief: tonight and the next 13 days, written out, so the
// phone can word a notification without the app open.
function studyBriefNights(day, st, stretches) {
  const s = st || studyBlank(), now = studyCursorNow(s.log), out = [];
  for (let k = 0; k < 14; k++) {
    const d = studyAddDays(studyMidnight(day), k);
    const t = k === 0 ? studyTonight(d, s, stretches) : null;
    let kind = t ? t.kind : studyNightKind(d, stretches, s.pauses), from = now, to = now, done = false;
    if (t) { from = t.from; to = t.to; done = t.done; if (t.ahead) kind = "ahead"; }
    else if (kind === "read") {
      const sh = studyShare(d, now, stretches, s.pauses);
      if (sh) { from = sh.from; to = sh.to; } else kind = now >= studySeq().total ? "complete" : "ahead";
    }
    if (now >= studySeq().total) kind = "complete";
    const e = {d: d.getTime(), kind, done};
    if (to > from) {
      const pc = studyPieces(from, to);
      e.pp = studyPP(from, to); e.n = to - from;
      e.what = pc.map(x => studyItemLabel(x.item)).filter((v, i, a) => a.indexOf(v) === i).join(" and ") +
        (pc.length === 1 ? " · " + pc[0].item.title : "");
    }
    out.push(e);
  }
  return out;
}
