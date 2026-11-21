"use strict";
// Add to GI Hub through the sender (tools/agenda/worker.mjs): pictures, PDFs and
// spreadsheets shared from the phone wait in KV for Claude, then for the phone, and go once
// nobody needs them. Run the way Cloudflare runs it, over in-memory KV and the
// inbox's Durable Object. Placeholder names only.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {ROOT} = require("./harness");

const mod = f => import(pathToFileURL(path.join(ROOT, "tools", "agenda", f)).href);
const SENDER = "https://gi-hub-agenda.lethalnifty.workers.dev";
const NOW = Date.UTC(2026, 10, 19, 14);        // Thu 19 Nov 2026, 09:00 in Winnipeg
const AT = "2026-11-19T09:00:00-05:00";
const PT = "P".repeat(43), SK = "S".repeat(43), CK = "C".repeat(43);
const sha = k => crypto.createHash("sha256").update(k).digest("hex");
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

// KV as Cloudflare gives it: each value as it was put, with its options.
function kv() {
  const m = new Map();
  return {m,
    async get(k, type) {
      if (!m.has(k)) return null;
      const {v} = m.get(k);
      if (type === "arrayBuffer") return typeof v === "string" ? new TextEncoder().encode(v).buffer : new Uint8Array(v).slice().buffer;
      return typeof v === "string" ? v : new TextDecoder().decode(v);
    },
    async put(k, v, opts = {}) { m.set(k, {v, opts}); },
    async delete(k) { m.delete(k); }};
}
// The inbox's one Durable Object, in memory.
function tellNs() {
  const m = new Map(), storage = {m,
    async get(k) { return m.has(k) ? structuredClone(m.get(k)) : undefined; },
    async put(k, v) { m.set(k, structuredClone(v)); },
    async delete(k) { return m.delete(k); }};
  let obj = null;
  return {storage, idFromName: n => n, get: () => ({async fetch(req) {
    if (!obj) obj = new (await mod("tell.mjs")).Tell({storage}, {});
    return obj.fetch(req);
  }})};
}
// The sender with the phone connected and Tell GI Hub's keys set; c.call is
// any of them (or no key) calling it.
async function sender() {
  const w = await mod("worker.mjs"), env = {AGENDA: kv(), TELL: tellNs()};
  await env.AGENDA.put("auth", sha(PT));
  const c = {w, env, now: NOW, pushed: []};
  c.call = (tok, method, p, body, headers = {}) => w.handle(new Request(SENDER + p, {method, body,
    headers: {...(tok ? {Authorization: "Bearer " + tok} : {}), ...headers}}), env, c.now, async url => { c.pushed.push(url); return {status: 201}; });
  c.json = (tok, method, p, body) => c.call(tok, method, p, JSON.stringify(body), {"Content-Type": "application/json"});
  assert.equal((await c.json(PT, "PUT", "/tell", {shortcut: sha(SK), claude: sha(CK)})).status, 200);
  return c;
}
const share = (c, bytes, type = "image/jpeg", at = AT, tok = SK) => c.call(tok, "POST", "/inbox", bytes, {"Content-Type": type, "X-At": at});
const items = async c => (await (await c.call(CK, "GET", "/inbox")).json()).items;
const files = c => [...c.env.AGENDA.m.keys()].filter(k => k.startsWith("file:"));

test("a JPEG body becomes a file item and its bytes wait in KV for 3 days", async () => {
  const c = await sender();
  assert.equal((await share(c, JPEG)).status, 200);
  const [it, ...rest] = await items(c);
  assert.deepEqual(rest, []);
  assert.deepEqual(it, {id: it.id, said: AT, file: {type: "image/jpeg", size: JPEG.length}});
  const kept = c.env.AGENDA.m.get("file:" + it.id);
  assert.deepEqual(new Uint8Array(kept.v), JPEG);
  assert.equal(kept.opts.expirationTtl, 259200);
});

test("a PNG and a PDF are known by their first bytes, whatever the header says", async () => {
  const c = await sender();
  assert.equal((await share(c, PNG, "application/octet-stream")).status, 200);
  assert.equal((await share(c, new TextEncoder().encode("%PDF-1.7\n1 0 obj"), "image/jpeg")).status, 200);
  assert.deepEqual((await items(c)).map(x => x.file.type), ["image/png", "application/pdf"]);
  assert.equal(files(c).length, 2);
});

// A spreadsheet as Mail shares one: a zip whose names include xl/workbook.xml.
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const zipNamed = (...names) => Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0, ...new TextEncoder().encode(names.join("\0\0\0"))]);
const SHEET = zipNamed("[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/worksheets/sheet1.xml");

test("a spreadsheet shared from Mail waits for Claude as one", async () => {
  const c = await sender();
  assert.equal((await share(c, SHEET, "application/octet-stream")).status, 200);
  const [it] = await items(c);
  assert.deepEqual(it.file, {type: XLSX, size: SHEET.length});
  const res = await c.call(CK, "GET", "/file/" + it.id);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), XLSX);
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), SHEET);
});

test("a zip that isn't a spreadsheet is still refused", async () => {
  const c = await sender();
  const res = await share(c, zipNamed("[Content_Types].xml", "word/document.xml"), "application/octet-stream");
  assert.equal(res.status, 415);
  assert.equal((await res.json()).error, "not a picture, a PDF or a spreadsheet");
  assert.deepEqual(files(c), []);
});

test("a text body becomes something said", async () => {
  const c = await sender();
  assert.equal((await share(c, new TextEncoder().encode("Casey has my night on the 30th"), "text/plain")).status, 200);
  assert.deepEqual((await items(c)).map(x => [x.text, x.said, x.file]), [["Casey has my night on the 30th", AT, undefined]]);
  // What the Tell shortcut and the + box send is unchanged.
  assert.equal((await c.json(SK, "POST", "/inbox", {text: "Dentist Friday at 9", at: AT})).status, 200);
  assert.deepEqual((await items(c)).map(x => x.text), ["Casey has my night on the 30th", "Dentist Friday at 9"]);
  assert.deepEqual(files(c), []);
});

test("an unknown body is refused 415 and an oversize one 413", async () => {
  const c = await sender();
  assert.equal((await share(c, Uint8Array.from([0, 1, 2, 3]), "application/octet-stream")).status, 415);
  const big = new Uint8Array(10485761);
  big.set(JPEG);
  assert.equal((await share(c, big)).status, 413);
  const most = new Uint8Array(10485760);
  most.set(JPEG);
  assert.equal((await share(c, most)).status, 200);
  assert.equal(files(c).length, 1);
});

test("GET /file/<id> gives Claude the bytes with their type, and the phone nothing yet", async () => {
  const c = await sender();
  await share(c, PNG, "image/png");
  const [it] = await items(c);
  const res = await c.call(CK, "GET", "/file/" + it.id);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "image/png");
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://lethalnifty.github.io");
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), PNG);
  assert.equal((await c.call(PT, "GET", "/file/" + it.id)).status, 404);
  assert.equal((await c.call(SK, "GET", "/file/" + it.id)).status, 401);
  assert.equal((await c.call(null, "GET", "/file/" + it.id)).status, 401);
  assert.equal((await c.call(CK, "GET", "/file/nope")).status, 400);
  // Gone from KV (3 days on): nothing to give.
  c.env.AGENDA.m.delete("file:" + it.id);
  assert.equal((await c.call(CK, "GET", "/file/" + it.id)).status, 404);
});

test("a refused share leaves nothing in KV", async () => {
  const c = await sender();
  assert.equal((await share(c, JPEG, "image/jpeg", AT, "X".repeat(43))).status, 401);
  assert.equal((await share(c, JPEG, "image/jpeg", AT, null)).status, 401);
  for (let k = 0; k < 50; k++) assert.equal((await c.json(SK, "POST", "/inbox", {text: "Thing " + k, at: AT})).status, 200);
  assert.equal((await share(c, JPEG)).status, 429);
  assert.deepEqual(files(c), []);
});

test("a picture the sender couldn't keep isn't left waiting", async () => {
  const c = await sender();
  c.env.AGENDA.put = async () => { throw new Error("over the day's writes"); };
  assert.equal((await share(c, JPEG)).status, 500);
  assert.deepEqual(await items(c), []);
});

// ---- What Claude files from them --------------------------------------------------------------------------

const DAYS = ["2026-11-19", "2026-11-20"].map(d => ({d,
  hsc: {day: {fellows: ["Brook"], res: [], att: "Ames"}, night: {fellow: "Casey", res: [], att: "Birch"}},
  stb: {day: {fellows: ["Rowan"], res: [], att: "Cole"}, night: {fellow: "Casey", res: [], att: "Dunn"}}}));
const call = (h, s) => ({item: h, with: [s], kind: "call", days: DAYS, notes: [], people: [], rules: [], look: [],
  sheets: [{site: "hsc", from: "2026-11-19", to: "2026-12-16", file: h}, {site: "stb", from: "2026-11-19", to: "2026-12-16", file: s}]});
const results = (c, list) => c.json(CK, "POST", "/results", {results: list});

test("confirming a call result lets the sender delete its pictures", async () => {
  const c = await sender();
  await share(c, PNG, "image/png");
  await share(c, JPEG);
  const [h, s] = await items(c);
  assert.equal((await results(c, [call(h.id, s.id)])).status, 200);
  assert.equal(files(c).length, 2, "kept for the phone");
  const got = (await (await c.call(PT, "GET", "/results")).json()).results;
  assert.deepEqual(got.map(x => x.kind), ["call"]);
  const pic = await c.call(PT, "GET", "/file/" + s.id);
  assert.equal(pic.status, 200);
  assert.equal(pic.headers.get("Content-Type"), "image/jpeg");
  assert.deepEqual(new Uint8Array(await pic.arrayBuffer()), JPEG);
  assert.equal((await c.json(PT, "PUT", "/alerts", {list: [], ack: [got[0].id]})).status, 200);
  assert.deepEqual(files(c), []);
  assert.equal((await c.call(PT, "GET", "/file/" + s.id)).status, 404);
});

test("a call result keeps its PDF for the phone but never its spreadsheet", async () => {
  const c = await sender();
  await share(c, SHEET, "application/octet-stream");
  await share(c, new TextEncoder().encode("%PDF-1.7\n1 0 obj"), "application/pdf");
  const [h, s] = await items(c);
  assert.equal((await results(c, [call(h.id, s.id)])).status, 200);
  const [got] = (await (await c.call(PT, "GET", "/results")).json()).results;
  assert.deepEqual(got.sheets.map(x => [x.site, x.file]), [["hsc", undefined], ["stb", s.id]], "GI Hub can't show a spreadsheet");
  assert.deepEqual(got.keep, [s.id]);
  assert.deepEqual(files(c), ["file:" + s.id]);
  assert.equal((await c.call(PT, "GET", "/file/" + h.id)).status, 404);
});

// Claude's drawing of a spreadsheet it read: a PDF the phone shows in the spreadsheet's place.
const DRAWING = new TextEncoder().encode("%PDF-1.4\n% the periods Claude filed\n");
const draw = (c, tok, id, body = DRAWING) => c.call(tok, "PUT", "/file/" + id, body, {"Content-Type": "application/pdf"});

test("Claude's drawing of a spreadsheet goes to the phone in its place", async () => {
  const c = await sender();
  await share(c, SHEET, "application/octet-stream");
  await share(c, new TextEncoder().encode("%PDF-1.7\n1 0 obj"), "application/pdf");
  const [h, s] = await items(c);
  assert.equal((await draw(c, CK, h.id)).status, 200);
  assert.deepEqual((await items(c))[0].file, {type: "application/pdf", size: DRAWING.length});
  assert.deepEqual(new Uint8Array(await (await c.call(CK, "GET", "/file/" + h.id)).arrayBuffer()), DRAWING);
  assert.equal((await results(c, [call(h.id, s.id)])).status, 200);
  const [got] = (await (await c.call(PT, "GET", "/results")).json()).results;
  assert.deepEqual(got.sheets.map(x => [x.site, x.file]), [["hsc", h.id], ["stb", s.id]]);
  assert.deepEqual(got.keep, [h.id, s.id]);
  const pic = await c.call(PT, "GET", "/file/" + h.id);
  assert.equal(pic.status, 200);
  assert.equal(pic.headers.get("Content-Type"), "application/pdf");
  assert.deepEqual(new Uint8Array(await pic.arrayBuffer()), DRAWING);
});

test("only Claude draws, only a PDF, and only over a spreadsheet that still waits", async () => {
  const c = await sender();
  await share(c, SHEET, "application/octet-stream");
  await share(c, JPEG);
  const [x, p] = await items(c);
  for (const tok of [SK, PT, null]) assert.equal((await draw(c, tok, x.id)).status, 401);
  assert.equal((await draw(c, CK, x.id, JPEG)).status, 415);
  const big = new Uint8Array(10485761);
  big.set(DRAWING);
  assert.equal((await draw(c, CK, x.id, big)).status, 413);
  assert.equal((await draw(c, CK, p.id)).status, 409, "a picture stays as it was shared");
  assert.equal((await draw(c, CK, "nope")).status, 400);
  assert.equal((await draw(c, CK, "iabcdefghij")).status, 404);
  assert.deepEqual(new Uint8Array(c.env.AGENDA.m.get("file:" + x.id).v), SHEET);
  assert.deepEqual(new Uint8Array(c.env.AGENDA.m.get("file:" + p.id).v), JPEG);
  assert.deepEqual((await items(c)).map(i => i.file.type), [XLSX, "image/jpeg"]);
  // Filed already: too late to draw.
  assert.equal((await results(c, [{item: x.id, kind: "note", t: "A shared file Claude couldn't read"}])).status, 200);
  assert.equal((await draw(c, CK, x.id)).status, 404);
});

test("Claude's result drops the files it doesn't keep", async () => {
  const c = await sender();
  await share(c, JPEG);
  const [it] = await items(c);
  assert.equal((await results(c, [{item: it.id, kind: "event", t: "Flight to Toronto", d: "2026-12-23", s: "11:00"}])).status, 200);
  assert.deepEqual(files(c), []);
});
