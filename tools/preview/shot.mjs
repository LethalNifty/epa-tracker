// Phone screenshots of GI Hub: headless Chrome driven over the DevTools Protocol.
//
//   node tools/preview/shot.mjs <scenarios.json> <outDir> [url]
//
// url defaults to http://localhost:8742/index.html (the "epa" preview server);
// point it at a worktree's own server, or at a bundle.py page (file:///...).
// A scenario: {name, demo?, today?, state?, call?, pre?, url?, width?, height?,
// dpr?, reducedMotion?, settle?, steps: [...]}. "demo": true seeds demo.json
// (fictional names) unless the scenario brings its own state and call; no
// state at all is the empty first-run app. Steps run in order, each with any of
// (applied in this order): eval (JS in the page; "log" prints its value), click
// (a CSS selector, an error if nothing matches), wait (ms), shot (file name) and
// full (true = the whole page height, not just the screen).
// Page errors and console.error lines are printed as ERRORS after the scenario.
import {spawn} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHROMES = [process.env.CHROME, "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"];
const CHROME = CHROMES.find(p => p && fs.existsSync(p));
const [,, scenFile, outDir, baseUrl = "http://localhost:8742/index.html"] = process.argv;
if (!scenFile || !outDir) { console.error("usage: node tools/preview/shot.mjs <scenarios.json> <outDir> [url]"); process.exit(1); }
if (!CHROME) { console.error("Chrome not found; set CHROME to its path"); process.exit(1); }
const scenarios = JSON.parse(fs.readFileSync(scenFile, "utf8"));
const demo = JSON.parse(fs.readFileSync(path.join(HERE, "demo.json"), "utf8"));
fs.mkdirSync(outDir, {recursive: true});
const PORT = 9333 + Math.floor(Math.random() * 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), "gi-hub-shot-"));

const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--force-color-profile=srgb", "about:blank"],
  {stdio: "ignore"});
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function json(url, method = "GET") {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(url, {method}); if (r.ok) return r.json(); } catch {}
    await sleep(250);
  }
  throw new Error("no devtools at " + url);
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const {res, rej} = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    } else if (msg.method) listeners.forEach(l => l(msg));
  };
  const ready = new Promise(r => ws.onopen = r);
  return {
    ready,
    send: (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, {res, rej}); ws.send(JSON.stringify({id: i, method, params})); }),
    once: name => new Promise(r => { const l = m => { if (m.method === name) { listeners.splice(listeners.indexOf(l), 1); r(m.params); } }; listeners.push(l); }),
    close: () => ws.close(),
    events: listeners,
  };
}

try {
  await json(`http://127.0.0.1:${PORT}/json/version`);
  for (const sc0 of scenarios) {
    const sc = sc0.demo ? {...demo, ...sc0} : sc0;
    const target = await json(`http://127.0.0.1:${PORT}/json/new?about:blank`, "PUT");
    const c = connect(target.webSocketDebuggerUrl);
    await c.ready;
    const errors = [];
    c.events.push(m => {
      if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map(a => a.value || a.description).join(" "));
    });
    await c.send("Runtime.enable");
    await c.send("Network.enable");
    await c.send("Network.setCacheDisabled", {cacheDisabled: true});
    await c.send("Network.setBypassServiceWorker", {bypass: true});
    const w = sc.width || 390, h = sc.height || 844;
    await c.send("Emulation.setDeviceMetricsOverride", {width: w, height: h, deviceScaleFactor: sc.dpr || 2, mobile: true});
    await c.send("Emulation.setTouchEmulationEnabled", {enabled: true, maxTouchPoints: 5});
    if (sc.reducedMotion) await c.send("Emulation.setEmulatedMedia", {features: [{name: "prefers-reduced-motion", value: "reduce"}]});
    await c.send("Page.enable");
    // The app reads window.__today in place of the clock, so a scenario shows the same week every run.
    const [y, m, d] = (sc.today || demo.today).split("-").map(Number);
    const seed = `(() => {
      window.__today = new Date(${y}, ${m - 1}, ${d}, 12);
      if (!sessionStorage.getItem("__seeded")) {
        sessionStorage.setItem("__seeded", "1");
        localStorage.clear();
        ${sc.state ? `localStorage.setItem("epa-state-v1", ${JSON.stringify(JSON.stringify(sc.state))});` : ""}
        ${sc.call ? `localStorage.setItem("gi-call-v1", ${JSON.stringify(JSON.stringify(sc.call))});` : ""}
      }
    })();`;
    await c.send("Page.addScriptToEvaluateOnNewDocument", {source: seed});
    if (sc.pre) await c.send("Page.addScriptToEvaluateOnNewDocument", {source: sc.pre});
    const loaded = c.once("Page.loadEventFired");
    await c.send("Page.navigate", {url: sc.url || baseUrl});
    await loaded;
    await sleep(sc.settle ?? 900);
    for (const st of sc.steps || []) {
      if (st.eval) {
        const r = await c.send("Runtime.evaluate", {expression: st.eval, awaitPromise: true, returnByValue: true});
        if (r.exceptionDetails) errors.push("step eval: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
        else if (st.log) console.log(sc.name, st.log, JSON.stringify(r.result.value));
      }
      if (st.click) {
        const r = await c.send("Runtime.evaluate", {expression: `(() => { const el = document.querySelector(${JSON.stringify(st.click)}); if (el) el.click(); return !!el; })()`, returnByValue: true});
        if (!r.result.value) errors.push("click: nothing matches " + st.click);
      }
      if (st.wait) await sleep(st.wait);
      if (st.shot) {
        if (st.full) {
          const {contentSize} = await c.send("Page.getLayoutMetrics");
          await c.send("Emulation.setDeviceMetricsOverride", {width: w, height: Math.ceil(contentSize.height), deviceScaleFactor: sc.dpr || 2, mobile: true});
          await sleep(300);
        }
        const {data} = await c.send("Page.captureScreenshot", {format: "png"});
        fs.writeFileSync(path.join(outDir, st.shot + ".png"), Buffer.from(data, "base64"));
        if (st.full) await c.send("Emulation.setDeviceMetricsOverride", {width: w, height: h, deviceScaleFactor: sc.dpr || 2, mobile: true});
        console.log("shot", st.shot);
      }
    }
    if (errors.length) console.log("ERRORS", sc.name, errors);
    c.close();
    await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
  }
} finally {
  chrome.kill();
  await sleep(500);
  try { fs.rmSync(prof, {recursive: true, force: true}); } catch {}
}
