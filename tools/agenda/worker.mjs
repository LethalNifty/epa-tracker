// GI Hub's reminder sender, and Tell GI Hub's inbox: a Cloudflare Worker that
// sends every reminder on the minute, from the list the phone keeps up to date
// (alerts.js), and keeps what you tell GI Hub until Claude files it. A
// reminder from the phone's list says only what kind it is and when; the
// phone writes the words from what it has saved. What you tell GI Hub is the
// one exception: its words wait in the inbox (tell.mjs) until Claude files
// them, and Claude's results until GI Hub picks them up (gone ten minutes
// after it confirms); the "added" push, and the alerts for results GI Hub
// hasn't picked up yet, carry their own words.
// Its own Worker (wrangler.toml beside this file), never in functions/, which
// deploys to the fellows' site.
//
// Storage, the KV namespace AGENDA:
//   vapid   the sender's own key pair, made the first time it's asked
//   auth    the SHA-256 of the phone's token, set when the phone first connects
//   sub     the phone's push subscription
//   alerts  {at, list: [{t, kind, s?, d?, id?}]}, the next five weeks
//   sent    the reminders sent in the last quarter hour, so a late one goes only once
//   idea:<id>  {for, t, said}: an idea Claude filed, for the desktop to read
// and the Durable Object TELL (tell.mjs): the inbox, Claude's run, the results.
// Secrets, set once by the user: TASK_URL, the Claude task's start address,
// and TASK_TOKEN, its token.
//
// With the phone's token:
//   GET    /vapid    the sender's public key, for the phone to subscribe with (no token)
//   PUT    /sub      {sub, key}: this phone, subscribed with that key
//   PUT    /alerts   {list, ack?}: every reminder the phone wants; ack, the results it now has
//   POST   /test     one test reminder, now
//   GET    /status   {sub, key, kept, next}
//   DELETE /sub      forget the phone, its reminders and its token
//   PUT    /tell     {shortcut, claude}: the fingerprints of the keys Settings made
//   DELETE /tell     Tell GI Hub off: neither key opens anything
//   GET    /results  what Claude filed that the phone hasn't confirmed, and whether anything waits
//   DELETE /idea/<id>  an idea taken back with Undo
//   POST   /tell/test  the test set (tell-tests.mjs) into the inbox; GET: how Claude did
// With the shortcut's key (or the phone's token, from the + box):
//   POST   /inbox    {text, at}: something said, and the phone's clock then
// With Claude's key:
//   GET    /inbox    what waits to be filed
//   POST   /results  {results}: what Claude filed, by item
import {newVapid, sendPush} from "./webpush.mjs";
export {Tell} from "./tell.mjs";

const ORIGIN = "https://lethalnifty.github.io";
const SUBJECT = "https://lethalnifty.github.io/epa-tracker/";
const KINDS = ["week", "ask", "pearls", "call", "study", "eve", "ev", "todo"];
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

// The cron, every minute (`at`, the run's scheduled time): the reminders due in
// the minute up to it, and any that a run Cloudflare skipped, or a push service
// too busy to answer, left behind: those go once they're three minutes late, up
// to a quarter hour. What went out is kept a quarter hour so nothing goes twice
// (three minutes gives storage time to agree). Reads a key or two a minute and
// writes only after it sends.
//
// extra: the alerts Claude's results need until the phone has them (tellTick),
// first. One goes no more once the plan read here is at least as new as the
// phone's confirming it (that plan has it), so a result alerts once whichever
// copy of the plan this reads. Alerts that share a key go as one push, an
// evening's events joined.
const LATE = 3 * MINUTE, CATCH_UP = 15 * MINUTE;
const alertKey = a => `${a.t}:${a.kind}:${a.id || a.d || a.s || ""}`;
export async function sendDue(env, at, fetchImpl = fetch, extra = []) {
  const raw = await env.AGENDA.get("alerts"), plan = raw ? JSON.parse(raw) : {list: []};
  const isDue = a => a.t <= at && a.t > at - CATCH_UP && (a.t > at - MINUTE || a.t <= at - LATE);
  const due = new Map();
  for (const x of [...extra, ...(plan.list || [])]) {
    if (!isDue(x) || (x.ack && plan.at >= x.ack)) continue;
    const {ack, ...a} = x, k = alertKey(a), had = due.get(k);
    if (!had) due.set(k, a);
    else if (a.kind === "eve" && Array.isArray(a.w)) had.w = [...(had.w || []), ...a.w.filter(y => !(had.w || []).some(z => z.id === y.id))];
  }
  if (!due.size) return 0;
  const sentRaw = await env.AGENDA.get("sent"), done = new Set(sentRaw ? JSON.parse(sentRaw) : []);
  const left = [...due.values()].filter(a => !done.has(alertKey(a))).sort((a, b) => a.t - b.t);
  if (!left.length) return 0;
  const subRaw = await env.AGENDA.get("sub");
  if (!subRaw) return 0;
  const sub = JSON.parse(subRaw);
  let sent = 0, more = false;
  for (const a of left) {
    const status = await push(env, sub, a, fetchImpl);
    if (status === 404 || status === 410) { console.log("The phone isn't connected to reminders any more."); break; }
    // Answered, either way: done. No answer, too busy, or failing: tried again later.
    if (status && status < 500 && status !== 429) { done.add(alertKey(a)); more = true; }
    if (status >= 200 && status < 300) sent++;
    else console.log("The push service turned a reminder away (" + status + ").");
  }
  if (more) await env.AGENDA.put("sent", JSON.stringify([...done].filter(k => parseInt(k, 10) > at - CATCH_UP - MINUTE)));
  return sent;
}

// ---- Tell GI Hub -----------------------------------------------------------------------------------
// One request to the inbox: {status, data}. who is "phone" only when the
// phone's token was matched here, "worker" only for this Worker's own calls;
// any other key goes as its fingerprint, for the inbox to match.
async function tellOp(env, op, {who = null, fp = null, now, body = null}) {
  const stub = env.TELL.get(env.TELL.idFromName("inbox"));
  const res = await stub.fetch(new Request("https://tell/op", {method: "POST", body: JSON.stringify({op, who, fp, now, body})}));
  return res.json();
}
async function caller(req, env) {
  const m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.get("Authorization") || "");
  if (!m) return {who: null, fp: null};
  const h = await sha256(m[1]), kept = await env.AGENDA.get("auth");
  return kept === h ? {who: "phone", fp: null} : {who: null, fp: h};
}
// A JSON body no longer than max: undefined when it's longer, null when it isn't JSON.
async function readCapped(req, max) {
  const text = await req.text();
  if (text.length > max) return undefined;
  try { return JSON.parse(text); } catch (e) { return null; }
}
const RESULT_ID = /^a[a-z0-9]{10}$/;
const obj = b => (b && typeof b === "object" ? b : {});
async function tellRoute(req, env, now, fetchImpl, path, m) {
  if (!env.TELL) return reply(404, {error: "not found"});
  const {who, fp} = await caller(req, env), ask = (op, body) => tellOp(env, op, {who, fp, now, body});
  const out = r => reply(r.status, r.data);
  if (path === "/inbox" && m === "POST") {
    const b = await readCapped(req, 20000);
    if (b === undefined) return reply(413, {error: "too long"});
    return out(await ask("say", {text: obj(b).text, at: obj(b).at}));
  }
  if (path === "/inbox" && m === "GET") return out(await ask("items"));
  if (path === "/results" && m === "POST") {
    const b = await readCapped(req, 400000);
    if (b === undefined) return reply(413, {error: "too many results"});
    const r = await ask("file", {results: obj(b).results});
    if (r.status !== 200) return out(r);
    // Filed, whatever happens next. Ideas wait for the desktop (it lists idea: keys);
    // the phone hears what was added.
    try {
      for (const i of r.data.ideas) await env.AGENDA.put("idea:" + i.id, JSON.stringify({for: i.for, t: i.t, said: i.said}));
      const subRaw = r.data.added ? await env.AGENDA.get("sub") : null;
      if (subRaw) await push(env, JSON.parse(subRaw), r.data.added, fetchImpl);
    } catch (e) { console.log("Filed, but the idea or the push didn't go."); }
    const {kept, skipped, left} = r.data;
    return reply(200, {ok: true, kept, skipped, left});
  }
  if (who !== "phone") return reply(401, {error: "locked"});
  if (path === "/results" && m === "GET") return out(await ask("results"));
  if (path === "/tell" && m === "PUT") {
    const b = obj(await readCapped(req, 2000));
    return out(await ask("keys", {shortcut: b.shortcut, claude: b.claude}));
  }
  if (path === "/tell" && m === "DELETE") return out(await ask("off"));
  if (path === "/tell/test" && m === "POST") return out(await ask("test"));
  if (path === "/tell/test" && m === "GET") return out(await ask("score"));
  if (path.startsWith("/idea/") && m === "DELETE") {
    const id = path.slice(6);
    if (!RESULT_ID.test(id)) return reply(400, {error: "not an idea"});
    await env.AGENDA.delete("idea:" + id);
    return reply(204);
  }
  return reply(405, {error: "not allowed"});
}

// The inbox's minute check: start Claude when it's time, and return the alerts
// Claude's results need until the phone has them. Never throws: the phone's
// own reminders go whatever the inbox does.
const TASK = /^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/trig_[A-Za-z0-9]+\/fire$/;
export async function tellTick(env, at, fetchImpl = fetch) {
  if (!env.TELL) return [];
  const ready = TASK.test(env.TASK_URL || "") && typeof env.TASK_TOKEN === "string" && env.TASK_TOKEN.length > 0;
  let r;
  try { r = await tellOp(env, "tick", {who: "worker", now: at, body: {at, ready}}); }
  catch (e) { console.log("The inbox didn't answer."); return []; }
  if (r.status !== 200) return [];
  if (r.data.fire) {
    let status = 0, retry;
    try {
      const res = await fetchImpl(env.TASK_URL, {method: "POST", headers: {Authorization: "Bearer " + env.TASK_TOKEN,
        "anthropic-version": "2023-06-01", "anthropic-beta": "experimental-cc-routine-2026-04-01"}});
      status = res.status;
      retry = retryAfter(res, at);
    } catch (e) {}
    try { await tellOp(env, "fired", {who: "worker", now: at, body: {at, status, retry}}); }
    catch (e) { console.log("Claude was started, but the inbox didn't hear how it went."); }
  }
  return Array.isArray(r.data.pending) ? r.data.pending : [];
}
// Retry-After as seconds (or a date), from `at`.
function retryAfter(res, at) {
  const v = res.headers && typeof res.headers.get === "function" ? (res.headers.get("Retry-After") || "").trim() : "";
  if (/^\d+$/.test(v)) return +v;
  const t = v ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? Math.max(0, Math.round((t - at) / 1000)) : undefined;
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
  if (["/inbox", "/results", "/tell", "/tell/test"].includes(path) || path.startsWith("/idea/")) return tellRoute(req, env, now, fetchImpl, path, m);
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
    // Claude's results this plan now has: the inbox keeps them ten minutes
    // more, for a minute check that reads an older copy of the plan.
    const ack = Array.isArray(body.ack) ? body.ack.filter(id => typeof id === "string" && RESULT_ID.test(id)).slice(0, 200) : [];
    if (ack.length && env.TELL) await tellOp(env, "ack", {who: "worker", now, body: {ids: ack, at: now}});
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
  async scheduled(controller, env) {
    const at = controller.scheduledTime;
    await sendDue(env, at, fetch, await tellTick(env, at));
  },
};
