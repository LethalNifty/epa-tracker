"use strict";
// GI Hub reminders: the words a push notification shows. Shared by the
// service worker, which shows it, and the app, which previews the next one.
// A push says only what kind of reminder it is and when; the EPAs, shifts and
// names come from the brief the app keeps on this phone (remind.js).
const NOTE_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const NOTE_WEEK = 7 * 86400000;
const notePad = n => String(n).padStart(2, "0");
const noteHM = t => { const d = new Date(t); return notePad(d.getHours()) + ":" + notePad(d.getMinutes()); };
const noteWd = t => NOTE_DAYS[new Date(t).getDay()];
const noteLong = st => st.e - st.s > 24 * 3600000;

function noteSite(name, x) {
  if (!x || !x.att) return `${name}: attending not listed.`;
  return `${name}: ${x.att}${x.res ? " with " + x.res : ", no resident"}.`;
}
// An hour before a stretch: who's on at each site, sign-out, and when it ends.
function noteCall(st, now) {
  const seg = st.segs.find(x => x.e > now) || st.segs[0];
  const title = st.s <= now ? `On call now, off ${noteWd(st.e)} ${noteHM(st.e)}` :
    noteLong(st) ? `Weekend call from ${noteHM(st.s)}` : `On call from ${noteHM(st.s)}`;
  const parts = [noteSite("HSC", seg.hsc), noteSite("St. B", seg.stb)];
  if (seg.so) parts.push(`Sign-out from ${seg.so.replace(/\s+\+\s+/g, " and ")}.`);
  if (noteLong(st) && st.s > now) parts.push(`Off ${noteWd(st.e)} ${noteHM(st.e)}.`);
  return {title, body: parts.join(" "), tag: "gi-call-" + st.s, url: "./#call"};
}
// Thursday morning: the week's EPAs and any call that week.
function noteWeek(w, brief, now) {
  const today = new Date(now).toDateString() === new Date(w.start).toDateString();
  const due = w.rows.length ? "Due: " + w.rows.map(r => r.label + (r.n > 1 ? " ×" + r.n : "")).join(", ") + "."
    : "Nothing due this week. Log anything you get.";
  const calls = (brief.call || []).filter(st => st.s >= w.start && st.s < w.start + NOTE_WEEK);
  const call = calls.length ? " Call: " + calls.map(st => `${noteWd(st.s)} ${noteHM(st.s)}${noteLong(st) ? " (weekend)" : ""}`).join(", ") + "." : "";
  const lw = brief.study && brief.study.week, read = lw && (lw.read || lw.planned) ? ` Reading: ${lw.read} of ${lw.planned} pages last week.` : "";
  return {title: `Block ${w.block}, week ${w.week} of 4${today ? " starts today" : ""}`, body: due + call + read, tag: "gi-week-" + w.start, url: "./"};
}
// 20:00 on a reading night: tonight's Mayo pages, or that they're done.
// The brief carries tonight and the next 13 days, written out by study.js.
const NOTE_STUDY_GENERIC = {title: "Tonight's reading", body: "Open GI Hub for tonight's pages.", tag: "gi-study", url: "./#study"};
function noteStudy(brief, now) {
  const nights = brief && brief.study && brief.study.nights || [];
  const day = new Date(now), key = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const i = nights.findIndex(x => x.d === key), n = nights[i];
  if (!n) return NOTE_STUDY_GENERIC;
  const tag = "gi-study-" + key, url = "./#study";
  const nx = nights.slice(i + 1).find(x => x.kind === "read" && x.pp);
  const next = nx ? `Next: ${NOTE_DAYS[new Date(nx.d).getDay()]}, pp. ${nx.pp}.` : "";
  if (n.kind === "complete") return {title: "Mayo pass 1 is read", body: "All the pages are done. Questions next.", tag, url};
  if (n.kind === "read" && n.done) return {title: "Reading done for tonight", body: next || "Nothing more tonight.", tag, url};
  if (n.kind === "read" && n.pp) return {title: `Tonight: pp. ${n.pp}`, body: `${n.what}. ${n.n} page${n.n === 1 ? "" : "s"}.`, tag, url};
  if (n.kind === "ahead") return {title: "You're ahead of plan", body: "Tonight is free. " + (next || "Keep going in GI Hub if you like."), tag, url};
  if (n.kind === "pause") return {title: "Reading paused", body: "No pages tonight.", tag, url};
  return {title: "No reading tonight", body: next, tag, url};
}
// msg: {kind: "week" | "call" | "study" | "test", t, s?}; brief: what the app saved, or null.
function noticeFor(msg, brief, now) {
  const kind = msg && msg.kind, b = brief && brief.v === 1 ? brief : null;
  if (kind === "test")
    return {title: "GI Hub reminders are on", body: "Thursdays at 08:00: the week's EPAs. An hour before each call: who's on at each site. " +
      "20:00 on reading nights: tonight's pages.", tag: "gi-test", url: "./"};
  if (kind === "study") return b ? noteStudy(b, now) : NOTE_STUDY_GENERIC;
  if (kind === "call") {
    const list = b ? b.call || [] : [];
    const st = (msg.s && list.find(x => Math.abs(x.s - msg.s) < 60000)) || list.find(x => x.e > now && x.s - now < 3 * 3600000);
    return st ? noteCall(st, now) : {title: msg.s ? `On call from ${noteHM(msg.s)}` : "GI call soon",
      body: "Open GI Hub for who's on at each site.", tag: "gi-call", url: "./#call"};
  }
  if (kind === "week") {
    const w = b && (b.weeks || []).find(x => x.start <= now && now < x.start + NOTE_WEEK);
    return w ? noteWeek(w, b, now) : {title: "A new GI Hub week", body: "Open GI Hub for this week's EPAs.", tag: "gi-week", url: "./"};
  }
  return {title: "GI Hub", body: "Open GI Hub for this week.", tag: "gi-hub", url: "./"};
}
