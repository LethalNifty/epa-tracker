// Invite codes for the fellows' site, checked on Cloudflare before any file is
// served (functions/_middleware.js runs this on every request).
//
// Each fellow gets their own code. The codes live only in the Cloudflare
// secret GI_CODES, as "f01:K7QM-4TZP f02:..." (an id, a colon, the code; any
// spaces or commas between). Entering a code sets a cookie holding the id and
// a signature made with that fellow's own code, so taking a code out of
// GI_CODES (and redeploying) ends that one fellow's access and nobody else's.
// With GI_CODES missing, every code fails: the site stays closed.
//
// Open without a code: what "Add to Home Screen" and the service worker need
// (icons, manifest, font, sw.js and the notify.js it imports) and robots.txt.

const OPEN = new Set(["/manifest.webmanifest", "/icon.svg", "/icon-180.png", "/icon-192.png", "/icon-512.png",
  "/fonts/outfit-var.woff2", "/robots.txt", "/sw.js", "/notify.js"]);
const COOKIE = "gi_access", YEAR_ISH = 400 * 86400;
const enc = new TextEncoder();
export const normCode = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export function codesFrom(env) {
  const m = new Map();
  for (const part of String((env && env.GI_CODES) || "").split(/[\s,;]+/)) {
    const i = part.indexOf(":");
    if (i < 1) continue;
    const id = part.slice(0, i), code = normCode(part.slice(i + 1));
    if (/^[A-Za-z0-9_-]+$/.test(id) && code.length >= 6) m.set(id, code);
  }
  return m;
}
async function sign(code, id) {
  const key = await crypto.subtle.importKey("raw", enc.encode(code), {name: "HMAC", hash: "SHA-256"}, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode("gi-access:" + id)));
  return [...sig].map(b => b.toString(16).padStart(2, "0")).join("");
}
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function allowed(request, codes) {
  const c = new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]+)\\.([0-9a-f]{64})`).exec(request.headers.get("Cookie") || "");
  return !!c && codes.has(c[1]) && same(await sign(codes.get(c[1]), c[1]), c[2]);
}
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {status,
  headers: {"Content-Type": "application/json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", ...headers}});

export async function handle(request, env, next) {
  const url = new URL(request.url), codes = codesFrom(env);
  if (url.pathname === "/__access") {
    if (request.method === "POST") {
      let typed = "";
      try { typed = normCode((await request.json()).code); } catch (e) {}
      let id = null;
      for (const [k, code] of codes) if (typed && same(code, typed)) id = k;
      if (!id) {
        // A wrong code waits a moment, so codes can't be guessed quickly.
        await new Promise(r => setTimeout(r, 600));
        return json(401, {ok: false});
      }
      return json(200, {ok: true}, {"Set-Cookie": `${COOKIE}=${id}.${await sign(codes.get(id), id)}; Path=/; Max-Age=${YEAR_ISH}; Secure; HttpOnly; SameSite=Lax`});
    }
    const ok = await allowed(request, codes);
    return json(ok ? 200 : 401, {ok});
  }
  if (OPEN.has(url.pathname) || await allowed(request, codes)) {
    const res = await next();
    const out = new Response(res.body, res);
    out.headers.set("X-Robots-Tag", "noindex");
    return out;
  }
  const page = request.method === "GET" && (url.pathname === "/" || url.pathname.endsWith(".html") || /text\/html/.test(request.headers.get("Accept") || ""));
  if (!page) return new Response("Invite code needed", {status: 401, headers: {"Cache-Control": "no-store", "X-Robots-Tag": "noindex"}});
  return new Response(GATE, {status: 200, headers: {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex"}});
}

// The page anyone without a code sees. It carries the manifest and icons, so
// adding it to the home screen gives the real app's name and icon.
export const GATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>GI Hub</title>
<meta name="robots" content="noindex, nofollow">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="GI Hub">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#0d0b1f">
<style>
@font-face { font-family: "Outfit"; src: url("/fonts/outfit-var.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }
:root { color-scheme: dark; }
* { box-sizing: border-box; }
html { background: #0d0b1f; }
body { margin: 0; min-height: 100vh; color: #f5f2ff; font: 400 15px/1.45 "Outfit", -apple-system, system-ui, sans-serif;
  background: radial-gradient(120% 60% at 20% 0%, rgba(139, 108, 255, .22), transparent 60%), #0d0b1f; }
main { max-width: 440px; margin: 0 auto; padding: calc(env(safe-area-inset-top) + 56px) 22px 40px; }
.eyebrow { margin: 0; color: #b3aed0; font-size: 11px; font-weight: 500; letter-spacing: .11em; text-transform: uppercase; }
h1 { margin: 6px 0 0; font-size: 30px; line-height: 1.15; font-weight: 500; letter-spacing: -.015em; }
p { color: #b3aed0; }
input { display: block; width: 100%; height: 56px; margin-top: 22px; padding: 0 16px; border-radius: 14px; border: 1px solid rgba(255, 255, 255, .16);
  background: rgba(255, 255, 255, .055); color: #f5f2ff; font: 500 22px/1 "Outfit", system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; }
input:focus { outline: none; border-color: #d58cff; box-shadow: 0 0 0 4px rgba(213, 140, 255, .13); }
button { width: 100%; height: 52px; margin-top: 12px; border: 0; border-radius: 14px; color: #fff; font: 520 16px/1 "Outfit", system-ui, sans-serif;
  background: linear-gradient(135deg, #8b6cff, #e063d3 55%, #ff8e6b); }
button:disabled { opacity: .6; }
.err { min-height: 20px; margin-top: 12px; color: #ff7f95; font-size: 14px; }
.note { margin-top: 26px; font-size: 13px; }
</style>
</head>
<body>
<main>
<p class="eyebrow">GI Hub · Adult Gastroenterology</p>
<h1>Enter your invite code</h1>
<p>GI Hub is shared by invitation. Your code came with the link.</p>
<form id="f">
<input id="c" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" placeholder="ABCD-2345" aria-label="Invite code">
<button id="b">Open GI Hub</button>
<div class="err" id="e" role="alert"></div>
</form>
<p class="note">On iPhone, add GI Hub to your home screen first and enter the code there: Safari and the home-screen app sign in separately.</p>
</main>
<script>
document.getElementById("f").addEventListener("submit", async ev => {
  ev.preventDefault();
  const b = document.getElementById("b"), e = document.getElementById("e");
  b.disabled = true; e.textContent = "";
  try {
    const r = await fetch("/__access", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({code: document.getElementById("c").value})});
    if (r.ok) { location.replace("/"); return; }
    e.textContent = "That code doesn't work. Check it, or ask the person who invited you.";
  } catch (err) { e.textContent = "No connection. Try again once you have signal."; }
  b.disabled = false;
});
</script>
</body>
</html>
`;
