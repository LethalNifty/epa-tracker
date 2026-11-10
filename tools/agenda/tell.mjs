// Tell GI Hub's inbox: a Durable Object (SQLite storage, on the free plan) that
// keeps what you say until Claude files it, and what Claude filed until GI Hub
// picks it up. It is a Durable Object rather than KV because three writers in
// three places touch the same list (the shortcut, Claude in the cloud, the
// phone), and KV's last write wins across locations, which would lose things
// said. It only stores and decides: worker.mjs makes every network call.
//
// Storage:
//   keys     {shortcut, claude}: SHA-256 fingerprints of the keys Settings made
//   inbox    [{id, text | file, said, off, got, test?}]: what waits for Claude. said
//            is the phone's clock with its offset, off that offset in minutes;
//            file {type, size} is a picture or PDF shared to Add to GI Hub, its
//            bytes in KV under file:<id> (worker.mjs), 3 days at most
//   seen     {hash: got}: what was said lately, so a resend from Reminders is one item
//   run      {at, took, tries, next, err, fails, firing}: Claude's run
//   results  [{id, item, kind, ..., said, off, line, at, with?, keep?, ack?}]: what
//            Claude filed, until the phone confirms it (and ten minutes more), 200
//            at most. with: the other items it came from (one share's sheets);
//            keep: the shared files the phone keeps with it (call sheets)
//   tests    {item id: results}, testIds [item id by place in the set]: the test run
//   last     when Claude last filed anything
//
// A request is a POST of {op, who, fp, now, body}: who is "phone" when the
// Worker matched the phone's token, "worker" for the Worker's own calls; fp is
// the SHA-256 of any other bearer key. The answer is {status, data}.
import {TELL_TESTS, tellScore} from "./tell-tests.mjs";

const TEXT_MAX = 4000, INBOX_MAX = 50, MINUTE = 60000, DAY = 864e5;
const SEEN_KEEP = 3 * DAY;
const HEX64 = /^[0-9a-f]{64}$/, ITEM_ID = /^i[a-z0-9]{10}$/;
// What Add to GI Hub takes: pictures and PDFs, 10 MB each at most.
export const FILE_TYPES = ["image/jpeg", "image/png", "application/pdf"], FILE_MAX = 10485760;
const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

// A fresh id: the prefix and ten random letters and digits.
export function tellId(prefix) {
  let s = prefix;
  for (const b of crypto.getRandomValues(new Uint8Array(10))) s += ID_CHARS[b % 36];
  return s;
}
const sha256 = async text => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))]
  .map(b => b.toString(16).padStart(2, "0")).join("");

// ---- When it was said --------------------------------------------------------------------------
const pad = n => String(n).padStart(2, "0");
// An instant written as the phone's wall clock with its offset: 2026-11-09T14:05:00-05:00.
function saidAt(t, off) {
  const d = new Date(t + off * MINUTE), a = Math.abs(off);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:` +
    `${pad(d.getUTCSeconds())}${off < 0 ? "-" : "+"}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}
const SAID = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
// The phone's clock reading, made whole: {said, off, t}. A time that isn't
// one, or is more than 30 days old or a day ahead, is now in Winnipeg (UTC-5
// all year), never a time zone database's idea of it.
export function saidParse(at, now) {
  const m = typeof at === "string" ? SAID.exec(at.trim()) : null;
  if (m) {
    const off = m[7] === "Z" ? 0 : (m[7][0] === "-" ? -1 : 1) * (+m[7].slice(1, 3) * 60 + +m[7].slice(4));
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - off * MINUTE;
    const said = Math.abs(off) <= 14 * 60 ? saidAt(t, off) : "";
    // A day or hour that doesn't exist (31 November, 25:00) doesn't survive the round trip.
    if (said.slice(0, 16) === `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` && t >= now - 30 * DAY && t <= now + DAY) return {said, off, t};
  }
  return {said: saidAt(now, -300), off: -300, t: now};
}

// ---- Days, from the date alone --------------------------------------------------------------------
const ISO = /^\d{4}-\d{2}-\d{2}$/, HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const dayMs = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const isoOf = ms => new Date(ms).toISOString().slice(0, 10);
const realDay = v => typeof v === "string" && ISO.test(v) && isoOf(dayMs(v)) === v;
const addDays = (iso, k) => isoOf(dayMs(iso) + k * DAY);
const hm = v => typeof v === "string" && HM.test(v) ? v : null;
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// "Wed 11 Nov", as the app writes a day.
const dayWords = iso => { const d = new Date(dayMs(iso)); return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };

// ---- What Claude files --------------------------------------------------------------------------
const str = (v, max) => typeof v === "string" ? v.trim().slice(0, max) : "";
const cut = (t, n) => t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
const IDEA_FOR = ["gihub", "heidi"];

// ---- Call schedules -------------------------------------------------------------------------------
// A call result is the whole block as read from one share's sheets: each
// sheet's site, dates and file, every day's day and night teams at each site,
// the notes and whose they are, the footers' full names and rules, and lines
// worth a look. A swap moves slots from one person to another ("me" is you).
// Names stay as written: the phone works out whose shifts are whose.
const SITES = ["hsc", "stb"], SWAP_SITES = ["both", "hsc", "stb"], SLOTS = ["night", "day"];
const DAYS_MAX = 62, UNREAD = "A shared file Claude couldn't read";
const rec = v => v && typeof v === "object" ? v : {};
const list = v => Array.isArray(v) ? v : [];
const name = v => str(v, 40);
const names = v => (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).map(name).filter(Boolean).slice(0, 4);
function siteDay(x) {
  const dy = rec(x.day), nt = rec(x.night), day = {fellows: names(dy.fellows), res: names(dy.res), att: name(dy.att)}, tpn = names(dy.tpn);
  if (tpn.length) day.tpn = tpn;
  return {day, night: {fellow: name(nt.fellow), res: names(nt.res), att: name(nt.att)}};
}
function callClean(raw, near) {
  const sheets = list(raw.sheets).map(rec).filter(x => SITES.includes(x.site) && near(x.from) && near(x.to) && x.from <= x.to &&
    dayMs(x.to) - dayMs(x.from) < DAYS_MAX * DAY).slice(0, 6)
    .map(x => ({site: x.site, from: x.from, to: x.to, ...(typeof x.file === "string" && ITEM_ID.test(x.file) ? {file: x.file} : {})}));
  // A site's day counts only inside one of that site's sheets.
  const covers = (site, d) => sheets.some(x => x.site === site && x.from <= d && d <= x.to);
  const days = [];
  for (const x of list(raw.days).map(rec)) {
    if (!near(x.d) || days.some(y => y.d === x.d)) continue;
    const e = {d: x.d};
    for (const site of SITES) if (x[site] && typeof x[site] === "object" && covers(site, x.d)) e[site] = siteDay(x[site]);
    if (e.hsc || e.stb) days.push(e);
  }
  days.sort((a, b) => a.d < b.d ? -1 : 1).splice(DAYS_MAX);
  if (!sheets.length || !days.length) return null;
  const notes = list(raw.notes).map(rec).filter(x => SITES.includes(x.site) && near(x.d) && covers(x.site, x.d) && name(x.who) && str(x.t, 120))
    .slice(0, 100).map(x => ({d: x.d, site: x.site, who: name(x.who), t: str(x.t, 120)}));
  const people = [];
  for (const x of list(raw.people).map(rec)) {
    const n = name(x.n), full = str(x.full, 80);
    if (n && full && people.length < 80 && !people.some(y => y.n === n)) people.push({n, full});
  }
  const rules = list(raw.rules).map(rec).filter(x => SITES.includes(x.site) && str(x.t, 300)).slice(0, 6).map(x => ({site: x.site, t: str(x.t, 300)}));
  const look = list(raw.look).map(x => str(x, 200)).filter(Boolean).slice(0, 20);
  return {kind: "call", sheets, days, notes, people, rules, look};
}
// Every slot has a day, a night or day slot and two people, or none is kept:
// half a swap would be wrong. No site is both.
function swapClean(raw, near) {
  const slots = [];
  for (const x of list(raw.slots).map(rec)) {
    const site = x.site == null ? "both" : x.site, from = name(x.from), to = name(x.to);
    if (!near(x.d) || !SWAP_SITES.includes(site) || !SLOTS.includes(x.slot) || !from || !to || from.toLowerCase() === to.toLowerCase()) return null;
    slots.push({d: x.d, site, slot: x.slot, from, to});
  }
  return slots.length && slots.length <= 8 ? {kind: "callswap", slots} : null;
}
// One result from Claude made whole, for the item it came from, or null:
// only the fields GI Hub reads, cut to size, real days near when it was said.
export function resultClean(raw, item) {
  if (!raw || typeof raw !== "object") return null;
  const sd = item.said.slice(0, 10), shm = item.said.slice(11, 16);
  const day = v => realDay(v) && v >= addDays(sd, -1) && v <= addDays(sd, 400) ? v : null;
  const near = v => realDay(v) && v >= addDays(sd, -60) && v <= addDays(sd, 400);
  let r;
  if (raw.kind === "event") {
    const t = str(raw.t, 120), d = day(raw.d), s = hm(raw.s), e = s ? hm(raw.e) : null, d2 = day(raw.d2), n = str(raw.n, 500);
    if (!t || !d) return null;
    r = {kind: "event", t, d};
    if (d2 && d2 > d && d2 <= addDays(d, 60)) r.d2 = d2;
    if (s) r.s = s;
    if (e) r.e = e;
    if (n) r.n = n;
  } else if (raw.kind === "todo") {
    const t = str(raw.t, 120), q = str(raw.q, 140);
    let d = raw.d == null ? null : day(raw.d), s = hm(raw.s);
    if (!t || (raw.d != null && !d)) return null;
    // No day: the next time it comes round (08:00 when no time was said either).
    if (!d) { s = s || "08:00"; d = s > shm ? sd : addDays(sd, 1); }
    // A day but no time: 08:00, or on the day it was said and after 08:00, the next whole hour.
    else if (!s) {
      s = "08:00";
      if (d === sd && s <= shm) { const h = +shm.slice(0, 2) + 1; if (h <= 23) s = pad(h) + ":00"; else d = addDays(sd, 1); }
    }
    r = {kind: "todo", t, d, s};
    if (q) r.q = q;
  } else if (raw.kind === "change") {
    const m = str(raw.m, 80), to = {}, x = raw.to && typeof raw.to === "object" ? raw.to : {};
    if (day(x.d)) to.d = x.d;
    if (hm(x.s)) to.s = x.s;
    if (hm(x.e)) to.e = x.e;
    if (!m || (raw.cancel !== true && !Object.keys(to).length)) return null;
    r = raw.cancel === true ? {kind: "change", m, cancel: true} : {kind: "change", m, to};
  } else if (raw.kind === "scope") {
    const text = str(raw.text, 2000);
    if (!text) return null;
    r = {kind: "scope", text, d: day(raw.d) || sd};
  } else if (raw.kind === "pearl") {
    const t = str(raw.t, 2000), topic = str(raw.topic, 60), who = str(raw.who, 60);
    if (!t) return null;
    r = {kind: "pearl", t, d: sd};
    if (topic) r.topic = topic;
    if (who) r.who = who;
  } else if (raw.kind === "idea") {
    const t = str(raw.t, 500);
    if (!t) return null;
    r = {kind: "idea", for: IDEA_FOR.includes(raw.for) ? raw.for : "gihub", t};
  } else if (raw.kind === "note") {
    const t = str(raw.t, TEXT_MAX);
    if (!t) return null;
    r = {kind: "note", t};
  } else if (raw.kind === "call") {
    if (!(r = callClean(raw, near))) return null;
  } else if (raw.kind === "callswap") {
    if (!(r = swapClean(raw, near))) return null;
  } else return null;
  if (raw.chk === true && ["event", "todo", "change"].includes(r.kind)) r.chk = true;
  r = {id: tellId("a"), item: item.id, ...r, said: item.said, off: item.off};
  const w = [...new Set(list(raw.with).filter(x => typeof x === "string" && ITEM_ID.test(x) && x !== item.id))].slice(0, 10);
  if (w.length) r.with = w;
  r.line = resultLine(r);
  return r;
}
// What a result says in the "added" notification and on the Claude added card.
// A scope case never says more than that it's there, a call schedule or swap
// no more than its dates.
export function resultLine(r) {
  const when = (d, s) => dayWords(d) + (s ? ", " + s : "");
  let line;
  if (r.kind === "event") line = `${r.t}, ${when(r.d, r.s)}` + (r.d2 ? ` to ${dayWords(r.d2)}` : "");
  else if (r.kind === "todo") line = `To-do: ${r.t}, ${when(r.d, r.s)}`;
  else if (r.kind === "change") line = r.cancel ? `Cancel: ${r.m}` : r.to.d || r.to.s ? `Move ${r.m} to ${r.to.d ? when(r.to.d, r.to.s) : r.to.s}` : `Change ${r.m}: ends at ${r.to.e}`;
  else if (r.kind === "scope") line = "Scope case, check it in Endo";
  else if (r.kind === "pearl") line = "Pearl: " + cut(r.t, 60);
  else if (r.kind === "idea") line = `${r.for === "heidi" ? "Heidi" : "GI Hub"} idea, waits for the desktop`;
  else if (r.kind === "call") line = `Call schedule, ${dayWords(r.sheets.map(x => x.from).sort()[0])} to ${dayWords(r.sheets.map(x => x.to).sort().at(-1))}, check it in Call`;
  else if (r.kind === "callswap") {
    const ds = [...new Set(r.slots.map(x => x.d))];
    line = ds.length === 1 ? `Call swap on ${dayWords(ds[0])}, check it in Call` : `Call swap, ${ds.length} days, check it in Call`;
  }
  else line = "Note: " + cut(r.t, 60);
  return r.chk ? line + " (check this)" : line;
}
const LINES = 6, RESULTS_MAX = 200, ACK_KEEP = 10 * MINUTE, RESULTS_KEEP = 30 * DAY, WAIT_SHOW = 15 * MINUTE;
// Confirmed results go ten minutes after the phone confirmed them (by then
// every copy of its new plan has the alerts); any result after 30 days.
const fresh = (results, now) => results.filter(r => !(r.ack && r.ack <= now - ACK_KEEP) && r.at > now - RESULTS_KEEP);

// ---- Alerts before GI Hub opens --------------------------------------------------------------------
// What a result reminds you of if GI Hub doesn't open before it's due, in the
// plan's own kinds: 30 minutes before a timed event, 19:00 the evening before
// any event, a to-do at its time. Each carries what it's about (w), since the
// phone's brief doesn't know it yet, and when the phone confirmed it (ack):
// the minute check leaves it to the phone's own plan once that plan is at
// least that new. Times are in the offset the thing was said in.
const SOON = 30 * MINUTE, EVE = "19:00", BACK = 15 * MINUTE, AHEAD = 40 * DAY;
const instant = (iso, s, off) => dayMs(iso) + (+s.slice(0, 2) * 60 + +s.slice(3) - off) * MINUTE;
export function pendingAlerts(results, now) {
  const out = [];
  for (const r of results) {
    const a = [];
    if (r.kind === "event") {
      if (r.s) { const s = instant(r.d, r.s, r.off); a.push({t: s - SOON, kind: "ev", s, id: r.id + "@" + r.d, w: r.t}); }
      a.push({t: instant(addDays(r.d, -1), EVE, r.off), kind: "eve", d: r.d, w: [{id: r.id, t: r.t, s: r.s || null}]});
    } else if (r.kind === "todo") a.push({t: instant(r.d, r.s, r.off), kind: "todo", id: r.id + "@" + r.d, w: r.t, q: r.q || ""});
    for (const x of a) if (x.t >= now - BACK && x.t <= now + AHEAD) out.push(r.ack ? {...x, ack: r.ack} : x);
  }
  return out.sort((x, y) => x.t - y.t);
}

// ---- Starting Claude -----------------------------------------------------------------------------
// A minute after the newest thing said (so a few things said in a row go in
// one run), never while a start is under way, and again on the same items if
// a run hasn't filed them in time. Minutes:
const QUIET = MINUTE, FIRING = 2 * MINUTE;
const RERUN = [15, 30, 60, 120], FAIL = [2, 5, 15, 30], BUSY = 10, BUSY_MAX = 60, REFUSED = 60;

// ---- The object --------------------------------------------------------------------------------
const answer = (status, data) => new Response(JSON.stringify({status, data}), {status, headers: {"Content-Type": "application/json"}});

// Each op: who may ask, and what it does: [status, data].
const OPS = {
  // Settings turned Tell GI Hub on, or made new keys: their fingerprints.
  keys: {who: ["phone"], async run(b) {
    if (!HEX64.test(b.shortcut || "") || !HEX64.test(b.claude || "") || b.shortcut === b.claude) return [400, {error: "two key fingerprints"}];
    await this.storage.put("keys", {shortcut: b.shortcut, claude: b.claude});
    return [200, {ok: true}];
  }},
  // Turned off: neither key opens anything.
  off: {who: ["phone"], async run() {
    await this.storage.delete("keys");
    return [200, {ok: true}];
  }},
  // Something said (the shortcut) or typed (the + box): kept until Claude files it.
  say: {who: ["shortcut", "phone"], async run(b, now) {
    const text = typeof b.text === "string" ? b.text.trim() : "";
    if (!text || text.length > TEXT_MAX) return [400, {error: text ? "too long" : "nothing said"}];
    const {said, off} = saidParse(b.at, now), h = await sha256(said + "|" + text);
    const seen = (await this.storage.get("seen")) || {};
    if (seen[h]) return [200, {ok: true, dup: true}];
    const inbox = (await this.storage.get("inbox")) || [];
    if (inbox.length >= INBOX_MAX) return [429, {error: "the inbox is full"}];
    inbox.push({id: tellId("i"), text, said, off, got: now});
    for (const k of Object.keys(seen)) if (seen[k] < now - SEEN_KEEP) delete seen[k];
    seen[h] = now;
    await this.storage.put("inbox", inbox);
    await this.storage.put("seen", seen);
    return [200, {ok: true}];
  }},
  // A file shared to Add to GI Hub: the Worker has its bytes; the item keeps
  // what it is, its size and when it was shared (one share's files carry the same).
  share: {who: ["shortcut", "phone"], async run(b, now) {
    if (!ITEM_ID.test(b.id || "") || !FILE_TYPES.includes(b.type) || !Number.isInteger(b.size) || b.size < 1 || b.size > FILE_MAX)
      return [400, {error: "not a picture or PDF the inbox takes"}];
    const inbox = (await this.storage.get("inbox")) || [];
    if (inbox.length >= INBOX_MAX) return [429, {error: "the inbox is full"}];
    const {said, off} = saidParse(b.at, now);
    inbox.push({id: b.id, file: {type: b.type, size: b.size}, said, off, got: now});
    await this.storage.put("inbox", inbox);
    return [200, {ok: true}];
  }},
  // The Worker couldn't keep a shared file's bytes: its item goes too.
  unshare: {who: ["worker"], async run(b) {
    const inbox = (await this.storage.get("inbox")) || [], i = inbox.findIndex(x => x.id === b.id && x.file);
    if (i < 0) return [404, {error: "no such file"}];
    inbox.splice(i, 1);
    await this.storage.put("inbox", inbox);
    return [200, {ok: true}];
  }},
  // Whether a shared file's bytes may be read: by Claude while its item
  // waits, by the phone while a result it hasn't confirmed keeps it.
  fileok: {who: ["claude", "phone"], async run(b, now, who) {
    const ok = who === "claude" ? ((await this.storage.get("inbox")) || []).some(x => x.id === b.id && x.file)
      : fresh((await this.storage.get("results")) || [], now).some(r => !r.ack && (r.keep || []).includes(b.id));
    return ok ? [200, {ok: true}] : [404, {error: "no such file"}];
  }},
  // Claude reads what waits; the run now holds those items.
  items: {who: ["claude"], async run() {
    const inbox = (await this.storage.get("inbox")) || [], run = (await this.storage.get("run")) || {};
    run.took = [...new Set([...(run.took || []), ...inbox.map(x => x.id)])];
    await this.storage.put("run", run);
    return [200, {items: inbox.map(x => x.file ? {id: x.id, said: x.said, file: x.file} : {id: x.id, text: x.text, said: x.said})}];
  }},
  // Claude's results, by the item each came from. An item that's no longer
  // waiting was filed already (a late second run): skipped. A result that
  // can't be used never loses what was said: the item's own words go in as a
  // note, beside the results that could (in place of them all, if none could).
  // The items a result came with (one share's other sheets) are filed with it.
  // drop: the shared files filed here that no result keeps, for the Worker to delete.
  file: {who: ["claude"], async run(b, now) {
    if (!Array.isArray(b.results)) return [400, {error: "results, a list"}];
    if (b.results.length > RESULTS_MAX) return [413, {error: "too many results"}];
    const inbox = (await this.storage.get("inbox")) || [], byItem = new Map(), waiting = new Map(inbox.map(x => [x.id, x]));
    for (const raw of b.results) if (raw && typeof raw.item === "string") byItem.set(raw.item, [...(byItem.get(raw.item) || []), raw]);
    const results = fresh((await this.storage.get("results")) || [], now), tests = (await this.storage.get("tests")) || {};
    const added = [], ideas = [], filed = new Set();
    let kept = 0, skipped = 0;
    for (const [id, raws] of byItem) {
      const item = waiting.get(id);
      if (!item) { skipped += raws.length; continue; }
      // What came with it, whether or not its results can be used: waiting, and a test only with a test.
      const own = [id, ...raws.flatMap(r => list(rec(r).with)).filter(w => w !== id && waiting.has(w) && !waiting.get(w).test === !item.test)];
      const good = raws.map(r => resultClean(r, item)).filter(Boolean);
      const rs = good.length === raws.length ? good : [...good, resultClean({kind: "note", t: item.file ? UNREAD : item.text}, item)];
      for (const r of rs) {
        r.at = now;
        if (r.with && !(r.with = r.with.filter(w => own.includes(w))).length) delete r.with;
        // A call result keeps its sheets' pictures: its own files, never a test's.
        if (r.kind !== "call") continue;
        const mine = [id, ...(r.with || [])].filter(w => waiting.get(w).file);
        r.sheets = r.sheets.map(x => !x.file || mine.includes(x.file) ? x : {site: x.site, from: x.from, to: x.to});
        const keep = [...new Set(r.sheets.map(x => x.file).filter(Boolean))];
        if (keep.length && !item.test) r.keep = keep;
      }
      kept += rs.length;
      for (const w of own) filed.add(w);
      if (item.test) { tests[id] = rs; continue; }
      results.push(...rs); added.push(...rs);
      for (const r of rs) if (r.kind === "idea") ideas.push({id: r.id, for: r.for, t: r.t, said: r.said});
    }
    results.splice(0, Math.max(0, results.length - RESULTS_MAX));
    const keep = new Set(added.flatMap(r => r.keep || []));
    const drop = inbox.filter(x => filed.has(x.id) && x.file && !x.test && !keep.has(x.id)).map(x => x.id);
    const rest = inbox.filter(x => !filed.has(x.id));
    // The run is over once nothing it took still waits.
    const run = (await this.storage.get("run")) || {}, left = (run.took || []).filter(id => rest.some(x => x.id === id));
    await this.storage.put("inbox", rest);
    await this.storage.put("results", results);
    if (Object.keys(tests).length) await this.storage.put("tests", tests);
    await this.storage.put("run", left.length ? run : {});
    if (kept) await this.storage.put("last", now);
    return [200, {ok: true, kept, skipped, left, drop, ideas, added: added.length ? {kind: "added", t: now, lines: added.slice(0, LINES).map(r => r.line),
      more: Math.max(0, added.length - LINES), fin: added.some(r => r.kind === "change")} : null}];
  }},
  // The phone picks up what it hasn't confirmed, and whether anything waits
  // too long for Claude (a quarter hour, or the last start failed).
  results: {who: ["phone"], async run(b, now) {
    const all = (await this.storage.get("results")) || [], results = fresh(all, now);
    if (results.length !== all.length) await this.storage.put("results", results);
    const inbox = (await this.storage.get("inbox")) || [], run = (await this.storage.get("run")) || {};
    const since = inbox.length ? Math.min(...inbox.map(x => x.got)) : null;
    const wait = inbox.length && (now - since >= WAIT_SHOW || run.err) ? {n: inbox.length, since, err: run.err || null} : null;
    return [200, {results: results.filter(r => !r.ack), wait}];
  }},
  // The phone's plan upload confirmed these (the Worker passes them on, with
  // the time that upload was kept). drop: the files they kept, on the phone now.
  ack: {who: ["worker"], async run(b, now) {
    const ids = new Set(Array.isArray(b.ids) ? b.ids : []), at = Number.isFinite(b.at) ? b.at : now;
    const results = (await this.storage.get("results")) || [], drop = [];
    let n = 0;
    for (const r of results) if (ids.has(r.id) && !r.ack) { r.ack = at; n++; drop.push(...(r.keep || [])); }
    if (n) await this.storage.put("results", results);
    return [200, {ok: true, n, drop}];
  }},
  // The test set (tell-tests.mjs): the 20 go in the inbox as if said at their
  // fixed times, in place of any earlier run's, and Claude files them like
  // anything said; their results stay here and never reach the phone.
  test: {who: ["phone"], async run(b, now) {
    const inbox = ((await this.storage.get("inbox")) || []).filter(x => !x.test), ids = [];
    for (const x of TELL_TESTS) {
      const z = x.at.slice(-6), off = (z[0] === "-" ? -1 : 1) * (+z.slice(1, 3) * 60 + +z.slice(4));
      ids.push(tellId("i"));
      inbox.push({id: ids.at(-1), text: x.say, said: x.at, off, got: now, test: true});
    }
    await this.storage.put("inbox", inbox);
    await this.storage.put("tests", {});
    await this.storage.put("testIds", ids);
    return [200, {ok: true, n: ids.length}];
  }},
  score: {who: ["phone"], async run() {
    const tests = (await this.storage.get("tests")) || {}, ids = (await this.storage.get("testIds")) || [], got = {};
    ids.forEach((id, i) => { if (tests[id]) got[i] = tests[id]; });
    return [200, tellScore(TELL_TESTS, got)];
  }},
  // The minute check: whether to start Claude now, and the alerts Claude's
  // results need until the phone has them. It tidies the results as it goes.
  tick: {who: ["worker"], async run(b, now) {
    const at = Number.isFinite(b.at) ? b.at : now;
    const all = (await this.storage.get("results")) || [], results = fresh(all, at);
    if (results.length !== all.length) await this.storage.put("results", results);
    const inbox = (await this.storage.get("inbox")) || [], run = (await this.storage.get("run")) || {}, was = JSON.stringify(run);
    let fire = false;
    if (inbox.length) {
      if (b.ready !== true) run.err = "setup";
      else if (Math.max(...inbox.map(x => x.got)) <= at - QUIET && at >= (run.next || 0) && !((run.firing || 0) > at - FIRING)) {
        fire = true;
        run.firing = at;
      }
    }
    if (JSON.stringify(run) !== was) await this.storage.put("run", run);
    return [200, {fire, pending: pendingAlerts(results, at)}];
  }},
  // How the start went (the status Claude's side answered, 0 for no answer).
  fired: {who: ["worker"], async run(b, now) {
    const at = Number.isFinite(b.at) ? b.at : now, st = Number.isInteger(b.status) ? b.status : 0;
    const run = (await this.storage.get("run")) || {};
    delete run.firing;
    if (st >= 200 && st < 300) {
      // Under way. If it hasn't filed by then, start it again on the same items.
      const tries = run.tries || 0;
      Object.assign(run, {at, tries: tries + 1, next: at + RERUN[Math.min(tries, RERUN.length - 1)] * MINUTE, err: null, fails: 0});
    } else if (st === 429) {
      // Busy, or out of usage for now: as long as it says (10 minutes if it doesn't), an hour at most.
      const wait = Number.isFinite(b.retry) && b.retry >= 0 ? b.retry * 1000 : BUSY * MINUTE;
      Object.assign(run, {next: at + Math.min(wait, BUSY_MAX * MINUTE), fails: 0});
    } else if (st === 0 || st >= 500) {
      // No answer, or trouble on their side: soon, then less often.
      const k = run.fails || 0;
      Object.assign(run, {next: at + FAIL[Math.min(k, FAIL.length - 1)] * MINUTE, fails: k + 1});
    } else Object.assign(run, {next: at + REFUSED * MINUTE, err: st, fails: 0});   // the address or key is wrong: say so, try hourly
    await this.storage.put("run", run);
    return [200, {ok: true}];
  }},
};

export class Tell {
  constructor(state, env) { this.storage = state.storage; this.env = env; }
  async fetch(req) {
    let m = null;
    try { m = await req.json(); } catch (e) {}
    if (!m || typeof m.op !== "string") return answer(400, {error: "not a request"});
    const f = Object.hasOwn(OPS, m.op) ? OPS[m.op] : null;
    if (!f) return answer(404, {error: "no such op"});
    const who = await this.role(m);
    if (!f.who.includes(who)) return answer(401, {error: "locked"});
    const [status, data] = await f.run.call(this, m.body && typeof m.body === "object" ? m.body : {}, Number.isFinite(m.now) ? m.now : Date.now(), who);
    return answer(status, data);
  }
  // Who's asking: the phone or the Worker as the Worker says, else whichever key matches.
  async role(m) {
    if (m.who === "phone" || m.who === "worker") return m.who;
    if (typeof m.fp !== "string" || !HEX64.test(m.fp)) return null;
    const keys = await this.storage.get("keys");
    return !keys ? null : m.fp === keys.shortcut ? "shortcut" : m.fp === keys.claude ? "claude" : null;
  }
}
