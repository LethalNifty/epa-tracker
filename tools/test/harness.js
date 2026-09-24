"use strict";
// Boots GI Hub's real page scripts (index.html inline blocks plus local
// <script src> files, in page order) inside a Node vm context with just enough
// DOM to run, so tests call the app's own functions. Top-level const, let and
// function declarations are shared across the scripts exactly as in a browser.
process.env.TZ = "America/Winnipeg";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..", "..");
const KEY = "epa-state-v1";

function pageScripts() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const out = [];
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    const src = /\bsrc="([^"]+)"/.exec(m[1] || "");
    out.push(src
      ? {name: src[1], code: fs.readFileSync(path.join(ROOT, src[1]), "utf8")}
      : {name: "index.html#script" + out.length, code: m[2]});
  }
  return out;
}

// JS source for local noon on an ISO date, evaluated inside the app's context.
function dateExpr(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `new Date(${y}, ${m - 1}, ${d}, 12)`;
}

function load(opts = {}) {
  const store = new Map();
  if (opts.state) store.set(KEY, JSON.stringify(opts.state));
  const downloads = [];
  const els = {
    app: {
      innerHTML: "",
      addEventListener() {},
      insertAdjacentHTML(pos, html) { this.innerHTML += html; },
    },
  };
  const ctx = {
    console, setTimeout, clearTimeout,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: k => { store.delete(k); },
    },
    navigator: {},
    document: {
      getElementById: id => els[id] || null,
      createElement: tag => ({tag, style: {}, click() { downloads.push(this.download); }, remove() {}}),
      body: {appendChild() {}},
    },
    URL: {createObjectURL: () => "blob:test", revokeObjectURL() {}},
    Blob: class Blob { constructor(parts, o) { this.parts = parts; this.type = o && o.type; } },
    File: class File { constructor(parts, name, o) { this.parts = parts; this.name = name; this.type = o && o.type; } },
    confirm: () => true,
    scrollTo() {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const run = code => vm.runInContext(code, ctx);
  if (opts.today) run(`window.__today = ${dateExpr(opts.today)};`);
  for (const s of pageScripts()) vm.runInContext(s.code, ctx, {filename: s.name});
  return {
    ctx, store, downloads, els, run,
    val: expr => { const s = run(`JSON.stringify(${expr})`); return s === undefined ? undefined : JSON.parse(s); },
    html: () => els.app.innerHTML,
    setToday: iso => run(`window.__today = ${dateExpr(iso)};`),
    saved: () => JSON.parse(store.get(KEY)),
    click: (action, data = {}) => run(`dispatch(${JSON.stringify(action)}, ${JSON.stringify(data)})`),
  };
}

// One observation dated d (YYYY-MM-DD), approved unless extra says otherwise.
function obs(d, extra = {}) {
  return {d, status: "approved", ts: d + "T18:00:00.000Z", ...extra};
}
// A saved app state holding these observations.
function state(obsByPart = {}, extra = {}) {
  return {v: 1, obs: obsByPart, lines: {}, lastBackup: null, ...extra};
}
// n observations dated d.
function many(n, d, extra) {
  return Array.from({length: n}, () => obs(d, extra));
}

module.exports = {load, obs, state, many, dateExpr, ROOT};
