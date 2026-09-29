"use strict";
// GI Hub study questions: Royal College-style short-answer questions on the
// Mayo pages, three or four a night, answered before reading. The file,
// studyq.json, is encrypted, because this site is public: the phone decrypts
// it with a password typed once and kept on this phone only (never in the
// backup). tools/studyq/build.js writes the file from the private questions.
// Loaded after study.js and before study-view.js; the views use app.js
// helpers when they run.

const STUDYQ_KEY = "gi-studyq-v1";
const STUDYQ_FILE = "studyq.json";
// status: "idle" before the first check; "none" when there is no question
// file yet; "locked" with no password saved; "bad" when the saved or typed
// password doesn't open the file; "ready" once the questions are open.
const StudyQ = {
  status: "idle", list: [], pw: null, err: null, made: null,
  load() { try { const s = JSON.parse(localStorage.getItem(STUDYQ_KEY)); this.pw = s && typeof s.pw === "string" ? s.pw : null; } catch (e) { this.pw = null; } },
  save() { try { localStorage.setItem(STUDYQ_KEY, JSON.stringify({pw: this.pw})); } catch (e) {} },
  forget() { this.pw = null; this.list = []; this.status = "locked"; try { localStorage.removeItem(STUDYQ_KEY); } catch (e) {} },
};

const studyqB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
// PBKDF2-SHA256 to an AES-256-GCM key; the tag is the last 16 bytes of ct.
async function studyqDecrypt(enc, pw) {
  const subtle = crypto.subtle;
  const base = await subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
  const key = await subtle.deriveKey({name: "PBKDF2", salt: studyqB64(enc.salt), iterations: enc.iter, hash: "SHA-256"},
    base, {name: "AES-GCM", length: 256}, false, ["decrypt"]);
  const plain = await subtle.decrypt({name: "AES-GCM", iv: studyqB64(enc.iv)}, key, studyqB64(enc.ct));
  return JSON.parse(new TextDecoder().decode(plain));
}
// Only questions on pages the plan reads, each with its place in the run.
function studyqAccept(payload) {
  const out = [];
  for (const x of (payload && Array.isArray(payload.q) ? payload.q : [])) {
    const it = STUDY_BY_ID[x.item], i = studyPageIndex(x.page);
    if (!it || i < 0 || x.page < it.p[0] || x.page > it.p[1] || !x.q || !Array.isArray(x.a)) continue;
    out.push({...x, i});
  }
  return out.sort((a, b) => a.i - b.i || String(a.id).localeCompare(String(b.id)));
}
async function studyqOpen(enc, pw) {
  try {
    const payload = await studyqDecrypt(enc, pw);
    StudyQ.list = studyqAccept(payload); StudyQ.made = payload.made || null; StudyQ.status = "ready"; return true;
  } catch (e) { StudyQ.list = []; StudyQ.status = "bad"; return false; }
}
let studyqEnc = null;
async function studyqFetch() {
  try {
    const res = await fetch(STUDYQ_FILE, {cache: "no-cache"});
    if (!res.ok) return null;
    const enc = await res.json();
    return enc && enc.v === 1 && enc.ct ? enc : null;
  } catch (e) { return null; }
}
// Checks for the file and opens it with the saved password, then redraws
// the screens that show questions.
async function studyqInit() {
  StudyQ.load();
  const before = StudyQ.status + StudyQ.list.length;
  studyqEnc = await studyqFetch();
  if (!studyqEnc) StudyQ.status = "none";
  else if (!StudyQ.pw) StudyQ.status = "locked";
  else await studyqOpen(studyqEnc, StudyQ.pw);
  if (StudyQ.status + StudyQ.list.length !== before && typeof route !== "undefined" &&
      (route.page === "study" || route.page === "week") && !sheet && !studySheet) { route.keepScroll = true; render(); }
}
async function studyqUnlock(pw) {
  pw = String(pw || "").trim();
  if (!pw) { StudyQ.err = "Type the study password."; return false; }
  if (!studyqEnc) studyqEnc = await studyqFetch();
  if (!studyqEnc) { StudyQ.status = "none"; return false; }
  const ok = await studyqOpen(studyqEnc, pw);
  if (ok) { StudyQ.pw = pw; StudyQ.save(); StudyQ.err = null; }
  else { StudyQ.status = StudyQ.pw ? "bad" : "locked"; StudyQ.err = "That password didn't open the questions. Check it and try again."; }
  return ok;
}
// Questions on run indices [from, to).
const studyqFor = (from, to) => StudyQ.status === "ready" ? StudyQ.list.filter(x => x.i >= from && x.i < to) : [];
// Questions on pages already read, grouped by plan item, in reading order.
function studyqBank(cursor) {
  const by = new Map();
  for (const x of StudyQ.list) if (x.i < cursor) {
    if (!by.has(x.item)) by.set(x.item, []);
    by.get(x.item).push(x);
  }
  return [...by.entries()].map(([id, qs]) => ({item: STUDY_BY_ID[id], qs}));
}
