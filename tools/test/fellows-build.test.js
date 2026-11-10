"use strict";
// The fellows' build (tools/fellows/build.mjs): what Cloudflare Pages serves.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {execFileSync} = require("node:child_process");
const {ROOT, load, state, obs} = require("./harness");

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
    // The owner's watch on the codes never reaches the fellows.
    assert.ok(!assets.includes("watch.js") && !fs.existsSync(path.join(out, "watch.js")));
    assert.doesNotMatch(html, /watch\.js/);
    // Nor the owner's daily backup to Cloudflare (backup.js).
    assert.ok(!assets.includes("backup.js") && !fs.existsSync(path.join(out, "backup.js")));
    assert.doesNotMatch(html, /backup\.js/);
    // Nor the owner's reminder sender and the plan the phone gives it (alerts.js).
    assert.ok(!assets.includes("alerts.js") && !fs.existsSync(path.join(out, "alerts.js")));
    assert.doesNotMatch(html, /alerts\.js/);
    // Nor Tell GI Hub: its keys and the results it picks up (tell.js).
    assert.ok(!assets.includes("tell.js") && !fs.existsSync(path.join(out, "tell.js")));
    assert.doesNotMatch(html, /tell\.js/);
    // Nor the call roster from the shared sheets (roster.js) or its screens (roster-view.js).
    for (const f of ["roster.js", "roster-view.js"]) assert.ok(!assets.includes(f) && !fs.existsSync(path.join(out, f)), f);
    assert.doesNotMatch(html, /roster(-view)?\.js/);
    // Not even the styles for the owner's list of codes.
    const css = fs.readFileSync(path.join(out, "app.css"), "utf8");
    assert.doesNotMatch(css, /Fellows' codes|\.watch|Cloud backup|\.cbk|Tell GI Hub|\.tellkey|Call roster|\.rost-|\.rostview/);
    assert.match(css, /\.pick \.pn/, "the rest of the stylesheet is still there");
    // No file in the build carries the owner's admin: the fellows' site address it
    // asks, the saved key, the hidden owner path, the key field or the codes list.
    const walk = d => fs.readdirSync(d, {withFileTypes: true}).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
    for (const f of walk(out).filter(f => /\.(js|css|html|json|webmanifest|txt|ics)$|_headers$/.test(f)))
      assert.doesNotMatch(fs.readFileSync(f, "utf8"), /WATCH_SITE|gi-watch-v1|gi-owner|watchPathFor|Admin key|[Ff]ellows' codes|watch\.js|GI_ADMIN|BACKUP_URL|gi-hub-backup|backup\.js|ALERTS_URL|gi-hub-agenda|alerts\.js|gi-tell-v1|TELL_STORE|function tellPick|tell\.js|gi-roster-v1|gi-roster-pics|roster\.js|roster-view\.js|function rosterAddCall|function rosterCheckView/,
        "owner-only in " + path.relative(out, f));
    assert.ok(!fs.existsSync(path.join(out, "studyq.json")));
    for (const f of assets) if (f !== "./") assert.ok(fs.existsSync(path.join(out, f)), "missing " + f);
    // The version the Settings check reads is the full app's.
    assert.equal(/const CACHE = "(epa-v\d+)"/.exec(sw)[1], /const CACHE = "(epa-v\d+)"/.exec(fs.readFileSync(path.join(ROOT, "sw.js"), "utf8"))[1]);
    assert.match(fs.readFileSync(path.join(out, "manifest.webmanifest"), "utf8"), /GI fellows/);
    assert.ok(!fs.existsSync(path.join(out, "tools")) && !fs.existsSync(path.join(out, "docs")));
    // The calendar reminder: every second Wednesday from a Wednesday, with an alert, CRLF lines, served as a calendar.
    const ics = fs.readFileSync(path.join(out, "reminder.ics"), "utf8");
    assert.ok(ics.split("\r\n").length > 15 && !/[^\r]\n/.test(ics));
    assert.match(ics, /\r\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=WE\r\n/);
    assert.match(ics, /\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\n/);
    const start = /DTSTART:(\d{4})(\d{2})(\d{2})T080000/.exec(ics);
    assert.equal(new Date(+start[1], +start[2] - 1, +start[3]).getDay(), 3);
    assert.match(fs.readFileSync(path.join(out, "_headers"), "utf8"), /\/reminder\.ics\n  Content-Type: text\/calendar/);
  } finally {
    fs.rmSync(out, {recursive: true, force: true});
  }
});

test("the fellows' build runs without the full app's own files", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "gi-fellows-"));
  try {
    execFileSync(process.execPath, [path.join(ROOT, "tools", "fellows", "build.mjs"), out]);
    const f = load({root: out, edition: "fellows", today: "2026-11-03",
      state: state({f3a: [obs("2026-11-01")]}, {setup: {d: "2026-10-01"}})});
    assert.equal(f.val("FELLOWS"), true);
    f.click("setopen");
    assert.match(f.html(), /data-action="export"/);
    // Typing passes the full app's own field handlers on its way.
    f.fire("input", {dataset: {}, value: "x"});
    f.click("setclose");
    f.click("tab", {page: "week"});
    assert.match(f.html(), /data-action="tab"/);
  } finally {
    fs.rmSync(out, {recursive: true, force: true});
  }
});
