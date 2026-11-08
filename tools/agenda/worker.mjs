// GI Hub's reminder sender: a Cloudflare Worker that sends every reminder on
// the minute, from the list the phone keeps up to date (alerts.js). A push
// says only what kind of reminder it is and when; the phone writes the words
// from what it has saved, so no titles, names or notes ever reach Cloudflare.
// Its own Worker (wrangler.toml beside this file), never in functions/, which
// deploys to the fellows' site.
//
// Storage, the KV namespace AGENDA:
//   vapid   the sender's own key pair, made the first time it's asked
//   auth    the SHA-256 of the phone's token, set when the phone first connects
//   sub     the phone's push subscription
//   alerts  {at, list: [{t, kind, s?, d?, id?}]}, the next five weeks
//
//   GET    /vapid    the sender's public key, for the phone to subscribe with
//   PUT    /sub      {sub, key}: this phone, subscribed with that key
//   PUT    /alerts   {list}: every reminder the phone wants
//   POST   /test     one test reminder, now
//   GET    /status   {sub, key, kept, next}
//   DELETE /sub      forget the phone, its reminders and its token
import {newVapid, sendPush} from "./webpush.mjs";

const ORIGIN = "https://lethalnifty.github.io";
const SUBJECT = "https://lethalnifty.github.io/epa-tracker/";
const KINDS = ["week", "ask", "pearls", "call", "study", "eve", "ev"];
const MAX = 800, MAX_BYTES = 200000, DAY = 864e5, MINUTE = 60000;
// Where a phone's push address can be: Apple's, and the other browsers' push services.
const PUSH_HOST = /(^|\.)(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/;
// How long the push service keeps trying a phone that's offline: an event's
// 30-minute alert and a call's hour are no use after the fact.
const TTL = {ev: 1800, call: 3600, test: 600}, TTL_REST = 21600;
const HEADERS = {
  "Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store", Vary: "Origin",
};
const reply = (status, body) => new Response(body === undefined ? null : JSON.stringify(body),
  {status, headers: body === undefined ? HEADERS : {...HEADERS, "Content-Type": "application/json"}});

const sha256 = async text => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))]
  .map(b => b.toString(16).padStart(2, "0")).join("");
// The bearer token's fingerprint matches the one kept; with claim, the first
// phone to connect sets it.
async function allowed(req, env, claim) {
  const m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.get("Authorization") || "");
  if (!m) return false;
  const h = await sha256(m[1]), kept = await env.AGENDA.get("auth");
  if (kept) return kept === h;
  if (!claim) return false;
  await env.AGENDA.put("auth", h);
  return true;
}
async function vapid(env) {
  const kept = await env.AGENDA.get("vapid");
  if (kept) return JSON.parse(kept);
  const v = await newVapid();
  await env.AGENDA.put("vapid", JSON.stringify(v));
  return v;
}
const readJSON = async req => { try { return JSON.parse(await req.text()); } catch (e) { return null; } };
function subOk(s) {
  try {
    const u = new URL(s.endpoint);
    return u.protocol === "https:" && PUSH_HOST.test(u.hostname) && typeof s.keys.p256dh === "string" && s.keys.p256dh.length < 200 &&
      typeof s.keys.auth === "string" && s.keys.auth.length < 100;
  } catch (e) { return false; }
}
// One reminder made whole, or null: a kind, a time from a day back to 40 days
// ahead, and only the fields the phone reads (a stretch's or an event's start,
// a day, an event's id).
function alertClean(a, now) {
  if (!a || !KINDS.includes(a.kind) || !Number.isInteger(a.t) || a.t < now - DAY || a.t > now + 40 * DAY) return null;
  const out = {t: a.t, kind: a.kind};
  if (Number.isInteger(a.s)) out.s = a.s;
  if (typeof a.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.d)) out.d = a.d;
  if (typeof a.id === "string" && /^[a-z0-9]{1,25}@\d{4}-\d{2}-\d{2}$/.test(a.id)) out.id = a.id;
  return out;
}
async function push(env, sub, msg, fetchImpl) {
  let r = {status: 0};
  for (let k = 0; k < 2; k++) {
    try { r = await sendPush(sub, msg, await vapid(env), {subject: SUBJECT, ttl: TTL[msg.kind] || TTL_REST, fetchImpl}); }
    catch (e) { r = {status: 0}; }
    if (r.status && r.status < 500 && r.status !== 429) break;
  }
  // Gone: the phone turned reminders off or dropped the connection. GI Hub
  // sees it next time it opens and offers to turn them on again.
  if (r.status === 404 || r.status === 410) await env.AGENDA.delete("sub");
  return r.status;
}

// The cron, every minute: the reminders due after the minute before and up to
// this one (`at`, the run's scheduled time), so a late run never repeats one.
// Reads one key a minute and writes only when a phone has gone.
export async function sendDue(env, at, fetchImpl = fetch) {
  const raw = await env.AGENDA.get("alerts");
  const due = raw ? (JSON.parse(raw).list || []).filter(a => a.t > at - MINUTE && a.t <= at) : [];
  if (!due.length) return 0;
  const subRaw = await env.AGENDA.get("sub");
  if (!subRaw) return 0;
  const sub = JSON.parse(subRaw);
  let sent = 0;
  for (const a of due) {
    const status = await push(env, sub, a, fetchImpl);
    if (status === 404 || status === 410) { console.log("The phone isn't connected to reminders any more."); break; }
    if (status >= 200 && status < 300) sent++;
    else console.log("The push service turned a reminder away (" + status + ").");
  }
  return sent;
}

// Any failure (storage down) still answers, with the headers that let the
// phone read it, so it reads as a refusal rather than no connection.
export async function handle(req, env, now = Date.now(), fetchImpl = fetch) {
  try { return await route(req, env, now, fetchImpl); }
  catch (e) { return reply(500, {error: "the sender failed"}); }
}

async function route(req, env, now, fetchImpl) {
  if (req.method === "OPTIONS") return reply(204);
  const path = new URL(req.url).pathname, m = req.method;
  if (path === "/vapid" && m === "GET") return reply(200, {key: (await vapid(env)).pub});
  if (path === "/sub" && m === "PUT") {
    const body = await readJSON(req);
    if (!body || !subOk(body.sub) || typeof body.key !== "string") return reply(400, {error: "not a push subscription"});
    if (body.key !== (await vapid(env)).pub) return reply(409, {error: "subscribed with another sender's key"});
    if (!(await allowed(req, env, true))) return reply(401, {error: "connected to another phone"});
    await env.AGENDA.put("sub", JSON.stringify({endpoint: body.sub.endpoint, keys: {p256dh: body.sub.keys.p256dh, auth: body.sub.keys.auth}}));
    return reply(200, {ok: true});
  }
  if (!["/alerts", "/test", "/status", "/sub"].includes(path)) return reply(404, {error: "not found"});
  if (!(await allowed(req, env, false))) return reply(401, {error: "locked"});
  if (path === "/alerts" && m === "PUT") {
    const text = await req.text();
    if (text.length > MAX_BYTES) return reply(413, {error: "too many reminders"});
    let body = null;
    try { body = JSON.parse(text); } catch (e) {}
    if (!body || !Array.isArray(body.list)) return reply(400, {error: "not a list of reminders"});
    const list = body.list.map(a => alertClean(a, now)).filter(Boolean).sort((a, b) => a.t - b.t).slice(0, MAX);
    await env.AGENDA.put("alerts", JSON.stringify({at: now, list}));
    const next = list.find(a => a.t > now);
    return reply(200, {kept: list.length, next: next ? next.t : null});
  }
  if (path === "/test" && m === "POST") {
    const subRaw = await env.AGENDA.get("sub");
    if (!subRaw) return reply(404, {error: "no phone connected"});
    return reply(200, {status: await push(env, JSON.parse(subRaw), {kind: "test", t: now}, fetchImpl)});
  }
  if (path === "/status" && m === "GET") {
    const subRaw = await env.AGENDA.get("sub"), raw = await env.AGENDA.get("alerts");
    const list = raw ? JSON.parse(raw).list || [] : [], next = list.find(a => a.t > now);
    return reply(200, {sub: !!subRaw, key: (await vapid(env)).pub, kept: list.length, next: next ? next.t : null});
  }
  if (path === "/sub" && m === "DELETE") {
    for (const k of ["sub", "alerts", "auth"]) await env.AGENDA.delete(k);
    return reply(204);
  }
  return reply(405, {error: "not allowed"});
}

export default {
  async fetch(req, env) { return handle(req, env); },
  async scheduled(controller, env) { await sendDue(env, controller.scheduledTime); },
};
