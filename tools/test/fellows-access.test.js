"use strict";
// Invite codes for the fellows' site (tools/fellows/access.mjs), run the way
// Cloudflare runs functions/_middleware.js: a request, the secrets and the KV
// store, and next().
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {ROOT} = require("./harness");

const load = () => import(pathToFileURL(path.join(ROOT, "tools", "fellows", "access.mjs")).href);
const SITE = "https://gi-hub-fellows.pages.dev";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const ADMIN_KEY = "QX7P-M4RT-9KWD-H3NB";

// Workers KV, as far as access.mjs uses it.
function kv() {
  const m = new Map();
  return {m,
    async get(k, type) { const v = m.has(k) ? m.get(k) : null; return v == null ? null : type === "json" ? JSON.parse(v) : v; },
    async put(k, v) { m.set(k, String(v)); },
    async delete(k) { m.delete(k); }};
}
const envWith = (extra = {}) => ({GI_CODES: "f01:K7QM-4TZP, f02:WX3N-8HRB", GI_ADMIN: ADMIN_KEY, GI_KV: kv(), ...extra});
const next = async () => new Response("the app", {status: 200, headers: {"Content-Type": "text/html"}});
function req(p, {method = "GET", headers = {}, body, cf} = {}) {
  const r = new Request(SITE + p, {method, headers, body});
  if (cf) Object.defineProperty(r, "cf", {value: cf});
  return r;
}
// A phone: its own cookies, its own kind and place.
function phone(handle, env, ua = IPHONE, cf = {city: "Winnipeg", regionCode: "MB", country: "CA"}) {
  const jar = {};
  const send = async (p, o = {}) => {
    const headers = {"User-Agent": ua, ...(o.headers || {})};
    const c = Object.entries(jar).map(([k, v]) => k + "=" + v).join("; ");
    if (c) headers.Cookie = c;
    const res = await handle(req(p, {...o, headers, cf}), env, next);
    const set = res.headers.get("Set-Cookie");
    if (set) { const [kv1] = set.split(";"); const i = kv1.indexOf("="); jar[kv1.slice(0, i)] = kv1.slice(i + 1); }
    return res;
  };
  return {jar, send,
    enter: code => send("/__access", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({code})}),
    check: () => send("/__access"),
    file: p => send(p)};
}
const form = o => ({method: "POST", headers: {"Content-Type": "application/x-www-form-urlencoded"}, body: new URLSearchParams(o).toString()});
async function adminOf(handle, env) {
  const me = phone(handle, env);
  const res = await me.send("/__admin/login", form({key: ADMIN_KEY.toLowerCase()}));
  assert.equal(res.status, 303);
  return {...me, act: (act, id = "") => me.send("/__admin/act", form({act, id})), view: async () => (await me.send("/__admin")).text()};
}

test("without a code: the gate for pages, nothing else but what Add to Home Screen needs", async () => {
  const {handle} = await load();
  const env = envWith();
  const page = await handle(req("/", {headers: {Accept: "text/html"}}), env, next);
  assert.equal(page.status, 200);
  const gate = await page.text();
  assert.match(gate, /Enter your invite code/);
  // On an iPhone in Safari it asks for the home screen first.
  assert.match(gate, /Add GI Hub to your Home Screen first/);
  assert.equal(page.headers.get("Cache-Control"), "no-store");
  assert.equal((await handle(req("/app.js"), env, next)).status, 401);
  assert.equal((await handle(req("/guides.json"), env, next)).status, 401);
  for (const open of ["/manifest.webmanifest", "/icon-180.png", "/sw.js", "/notify.js", "/fonts/outfit-var.woff2"])
    assert.equal(await (await handle(req(open), env, next)).text(), "the app", open);
  assert.equal((await handle(req("/__access"), env, next)).status, 401);
});

test("a code opens GI Hub on the first phone only; another phone is turned away and noted", async () => {
  const {handle} = await load();
  const env = envWith();
  const mine = phone(handle, env);
  assert.equal((await mine.enter("K7QM-4TZX")).status, 401);
  const ok = await mine.enter("  k7qm 4tzp ");
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("Set-Cookie"), /^gi_access=f01\.[0-9a-f]{16}\.[0-9a-f]{64}; Path=\/; Max-Age=\d+; Secure; HttpOnly; SameSite=Lax$/);
  assert.equal(await (await mine.file("/guides.json")).text(), "the app");
  assert.equal((await mine.check()).status, 200);
  // Entering it again on the same phone is fine.
  assert.equal((await mine.enter("K7QM-4TZP")).status, 200);
  // A friend's phone with the same code.
  const friend = phone(handle, env, ANDROID, {city: "Toronto", regionCode: "ON", country: "CA"});
  const no = await friend.enter("K7QM-4TZP");
  assert.equal(no.status, 409);
  assert.equal((await no.json()).why, "taken");
  assert.equal((await friend.file("/app.js")).status, 401);
  const rec = await env.GI_KV.get("acc:f01", "json");
  assert.equal(rec.phone.dev, "iPhone");
  assert.equal(rec.phone.where, "Winnipeg, MB");
  assert.deepEqual(rec.tries.map(t => [t.dev, t.where]), [["Android", "Toronto, ON"]]);
  // A second try within the minute isn't written again.
  await friend.enter("K7QM-4TZP");
  assert.equal((await env.GI_KV.get("acc:f01", "json")).tries.length, 1);
  // The other code is untouched.
  assert.equal((await friend.enter("WX3N-8HRB")).status, 200);
  // A forged or borrowed signature fails.
  const forged = phone(handle, env);
  forged.jar.gi_access = mine.jar.gi_access.replace(/^f01\./, "f02.");
  assert.equal((await forged.check()).status, 401);
});

test("no admin page on the fellows' site: the owner's GI Hub asks one address from the key, with the key", async () => {
  const {handle, ownerPath} = await load();
  const env = envWith();
  // Nowhere to type a key: old admin addresses are just the invite page.
  for (const p of ["/__admin", "/__admin/login", "/__admin/summary"]) {
    const html = await (await handle(req(p, {headers: {Accept: "text/html"}}), env, next)).text();
    assert.match(html, /Enter your invite code/);
    assert.doesNotMatch(html, /Admin key|admin/i);
  }
  const at = await ownerPath(ADMIN_KEY);
  assert.match(at, /^\/__[0-9a-f]{24}$/);
  const ask = (body, key = ADMIN_KEY, p = at) => handle(req(p, body
    ? {method: "POST", headers: {Authorization: "Bearer " + key, "Content-Type": "application/json"}, body: JSON.stringify(body)}
    : {headers: {Authorization: "Bearer " + key}}), env, next);
  // A wrong key, no key, or the key somewhere else: what any address gets.
  assert.equal((await ask(null, "AAAA-BBBB-CCCC-DDDD")).status, 401);
  assert.equal((await handle(req(at), env, next)).status, 401);
  assert.equal((await ask(null, ADMIN_KEY, "/__0123456789abcdef01234567")).status, 401);
  assert.equal((await ask(null, ADMIN_KEY, "/__admin/summary")).status, 401);
  const pre = await handle(req(at, {method: "OPTIONS"}), env, next);
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get("Access-Control-Allow-Headers"), /Authorization/);
  // What the owner sees: each code (with the code, to send), its phone, tries from other phones.
  const old = phone(handle, env), fresh = phone(handle, env, ANDROID, {city: "Toronto", regionCode: "ON", country: "CA"});
  await old.enter("K7QM-4TZP");
  await fresh.enter("K7QM-4TZP");
  const res = await ask(null, ADMIN_KEY.toLowerCase());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
  let j = await res.json();
  assert.equal(j.inUse, 1);
  assert.deepEqual(j.codes.map(c => [c.id, c.state, c.tries, c.code, c.where]), [["f01", "in", 1, "K7QM-4TZP", "Winnipeg, MB"], ["f02", "new", 0, "WX3N-8HRB", ""]]);
  assert.deepEqual(j.tries.map(t => [t.id, t.dev, t.where]), [["f01", "Android", "Toronto, ON"]]);
  // A new phone: free it up; the old phone locks, the new one gets in.
  j = await (await ask({act: "free", id: "f01"})).json();
  assert.equal(j.codes[0].state, "new");
  assert.equal((await old.check()).status, 401);
  assert.equal((await fresh.enter("K7QM-4TZP")).status, 200);
  // Off locks the phone and refuses the code; back on, the same phone is in again.
  await ask({act: "off", id: "f01"});
  assert.equal((await fresh.check()).status, 401);
  assert.equal((await fresh.file("/app.js")).status, 401);
  assert.equal((await (await fresh.enter("K7QM-4TZP")).json()).why, "off");
  await ask({act: "on", id: "f01"});
  assert.equal((await fresh.check()).status, 200);
  j = await (await ask({act: "clear", id: "f01"})).json();
  assert.equal(j.codes[0].tries, 0);
  // A new code works like the others.
  j = await (await ask({act: "add"})).json();
  assert.equal(j.added.id, "f03");
  assert.match(j.added.code, /^[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/);
  const third = phone(handle, env);
  assert.equal((await third.enter(j.added.code)).status, 200);
  assert.equal(await (await third.file("/app.js")).text(), "the app");
  await ask({act: "add"});
  assert.deepEqual(Object.keys(await env.GI_KV.get("extra", "json")), ["f03", "f04"]);
  // A fellow's own cookie gets the app there, never the codes.
  assert.equal(await (await third.send(at)).text(), "the app");
  // No admin key set: nothing answers.
  assert.equal((await handle(req(at, {headers: {Authorization: "Bearer " + ADMIN_KEY}}), envWith({GI_ADMIN: ""}), next)).status, 401);
});

test("phones signed in before codes claimed a phone: the first claims its code, any other is out", async () => {
  const {handle} = await load();
  const env = envWith();
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode("K7QM4TZP"), {name: "HMAC", hash: "SHA-256"}, false, ["sign"]);
  const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode("gi-access:f01")))].map(b => b.toString(16).padStart(2, "0")).join("");
  const a = phone(handle, env), b = phone(handle, env);
  a.jar.gi_access = b.jar.gi_access = "f01." + sig;
  assert.equal(await (await a.file("/app.js")).text(), "the app");
  const first = await a.check();
  assert.equal(first.status, 200);
  assert.match(a.jar.gi_access, /^f01\.[0-9a-f]{16}\.[0-9a-f]{64}$/);
  assert.equal((await b.check()).status, 401);
  assert.equal((await b.file("/app.js")).status, 401);
  assert.equal((await a.check()).status, 200);
});

test("no store connected: no phone can claim a code; no codes set: the site stays closed", async () => {
  const {handle, codesFrom} = await load();
  const noKV = envWith({GI_KV: undefined});
  const res = await phone(handle, noKV).enter("K7QM-4TZP");
  assert.equal(res.status, 503);
  assert.equal((await res.json()).why, "setup");
  assert.equal(codesFrom({}).size, 0);
  assert.equal((await phone(handle, {GI_KV: kv()}).enter("K7QM-4TZP")).status, 401);
  assert.deepEqual([...codesFrom({GI_CODES: "f01:K7QM-4TZP\nbad f03:short f04:AB12CD34"}).keys()], ["f01", "f04"]);
});
