// Tell GI Hub's inbox: a Durable Object (SQLite storage, on the free plan) that
// keeps what you say until Claude files it, and what Claude filed until GI Hub
// picks it up. It is a Durable Object rather than KV because three writers in
// three places touch the same list (the shortcut, Claude in the cloud, the
// phone), and KV's last write wins across locations, which would lose things
// said. It only stores and decides: worker.mjs makes every network call.
//
// Storage:
//   keys     {shortcut, claude}: SHA-256 fingerprints of the keys Settings made
//   inbox    [{id, text, said, off, got, test?}]: what waits for Claude. said is
//            the phone's clock with its offset, off that offset in minutes
//   seen     {hash: got}: what was said lately, so a resend from Reminders is one item
//   run      {at, took, tries, next, err, firing}: Claude's run
//
// A request is a POST of {op, who, fp, now, body}: who is "phone" when the
// Worker matched the phone's token, "worker" for the Worker's own calls; fp is
// the SHA-256 of any other bearer key. The answer is {status, data}.

const TEXT_MAX = 4000, INBOX_MAX = 50, MINUTE = 60000, DAY = 864e5;
const SEEN_KEEP = 3 * DAY;
const HEX64 = /^[0-9a-f]{64}$/;
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
// One result from Claude made whole, for the item it came from, or null:
// only the fields GI Hub reads, cut to size, real days near when it was said.
export function resultClean(raw, item) {
  if (!raw || typeof raw !== "object") return null;
  const sd = item.said.slice(0, 10), shm = item.said.slice(11, 16);
  const day = v => realDay(v) && v >= addDays(sd, -1) && v <= addDays(sd, 400) ? v : null;
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
  } else return null;
  if (raw.chk === true && ["event", "todo", "change"].includes(r.kind)) r.chk = true;
  r = {id: tellId("a"), item: item.id, ...r, said: item.said, off: item.off};
  r.line = resultLine(r);
  return r;
}
// What a result says in the "added" notification and on the Claude added card.
// A scope case never says more than that it's there.
export function resultLine(r) {
  const when = (d, s) => dayWords(d) + (s ? ", " + s : "");
  let line;
  if (r.kind === "event") line = `${r.t}, ${when(r.d, r.s)}` + (r.d2 ? ` to ${dayWords(r.d2)}` : "");
  else if (r.kind === "todo") line = `To-do: ${r.t}, ${when(r.d, r.s)}`;
  else if (r.kind === "change") line = r.cancel ? `Cancel: ${r.m}` : r.to.d || r.to.s ? `Move ${r.m} to ${r.to.d ? when(r.to.d, r.to.s) : r.to.s}` : `Change ${r.m}: ends at ${r.to.e}`;
  else if (r.kind === "scope") line = "Scope case, check it in Endo";
  else if (r.kind === "pearl") line = "Pearl: " + cut(r.t, 60);
  else if (r.kind === "idea") line = `${r.for === "heidi" ? "Heidi" : "GI Hub"} idea, waits for the desktop`;
  else line = "Note: " + cut(r.t, 60);
  return r.chk ? line + " (check this)" : line;
}
const LINES = 6, RESULTS_MAX = 200, ACK_KEEP = 10 * MINUTE, RESULTS_KEEP = 30 * DAY, WAIT_SHOW = 15 * MINUTE;
// Confirmed results go ten minutes after the phone confirmed them (by then
// every copy of its new plan has the alerts); any result after 30 days.
const fresh = (results, now) => results.filter(r => !(r.ack && r.ack <= now - ACK_KEEP) && r.at > now - RESULTS_KEEP);

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
  // Claude reads what waits; the run now holds those items.
  items: {who: ["claude"], async run() {
    const inbox = (await this.storage.get("inbox")) || [], run = (await this.storage.get("run")) || {};
    run.took = [...new Set([...(run.took || []), ...inbox.map(x => x.id)])];
    await this.storage.put("run", run);
    return [200, {items: inbox.map(x => ({id: x.id, text: x.text, said: x.said}))}];
  }},
  // Claude's results, by the item each came from. An item that's no longer
  // waiting was filed already (a late second run): skipped. An item whose
  // results are all unusable becomes a note in its own words.
  file: {who: ["claude"], async run(b, now) {
    if (!Array.isArray(b.results)) return [400, {error: "results, a list"}];
    if (b.results.length > RESULTS_MAX) return [413, {error: "too many results"}];
    const inbox = (await this.storage.get("inbox")) || [], byItem = new Map();
    for (const raw of b.results) if (raw && typeof raw.item === "string") byItem.set(raw.item, [...(byItem.get(raw.item) || []), raw]);
    const results = fresh((await this.storage.get("results")) || [], now), tests = (await this.storage.get("tests")) || {};
    const added = [], ideas = [];
    let kept = 0, skipped = 0;
    for (const [id, raws] of byItem) {
      const i = inbox.findIndex(x => x.id === id);
      if (i < 0) { skipped += raws.length; continue; }
      const item = inbox[i];
      let rs = raws.map(r => resultClean(r, item)).filter(Boolean);
      if (!rs.length) rs = [resultClean({kind: "note", t: item.text}, item)];
      for (const r of rs) r.at = now;
      kept += rs.length;
      inbox.splice(i, 1);
      if (item.test) { tests[id] = rs; continue; }
      results.push(...rs); added.push(...rs);
      for (const r of rs) if (r.kind === "idea") ideas.push({id: r.id, for: r.for, t: r.t, said: r.said});
    }
    results.splice(0, Math.max(0, results.length - RESULTS_MAX));
    // The run is over once nothing it took still waits.
    const run = (await this.storage.get("run")) || {}, left = (run.took || []).filter(id => inbox.some(x => x.id === id));
    await this.storage.put("inbox", inbox);
    await this.storage.put("results", results);
    if (Object.keys(tests).length) await this.storage.put("tests", tests);
    await this.storage.put("run", left.length ? run : {});
    if (kept) await this.storage.put("last", now);
    return [200, {ok: true, kept, skipped, left, ideas, added: added.length ? {kind: "added", t: now, lines: added.slice(0, LINES).map(r => r.line),
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
  // the time that upload was kept).
  ack: {who: ["worker"], async run(b, now) {
    const ids = new Set(Array.isArray(b.ids) ? b.ids : []), at = Number.isFinite(b.at) ? b.at : now;
    const results = (await this.storage.get("results")) || [];
    let n = 0;
    for (const r of results) if (ids.has(r.id) && !r.ack) { r.ack = at; n++; }
    if (n) await this.storage.put("results", results);
    return [200, {ok: true, n}];
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
    if (!f.who.includes(await this.role(m))) return answer(401, {error: "locked"});
    const [status, data] = await f.run.call(this, m.body && typeof m.body === "object" ? m.body : {}, Number.isFinite(m.now) ? m.now : Date.now());
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
