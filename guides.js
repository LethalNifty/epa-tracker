"use strict";
// GI Hub guides: the guideline library and the logic behind the Guides tab.
// guides.json is built from private sources by a script outside this
// repository and holds only titles, years, links and our own one-line notes;
// a weekly check adds new guidelines to it without an app update. Pure: no
// DOM and no Store. Loaded after study.js (blocks and Mayo chapters) and
// before guides-view.js.

const GUIDES_FILE = "guides.json";
const GUIDES_NEW_DAYS = 30;        // "New" means published online in the last 30 days
const GUIDES_OLD_YEARS = 10;       // a lead guideline this old is flagged as aging
// Yamada readings in the study plan, by the topics they cover.
const GUIDES_BY_ITEM = {y1: ["nutrition-support", "refeeding"], y2: ["short-bowel"], y3: ["peg"], y4: ["peg"]};
const GUIDES_FAMILY_LABEL = {consults: "Consults", hepatology: "Hepatology", motility: "Motility", radiology: "Radiology",
  endoscopy: "Endoscopy", pathology: "Pathology"};

// status: "idle" before the first check; "none" when there is no library
// yet (first open without signal); "ready" once it is loaded.
const Guides = {status: "idle", data: null, byId: {}};

// Checks the file's shape and indexes it. Returns false (and keeps whatever
// was loaded before) when the file isn't a library.
function guidesAccept(json) {
  if (!json || json.v !== 1 || !Array.isArray(json.topics) || !Array.isArray(json.sections)) return false;
  const secs = {}, byId = {};
  for (const s of json.sections) if (s && s.id) secs[s.id] = s;
  const topics = [];
  for (const t of json.topics) {
    if (!t || !t.id || !t.n || !secs[t.s] || byId[t.id]) continue;
    const doc = d => d && d.u && d.t && d.w ? d : null;
    const x = {id: t.id, s: t.s, n: t.n, k: t.k || "", note: t.note || "",
      ch: Array.isArray(t.ch) ? t.ch : [], fam: Array.isArray(t.fam) ? t.fam : [], bx: Array.isArray(t.bx) ? t.bx : [],
      p: (t.p || []).map(doc).filter(Boolean), a: (t.a || []).map(doc).filter(Boolean),
      c: (t.c || []).filter(c => c && c.t && c.u)};
    x.hay = guidesHay(x);
    byId[x.id] = x;
    topics.push(x);
  }
  if (!topics.length) return false;
  Guides.data = {checked: json.checked || null, sections: json.sections.filter(s => secs[s.id]), topics, secs};
  Guides.byId = byId;
  Guides.status = "ready";
  return true;
}

async function guidesFetch() {
  try {
    const res = await fetch(GUIDES_FILE, {cache: "no-cache"});
    return res.ok ? await res.json() : null;
  } catch (e) { return null; }
}
// Loads the library (the service worker answers from the network first, so a
// weekly update shows on the next open), then redraws: the bar's dot can
// change on any screen.
async function guidesInit() {
  const json = await guidesFetch();
  if (!guidesAccept(json) && Guides.status !== "ready") Guides.status = "none";
  if (typeof guidesRedraw === "function") guidesRedraw();
}

// ---- Search -------------------------------------------------------------------------
// Lower case, accents and punctuation off: "H. pylori" finds "h pylori",
// "Crohn's" finds "crohns".
function guidesNorm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
// Each topic's words, by how much a match there should count.
function guidesHay(t) {
  const docs = t.p.concat(t.a);
  return {
    name: " " + guidesNorm(t.n) + " ",
    k: " " + guidesNorm(t.k) + " ",
    docs: " " + guidesNorm(docs.map(d => d.w + " " + d.y + " " + d.t).join(" ") + " " + t.c.map(c => c.t).join(" ")) + " ",
    lead: " " + guidesNorm(t.p.map(d => d.w + " " + d.y).join(" ")) + " ",
    note: " " + guidesNorm(t.note) + " ",
  };
}
// Every word must match somewhere; a word at the start of a name or alias
// counts most. Ties keep the library's own order (section by section).
function guidesSearch(topics, q) {
  const words = guidesNorm(q).split(" ").filter(Boolean);
  if (!words.length) return topics.slice();
  const scored = [];
  topics.forEach((t, i) => {
    let score = 0;
    for (const w of words) {
      const at = (hay, weight) => hay.includes(" " + w) ? weight * 2 : hay.includes(w) ? weight : 0;
      const s = Math.max(at(t.hay.name, 6), at(t.hay.k, 4), at(t.hay.lead, 3), at(t.hay.docs, 1.5), at(t.hay.note, 1));
      if (!s) return;
      score += s;
    }
    if (t.hay.name.startsWith(" " + words.join(" "))) score += 20;
    scored.push({t, score, i});
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map(x => x.t);
}

// ---- This block --------------------------------------------------------------------------
// The Mayo chapters (and Yamada readings) the study plan puts in this block.
function guidesBlockReading(num) {
  const ids = (typeof STUDY_PLAN !== "undefined" && STUDY_PLAN[num]) || [];
  return {ch: ids.filter(id => id[0] === "c").map(id => +id.slice(1)), items: ids.filter(id => GUIDES_BY_ITEM[id])};
}
// Topics for this block: first what this block's reading covers, then what
// the rotation itself brings up.
function guidesForBlock(topics, num) {
  if (!num) return [];
  const {ch, items} = guidesBlockReading(num), fam = BLOCK_FAMILY[num];
  const fromItems = new Set(items.flatMap(id => GUIDES_BY_ITEM[id]));
  const reading = topics.filter(t => t.ch.some(c => ch.includes(c)) || fromItems.has(t.id));
  const rotation = topics.filter(t => !reading.includes(t) && t.fam.includes(fam));
  return reading.concat(rotation);
}
// Topics for one study item (a Mayo chapter or a Yamada reading).
function guidesForItem(topics, item) {
  if (!item) return [];
  if (GUIDES_BY_ITEM[item.id]) return GUIDES_BY_ITEM[item.id].map(id => topics.find(t => t.id === id)).filter(Boolean);
  return item.ch ? topics.filter(t => t.ch.includes(item.ch)) : [];
}

// ---- New, and how current the library is -------------------------------------------------
// Guidelines published online in the last 30 days, newest first, once each.
function guidesNews(topics, today) {
  const from = fmtDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - GUIDES_NEW_DAYS)), to = fmtDate(today);
  const seen = new Set(), out = [];
  for (const t of topics) for (const d of t.p.concat(t.a))
    if (d.d && d.d >= from && d.d <= to && !seen.has(d.k)) { seen.add(d.k); out.push({...d, topic: t}); }
  return out.sort((a, b) => (b.d > a.d ? 1 : b.d < a.d ? -1 : 0));
}
// News this phone hasn't been shown yet.
function guidesUnseen(news, seen) {
  const s = new Set(seen || []);
  return news.filter(n => !s.has(n.k));
}
// Each topic's lead guideline year, newest of its leads.
function guidesLeadYear(t) {
  return t.p.length ? Math.max(...t.p.map(d => d.y)) : null;
}
// The library at a glance: lead guidelines by year, Canadian or not.
function guidesFreshness(topics, today) {
  const year = today.getFullYear(), by = {};
  let recent = 0, old = 0, ca = 0, n = 0;
  for (const t of topics) {
    const y = guidesLeadYear(t);
    if (!y) continue;
    const isCa = t.p.some(d => d.ca);
    (by[y] ||= {all: 0, ca: 0}).all++;
    if (isCa) { by[y].ca++; ca++; }
    if (y >= year - 2) recent++;
    if (year - y >= GUIDES_OLD_YEARS) old++;
    n++;
  }
  const years = Object.keys(by).map(Number);
  return {by, n, recent, old, ca, from: Math.min(...years, year - 10), to: year};
}
