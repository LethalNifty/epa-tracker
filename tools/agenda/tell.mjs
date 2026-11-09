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
