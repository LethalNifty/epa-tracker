// Builds the fellows' edition into dist/ for Cloudflare Pages, which runs it on
// every push to the `fellows` branch (build command `node tools/fellows/build.mjs`,
// output directory `dist`). No dependencies: Node's own fs and path.
//
//   node tools/fellows/build.mjs [outDir]
//
// The same files as the full app, minus the study questions, with three changes:
// index.html sets window.GI_EDITION = "fellows" before any script runs and asks
// search engines to stay away; sw.js stops caching studyq.json; the manifest
// describes the fellows' edition. robots.txt keeps crawlers out too.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.resolve(process.argv[2] || path.join(ROOT, "dist"));
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const LEFT_OUT = new Set(["./", "studyq.json"]);
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
html = must(html, "<body>\n", `<body>\n<script>window.GI_EDITION = "fellows";</script>\n`, "<body>");
html = must(html, /<meta name="description" content="[^"]*">/.exec(html)?.[0] ?? "<meta name=\"description\"",
  `<meta name="description" content="${DESCRIPTION}">\n<meta name="robots" content="noindex, nofollow">`, "the description");
fs.writeFileSync(path.join(OUT, "index.html"), html);

fs.writeFileSync(path.join(OUT, "sw.js"), must(sw, ` "studyq.json",`, "", "studyq.json in ASSETS"));

const manifest = JSON.parse(read("manifest.webmanifest"));
manifest.description = DESCRIPTION;
fs.writeFileSync(path.join(OUT, "manifest.webmanifest"), JSON.stringify(manifest, null, 2) + "\n");

fs.writeFileSync(path.join(OUT, "robots.txt"), "User-agent: *\nDisallow: /\n");
console.log(`fellows build: ${fs.readdirSync(OUT, {recursive: true}).length} files in ${OUT}`);
