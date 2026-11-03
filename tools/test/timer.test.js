"use strict";
// The reminder timer (tools/timer): a Cloudflare Worker that asks GitHub to run
// the reminder workflow every 15 minutes, because GitHub's own schedule runs it
// hours apart. Run here the way Cloudflare runs it: a cron event and the secrets.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {ROOT} = require("./harness");

const DIR = path.join(ROOT, "tools", "timer");
const load = () => import(pathToFileURL(path.join(DIR, "worker.mjs")).href);
const TOKEN = "github_pat_TEST0123456789";
// GitHub's API, as far as the timer uses it: records each request, answers with status.
function github(status = 204) {
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push({url, init}); return new Response(status === 204 ? null : "{}", {status}); };
  return {seen, fetchImpl};
}

test("each tick asks GitHub to run reminders.yml on main, with the token and the headers GitHub needs", async () => {
  const {dispatch} = await load();
  const gh = github();
  await dispatch({GH_TOKEN: TOKEN}, gh.fetchImpl);
  assert.equal(gh.seen.length, 1);
  const {url, init} = gh.seen[0];
  assert.equal(url, "https://api.github.com/repos/LethalNifty/epa-tracker/actions/workflows/reminders.yml/dispatches");
  assert.equal(init.method, "POST");
  assert.deepEqual(JSON.parse(init.body), {ref: "main"});
  assert.equal(init.headers.Authorization, "Bearer " + TOKEN);
  assert.equal(init.headers.Accept, "application/vnd.github+json");
  assert.equal(init.headers["X-GitHub-Api-Version"], "2022-11-28");
  // GitHub turns away requests with no User-Agent, and a Worker sends none by itself.
  assert.ok(init.headers["User-Agent"]);
});

test("the cron event runs the same dispatch", async () => {
  const worker = (await load()).default;
  assert.equal(typeof worker.scheduled, "function");
  // No address to visit: the Worker only runs on its timer.
  assert.equal(worker.fetch, undefined);
  const gh = github(), real = globalThis.fetch;
  globalThis.fetch = gh.fetchImpl;
  try { await worker.scheduled({cron: "*/15 * * * *", scheduledTime: Date.now()}, {GH_TOKEN: TOKEN}, {waitUntil() {}}); }
  finally { globalThis.fetch = real; }
  assert.equal(gh.seen.length, 1);
});

test("a refusal fails loudly enough to show in Cloudflare's logs, and never prints the token", async () => {
  const {dispatch} = await load();
  for (const status of [401, 403, 404, 422, 500]) {
    const gh = github(status);
    await assert.rejects(dispatch({GH_TOKEN: TOKEN}, gh.fetchImpl), e => {
      assert.match(e.message, new RegExp(String(status)));
      assert.doesNotMatch(e.message, /github_pat_/);
      return true;
    });
  }
});

test("with no token set it says so and asks GitHub nothing", async () => {
  const {dispatch} = await load();
  const gh = github();
  await assert.rejects(dispatch({}, gh.fetchImpl), /GH_TOKEN/);
  assert.equal(gh.seen.length, 0);
});

test("wrangler.toml: its own Worker, every 15 minutes, no public address", () => {
  const toml = fs.readFileSync(path.join(DIR, "wrangler.toml"), "utf8").replace(/\r\n/g, "\n");
  assert.match(toml, /^name = "gi-hub-timer"$/m);
  assert.match(toml, /^main = "worker\.mjs"$/m);
  assert.match(toml, /^compatibility_date = "\d{4}-\d{2}-\d{2}"$/m);
  assert.match(toml, /^workers_dev = false$/m);
  assert.match(toml, /\[triggers\]\ncrons = \["\*\/15 \* \* \* \*"\]/);
  assert.doesNotMatch(toml, /^routes?\s*=/m);
  // The token lives only in Cloudflare's secrets, never in the repository.
  assert.doesNotMatch(toml, /GH_TOKEN\s*=|github_pat_|ghp_/);
});

test("the timer stays apart from the fellows' site: nothing in functions/ reaches it", () => {
  for (const f of fs.readdirSync(path.join(ROOT, "functions")))
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, "functions", f), "utf8"), /timer/);
});
