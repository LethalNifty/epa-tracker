// Draws the made-up call sheets the test set gives Claude to read (TELL_SHEET
// in ../tell-tests.mjs): each site's sheet as a page in the real layout, then
// a picture of it from headless Chrome, beside this file. Placeholder names only.
//   node tools/agenda/test-sheets/make.mjs
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {TELL_SHEET, SHEET_STATS} from "../tell-tests.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHROMES = [process.env.CHROME, "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"];
const CHROME = CHROMES.find(p => p && fs.existsSync(p));
if (!CHROME) { console.error("Chrome not found; set CHROME to its path"); process.exit(1); }

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SITES = {hsc: {name: "Health Sciences Centre", light: "#f8cbad", dark: "#c55a11", height: 835},
  stb: {name: "St. Boniface Hospital", light: "#c5e0b4", dark: "#548235", height: 875}};
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
// Names as the sheets write them, a note after the name it belongs to: "Brook (No call 1200-1700) / Casey".
function cell(names, d, site) {
  return (Array.isArray(names) ? names : names ? [names] : []).map(n => {
    const note = TELL_SHEET.notes.find(x => x.d === d && x.site === site && x.who === n);
    return esc(n) + (note ? ` (${esc(note.t)})` : "");
  }).join(" / ");
}
function page(site) {
  const s = SITES[site], stb = site === "stb";
  const rows = TELL_SHEET.days.map(x => {
    const dd = new Date(x.d + "T12:00:00Z"), wd = dd.getUTCDay(), off = wd === 0 || wd === 6 || SHEET_STATS.includes(x.d), t = x[site];
    return `<tr${off ? ` class="off"` : ""}><td class="date">${WD[wd]} ${MON[dd.getUTCMonth()]} ${dd.getUTCDate()}</td>` +
      `<td>${cell(t.day.fellows, x.d, site)}</td><td>${cell(t.day.res, x.d, site)}</td><td>${cell(t.day.att, x.d, site)}</td>` +
      (stb ? `<td>${cell(t.day.tpn || [], x.d, site)}</td>` : "") +
      `<td class="split">${cell(t.night.fellow, x.d, site)}</td><td>${cell(t.night.res, x.d, site)}</td><td>${cell(t.night.att, x.d, site)}</td></tr>`;
  }).join("\n");
  const foot = !stb ? "" : `<div class="foot"><p>${TELL_SHEET.people.map(p => esc(p.full)).join(" &middot; ")}</p>` +
    TELL_SHEET.rules.filter(r => r.site === site).map(r => `<p><b>${esc(r.t)}</b></p>`).join("") + `</div>`;
  return `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:18px 20px;font:13px Arial,Helvetica,sans-serif;color:#000;background:#fff}
h1{font-size:17px;margin:0 0 2px}h2{font-size:13px;font-weight:normal;margin:0 0 10px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #555;padding:3px 6px;height:18px;text-align:left}
th{background:${s.light};font-size:12px}th.grp{background:${s.dark};color:#fff;text-align:center}
tr.off td{background:#e2e2e2}td.date{white-space:nowrap;font-weight:bold}.split{border-left:3px solid #000}
.foot{margin-top:10px;font-size:12px}.foot p{margin:3px 0}
</style>
<h1>${s.name}: GI Call Schedule</h1>
<h2>Block 7, Thursday December 17, 2026 to Wednesday January 13, 2027</h2>
<table><tr><th rowspan="2">Date</th><th class="grp" colspan="${stb ? 4 : 3}">Day 0800-1700</th><th class="grp split" colspan="3">Overnight 1700-0800</th></tr>
<tr><th>1st Call Fellow(s)</th><th>Junior Resident(s)</th><th>Attending</th>${stb ? "<th>TPN Consults</th>" : ""}<th class="split">Fellow</th><th>Junior Resident</th><th>Attending</th></tr>
${rows}</table>${foot}`;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gi-sheets-"));
try {
  for (const {site, repo} of TELL_SHEET.files) {
    const html = path.join(tmp, site + ".html"), out = path.join(HERE, path.basename(repo));
    fs.writeFileSync(html, page(site));
    fs.rmSync(out, {force: true});
    const r = spawnSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", `--user-data-dir=${path.join(tmp, "profile")}`,
      `--screenshot=${out}`, `--window-size=1100,${SITES[site].height}`, pathToFileURL(html).href], {stdio: "ignore", timeout: 60000});
    if (!fs.existsSync(out)) throw new Error("Chrome didn't draw the " + site + " sheet");
    console.log("drew " + path.relative(process.cwd(), out));
  }
} finally { fs.rmSync(tmp, {recursive: true, force: true}); }
