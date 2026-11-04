"use strict";
// The guideline library and the study questions come from the network first.
// On wifi that connects and then passes nothing (hospital guest networks) the
// phone's own copy answers after 3 seconds, and when the new one lands it is
// kept and the app hears so it can swap it in.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {load, ROOT} = require("./harness");

const URL_G = "https://lethalnifty.github.io/epa-tracker/guides.json";
const tick = () => new Promise(r => setImmediate(r));
const res = tag => ({ok: true, tag, clone() { return {...this, tag: tag + " (copy)"}; }});

// sw.js with a network the test answers by hand, a cache and a clock it runs.
function worker(phoneCopy) {
  const timers = [], posted = [], handlers = {}, saved = [];
  let answer, rejectNet;
  const net = new Promise((ok, no) => { answer = ok; rejectNet = no; });
  const ctx = {
    URL, console, Promise,
    setTimeout: (fn, ms) => { timers.push({fn, ms}); return timers.length; },
    clearTimeout: id => { if (timers[id - 1]) timers[id - 1].fn = null; },
    fetch: () => net,
    caches: {open: async () => ({put: async (k, r) => { saved.push(r.tag); }}), keys: async () => [],
      match: async () => (phoneCopy ? res(phoneCopy) : undefined)},
    importScripts: f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx),
    self: {addEventListener: (t, fn) => { handlers[t] = fn; }, skipWaiting() {},
      registration: {scope: "https://lethalnifty.github.io/epa-tracker/"},
      clients: {claim() {}, matchAll: async () => [{postMessage: m => posted.push(m)}]}},
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "sw.js"), "utf8"), ctx);
  let got = null;
  handlers.fetch({request: {url: URL_G, method: "GET"}, respondWith: p => { p.then(r => { got = r; }, () => { got = "network error"; }); }, waitUntil() {}});
  return {timers, posted, saved, answer, rejectNet, got: () => got,
    wait: async () => { for (const t of timers) if (t.fn) { const fn = t.fn; t.fn = null; fn(); } await tick(); await tick(); }};
}

test("a quick network answers as before, and its copy is kept", async () => {
  const w = worker("phone");
  w.answer(res("net"));
  await tick(); await tick();
  assert.equal(w.got().tag, "net");
  assert.deepEqual(w.saved, ["net (copy)"]);
  assert.deepEqual(w.posted, []);
});

test("wifi that passes nothing: the phone's copy after 3 seconds, then the new one is kept and the app told", async () => {
  const w = worker("phone");
  await tick();
  assert.equal(w.got(), null, "still waiting");
  assert.deepEqual(w.timers.map(t => t.ms), [3000]);
  await w.wait();
  assert.equal(w.got().tag, "phone");
  w.answer(res("net"));
  await tick(); await tick(); await tick();
  assert.deepEqual(w.saved, ["net (copy)"]);
  assert.deepEqual(JSON.parse(JSON.stringify(w.posted)), [{fresh: "guides.json"}]);
});

test("offline: the phone's copy straight away", async () => {
  const w = worker("phone");
  w.rejectNet(new Error("offline"));
  await tick(); await tick();
  assert.equal(w.got().tag, "phone");
});

test("the first open, before the phone has a copy, keeps waiting for the network", async () => {
  const w = worker(null);
  await w.wait();
  assert.equal(w.got(), null);
  w.answer(res("net"));
  await tick(); await tick();
  assert.equal(w.got().tag, "net");
  assert.deepEqual(w.posted, []);
});

test("the app reads a file again when the service worker says a new copy landed", () => {
  const h = load({today: "2026-11-03"});
  h.run(`globalThis.__read = []; guidesInit = () => __read.push("guides"); studyqInit = () => __read.push("studyq");`);
  h.run(`appMessage({fresh: "guides.json"}); appMessage({fresh: "studyq.json"}); appMessage({fresh: "other.json"});`);
  assert.deepEqual(h.val("__read"), ["guides", "studyq"]);
});
