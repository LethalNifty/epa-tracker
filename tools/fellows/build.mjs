// Builds the fellows' edition into dist/ for Cloudflare Pages, which runs it on
// every push to the `fellows` branch (build command `node tools/fellows/build.mjs`,
// output directory `dist`). No dependencies: Node's own fs and path.
//
//   node tools/fellows/build.mjs [outDir]
//
// The same files as the full app, minus the study questions, the owner's
// watch on the codes (watch.js) and the owner's daily backup (backup.js), with
// four changes:
// index.html sets window.GI_EDITION = "fellows" before any script runs and asks
// search engines to stay away; sw.js stops caching studyq.json; the manifest
// describes the fellows' edition; app.css loses the styles for the owner's list
// of codes and backup card. robots.txt keeps crawlers out too.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.resolve(process.argv[2] || path.join(ROOT, "dist"));
// LF throughout, so a Windows checkout (core.autocrlf) builds the same as Cloudflare's.
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\r\n/g, "\n");
// The owner's watch on the fellows' codes (watch.js) and daily backup to
// Cloudflare (backup.js) never reach the fellows.
const OWNER_ONLY = ["watch.js", "backup.js"];
const LEFT_OUT = new Set(["./", "studyq.json", ...OWNER_ONLY]);
const DESCRIPTION = "EPA tracker, procedure log and guideline library for GI fellows.";

function must(text, from, to, what) {
  if (!text.includes(from)) throw new Error("fellows build: can't find " + what);
  return text.replace(from, to);
}

// Every file the service worker caches is every file the app needs.
const sw = read("sw.js");
const list = /const ASSETS = \[([\s\S]*?)\];/.exec(sw);
if (!list) throw new Error("fellows build: no ASSETS in sw.js");
const assets = [...list[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);

fs.rmSync(OUT, {recursive: true, force: true});
for (const f of assets) {
  if (LEFT_OUT.has(f)) continue;
  fs.mkdirSync(path.dirname(path.join(OUT, f)), {recursive: true});
  fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
}

let html = read("index.html");
for (const f of OWNER_ONLY) html = must(html, `<script src="${f}"></script>\n`, "", f + " in index.html");
html = must(html, "<body>\n", `<body>\n<script>window.GI_EDITION = "fellows";</script>\n`, "<body>");
html = must(html, /<meta name="description" content="[^"]*">/.exec(html)?.[0] ?? "<meta name=\"description\"",
  `<meta name="description" content="${DESCRIPTION}">\n<meta name="robots" content="noindex, nofollow">`, "the description");
fs.writeFileSync(path.join(OUT, "index.html"), html);

// Nothing of the owner's list of codes or backup card reaches the fellows, not
// even its styles: each block from its heading comment to the next blank line.
let css = read("app.css");
for (const head of ["Fellows' codes", "Cloud backup"]) {
  const block = new RegExp(`/\\* ${head} [^*]*\\*/\\n[\\s\\S]*?\\n\\n`).exec(css);
  css = must(css, block ? block[0] : "/* " + head, "", `the ${head} styles in app.css`);
}
fs.writeFileSync(path.join(OUT, "app.css"), css);

let swOut = must(sw, ` "studyq.json",`, "", "studyq.json in ASSETS");
for (const f of OWNER_ONLY) swOut = must(swOut, ` "${f}",`, "", f + " in ASSETS");
fs.writeFileSync(path.join(OUT, "sw.js"), swOut);

const manifest = JSON.parse(read("manifest.webmanifest"));
manifest.description = DESCRIPTION;
fs.writeFileSync(path.join(OUT, "manifest.webmanifest"), JSON.stringify(manifest, null, 2) + "\n");

fs.writeFileSync(path.join(OUT, "robots.txt"), "User-agent: *\nDisallow: /\n");

// The reminder Settings links to: one event every second Wednesday at 8 AM
// phone time (no time zone, so it follows the phone), with an alert. Opening it
// on an iPhone offers "Add All" to Calendar; it then fires with the app closed.
const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GI Hub//Fellows//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
  "BEGIN:VEVENT", "UID:epa-reminder@gi-hub-fellows", "DTSTAMP:20261014T120000Z",
  "DTSTART:20261021T080000", "DTEND:20261021T081500", "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=WE",
  "SUMMARY:EPAs: ask for one this week",
  "DESCRIPTION:Ask staff for an EPA this week\\, then log it in GI Hub. Forms pending 14+ days are on Home.",
  "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:EPAs: ask for one this week", "TRIGGER:PT0M", "END:VALARM",
  "END:VEVENT", "END:VCALENDAR"];
fs.writeFileSync(path.join(OUT, "reminder.ics"), ics.join("\r\n") + "\r\n");
fs.writeFileSync(path.join(OUT, "_headers"), "/reminder.ics\n  Content-Type: text/calendar; charset=utf-8\n");
console.log(`fellows build: ${fs.readdirSync(OUT, {recursive: true}).length} files in ${OUT}`);
