"use strict";
// GI Hub call: the call schedule read from the .ics file made for each block,
// who is on at HSC and St. Boniface, and the Call card and screen.
// Names and paging numbers live on this phone only, under their own key: never
// in the EPA backup, the code, the tests or the repository.
// Loaded after coach.js and before app.js. The views use app.js helpers (esc,
// ic, DAYS, showToast, render) when they run, never while this file loads.

const CALL_KEY = "gi-call-v1";
const HOUR_MS = 3600000;
// [key, short name, full name, the site's part of the X-GI-CALL-* field names]
const CALL_SITES = [["hsc", "HSC", "HSC", "HSC"], ["stb", "St. B", "St. Boniface", "STB"]];
const CALL_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ---- Reading .ics files --------------------------------------------------------
// A line that starts with a space or tab continues the line before (RFC 5545
// 3.1). Folds are joined on the raw bytes, before decoding, so a fold that
// splits a multi-byte character (é, ’) still decodes cleanly.
function icsText(bytes) {
  const out = new Uint8Array(bytes.length);
  let n = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 13 && bytes[i + 1] === 10 && (bytes[i + 2] === 32 || bytes[i + 2] === 9)) { i += 2; continue; }
    if (bytes[i] === 10 && (bytes[i + 1] === 32 || bytes[i + 1] === 9)) { i += 1; continue; }
    out[n++] = bytes[i];
  }
  return new TextDecoder("utf-8").decode(out.subarray(0, n));
}
function icsLines(text) {
  return String(text).replace(/^﻿/, "").replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "")
    .split("\n").filter(l => l.trim());
}
// NAME;PARAM=value;PARAM="quoted; value":value
function icsProp(line) {
  const n = line.length;
  let j = 0;
  while (j < n && line[j] !== ";" && line[j] !== ":") j++;
  const prop = {name: line.slice(0, j).trim().toUpperCase(), params: {}, value: ""};
  while (line[j] === ";") {
    let k = ++j;
    while (k < n && !"=;:".includes(line[k])) k++;
    const key = line.slice(j, k).toUpperCase(), vals = [];
    if (line[k] === "=") {
      do {
        k++;
        if (line[k] === '"') {
          const q = line.indexOf('"', k + 1), end = q < 0 ? n : q;
          vals.push(line.slice(k + 1, end)); k = end + 1;
        } else {
          let m = k;
          while (m < n && !";:,".includes(line[m])) m++;
          vals.push(line.slice(k, m)); k = m;
        }
      } while (line[k] === ",");
    }
    prop.params[key] = vals.join(",");
    j = k;
  }
  if (line[j] !== ":") return null;
  prop.value = line.slice(j + 1);
  return prop;
}
// TEXT values escape \\ \; \, and line breaks as \n (RFC 5545 3.3.11).
function icsUnescape(v) {
  return String(v).replace(/\\([\\;,:nN])/g, (m, c) => c === "n" || c === "N" ? "\n" : c);
}
// DTSTART;TZID=America/Winnipeg:20261007T170000 is read as this phone's own
// local time (the phone is in Winnipeg). A trailing Z is UTC; a bare date is
// local midnight.
function icsTime(p) {
  const m = p && /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/i.exec(p.value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(v => +(v || 0));
  const t = m[7] ? Date.UTC(y, mo - 1, d, h, mi, s) : new Date(y, mo - 1, d, h, mi, s).getTime();
  return isNaN(t) ? null : t;
}
// DURATION, for an event with no DTEND: days count on the clock, hours exactly.
function icsEnd(start, v) {
  const m = /^\+?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(String(v || "").trim());
  if (!m || !m.slice(1).some(Boolean)) return null;
  const [w, d, h, mi, s] = m.slice(1).map(x => +(x || 0));
  const t = new Date(start);
  t.setDate(t.getDate() + w * 7 + d);
  return t.getTime() + ((h * 60 + mi) * 60 + s) * 1000;
}
// Components nest (VCALENDAR > VEVENT > VALARM) and each keeps its own
// properties, so an alarm's DESCRIPTION never lands on its event.
function parseICS(src) {
  const stack = [], events = [];
  let calendar = false;
  for (const line of icsLines(src)) {
    const p = icsProp(line);
    if (!p) continue;
    if (p.name === "BEGIN") {
      const type = p.value.trim().toUpperCase();
      if (type === "VCALENDAR") calendar = true;
      stack.push({type, props: {}});
    } else if (p.name === "END") {
      const type = p.value.trim().toUpperCase();
      if (!stack.some(c => c.type === type)) continue;
      for (let c = stack.pop(); ; c = stack.pop()) {
        if (c.type === "VEVENT") events.push(c.props);
        if (c.type === type) break;
      }
    } else if (stack.length) {
      const props = stack[stack.length - 1].props;
      if (!(p.name in props)) props[p.name] = p;
    }
  }
  return {calendar, events};
}
const CALL_NONE = /^(none|nil|n\/a|-+)$/i;
// Each VEVENT carrying X-GI-CALL-* fields is one shift. A resident of "none"
// means no resident that shift; the sign-out line is sometimes left out.
function icsShifts(src) {
  const cal = parseICS(src);
  if (!cal.calendar) return {ok: false, error: "That file isn't a calendar. Pick the .ics call file for your block."};
  const shifts = [], cancelled = [];
  let skipped = 0;
  for (const ev of cal.events) {
    if (!Object.keys(ev).some(k => k.startsWith("X-GI-CALL-"))) continue;
    const text = k => ev[k] ? icsUnescape(ev[k].value).replace(/\s+/g, " ").trim() : "";
    const who = k => { const v = text(k); return v && !CALL_NONE.test(v) ? v : null; };
    const s = icsTime(ev.DTSTART), uid = text("UID") || "start-" + s;
    if (/^cancel/i.test(text("STATUS"))) { cancelled.push(uid); continue; }
    const e = ev.DTEND ? icsTime(ev.DTEND) : s !== null && ev.DURATION ? icsEnd(s, ev.DURATION.value) : null;
    if (s === null || e === null || e <= s) { skipped++; continue; }
    const shift = {uid, s, e, so: who("X-GI-CALL-SIGNOUT")};
    for (const [key, , , tag] of CALL_SITES)
      shift[key] = {att: who(`X-GI-CALL-${tag}-ATTENDING`), res: who(`X-GI-CALL-${tag}-RESIDENT`)};
    shifts.push(shift);
  }
  if (!shifts.length && !cancelled.length)
    return {ok: false, error: skipped ? "The shifts in that file have no readable times." :
      "No GI call shifts in that file. Pick your block's call file (GI-Call-Block4.ics, for example)."};
  return {ok: true, shifts, cancelled, skipped};
}
// Merges by UID, so importing a block again updates it instead of doubling
// it. A shift the new file no longer has, inside the dates that file covers,
// was traded away and goes; so does any shift the file marks cancelled.
function callMerge(prev, parsed) {
  const shifts = {...prev}, out = {shifts, added: 0, changed: 0, removed: 0};
  const inFile = new Set(parsed.shifts.map(x => x.uid));
  if (parsed.shifts.length) {
    const lo = Math.min(...parsed.shifts.map(x => x.s)), hi = Math.max(...parsed.shifts.map(x => x.e));
    for (const uid in shifts)
      if (!inFile.has(uid) && shifts[uid].s >= lo && shifts[uid].s < hi) { delete shifts[uid]; out.removed++; }
  }
  for (const x of parsed.shifts) {
    if (!shifts[x.uid]) out.added++;
    else if (JSON.stringify(shifts[x.uid]) !== JSON.stringify(x)) out.changed++;
    shifts[x.uid] = x;
  }
  for (const uid of parsed.cancelled) if (shifts[uid] && !inFile.has(uid)) { delete shifts[uid]; out.removed++; }
  return out;
}

// ---- Saved on this phone ---------------------------------------------------------
const callBlank = () => ({v: 1, shifts: {}, nums: {hsc: "", stb: ""}, last: null});
const CallStore = {
  state: callBlank(),
  load() {
    try {
      const s = JSON.parse(localStorage.getItem(CALL_KEY));
      if (s && s.v === 1 && s.shifts && typeof s.shifts === "object")
        this.state = {v: 1, shifts: s.shifts, nums: {hsc: "", stb: "", ...s.nums}, last: s.last || null};
    } catch (e) {}
  },
  save() { try { localStorage.setItem(CALL_KEY, JSON.stringify(this.state)); } catch (e) {} },
  snapshot() { return JSON.parse(JSON.stringify(this.state)); },
  isEmpty() { return !Object.keys(this.state.shifts).length && !this.state.nums.hsc && !this.state.nums.stb; },
  // Clearing removes the key itself, so nothing is left behind on the phone.
  clear() { this.state = callBlank(); try { localStorage.removeItem(CALL_KEY); } catch (e) {} },
  restore(s) { this.state = s; if (this.isEmpty()) this.clear(); else this.save(); },
  list() { return Object.values(this.state.shifts).sort((a, b) => a.s - b.s); },
  setNum(site, v) { this.state.nums[site] = String(v).slice(0, 40); this.save(); },
};

// ---- Shifts, stretches and time ---------------------------------------------------
// Back-to-back shifts (a weekend runs Fri 1700 to Sat 0800 to Sun 0800 to
// Mon 0800) read as one stretch.
function callStretches(shifts) {
  const out = [];
  for (const x of shifts.slice().sort((a, b) => a.s - b.s)) {
    const last = out[out.length - 1];
    if (last && x.s <= last.e + 60000) { last.segs.push(x); last.e = Math.max(last.e, x.e); }
    else out.push({s: x.s, e: x.e, segs: [x]});
  }
  return out;
}
// cur: the stretch under way; seg: its shift on now; up: stretches still to
// come. Stretches that are over are dropped.
function callStatus(shifts, now) {
  const left = callStretches(shifts).filter(st => st.e > now);
  const cur = left[0] && left[0].s <= now ? left[0] : null;
  const up = left.filter(st => st.s > now);
  return {cur, seg: cur ? cur.segs.find(x => x.e > now) : null, next: up[0] || null, up, has: shifts.length > 0};
}
function callNow() { return window.__now ? +window.__now : window.__today ? +window.__today : Date.now(); }
const callPad = n => String(n).padStart(2, "0");
function callHM(t) { const d = new Date(t); return callPad(d.getHours()) + ":" + callPad(d.getMinutes()); }
function callDay(t) { const d = new Date(t); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; }
const callWd = t => DAYS[new Date(t).getDay()];
// "17:00 → 08:00" overnight; the end day is named once a stretch runs longer.
function callRange(s, e) { return callHM(s) + " → " + (e - s > 16 * HOUR_MS ? callWd(e) + " " : "") + callHM(e); }
function callHours(s, e) { return Math.round((e - s) / HOUR_MS); }
function callSpan(ms) {
  const min = Math.max(1, Math.ceil(ms / 60000)), d = Math.floor(min / 1440), h = Math.floor(min % 1440 / 60), m = min % 60;
  return d ? `${d} d${h ? " " + h + " h" : ""}` : h ? `${h} h${m ? " " + m + " min" : ""}` : `${m} min`;
}
function callTitle(st) {
  const s = new Date(st.s), hrs = (st.e - st.s) / HOUR_MS;
  let weekend = false;
  for (let t = st.s; t < st.e; t += HOUR_MS) { const g = new Date(t).getDay(); if (g === 0 || g === 6) weekend = true; }
  if (hrs > 24 && weekend) return hrs > 70 ? "Long weekend" : "Weekend";
  if (hrs <= 18 && s.getHours() >= 12) return CALL_WEEKDAYS[s.getDay()] + " night";
  return CALL_WEEKDAYS[s.getDay()] + " " + Math.round(hrs) + " h";
}
// A tel: link for a saved number, or null if it has too few digits to dial.
function callTel(num) {
  const t = String(num || "").replace(/[^\d+*#,;]/g, "");
  return (t.match(/\d/g) || []).length >= 3 ? "tel:" + t.replace(/#/g, "%23") : null;
}
const callMidnight = t => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };

// ---- Import ----------------------------------------------------------------------------
let callError = null, callTimer = null, callKey = "";
function callImport(src, name) {
  const parsed = icsShifts(src);
  if (!parsed.ok) { callError = parsed.error; return parsed; }
  callError = null;
  const before = CallStore.snapshot(), first = !Object.keys(before.shifts).length;
  const m = callMerge(CallStore.snapshot().shifts, parsed), n = parsed.shifts.length;
  CallStore.state.shifts = m.shifts;
  CallStore.state.last = {at: new Date(callNow()).toISOString(), file: String(name || "").slice(0, 80), n};
  CallStore.save();
  const msg = first ? `Imported ${n} call shift${n === 1 ? "" : "s"}` :
    !m.added && !m.changed && !m.removed ? "Call schedule already up to date" :
    "Call schedule updated: " + [m.added && `${m.added} new`, m.changed && `${m.changed} changed`,
      m.removed && `${m.removed} removed`].filter(Boolean).join(", ");
  showToast(msg, () => CallStore.restore(before));
  return {ok: true, added: m.added, changed: m.changed, removed: m.removed};
}
// No accept filter on the picker: iOS greys out .ics files in some Files
// locations (Google Drive among them) when one is set. The contents are
// checked instead.
function callFileInput() { return `<input type="file" id="callfile" hidden>`; }
function callReadFile(f) {
  if (!f) return;
  const done = text => { callImport(text, f.name); route.keepScroll = true; render(); };
  const fail = () => { callError = "Couldn't read that file. Try again."; route.keepScroll = true; render(); };
  if (typeof f.arrayBuffer === "function") f.arrayBuffer().then(b => done(icsText(new Uint8Array(b))), fail);
  else { const rd = new FileReader(); rd.onload = () => done(icsText(new Uint8Array(rd.result))); rd.onerror = fail; rd.readAsArrayBuffer(f); }
}
// Numbers save as they are typed; leaving the field confirms it.
// Under each number: Saved once it can be dialled. A half-typed number shows
// nothing until you leave the field, then says what's wrong.
function callNumStatus(v, typing) {
  if (!v) return "";
  if (callTel(v)) return `${ic("check")}Saved`;
  return typing ? "" : "Not a phone number. Use digits, and a comma to pause.";
}
function callShowStatus(site, v, typing) {
  const el = document.getElementById("numstat-" + site);
  if (!el) return;
  el.innerHTML = callNumStatus(v, typing);
  el.className = "numstat" + (v && !callTel(v) && !typing ? " bad" : "");
}
function callField(t) {
  const site = t.dataset && t.dataset.callnum;
  if (!site) return false;
  CallStore.setNum(site, t.value.trim());
  callShowStatus(site, t.value.trim(), true);
  return true;
}
function callNumDone(t) {
  const site = t.dataset.callnum, v = t.value.trim();
  CallStore.setNum(site, v);
  callShowStatus(site, v, false);
  // Tapping the other field fires this first: redraw only once no field has
  // the keyboard, so the keyboard stays up while moving between them.
  setTimeout(() => {
    const a = document.activeElement;
    if (!(a && a.tagName === "INPUT")) { route.keepScroll = true; render(); }
  }, 0);
}

// ---- The trace: one tick per hour ---------------------------------------------------
// Like the dial's one tick per observation. Call hours stand tall in white
// light, hours already gone dim, and the stretch you are on glows mucosa red.
// Midnight and noon ticks stand a little taller, like a ruler.
function callTraceSVG(from, days, now, stretches, live) {
  const hours = days * 24, f0 = from.getTime();
  const f1 = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days).getTime();
  let t = "";
  for (let h = 0; h < hours; h++) {
    const a = new Date(from.getFullYear(), from.getMonth(), from.getDate(), h).getTime(), mid = a + HOUR_MS / 2;
    const st = stretches.find(x => x.s <= mid && mid < x.e), past = a + HOUR_MS <= now, x = h * 2 + 1;
    const cls = st ? "on" + (past ? " past" : live && st.s === live.s ? " live" : "") : past ? "past" : "";
    const y1 = st ? 2 : h % 24 === 0 ? 11 : h % 12 === 0 ? 15 : 18;
    t += `<line${cls ? ` class="${cls}"` : ""} x1="${x}" y1="${y1}" x2="${x}" y2="24"/>`;
  }
  const p = (now - f0) / (f1 - f0) * 100;
  return `<svg viewBox="0 0 ${hours * 2} 24" preserveAspectRatio="none" aria-hidden="true">${t}</svg>` +
    (p >= 0 && p < 100 ? `<span class="tr-now${live ? " live" : ""}" style="left:${p.toFixed(2)}%"></span>` : "");
}
function callBar(from, days, now, stretches, live) {
  return `<div class="tr-bar" data-from="${from.getTime()}" data-days="${days}">${callTraceSVG(from, days, now, stretches, live)}</div>`;
}
function callTraceHTML(from, days, now, stretches, live) {
  const today = fmtDate(new Date(now));
  const lab = Array.from({length: days}, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    return `<span${fmtDate(d) === today ? ` class="today"` : ""}>${DAYS[d.getDay()]} ${d.getDate()}</span>`;
  }).join("");
  return `<div class="trace">${callBar(from, days, now, stretches, live)}<div class="tr-days mono">${lab}</div></div>`;
}

// ---- Views -------------------------------------------------------------------------
const callWho = v => v ? esc(v) : `<span class="none">Not listed</span>`;
function callSitesHTML(seg) {
  return `<div class="sites">` + CALL_SITES.map(([k, short, full]) => {
    const w = seg[k] || {}, tel = callTel(CallStore.state.nums[k]);
    return `<div class="site"><div class="site-h mono">${full}</div>` +
      `<div class="who"><span class="role mono">Attending</span><b>${callWho(w.att)}</b></div>` +
      `<div class="who"><span class="role mono">Resident</span>${w.res ? `<b>${esc(w.res)}</b>` : `<span class="none">No resident</span>`}</div>` +
      (tel ? `<a class="btn callbtn" href="${tel}">${ic("phone")}Call ${short}</a>`
        : `<button class="btn callbtn ghost" data-action="callsetup" data-site="${k}">${ic("plus")}Add number</button>`) + `</div>`;
  }).join("") + `</div>`;
}
// "Fellow A (HSC) + Fellow B (St B)" becomes one name per site.
function callSignout(so) {
  return so.split(/\s+\+\s+|\s*;\s*|\s+&\s+/).filter(Boolean).map(x => {
    const m = /^(.*?)\s*\(([^)]+)\)$/.exec(x.trim());
    return m ? `<span class="so">${esc(m[1])}<i class="mono">${esc(m[2])}</i></span>` : `<span class="so">${esc(x.trim())}</span>`;
  }).join("");
}
function callLiveHTML(cs, now, where) {
  const {cur, seg} = cs, then = cur.segs[cur.segs.indexOf(seg) + 1];
  const off = `${callWd(cur.e)} ${callHM(cur.e)}`;
  let h = `<section class="callnow" aria-label="On call now, off ${callDay(cur.e)} at ${callHM(cur.e)}"><div class="callnow-in">` +
    `<div class="ov mono"><span class="live-tag"><i></i>On call now</span><span>Off ${off}</span></div>` +
    `<div class="cn-big"><b data-until="${cur.e}">${callSpan(cur.e - now)}</b>left</div>` +
    `<div class="cn-sub">${callTitle(cur)} · ${callDay(cur.s)} · ${callRange(cur.s, cur.e)}</div>` +
    callTraceHTML(callMidnight(cur.s), 7, now, callStretches(CallStore.list()), cur) + callSitesHTML(seg);
  const rows = [];
  if (seg.so) rows.push(`<div class="cn-row"><span class="k mono">Sign-out ${callHM(seg.s)}</span><span class="v">${callSignout(seg.so)}</span></div>`);
  if (then) rows.push(`<div class="cn-row"><span class="k mono">Then ${callWd(then.s)} ${callHM(then.s)}</span><span class="v">` +
    CALL_SITES.map(([k, short]) => `<span class="so">${callWho(then[k].att)}<i class="mono">${short}</i></span>`).join("") + `</span></div>`);
  if (rows.length) h += `<div class="cn-rows">${rows.join("")}</div>`;
  if (where === "week") h += `<button class="cn-link" data-action="callopen"><span>${cs.next ?
    `Next call ${callDay(cs.next.s)}, ${callHM(cs.next.s)}` : "All call shifts"}</span>${ic("forward", "sm")}</button>`;
  return h + `</div></section>`;
}
function callInviteHTML(msg, btn, head, meta) {
  return `<section class="sec"><div class="sec-head"><h2>${head || "Call"}</h2><span class="mono">${meta || "HSC · St. Boniface"}</span></div>` +
    `<div class="card callinvite">${ic("phone")}<p>${msg}</p>` +
    `<button class="btn" data-action="callimport">${ic("download")}${btn}</button>${callFileInput()}` +
    (callError ? `<div class="err" role="alert">${esc(callError)}</div>` : "") + `</div></section>`;
}
// The Week tab's card when you are not on call: the next stretch with a
// countdown, the week ahead as a trace, then the few stretches after it.
function callCardHTML(cs, now) {
  if (!cs.has) return callInviteHTML("Import your block's call file to see your next shift and who's on at each site.", "Import call schedule");
  if (!cs.next) return callInviteHTML("No call left in the schedule you imported.", "Import the next block");
  const nx = cs.next, first = nx.segs[0], rest = cs.up.slice(1, 4), more = cs.up.length - 1 - rest.length;
  let h = `<section class="sec"><div class="sec-head"><h2>Call</h2><span class="mono">Next in <b data-until="${nx.s}">${callSpan(nx.s - now)}</b></span></div>` +
    `<div class="card callcard"><button class="cx" data-action="callopen">` +
    `<span class="cx-top mono"><span>${callDay(nx.s)} · ${callRange(nx.s, nx.e)}</span><span>${callHours(nx.s, nx.e)} h</span></span>` +
    `<span class="cx-title">${callTitle(nx)}</span>` +
    `<span class="cx-who">${CALL_SITES.map(([k, short]) => `<span><i>${short}</i>${callWho(first[k].att)}</span>`).join("")}</span>` +
    (nx.segs.length > 1 ? `<span class="cx-note">${nx.segs.length} shifts back to back. Tap for who's on each.</span>` : "") +
    `</button>` + callTraceHTML(callMidnight(now), 7, now, callStretches(CallStore.list()), null) + callHintHTML(nx);
  if (rest.length) h += `<div class="xlist">` + rest.map(st => `<button class="xrow" data-action="callopen">` +
    `<span class="xd mono">${callDay(st.s)}</span><span class="xt">${callRange(st.s, st.e)}</span>` +
    `<span class="xh mono${st.e - st.s > 24 * HOUR_MS ? " long" : ""}">${callHours(st.s, st.e)} h</span></button>`).join("") + `</div>`;
  return h + `<button class="cx-all" data-action="callopen"><span>${more > 0 ? `${more} more, plus contacts and numbers` :
    "All shifts, contacts and numbers"}</span>${ic("forward", "sm")}</button></div></section>`;
}
// What the numbers are for, said before the shift that uses them.
function callHintHTML(nx) {
  const when = `${callWd(nx.s)} ${callHM(nx.s)}`, n = CALL_SITES.filter(([k]) => callTel(CallStore.state.nums[k])).length;
  return `<p class="cx-hint">${ic("phone")}<span>` + (n === CALL_SITES.length
    ? `From ${when}, the top of Week shows who's on, with a Call button for HSC and St. Boniface.`
    : `From ${when}, the top of Week shows who's on at each site. Save the paging numbers to get a Call button for each.`) +
    `</span></p>`;
}
function callSegHTML(x, many) {
  return `<div class="cseg"><div class="cseg-when mono">${many ? `${callWd(x.s)} ${callHM(x.s)} → ${callWd(x.e)} ${callHM(x.e)}` : callRange(x.s, x.e)}</div>` +
    CALL_SITES.map(([k, short]) => `<div class="cseg-site"><span class="mono">${short}</span><span>${callWho(x[k].att)}</span>` +
      `<span class="res">${x[k].res ? esc(x[k].res) : "No resident"}</span></div>`).join("") +
    (x.so ? `<div class="cseg-so"><span class="mono">Sign-out</span><span class="v">${callSignout(x.so)}</span></div>` : "") + `</div>`;
}
// Thursday to Wednesday rows, like the blocks, from this week to the last shift.
function callWeeksHTML(all, now, lastEnd, live) {
  const d = callMidnight(now), thu = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() + 3) % 7);
  const rows = Math.min(6, Math.max(1, Math.ceil((lastEnd - thu.getTime()) / (7 * DAY_MS))));
  let h = `<section class="sec"><div class="sec-head"><h2>By week</h2><span class="mono">Thu to Wed</span></div><div class="card weeks">` +
    `<div class="wk-days mono"><span></span>${["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"].map(x => `<span>${x}</span>`).join("")}</div>`;
  for (let r = 0; r < rows; r++) {
    const from = new Date(thu.getFullYear(), thu.getMonth(), thu.getDate() + r * 7);
    h += `<div class="wk-row${r === 0 ? " cur" : ""}"><span class="wk-lbl mono">${MONTHS[from.getMonth()]} ${from.getDate()}</span>` +
      callBar(from, 7, now, all, live) + `</div>`;
  }
  return h + `</div></section>`;
}
function callNumbersHTML() {
  const field = ([k, , full]) => {
    const v = CallStore.state.nums[k], bad = v && !callTel(v);
    return `<label class="lbl mono">${full}<input type="tel" inputmode="tel" autocomplete="off" data-callnum="${k}" ` +
      `value="${esc(v)}" placeholder="Paging or locating number"${bad ? ` aria-invalid="true"` : ""}></label>` +
      `<div class="numstat${bad ? " bad" : ""}" id="numstat-${k}" aria-live="polite">${callNumStatus(v, false)}</div>`;
  };
  return `<section class="sec"><div class="sec-head"><h2>Paging numbers</h2><span class="mono">One per site</span></div>` +
    `<div class="card pad callnums">${CALL_SITES.map(field).join("")}` +
    `<p class="numhint">During a shift, each site gets a Call button that dials its number.</p></div></section>`;
}
const callLastImport = () => { const l = CallStore.state.last;
  return l ? `Imported ${MONTHS[new Date(l.at).getMonth()]} ${new Date(l.at).getDate()}` : "Nothing imported"; };
// withImport is false when the screen already leads with an import button.
function callScheduleHTML(withImport) {
  const last = CallStore.state.last;
  return `<section class="sec"><div class="sec-head"><h2>${withImport ? "Schedule" : "Your call data"}</h2><span class="mono">${callLastImport()}</span></div>` +
    `<div class="card pad">` + (withImport ? `<button class="btn" data-action="callimport">${ic("download")}Import call schedule</button>${callFileInput()}` +
    (callError ? `<div class="err" role="alert">${esc(callError)}</div>` : "") : "") +
    `<p class="cnote${withImport ? "" : " first"}">${last && last.file ? `Last file: <b>${esc(last.file)}</b>. ` : ""}Pick your block's call file from Files. ` +
    `Importing a block again updates it.</p>` +
    (CallStore.isEmpty() ? "" : `<button class="btn danger" data-action="callclear">Clear call data</button>`) +
    `<p class="bnote mono">Names and numbers stay on this phone</p></div></section>`;
}
function viewCall() {
  const now = callNow(), list = CallStore.list(), cs = callStatus(list, now), all = callStretches(list);
  const back = {week: "This week", epas: "EPAs", plan: "Plan", biopsy: "Biopsy"}[route.from] || "This week";
  const left = (cs.cur ? [cs.cur] : []).concat(cs.up);
  const hrs = left.reduce((a, st) => a + st.e - Math.max(st.s, now), 0) / HOUR_MS;
  let h = `<header class="ph"><button class="back" data-action="back">${ic("back")}${back}</button>` +
    `<p class="eyebrow mono">GI call · HSC and St. Boniface</p><h1 class="title">Call</h1>` +
    (left.length ? `<div class="ph-meta mono"><b>${left.length}</b> shift${left.length === 1 ? "" : "s"} left · <b>${Math.round(hrs)}</b> hours</div>` : "") +
    `</header>`;
  if (cs.cur) h += callLiveHTML(cs, now, "call");
  if (left.length) {
    h += callWeeksHTML(all, now, left[left.length - 1].e, cs.cur);
    if (cs.up.length) h += `<section class="sec"><div class="sec-head"><h2>${cs.cur ? "After this" : "Upcoming"}</h2>` +
      `<span class="mono">${cs.up.length} shift${cs.up.length === 1 ? "" : "s"}</span></div>` +
      cs.up.map((st, i) => `<article class="cst${i === 0 ? " next" : ""}"><div class="cst-top mono"><span>${callDay(st.s)}` +
        `${st.e - st.s > 16 * HOUR_MS ? " → " + callDay(st.e) : ""}</span><span>${callHours(st.s, st.e)} h</span></div>` +
        `<h3><span>${callTitle(st)}</span>${i === 0 ? `<span class="tag wli">In <b data-until="${st.s}">${callSpan(st.s - now)}</b></span>` : ""}</h3>` +
        st.segs.map(x => callSegHTML(x, st.segs.length > 1)).join("") + `</article>`).join("") + `</section>`;
    return h + callNumbersHTML() + callScheduleHTML(true);
  }
  h += cs.has ? callInviteHTML("No call left in the schedule you imported.", "Import the next block", "Schedule", callLastImport())
    : callInviteHTML("Import your block's call file to see your shifts and who's on at each site.", "Import call schedule", "Schedule", "Nothing imported");
  return h + callNumbersHTML() + (CallStore.isEmpty() ? "" : callScheduleHTML(false));
}

// ---- Keeping the clock current -------------------------------------------------------
// Countdowns tick while Week or Call is open. When a shift starts or ends the
// screen redraws, unless you are typing or the log sheet is open.
function callKeyAt(now) {
  const cs = callStatus(CallStore.list(), now);
  return [cs.cur && cs.cur.s, cs.seg && cs.seg.uid, cs.next && cs.next.s].join("|");
}
function callAfterRender() {
  if (route.focus && document.querySelector) {
    const el = document.querySelector(`[data-callnum="${route.focus}"]`);
    if (el) { if (el.scrollIntoView) el.scrollIntoView({block: "center"}); el.focus(); }
  }
  delete route.focus;
  clearTimeout(callTimer);
  if ((route.page === "week" || route.page === "call") && CallStore.list().length) {
    callKey = callKeyAt(callNow());
    callTimer = setTimeout(callTick, 20000);
  }
}
function callTick() {
  const now = callNow(), a = document.activeElement, busy = sheet || (a && a.tagName === "INPUT");
  if (callKeyAt(now) !== callKey && !busy) { route.keepScroll = true; render(); return; }
  if (document.querySelectorAll) {
    const cs = callStatus(CallStore.list(), now), all = callStretches(CallStore.list());
    document.querySelectorAll("[data-until]").forEach(el => { el.textContent = callSpan(+el.dataset.until - now); });
    document.querySelectorAll(".tr-bar[data-from]").forEach(el => {
      el.innerHTML = callTraceSVG(new Date(+el.dataset.from), +el.dataset.days, now, all, cs.cur); });
  }
  callTimer = setTimeout(callTick, 20000);
}
