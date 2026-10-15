"use strict";
// The fellows' build (tools/fellows/build.mjs): what Cloudflare Pages serves.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {execFileSync} = require("node:child_process");
const {ROOT} = require("./harness");

test("the fellows' build: every cached file, the switch before any script, no study questions, no crawlers", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "gi-fellows-"));
  try {
    execFileSync(process.execPath, [path.join(ROOT, "tools", "fellows", "build.mjs"), out]);
    const html = fs.readFileSync(path.join(out, "index.html"), "utf8");
    const at = html.indexOf('window.GI_EDITION = "fellows"');
    assert.ok(at > 0 && at < html.indexOf("<script src="), "the switch comes before the scripts");
    assert.ok(at < html.indexOf("/*EPA_DATA_START*/"));
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
    assert.equal(fs.readFileSync(path.join(out, "robots.txt"), "utf8"), "User-agent: *\nDisallow: /\n");
    const sw = fs.readFileSync(path.join(out, "sw.js"), "utf8");
    const assets = [.../const ASSETS = \[([\s\S]*?)\];/.exec(sw)[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
    assert.ok(!assets.includes("studyq.json"));
    assert.ok(!fs.existsSync(path.join(out, "studyq.json")));
    for (const f of assets) if (f !== "./") assert.ok(fs.existsSync(path.join(out, f)), "missing " + f);
    // The version the Settings check reads is the full app's.
    assert.equal(/const CACHE = "(epa-v\d+)"/.exec(sw)[1], /const CACHE = "(epa-v\d+)"/.exec(fs.readFileSync(path.join(ROOT, "sw.js"), "utf8"))[1]);
    assert.match(fs.readFileSync(path.join(out, "manifest.webmanifest"), "utf8"), /GI fellows/);
    assert.ok(!fs.existsSync(path.join(out, "tools")) && !fs.existsSync(path.join(out, "docs")));
  } finally {
    fs.rmSync(out, {recursive: true, force: true});
  }
});
