"use strict";
// Sends GI Hub's reminders; .github/workflows/reminders.yml runs it every 15
// minutes. Each run covers the time since the last run that actually ran.
// The push says only what kind of reminder it is and when; the phone writes
// the words from what it has saved, so no names ever leave the phone.
// Logs stay generic: this repository is public.
process.env.TZ = "America/Winnipeg";
const {sendPush} = require("./webpush");
const {dueReminders, parseCallTimes, windowFor} = require("./schedule");

const SUBJECT = "https://lethalnifty.github.io/epa-tracker/";
const WORKFLOW = "reminders.yml";

async function gh(path) {
  const res = await fetch("https://api.github.com/repos/" + process.env.GITHUB_REPOSITORY + path, {
    headers: {authorization: "Bearer " + process.env.GITHUB_TOKEN, accept: "application/vnd.github+json"}});
  if (!res.ok) throw new Error("GitHub API " + res.status);
  return res.json();
}
// This run's start, and the start of the last run that got as far as running.
async function runTimes() {
  const me = await gh(`/actions/runs/${process.env.GITHUB_RUN_ID}`);
  const list = await gh(`/actions/workflows/${WORKFLOW}/runs?status=completed&per_page=20`);
  const prev = list.workflow_runs.find(r => r.id !== me.id && ["success", "failure"].includes(r.conclusion));
  return {thisStart: Date.parse(me.run_started_at), prevStart: prev ? Date.parse(prev.run_started_at) : null};
}

async function main() {
  const {VAPID_PRIVATE_KEY, PUSH_SUBSCRIPTION, CALL_TIMES, SEND_NOW} = process.env;
  if (!VAPID_PRIVATE_KEY || !PUSH_SUBSCRIPTION) { console.log("Reminders aren't connected yet."); return; }
  const sub = JSON.parse(PUSH_SUBSCRIPTION);
  let times;
  try { times = await runTimes(); } catch (e) { times = {thisStart: Date.now(), prevStart: null}; }
  const {lo, hi} = windowFor(times.prevStart, times.thisStart);
  const starts = parseCallTimes(CALL_TIMES);
  const due = dueReminders(lo, hi, starts);
  if (SEND_NOW) {
    const now = Date.now(), next = starts.find(s => s > now) || null;
    due.push(SEND_NOW === "call" ? {kind: "call", t: now, s: next} : {kind: SEND_NOW, t: now});
  }
  let failed = 0;
  for (const msg of due) {
    let r = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { r = await sendPush(sub, msg, {vapidPrivate: VAPID_PRIVATE_KEY, subject: SUBJECT}); } catch (e) { r = {status: 0}; }
      if (r.status < 500 && r.status !== 0 && r.status !== 429) break;
      await new Promise(ok => setTimeout(ok, 4000 * (attempt + 1)));
    }
    // Gone: reminders were turned off on the phone, or the phone dropped the
    // connection. Not a failure; GI Hub offers to turn them on again.
    if (r.status === 404 || r.status === 410) console.log("The phone isn't connected to reminders any more.");
    else if (r.status >= 300 || r.status === 0) { console.log("The push service turned a reminder away (" + r.status + ")."); failed++; }
  }
  console.log("Checked.");
  if (failed) process.exitCode = 1;
}

if (require.main === module) main().catch(e => { console.log("Reminder run failed: " + e.message); process.exitCode = 1; });
module.exports = {main};
