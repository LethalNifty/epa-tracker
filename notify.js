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
const noteDay = t => { const d = new Date(t); return d.getFullYear() + "-" + notePad(d.getMonth() + 1) + "-" + notePad(d.getDate()); };
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
const noteDue = w => w.rows.map(r => r.label + (r.n > 1 ? " ×" + r.n : "")).join(", ");
// Last week's reading: of the Monday-to-Sunday weeks the app wrote, the one
// that ended before now. A brief from before those carries a single week.
function noteLastRead(s, now) {
  if (!s) return null;
  if (!s.weeks) return s.week || null;
  return s.weeks.find(x => x.start + NOTE_WEEK <= now && now < x.start + 2 * NOTE_WEEK) || null;
}
// Monday morning: the week's EPAs, call in the next seven days, last week's reading.
function noteWeek(w, brief, now) {
  const due = w.rows.length ? `Due: ${noteDue(w)}.` : "Nothing due this week. Log anything you get.";
  const calls = (brief.call || []).filter(st => st.s >= now && st.s < now + NOTE_WEEK);
  const call = calls.length ? " Call: " + calls.map(st => `${noteWd(st.s)} ${noteHM(st.s)}${noteLong(st) ? " (weekend)" : ""}`).join(", ") + "." : "";
  const lw = noteLastRead(brief.study, now), read = lw && (lw.read || lw.planned) ? ` Reading: ${lw.read} of ${lw.planned} pages last week.` : "";
  return {title: "This week's EPAs", body: `Block ${w.block}, week ${w.week}. ` + due + call + read, tag: "gi-week-" + now, url: "./"};
}
// Wednesday morning, the last day of each block week: what's still due, to ask for today.
function noteAsk(w) {
  const tag = "gi-ask-" + w.start, url = "./";
  if (!w.rows.length) return {title: "This week's EPAs are covered", body: `Nothing still due for block ${w.block}, week ${w.week}. Log anything extra you get.`, tag, url};
  return {title: "Ask for your EPAs today", body: `Last day of block ${w.block}, week ${w.week}. Still due: ${noteDue(w)}.`, tag, url};
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
  if (n.kind === "read" && n.pp) return {title: `Tonight: ${n.book ? n.book + " " : ""}pp. ${n.pp}`,
    body: `${n.what}. ${n.n} page${n.n === 1 ? "" : "s"}` + (n.qn ? `, then ${n.qn} question${n.qn === 1 ? "" : "s"}.` : "."), tag, url};
  if (n.kind === "skip") return {title: "Skipped tonight", body: next || "The pages move to the next reading night.", tag, url};
  if (n.kind === "ahead") return {title: "You're ahead of plan", body: "Tonight is free. " + (next || "Keep going in GI Hub if you like."), tag, url};
  if (n.kind === "pause") return {title: "Reading paused", body: "No pages tonight.", tag, url};
  return {title: "No reading tonight", body: next, tag, url};
}
// Sunday 17:00: the pearls still to send, or a nudge to catch this week's.
const NOTE_PEARLS_GENERIC = {title: "Pearls", body: "Open GI Hub to send this week's pearls.", tag: "gi-pearls", url: "./#pearls"};
function notePearls(brief, now) {
  const n = brief.pearls ? brief.pearls.unsent || 0 : 0;
  const day = new Date(now), tag = "gi-pearls-" + new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime(), url = "./#pearls";
  if (n) return {title: `${n} pearl${n === 1 ? "" : "s"} to send`, body: "Send them from GI Hub so they're in Drive for tonight's cards.", tag, url};
  return {title: "Any pearls this week?", body: "Catch them in GI Hub while you still remember.", tag, url};
}
// Events, from the brief's agenda (alertOccurrences). 30 minutes before: the title,
// the start and the note; one that arrives late says the minutes truly left. A
// start that moved after the sender last heard keeps the time the phone has now
// and drops the countdown. One that's gone, or a phone with no brief, still says when.
// One Claude added that GI Hub hasn't picked up yet: the sender's copy carries its title (w).
const noteWhat = o => o.s ? `${o.t} at ${o.s}` : `${o.t} (all day)`;
function noteEv(msg, brief, now) {
  const o = (brief && (brief.agenda || []).find(x => x.id === msg.id)) ||
    (typeof msg.w === "string" && msg.w && msg.s ? {t: msg.w, s: noteHM(msg.s), n: ""} : null);
  if (!o || !o.s) return {title: msg.s ? `Coming up at ${noteHM(msg.s)}` : "Coming up soon", body: "Open GI Hub's Agenda for what's on.",
    tag: "gi-ev", url: "./#agenda"};
  const left = msg.s && Number.isFinite(now) ? Math.round((msg.s - now) / 60000) : 30;
  const soon = msg.s && noteHM(msg.s) !== o.s ? "" : left >= 2 ? `In ${left} minutes.` : "Starting now.";
  return {title: noteWhat(o), body: [soon, o.n].filter(Boolean).join(" "), tag: "gi-ev-" + msg.id, url: "./#agenda"};
}
// 19:00 the evening before: tomorrow's events with that alert on, all day first.
// One that arrives after midnight (the phone was off at 19:00) says Today.
// Ones Claude added that GI Hub hasn't picked up yet come in the sender's copy (w).
function noteEve(msg, brief, now) {
  const day = msg.d && Number.isFinite(now) && noteDay(now) >= msg.d ? "Today" : "Tomorrow";
  const list = brief && msg.d ? (brief.agenda || []).filter(x => x.d === msg.d && x.eve) : [];
  for (const x of Array.isArray(msg.w) ? msg.w : [])
    if (x && typeof x.t === "string" && x.t && !list.some(y => String(y.id).split("@")[0] === x.id)) list.push({id: x.id, t: x.t, s: x.s || null, n: ""});
  if (!list.length) return {title: day + "'s agenda", body: "Open GI Hub's Agenda for what's on " + day.toLowerCase() + ".", tag: "gi-eve", url: "./#agenda"};
  list.sort((a, b) => ((a.s || "") > (b.s || "") ? 1 : (a.s || "") < (b.s || "") ? -1 : 0));
  const tag = "gi-eve-" + msg.d, url = "./#agenda";
  if (list.length === 1) return {title: day + ": " + noteWhat(list[0]), body: list[0].n || "", tag, url};
  return {title: `${day}: ${list.length} things`, body: list.map(noteWhat).join(", ") + ".", tag, url};
}
// A to-do at its time: its question, or the to-do and Did you do it. The
// answers wait in GI Hub (Week, or the to-do's sheet). One the phone hasn't
// picked up yet (Tell GI Hub) carries its words in the sender's copy, w and q.
function noteTodo(msg, brief) {
  const o = brief && (brief.agenda || []).find(x => x.id === msg.id && x.todo);
  const q = o ? o.q || "" : msg.q || "", t = o ? o.t : msg.w || "";
  return {title: q || t || "A to-do", body: (q ? "" : "Did you do it? ") + "Tap for Done, Tomorrow or Drop it.", tag: "gi-todo-" + (msg.id || ""), url: "./"};
}
// Claude filed what you said (Tell GI Hub): one thing names itself; several
// are counted, then listed. fin: something waits in GI Hub for you to finish.
function noteAdded(msg) {
  const lines = (Array.isArray(msg.lines) ? msg.lines : []).filter(x => typeof x === "string" && x);
  const more = Number.isInteger(msg.more) && msg.more > 0 ? msg.more : 0, fin = msg.fin ? "Open GI Hub to finish." : "";
  const tag = "gi-added-" + (msg.t || 0), url = "./";
  if (!lines.length) return {title: "Claude filed what you said", body: fin || "Open GI Hub to see it.", tag, url};
  if (lines.length === 1 && !more) return {title: "Added: " + lines[0], body: fin, tag, url};
  return {title: `Added ${lines.length + more} things`, body: lines.join(". ") + (more ? `, and ${more} more` : "") + "." + (fin ? " " + fin : ""), tag, url};
}
// msg: {kind: "week" | "ask" | "call" | "study" | "pearls" | "ev" | "eve" | "todo" | "added" | "test", t, s?, d?, id?, w?, q?, lines?, more?, fin?};
// brief: what the app saved, or null.
function noticeFor(msg, brief, now) {
  const kind = msg && msg.kind, b = brief && brief.v === 1 ? brief : null;
  if (kind === "test")
    return {title: "GI Hub reminders are on", body: "Mondays at 08:00: the week's EPAs. Wednesdays at 08:00: what's still due, to ask for. " +
      "An hour before each call: who's on at each site. 20:00 on reading nights: tonight's pages. Sundays at 17:00: pearls to send. " +
      "Events: 19:00 the evening before, and 30 minutes before.", tag: "gi-test", url: "./"};
  if (kind === "ev") return noteEv(msg, b, now);
  if (kind === "eve") return noteEve(msg, b, now);
  if (kind === "todo") return noteTodo(msg, b);
  if (kind === "added") return noteAdded(msg);
  if (kind === "study") return b ? noteStudy(b, now) : NOTE_STUDY_GENERIC;
  if (kind === "pearls") return b ? notePearls(b, now) : NOTE_PEARLS_GENERIC;
  if (kind === "call") {
    const list = b ? b.call || [] : [];
    const st = (msg.s && list.find(x => Math.abs(x.s - msg.s) < 60000)) || list.find(x => x.e > now && x.s - now < 3 * 3600000);
    return st ? noteCall(st, now) : {title: msg.s ? `On call from ${noteHM(msg.s)}` : "GI call soon",
      body: "Open GI Hub for who's on at each site.", tag: "gi-call", url: "./#call"};
  }
  if (kind === "week" || kind === "ask") {
    const w = b && (b.weeks || []).find(x => x.start <= now && now < x.start + NOTE_WEEK);
    if (w) return kind === "week" ? noteWeek(w, b, now) : noteAsk(w);
    return kind === "week" ? {title: "This week's EPAs", body: "Open GI Hub for this week's EPAs.", tag: "gi-week", url: "./"}
      : {title: "Ask for your EPAs today", body: "Open GI Hub for what's still due this week.", tag: "gi-ask", url: "./"};
  }
  return {title: "GI Hub", body: "Open GI Hub for this week.", tag: "gi-hub", url: "./"};
}
// The icon badge: forms worth chasing that passed 14 days since GI Hub was last
// open (the brief's chase and seen, from remind.js). Opening the app clears it.
function badgeCount(brief, now) {
  const seen = (brief && brief.seen) || 0;
  return ((brief && brief.chase) || []).filter(t => t > seen && t <= now).length;
}
