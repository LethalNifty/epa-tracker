// Invite codes for the fellows' site, checked on Cloudflare before any file is
// served (functions/_middleware.js runs this on every request).
//
// Each fellow gets their own code, and a code opens GI Hub on one phone: the
// first phone to enter it claims it; another phone that tries it is turned
// away, and the attempt is noted. Whoever hands out the codes manages them at
// /__admin: which phone each code is on, when it was last opened, attempts
// from other phones, and buttons to free a code for a new phone, turn one off,
// or add a new code.
//
// Where things live:
//   GI_CODES  secret: the first codes, "f01:K7QM-4TZP f02:..." (an id, a colon,
//             the code; any spaces or commas between).
//   GI_KV     KV namespace: "acc:<id>" is a code's phone, state and attempts;
//             "extra" holds the codes added at /__admin.
//   GI_ADMIN  secret: the key that opens /__admin.
// Without GI_KV no phone can claim a code, so the site stays closed to new
// phones; phones already in keep working. Without GI_CODES (or with a code
// taken out of it) that code fails everywhere.
//
// The cookie holds the code's id, a random number for the phone that claimed
// it, and a signature made with the code, so it can't be forged, and a phone
// whose code was freed or turned off is locked out at its next check.
//
// Open without a code: what "Add to Home Screen" and the service worker need
// (icons, manifest, font, sw.js and the notify.js it imports) and robots.txt.

const OPEN = new Set(["/manifest.webmanifest", "/icon.svg", "/icon-180.png", "/icon-192.png", "/icon-512.png",
  "/fonts/outfit-var.woff2", "/robots.txt", "/sw.js", "/notify.js"]);
const COOKIE = "gi_access", ADMIN = "gi_admin", YEAR_ISH = 400 * 86400, TRIES = 20;
// Codes leave out letters and digits that read alike (I, L, O, 0, 1).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const enc = new TextEncoder();
export const normCode = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const shown = c => c.length === 8 ? c.slice(0, 4) + "-" + c.slice(4) : c;
const hex = a => [...a].map(b => b.toString(16).padStart(2, "0")).join("");
const wait = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
const ID = /^[A-Za-z0-9_-]+$/;

export function codesFrom(env) {
  const m = new Map();
  for (const part of String((env && env.GI_CODES) || "").split(/[\s,;]+/)) {
    const i = part.indexOf(":");
    if (i < 1) continue;
    const id = part.slice(0, i), code = normCode(part.slice(i + 1));
    if (ID.test(id) && code.length >= 6) m.set(id, code);
  }
  return m;
}
async function extra(env) {
  if (!env || !env.GI_KV) return {};
  const x = await env.GI_KV.get("extra", "json");
  return x && typeof x === "object" ? x : {};
}
// Every code: the secret's first, then the ones added at /__admin.
async function allCodes(env) {
  const m = codesFrom(env);
  for (const [id, code] of Object.entries(await extra(env)))
    if (!m.has(id) && ID.test(id) && normCode(code).length >= 6) m.set(id, normCode(code));
  return m;
}
async function codeFor(env, id) {
  return codesFrom(env).get(id) || (ID.test(id) ? normCode((await extra(env))[id]) || null : null);
}

async function hmac(key, msg) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), {name: "HMAC", hash: "SHA-256"}, false, ["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg))));
}
// A cookie from before codes claimed a phone has no phone number (n).
const sigFor = (code, id, n) => hmac(code, n ? `gi-access:${id}.${n}` : "gi-access:" + id);
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function cookie(request, name) {
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(request.headers.get("Cookie") || "");
  return m ? m[1].trim() : "";
}

// A code's record: the phone holding it, whether it's turned off, how many
// phones have held it, and attempts from other phones (newest last).
async function record(env, id) {
  const r = await env.GI_KV.get("acc:" + id, "json");
  return {phone: null, off: false, claims: 0, tries: [], ...(r && typeof r === "object" ? r : {})};
}
const save = (env, id, rec) => env.GI_KV.put("acc:" + id, JSON.stringify(rec));

function device(request) {
  const ua = request.headers.get("User-Agent") || "";
  return /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
    : /Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : ua ? "Other" : "Unknown";
}
// Cloudflare's guess from the network: rough, and a phone on LTE can show a
// city it isn't in.
function place(request) {
  const cf = request.cf || {};
  const bits = [cf.city, cf.regionCode || cf.region].filter(Boolean);
  if (cf.country && cf.country !== "CA") bits.push(cf.country);
  return bits.join(", ");
}

// The code this request's cookie opens, or null. The cookie must be signed
// with the code, and (with the store) be the phone holding a code that's on.
async function holder(request, env) {
  const c = /^([A-Za-z0-9_-]+)\.(?:([0-9a-f]{16})\.)?([0-9a-f]{64})$/.exec(cookie(request, COOKIE));
  if (!c) return null;
  const [, id, n = "", sig] = c, code = await codeFor(env, id);
  if (!code || !same(await sigFor(code, id, n), sig)) return null;
  if (!env.GI_KV) return {id, n, code, rec: null};
  const rec = await record(env, id);
  if (rec.off) return null;
  // An older cookie still opens a code no phone has held yet; it claims it at its next check.
  const ok = n ? !!rec.phone && rec.phone.n === n : !rec.phone && !rec.claims;
  return ok ? {id, n, code, rec} : null;
}
async function claim(env, id, code, rec, request) {
  const n = hex(crypto.getRandomValues(new Uint8Array(8))), now = new Date().toISOString();
  rec.phone = {n, at: now, dev: device(request), where: place(request), seen: now};
  rec.claims = (rec.claims || 0) + 1;
  await save(env, id, rec);
  return `${COOKIE}=${id}.${n}.${await sigFor(code, id, n)}; Path=/; Max-Age=${YEAR_ISH}; Secure; HttpOnly; SameSite=Lax`;
}
async function noteTry(env, id, rec, request) {
  const last = rec.tries[rec.tries.length - 1];
  // At most one note a minute for a code, so retrying can't use up the store's daily writes.
  if (last && Date.now() - Date.parse(last.at) < 60e3) return;
  rec.tries = [...rec.tries, {at: new Date().toISOString(), dev: device(request), where: place(request)}].slice(-TRIES);
  await save(env, id, rec);
}

const NOINDEX = {"Cache-Control": "no-store", "X-Robots-Tag": "noindex"};
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {status,
  headers: {"Content-Type": "application/json", ...NOINDEX, ...headers}});
const page = (status, html, headers = {}) => new Response(html, {status,
  headers: {"Content-Type": "text/html; charset=utf-8", ...NOINDEX, ...headers}});
const goTo = (where, headers = {}) => new Response(null, {status: 303, headers: {Location: where, ...NOINDEX, ...headers}});

export async function handle(request, env, next) {
  env = env || {};
  const url = new URL(request.url);
  if (url.pathname === "/__admin" || url.pathname.startsWith("/__admin/")) return admin(request, env, url);
  if (url.pathname === "/__access") return request.method === "POST" ? signIn(request, env) : check(request, env);
  if (OPEN.has(url.pathname) || await holder(request, env)) {
    const res = await next();
    const out = new Response(res.body, res);
    out.headers.set("X-Robots-Tag", "noindex");
    return out;
  }
  const html = request.method === "GET" && (url.pathname === "/" || url.pathname.endsWith(".html") || /text\/html/.test(request.headers.get("Accept") || ""));
  if (!html) return new Response("Invite code needed", {status: 401, headers: NOINDEX});
  return page(200, GATE);
}

// Entering a code: the first phone claims it.
async function signIn(request, env) {
  let typed = "";
  try { typed = normCode((await request.json()).code); } catch (e) {}
  let id = null;
  const codes = await allCodes(env);
  for (const [k, code] of codes) if (typed && same(code, typed)) id = k;
  // A refused code waits a moment, so codes can't be tried quickly.
  if (!id) { await wait(600); return json(401, {ok: false, why: "wrong"}); }
  if (!env.GI_KV) return json(503, {ok: false, why: "setup"});
  const rec = await record(env, id);
  if (rec.off) { await wait(600); return json(401, {ok: false, why: "off"}); }
  if (rec.phone) {
    const me = await holder(request, env);
    if (me && me.id === id) return json(200, {ok: true});
    await noteTry(env, id, rec, request);
    await wait(600);
    return json(409, {ok: false, why: "taken"});
  }
  return json(200, {ok: true}, {"Set-Cookie": await claim(env, id, codes.get(id), rec, request)});
}

// The app asks on each launch online whether this phone still holds its code.
async function check(request, env) {
  const me = await holder(request, env);
  if (!me) return json(401, {ok: false});
  if (!me.rec) return json(200, {ok: true});
  if (!me.n) return json(200, {ok: true}, {"Set-Cookie": await claim(env, me.id, me.code, me.rec, request)});
  const now = new Date().toISOString();
  // "Last opened" moves once a day at most, to keep writes few.
  if (String(me.rec.phone.seen || "").slice(0, 10) !== now.slice(0, 10)) { me.rec.phone.seen = now; await save(env, me.id, me.rec); }
  return json(200, {ok: true});
}

// ---- /__admin ---------------------------------------------------------------------------------------
async function admin(request, env, url) {
  const key = normCode(env.GI_ADMIN);
  if (key.length < 12) return page(404, "Not found");
  const token = await hmac(key, "gi-admin");
  if (request.method === "POST" && url.pathname === "/__admin/login") {
    let typed = "";
    try { typed = normCode((await request.formData()).get("key")); } catch (e) {}
    if (typed && same(typed, key))
      return goTo("/__admin", {"Set-Cookie": `${ADMIN}=${token}; Path=/__admin; Max-Age=${30 * 86400}; Secure; HttpOnly; SameSite=Lax`});
    await wait(600);
    return page(401, adminLogin("That key doesn't work."));
  }
  if (!same(cookie(request, ADMIN), token)) return page(200, adminLogin(""));
  if (request.method === "POST" && url.pathname === "/__admin/act") {
    let form = null;
    try { form = await request.formData(); } catch (e) {}
    if (!form || !env.GI_KV) return goTo("/__admin");
    const act = String(form.get("act") || ""), id = String(form.get("id") || "");
    if (act === "add") return goTo("/__admin?new=" + encodeURIComponent(await addCode(env)));
    if (!(await allCodes(env)).has(id)) return goTo("/__admin");
    const rec = await record(env, id);
    if (act === "free") rec.phone = null;
    else if (act === "off") rec.off = true;
    else if (act === "on") rec.off = false;
    else if (act === "clear") rec.tries = [];
    else return goTo("/__admin");
    await save(env, id, rec);
    return goTo("/__admin#" + id);
  }
  return page(200, await adminPage(env, url.searchParams.get("new")));
}
function freshCode() {
  let out = "";
  const top = 256 - 256 % ALPHABET.length;
  while (out.length < 8) for (const b of crypto.getRandomValues(new Uint8Array(16)))
    if (b < top && out.length < 8) out += ALPHABET[b % ALPHABET.length];
  return out;
}
async function addCode(env) {
  const codes = await allCodes(env), x = await extra(env);
  const top = Math.max(0, ...[...codes.keys()].map(id => (/^f(\d+)$/.exec(id) || [])[1] || 0).map(Number));
  const id = "f" + String(top + 1).padStart(2, "0");
  x[id] = freshCode();
  await env.GI_KV.put("extra", JSON.stringify(x));
  return id;
}
const when = iso => `<time datetime="${esc(iso)}">${esc(String(iso || "").slice(0, 10))}</time>`;
const where = (dev, at) => [dev, at].filter(Boolean).map(esc).join(" · ");
function button(id, act, label, cls = "", ask = "") {
  return `<form method="post" action="/__admin/act"${ask ? ` onsubmit="return confirm(${esc(JSON.stringify(ask))})"` : ""}>` +
    `<input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="act" value="${act}">` +
    `<button class="${cls}">${label}</button></form>`;
}
async function adminPage(env, fresh) {
  const codes = [...(await allCodes(env))].sort((a, b) => a[0].localeCompare(b[0], "en", {numeric: true}));
  const recs = env.GI_KV ? await Promise.all(codes.map(([id]) => record(env, id))) : codes.map(() => null);
  const inUse = recs.filter(r => r && r.phone && !r.off).length, flagged = recs.filter(r => r && r.tries.length).length;
  let h = `<p class="eyebrow">GI Hub · Invite codes</p><h1>Who's in</h1>` +
    `<p>${inUse} of ${codes.length} codes in use${flagged ? ` · <b class="hot">${flagged} tried on another phone</b>` : ""}</p>`;
  if (!env.GI_KV) h += `<p class="err">The storage (GI_KV) isn't connected, so no new phone can sign in. Connect it in the project's Settings, Bindings.</p>`;
  const made = fresh && codes.find(([id]) => id === fresh);
  if (made) h += `<div class="new">New code <b>${esc(made[0])}</b>: <span class="code">${esc(shown(made[1]))}</span><br>Send it privately, and write down who has it.</div>`;
  codes.forEach(([id, code], i) => {
    const r = recs[i] || {phone: null, off: false, tries: []}, p = r.phone;
    const tag = r.off ? `<span class="tag off">Turned off</span>` : p ? `<span class="tag on">In use</span>` : `<span class="tag">Not used yet</span>`;
    h += `<section class="row${r.tries.length ? " hot" : ""}" id="${esc(id)}"><div class="top"><b>${esc(id)}</b><span class="code">${esc(shown(code))}</span>${tag}</div>`;
    if (p) h += `<p>${where(p.dev, p.where)} · since ${when(p.at)}<br>Last opened ${when(p.seen || p.at)}</p>`;
    if (r.tries.length) {
      h += `<div class="tries"><b>Tried on another phone ${r.tries.length === 1 ? "once" : r.tries.length + " times"}</b><ul>` +
        r.tries.slice(-5).reverse().map(t => `<li>${where(t.dev, t.where)} · ${when(t.at)}</li>`).join("") + `</ul></div>`;
    }
    if (env.GI_KV) {
      h += `<div class="acts">` +
        (p ? button(id, "free", "Free for new phone", "", `Free ${id} for a new phone? The phone it's on now locks.`) : "") +
        (r.off ? button(id, "on", "Turn back on") : button(id, "off", "Turn off", "danger", `Turn off ${id}? GI Hub locks on that phone.`)) +
        (r.tries.length ? button(id, "clear", "Clear attempts") : "") + `</div>`;
    }
    h += `</section>`;
  });
  if (env.GI_KV) h += `<div class="acts add">${button("", "add", "Add a code", "primary")}</div>`;
  h += `<p class="note">Keep the list of who has which code yourself; this page shows only the codes. Places are Cloudflare's rough guess from the network.</p>`;
  return shell("GI Hub codes", h, `<script>for (const t of document.querySelectorAll("time")) { const d = new Date(t.dateTime);` +
    ` if (!isNaN(d)) t.textContent = d.toLocaleString([], {month: "short", day: "numeric", hour: "numeric", minute: "2-digit"}); }</script>`);
}
function adminLogin(err) {
  return shell("GI Hub codes", `<p class="eyebrow">GI Hub · Invite codes</p><h1>Admin key</h1>` +
    `<form method="post" action="/__admin/login"><input name="key" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Admin key">` +
    `<button class="primary">Open</button><div class="err">${esc(err)}</div></form>`);
}

// ---- Pages ------------------------------------------------------------------------------------------
const STYLE = `
@font-face { font-family: "Outfit"; src: url("/fonts/outfit-var.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }
:root { color-scheme: dark; }
* { box-sizing: border-box; }
html { background: #0d0b1f; }
body { margin: 0; min-height: 100vh; color: #f5f2ff; font: 400 15px/1.45 "Outfit", -apple-system, system-ui, sans-serif;
  background: radial-gradient(120% 60% at 20% 0%, rgba(139, 108, 255, .22), transparent 60%), #0d0b1f; }
main { max-width: 440px; margin: 0 auto; padding: calc(env(safe-area-inset-top) + 56px) 22px 40px; }
.eyebrow { margin: 0; color: #b3aed0; font-size: 11px; font-weight: 500; letter-spacing: .11em; text-transform: uppercase; }
h1 { margin: 6px 0 0; font-size: 30px; line-height: 1.15; font-weight: 500; letter-spacing: -.015em; }
p, li { color: #b3aed0; }
input { display: block; width: 100%; height: 56px; margin-top: 22px; padding: 0 16px; border-radius: 14px; border: 1px solid rgba(255, 255, 255, .16);
  background: rgba(255, 255, 255, .055); color: #f5f2ff; font: 500 22px/1 "Outfit", system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; }
input:focus { outline: none; border-color: #d58cff; box-shadow: 0 0 0 4px rgba(213, 140, 255, .13); }
button { width: 100%; height: 52px; margin-top: 12px; border: 0; border-radius: 14px; color: #fff; font: 520 16px/1 "Outfit", system-ui, sans-serif;
  background: rgba(255, 255, 255, .09); }
button.primary { background: linear-gradient(135deg, #8b6cff, #e063d3 55%, #ff8e6b); }
button:disabled { opacity: .6; }
.err { min-height: 20px; margin-top: 12px; color: #ff7f95; font-size: 14px; }
.note { margin-top: 26px; font-size: 13px; }
ol { padding-left: 22px; } li + li { margin-top: 8px; } li b { color: #f5f2ff; font-weight: 520; }
`;
const ADMIN_STYLE = `
.row { margin-top: 14px; padding: 14px 16px; border-radius: 16px; background: rgba(255, 255, 255, .045); border: 1px solid rgba(255, 255, 255, .08); }
.row.hot { border-color: rgba(255, 127, 149, .55); }
.row p { margin: 8px 0 0; font-size: 14px; }
.top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.code { font-variant-numeric: tabular-nums; letter-spacing: .08em; user-select: all; -webkit-user-select: all; }
.tag { margin-left: auto; padding: 3px 9px; border-radius: 99px; font-size: 12px; color: #b3aed0; background: rgba(255, 255, 255, .07); }
.tag.on { color: #9ef0c4; background: rgba(80, 220, 150, .13); } .tag.off { color: #ff7f95; background: rgba(255, 127, 149, .13); }
b.hot, .tries b { color: #ff9fb0; }
.tries { margin-top: 10px; font-size: 14px; } .tries ul { margin: 4px 0 0; padding-left: 18px; }
.acts { display: flex; gap: 8px; flex-wrap: wrap; } .acts form { flex: 1 1 140px; }
.acts button { height: 42px; margin-top: 12px; font-size: 14px; }
button.danger { color: #ff9fb0; }
.add button { height: 52px; font-size: 16px; margin-top: 22px; }
.new { margin-top: 18px; padding: 14px 16px; border-radius: 16px; background: rgba(139, 108, 255, .16); line-height: 1.6; }
.new .code { font-size: 20px; color: #fff; }
`;
const HEAD = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<meta name="theme-color" content="#0d0b1f">`;
function shell(title, body, script = "") {
  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n${HEAD}\n<title>${title}</title>\n<style>${STYLE}${ADMIN_STYLE}</style>\n</head>\n` +
    `<body>\n<main>\n${body}\n</main>\n${script}\n</body>\n</html>\n`;
}

// The page anyone without a code sees. It carries the manifest and icons, so
// adding it to the home screen gives the real app's name and icon. On an
// iPhone in Safari it asks for the home screen first: Safari and the
// home-screen app keep separate cookies, and a code entered in Safari would
// claim it for Safari.
export const GATE = `<!DOCTYPE html>
<html lang="en">
<head>
${HEAD}
<title>GI Hub</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="GI Hub">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<style>${STYLE}</style>
</head>
<body>
<main>
<p class="eyebrow">GI Hub · Adult Gastroenterology</p>
<div id="home" hidden>
<h1>Add GI Hub to your Home Screen first</h1>
<p>Your invite code goes in the home-screen app, not in Safari.</p>
<ol>
<li>Tap the <b>☰</b> button (three lines) at the left of the address bar, then <b>Share</b>. On some iPhones, Share is right at the bottom.</li>
<li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
<li>Open <b>GI Hub</b> from your home screen and enter your code there.</li>
</ol>
<p class="note">Opened this link from another app? Open it in Safari first.</p>
</div>
<div id="enter">
<h1>Enter your invite code</h1>
<p>GI Hub is shared by invitation. Your code came with the link.</p>
<form id="f">
<input id="c" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" placeholder="ABCD-2345" aria-label="Invite code">
<button id="b" class="primary">Open GI Hub</button>
<div class="err" id="e" role="alert"></div>
</form>
</div>
</main>
<script>
const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const app = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
if (ios && !app) { document.getElementById("home").hidden = false; document.getElementById("enter").hidden = true; }
const WHY = {
  taken: "That code is already in use on another phone. Ask the person who invited you.",
  off: "That code has been turned off. Ask the person who invited you.",
  setup: "Signing in isn't open right now. Try again later.",
  wrong: "That code doesn't work. Check it, or ask the person who invited you."
};
document.getElementById("f").addEventListener("submit", async ev => {
  ev.preventDefault();
  const b = document.getElementById("b"), e = document.getElementById("e");
  b.disabled = true; e.textContent = "";
  try {
    const r = await fetch("/__access", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({code: document.getElementById("c").value})});
    if (r.ok) { location.replace("/"); return; }
    let why = "";
    try { why = (await r.json()).why; } catch (err) {}
    e.textContent = WHY[why] || WHY.wrong;
  } catch (err) { e.textContent = "No connection. Try again once you have signal."; }
  b.disabled = false;
});
</script>
</body>
</html>
`;
