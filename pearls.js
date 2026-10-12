"use strict";
// Pearls: teaching points staff say on the wards, caught in a few words.
// Pure helpers: cleaning a saved list, search, a topic guessed from the words,
// the patient-detail check and the text file sent on to become Anki cards
// (format: docs/PEARLS.md). Reads the guideline library (guides.js) and the
// number guard (scope.js). Who said it never leaves the phone.

const PEARL_MAX = 2000, PEARL_WHO_MAX = 60;
const PEARL_ISO = /^\d{4}-\d{2}-\d{2}$/;
// Words too common to say anything about a topic.
const PEARL_STOP = new Set(("the and for with that this from have has had not are was were you your they them their then than " +
  "what when which who whom will would should could can cant always never only also just about after before into over under " +
  "more most less all any every each some one two three four five give given check use used using start stop think need needs " +
  "get got make take its but our out very much many well good best first second third day days week weeks month months year years " +
  "dose doses patient patients disease diseases said says say told tell teach taught remember why how there here where while " +
  "because does did done don dont didnt isnt wasnt like look looks see seen even still yet both other others such same per via " +
  "whole read once again thing things way ways lot lots kind nice night nights body normal treat treated treating treatment " +
  "everyone anyone within without hour hours").split(" "));

function pearlId(taken) {
  let id;
  do id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); while (taken.has(id));
  return id;
}
// One saved pearl made whole, or null when it has no words. Who and the
// topic stay optional; a missing date is today.
function pearlClean(p) {
  if (!p || typeof p.t !== "string" || !p.t.trim()) return null;
  const s = v => typeof v === "string" ? v.trim() : "";
  return {id: typeof p.id === "string" && /^p[a-z0-9]{1,20}$/.test(p.id) ? p.id : "",
    d: PEARL_ISO.test(p.d) ? p.d : fmtDate(getToday()), t: p.t.trim().slice(0, PEARL_MAX),
    who: s(p.who).slice(0, PEARL_WHO_MAX), topic: s(p.topic).slice(0, 60),
    sent: PEARL_ISO.test(p.sent) ? p.sent : null, ts: s(p.ts)};
}
// A saved list made whole: blanks dropped, every id present and unique.
function pearlsClean(list) {
  const out = [], taken = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const p = pearlClean(raw);
    if (!p) continue;
    if (!p.id || taken.has(p.id)) p.id = pearlId(taken);
    taken.add(p.id);
    out.push(p);
  }
  return out;
}
const pearlsByDate = (a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0);
const pearlsNewest = list => list.slice().sort((a, b) => pearlsByDate(b, a));
const pearlsUnsent = list => list.filter(p => !p.sent);
function pearlTopicName(id) {
  const t = id && Guides.byId && Guides.byId[id];
  return t ? t.n : id || "";
}
// "Sat 10 Oct" for 2026-10-10 (app.js dayLabel).
const pearlDay = iso => dayLabel(iso);

// Newest first; every word must match the pearl, who said it, its topic or its date.
const pearlsScored = (list, q) => searchScored(pearlsNewest(list), q,
  p => [[searchHay(p.t + " " + p.who + " " + pearlTopicName(p.topic) + " " + p.d), 1]], {keep: true});
const pearlsSearch = (list, q) => pearlsScored(list, q).map(x => x.item);

// ---- The topic it's about ---------------------------------------------------------------------
// The words worth matching: three letters or more, or a two-letter
// abbreviation written in capitals (UC, HE), never a lowercase "he".
function pearlWords(text) {
  const toks = String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "").match(/[A-Za-z0-9]+/g) || [];
  const out = new Set();
  for (const tok of toks) {
    const w = tok.toLowerCase();
    if ((w.length >= 3 && !PEARL_STOP.has(w) && !/^\d+$/.test(w)) || /^[A-Z][A-Z0-9]$/.test(tok)) out.add(w);
  }
  return [...out];
}
// How strongly one word points at a topic: its name beats its keywords, a
// whole word beats the start of one, and a plural finds its singular.
function pearlHit(t, w) {
  const forms = [w];
  if (/ies$/.test(w)) forms.push(w.slice(0, -3) + "y"); else if (/s$/.test(w) && w.length >= 4) forms.push(w.slice(0, -1));
  let best = 0;
  for (const f of forms) {
    if (t.hay.name.includes(" " + f + " ")) return 3;
    if (t.hay.k.includes(" " + f + " ")) best = Math.max(best, 2);
    else if (f.length >= 5 && (t.hay.name.includes(" " + f) || t.hay.k.includes(" " + f))) best = Math.max(best, 1);
  }
  return best;
}
// Up to n Guides topics the pearl is most likely about. A word shared by
// many topics counts for less than one only a few topics use, and a guess
// well behind the best one isn't offered.
function pearlTopicGuess(text, topics, n = 3) {
  const words = pearlWords(text);
  if (!words.length || !topics || !topics.length) return [];
  const hits = words.map(w => topics.map(t => pearlHit(t, w)));
  const weight = hits.map(row => { const df = row.filter(Boolean).length; return df ? 1 + Math.log(topics.length / df) : 0; });
  const scored = topics.map((t, i) => ({t, i, score: hits.reduce((a, row, k) => a + row[i] * weight[k], 0)}));
  const best = Math.max(...scored.map(x => x.score));
  return scored.filter(x => x.score >= Math.max(4, best * .4)).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, n).map(x => x.t);
}

// ---- Patient details ----------------------------------------------------------------------------
// Anything the Endo number guard would remove (long digit runs, MRN, PHIN,
// date of birth), or a name after Mr, Mrs, Ms or Miss.
function pearlFlagged(text) {
  return scopeGuard(text).removed > 0 || /\b(?:Mr|Mrs|Ms|Miss|Mx)\.?\s+[A-Z][a-z]/.test(String(text || ""));
}

// ---- The file sent on ----------------------------------------------------------------------------
// Oldest first. Each pearl: "[id] date · topic", then its text with blank
// lines folded, so a blank line always means the next pearl.
function pearlsSendText(list, day) {
  const n = list.length;
  let out = `GI Hub pearls\nSent ${fmtDate(day)} · ${n} pearl${n === 1 ? "" : "s"}\n` +
    `Format: [id] date · topic, then the pearl. Who said it stays on the phone.\n`;
  for (const p of list.slice().sort(pearlsByDate)) {
    const body = p.t.split("\n").map(l => l.trim()).filter(Boolean).join("\n");
    out += `\n[${p.id}] ${p.d} · ${pearlTopicName(p.topic) || "No topic"}\n${body}\n`;
  }
  return out;
}
// gi-pearls-2026-10-12-1430.txt: two sends on one day never share a name.
function pearlFileName(now) {
  const pad = v => String(v).padStart(2, "0");
  return `gi-pearls-${fmtDate(now)}-${pad(now.getHours())}${pad(now.getMinutes())}.txt`;
}
