"use strict";
// Invite codes for the fellows' site (tools/fellows/access.mjs), run the way
// Cloudflare runs functions/_middleware.js: a request, the secrets, and next().
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {ROOT} = require("./harness");

const load = () => import(pathToFileURL(path.join(ROOT, "tools", "fellows", "access.mjs")).href);
const ENV = {GI_CODES: "f01:K7QM-4TZP, f02:WX3N-8HRB"};
const SITE = "https://gi-hub-fellows.pages.dev";
const next = async () => new Response("the app", {status: 200, headers: {"Content-Type": "text/html"}});
const get = (p, headers = {}) => new Request(SITE + p, {headers});
const post = code => new Request(SITE + "/__access", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({code})});

test("without a code: the gate for pages, nothing else but what Add to Home Screen needs", async () => {
  const {handle} = await load();
  const page = await handle(get("/", {Accept: "text/html"}), ENV, next);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Enter your invite code/);
  assert.equal(page.headers.get("Cache-Control"), "no-store");
  assert.equal((await handle(get("/app.js"), ENV, next)).status, 401);
  assert.equal((await handle(get("/guides.json"), ENV, next)).status, 401);
  for (const open of ["/manifest.webmanifest", "/icon-180.png", "/sw.js", "/notify.js", "/fonts/outfit-var.woff2"])
    assert.equal(await (await handle(get(open), ENV, next)).text(), "the app", open);
  assert.equal((await handle(get("/__access"), ENV, next)).status, 401);
});

test("a fellow's code, typed any way, opens the site; a wrong one doesn't", async () => {
  const {handle} = await load();
  assert.equal((await handle(post("K7QM-4TZX"), ENV, next)).status, 401);
  const ok = await handle(post("  k7qm 4tzp "), ENV, next);
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get("Set-Cookie");
  assert.match(cookie, /^gi_access=f01\.[0-9a-f]{64}; Path=\/; Max-Age=\d+; Secure; HttpOnly; SameSite=Lax$/);
  const jar = {Cookie: cookie.split(";")[0]};
  assert.equal(await (await handle(get("/", jar), ENV, next)).text(), "the app");
  assert.equal(await (await handle(get("/guides.json", jar), ENV, next)).text(), "the app");
  assert.equal((await handle(get("/__access", jar), ENV, next)).status, 200);
  // Taking that one code out ends that fellow's access only.
  const without = {GI_CODES: "f02:WX3N-8HRB"};
  assert.equal((await handle(get("/__access", jar), without, next)).status, 401);
  assert.match(await (await handle(get("/", {...jar, Accept: "text/html"}), without, next)).text(), /Enter your invite code/);
  // A forged or borrowed signature fails.
  const forged = {Cookie: "gi_access=f02." + cookie.split(".")[1].slice(0, 64)};
  assert.equal((await handle(get("/__access", forged), ENV, next)).status, 401);
});

test("no codes set: the site stays closed", async () => {
  const {handle, codesFrom} = await load();
  assert.equal(codesFrom({}).size, 0);
  assert.equal((await handle(post("K7QM-4TZP"), {}, next)).status, 401);
  assert.deepEqual([...codesFrom({GI_CODES: "f01:K7QM-4TZP\nbad f03:short f04:AB12CD34"}).keys()], ["f01", "f04"]);
});
