"""Bundles GI Hub into one self-contained HTML page with fictional demo data,
for showing a change on the user's phone (publish it as an Artifact) before it
ships. Every script, the stylesheet and the font are inlined; guides.json is
served from inside the page and studyq.json answers 404 (the questions stay
locked), so the page needs no server. The service worker is left out.

    python tools/preview/bundle.py <out.html> [--repo DIR] [--demo FILE] [--title TEXT] [--today now]

--repo defaults to this checkout (so run it from a worktree to bundle that
branch), --demo to tools/preview/demo.json, and the app's date to the demo's
"today" so the example weeks line up (--today now uses the real clock, or give
YYYY-MM-DD).
"""
import argparse
import base64
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent

ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
ap.add_argument("out", type=Path)
ap.add_argument("--repo", type=Path, default=HERE.parent.parent)
ap.add_argument("--demo", type=Path, default=HERE / "demo.json")
ap.add_argument("--title", default="GI Hub preview")
ap.add_argument("--today", help="YYYY-MM-DD, or now for the real clock (default: the demo's today)")
a = ap.parse_args()
repo = a.repo

html = (repo / "index.html").read_text(encoding="utf-8")
css = (repo / "app.css").read_text(encoding="utf-8")
css = re.sub(r'url\("?(fonts/[^)"]+\.woff2)"?\)',
             lambda m: "url(data:font/woff2;base64," + base64.b64encode((repo / m.group(1)).read_bytes()).decode() + ")", css)

body = html[html.index("<body>") + len("<body>"):html.index("</body>")]


def inline(m):
    src = m.group(1)
    code = (repo / src).read_text(encoding="utf-8")
    if src == "app.js":
        code = code.replace('navigator.serviceWorker.register("sw.js")', "Promise.resolve()")
    assert "</script" not in code, src
    return f"<script>\n{code}\n</script>"


body = re.sub(r'<script src="([^"]+)"></script>', inline, body)

demo = json.loads(a.demo.read_text(encoding="utf-8"))
guides = (repo / "guides.json").read_text(encoding="utf-8")
today = a.today or demo["today"]
pin = ""
if today != "now":
    y, m, d = (int(x) for x in today.split("-"))
    pin = f"window.__today = new Date({y}, {m - 1}, {d}, 12);"
seed = f"""<script>
// Preview only: example data with fictional names, kept in this page's own storage.
(function () {{
  {pin}
  try {{
    if (!localStorage.getItem("epa-state-v1")) {{
      localStorage.setItem("epa-state-v1", {json.dumps(json.dumps(demo["state"]))});
      localStorage.setItem("gi-call-v1", {json.dumps(json.dumps(demo["call"]))});
    }}
  }} catch (e) {{}}
  var GUIDES = {guides};
  var real = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (url, o) {{
    var u = String(url);
    if (/guides\\.json$/.test(u)) return Promise.resolve(new Response(JSON.stringify(GUIDES), {{status: 200, headers: {{"Content-Type": "application/json"}}}}));
    if (/studyq\\.json$/.test(u)) return Promise.resolve(new Response("", {{status: 404}}));
    // Settings' update check: the preview is the version it was built from.
    if (/sw\\.js$/.test(u)) return Promise.resolve(new Response('const CACHE = "' + APP_VERSION + '";', {{status: 200}}));
    return real ? real(url, o) : Promise.reject(new Error("offline"));
  }};
}})();
</script>"""
note = """<script>
setTimeout(function () { try { showToast("Preview with example names. Your own GI Hub is unchanged."); route.keepScroll = true; render(); } catch (e) {} }, 2600);
</script>"""

# No <html>, <head> or <body>: the Artifact publisher wraps the page in its own.
page = f"""<title>{a.title}</title>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0d0b1f">
<style>
{css}
</style>
{seed}
{body}
{note}
"""
a.out.write_text(page, encoding="utf-8")
print(a.out, round(len(page.encode()) / 1024), "KB")
