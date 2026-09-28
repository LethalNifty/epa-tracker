"use strict";
// The reminder sender's CALL_TIMES value: reads the block call files with the
// app's own parser and prints just the start of each stretch to come (a
// weekend is one), as JSON. No names. Store the output as the CALL_TIMES
// repository secret after each new block's call file.
//   node tools/push/call-times.js                 (every GI-Call-Block*.ics in My Drive\Fellowship)
//   node tools/push/call-times.js file.ics ...    (just these)
const fs = require("node:fs");
const path = require("node:path");
const {load} = require("../test/harness");

const FOLDER = path.join(process.env.USERPROFILE || process.env.HOME || "", "My Drive", "Fellowship");

// Stretch starts still to come, as Winnipeg wall times, from these .ics texts in order.
function callStarts(texts, now) {
  const h = load();
  h.run(`window.__merged = {}`);
  for (const t of texts) {
    h.ctx.__src = t;
    const ok = h.val(`(() => { const p = icsShifts(__src); if (p.ok) __merged = callMerge(__merged, p).shifts; return p.ok; })()`);
    if (!ok) throw new Error("Not a GI call file");
  }
  const starts = h.val(`callStretches(Object.values(__merged)).filter(st => st.e > ${now}).map(st => st.s)`);
  const p = n => String(n).padStart(2, "0");
  return starts.map(s => { const d = new Date(s); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; });
}

function main(argv) {
  let files = argv.filter(a => !a.startsWith("--"));
  if (!files.length) files = fs.readdirSync(FOLDER).filter(f => /^GI-Call-Block\d+\.ics$/i.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0])).map(f => path.join(FOLDER, f));
  if (!files.length) throw new Error("No call files found in " + FOLDER);
  const json = JSON.stringify({v: 1, starts: callStarts(files.map(f => fs.readFileSync(f, "utf8")), Date.now())});
  console.log(json);
  return json;
}

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = {callStarts, main};
