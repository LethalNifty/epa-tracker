// GI Hub's backup: a Cloudflare Worker that keeps the last 14 daily backups.
// Each one is locked on the phone before it leaves (AES-GCM, with a key made
// from a passphrase only the user knows), so Cloudflare only ever holds
// scrambled data. Its own Worker (wrangler.toml beside this file), never in
// functions/, which deploys to the fellows' site. Storage: the KV namespace
// BACKUPS, one key per day ("b:2026-11-03") and "auth".
//
// The phone proves itself with a second key made from the same passphrase,
// sent as a bearer token; the Worker keeps only its SHA-256, set by the first
// backup it takes.
//   PUT    /backups/YYYY-MM-DD   that day's backup (the same day again replaces it)
//   GET    /backups              the days kept, newest first
//   GET    /backups/YYYY-MM-DD   one day's backup
//   DELETE /backups              every backup and the token: a fresh start
const ORIGIN = "https://lethalnifty.github.io";
const KEEP = 14, MAX_BYTES = 5 * 1024 * 1024, DAY_MS = 864e5;
const HEADERS = {
  "Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store", Vary: "Origin",
};
const reply = (status, body, type = "application/json") =>
  new Response(body === undefined ? null : typeof body === "string" ? body : JSON.stringify(body),
    {status, headers: body === undefined ? HEADERS : {...HEADERS, "Content-Type": type}});

const sha256 = async text => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))]
  .map(b => b.toString(16).padStart(2, "0")).join("");
// A real calendar day within two of the Worker's own (the phone's day can run
// ahead of UTC or behind it).
function dayOk(day, now) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const t = Date.parse(day + "T12:00:00Z");
  return !isNaN(t) && new Date(t).toISOString().slice(0, 10) === day && Math.abs(t - now) <= 2 * DAY_MS;
}
// What the phone sends: {v: 1, iv, ct}, the locked backup and its nonce.
function sealedOk(text) {
  try { const s = JSON.parse(text); return !!s && s.v === 1 && typeof s.iv === "string" && typeof s.ct === "string" && s.ct.length > 0; }
  catch (e) { return false; }
}
// The bearer token's fingerprint matches the one kept; with claim, the first
// backup sets it.
async function allowed(req, env, claim) {
  const m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.get("Authorization") || "");
  if (!m) return false;
  const h = await sha256(m[1]), kept = await env.BACKUPS.get("auth");
  if (kept) return kept === h;
  if (!claim) return false;
  await env.BACKUPS.put("auth", h);
  return true;
}
const daysKept = async env => (await env.BACKUPS.list({prefix: "b:"})).keys;

// Any failure (storage down) still answers, with the headers that let the
// phone read it, so it reads as a refusal rather than no connection.
export async function handle(req, env, now = Date.now()) {
  try { return await route(req, env, now); }
  catch (e) { return reply(500, {error: "the backup store failed"}); }
}

async function route(req, env, now) {
  if (req.method === "OPTIONS") return reply(204);
  const path = new URL(req.url).pathname, one = /^\/backups\/([^/]+)$/.exec(path);
  if (path !== "/backups" && !one) return reply(404, {error: "not found"});
  if (req.method === "PUT" && one) {
    const day = one[1], body = await req.text();
    if (body.length > MAX_BYTES) return reply(413, {error: "too big"});
    if (!dayOk(day, now) || !sealedOk(body)) return reply(400, {error: "not a locked backup for about today"});
    if (!(await allowed(req, env, true))) return reply(401, {error: "locked with another passphrase"});
    await env.BACKUPS.put("b:" + day, body, {metadata: {size: body.length, at: new Date(now).toISOString()}});
    const keys = await daysKept(env);
    for (const k of keys.slice(0, Math.max(0, keys.length - KEEP))) await env.BACKUPS.delete(k.name);
    return reply(200, {kept: Math.min(keys.length, KEEP)});
  }
  if (req.method === "GET" || (req.method === "DELETE" && !one)) {
    if (!(await allowed(req, env, false))) return reply(401, {error: "locked"});
    if (req.method === "DELETE") {
      for (const k of await daysKept(env)) await env.BACKUPS.delete(k.name);
      await env.BACKUPS.delete("auth");
      return reply(204);
    }
    if (!one) return reply(200, {days: (await daysKept(env)).reverse()
      .map(k => ({day: k.name.slice(2), size: (k.metadata && k.metadata.size) || 0, at: (k.metadata && k.metadata.at) || null}))});
    const body = await env.BACKUPS.get("b:" + one[1]);
    return body === null ? reply(404, {error: "no backup that day"}) : reply(200, body);
  }
  return reply(405, {error: "not allowed"});
}

export default {
  async fetch(req, env) { return handle(req, env); },
};
