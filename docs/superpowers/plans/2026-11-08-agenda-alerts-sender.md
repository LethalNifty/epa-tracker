# Agenda alerts sender (Agenda takeover, part 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One free Cloudflare Worker sends every GI Hub reminder on the minute, from a list the phone keeps up to date, and Agenda events get alerts (19:00 the evening before, 30 minutes before).

**Architecture:** A new Worker, `gi-hub-agenda` (`tools/agenda/`, its own Worker, never in `functions/`), keeps one push subscription, one alert list and its own VAPID key pair in the KV namespace `AGENDA`; a cron every minute sends what falls due. The phone works out the list (`alerts.js`, owner only) and uploads it when it changes. As today, a push carries only a kind and times; the service worker writes the words from the brief on the phone, so no titles, names or notes ever reach Cloudflare. The phone moves to the new sender once (it re-subscribes with the Worker's key), which ends the old path: the GitHub workflow, the timer Worker and the per-block `CALL_TIMES` secret.

**Tech Stack:** Classic browser scripts (no build), Cloudflare Workers + KV (free plan), WebCrypto (RFC 8291 aes128gcm, RFC 8292 VAPID), `node --test`.

**Spec:** the plan the user approved in chat on 2026-11-08 ("Alerts on the minute ... Agenda events (19:00 the evening before and 30 min before) and the reminders you already get (call, reading nights, Monday, Wednesday, Sunday pearls) ... You'd turn reminders on once more, because it's a new sender"), and the 2026-10-24 Agenda answers (appointments: 19:00 the evening before + 30 min before).

## Global Constraints

- No em-dashes in UI copy; no "Dr."; Entrada never Elentra (copy.test.js).
- No real names in code, tests or commits; placeholders only.
- Owner only: `alerts.js` joins `OWNER_ONLY` in `tools/fellows/build.mjs`; nothing of it, its URL or `gi-hub-agenda` reaches the fellows' build.
- No secrets set by anyone: the Worker makes and keeps its own VAPID key pair.
- Cloudflare free plan: KV 1,000 writes a day, so the per-minute cron writes only when it sends or a subscription is gone; 10 ms CPU per run.
- Version bump only when shipping (`tools/ship.py`). Ask before pushing to main.
- Every push must show a notification (iPhone revokes pushes that show none).

## Review Focus

1. The phone is offline when the plan changes: alerts already uploaded still fire; the upload retries on the next render after a minute and on the next open. Test in Task 5.
2. iPhone drops the subscription: the push service answers 404/410, the Worker forgets it, and the next open shows "Reminders stopped reaching this phone". Tests in Tasks 2 and 5.
3. An alert whose event was deleted while offline: the notification still shows, with generic words. Test in Task 4.
4. Redraws must not re-upload an unchanged plan (KV write budget): the plan is keyed from the start of today, so it changes only with the data or at midnight. Test in Task 5.
5. A new phone without the token: the Worker answers 401 and the phone says to ask Claude to free the sender. Test in Task 5.

---

### Task 1: Web Push in WebCrypto

**Files:**
- Create: `tools/agenda/webpush.mjs`
- Test: `tools/test/agenda-worker.test.js`

**Interfaces:**
- Produces: `newVapid() -> Promise<{jwk, pub}>` (P-256 ECDSA; `pub` = base64url 65-byte point); `encrypt(plain: Uint8Array, p256dh: string, auth: string) -> Promise<Uint8Array>` (salt 16, rs 4096, idlen 65, sender key, one record ending 0x02); `vapidAuth(endpoint, vapid, subject, nowSec) -> Promise<string>` (`vapid t=<ES256 JWT>, k=<pub>`, aud = endpoint origin, exp = now + 12 h); `sendPush(sub, payload, vapid, {ttl, fetchImpl}) -> Promise<{status}>`; `b64u`, `unb64u`.

- [ ] Write `"a push decrypts on the phone to what was sent (RFC 8291)"`: a Node ECDH receiver key + 16-byte auth as the subscription; decrypt the body with Node crypto (shared secret, HKDF info "WebPush: info\0"+ua+as, CEK/nonce from the salt) and assert the plaintext JSON and the 0x02 delimiter; the same decryptor also opens `tools/push/webpush.js` output (checks the checker).
- [ ] Write `"the VAPID header verifies with the sender's public key"`: split the JWT, `crypto.verify` (ieee-p1363) with the `k=` key; claims aud `https://web.push.apple.com`, exp within 24 h, sub the app's address.
- [ ] Run, see both fail (module missing). Implement. Run, see them pass. Commit.

### Task 2: The Worker

**Files:**
- Create: `tools/agenda/worker.mjs`, `tools/agenda/wrangler.toml`
- Test: `tools/test/agenda-worker.test.js`

**Interfaces:**
- Consumes: Task 1.
- Produces (HTTP, CORS for `https://lethalnifty.github.io` only, Bearer token of 43 base64url characters, SHA-256 kept as `auth`, first `PUT /sub` claims it):
  - `GET /vapid` -> `{key}` (makes the pair once, KV `vapid`)
  - `PUT /sub` `{sub: {endpoint, keys: {p256dh, auth}}, key}` -> 200; 400 when the endpoint isn't https on a push service (`push.apple.com`, `fcm.googleapis.com`, `push.services.mozilla.com`, `notify.windows.com`); 401 another token; 409 when `key` isn't the current one
  - `PUT /alerts` `{list: [{t, kind, s?, d?, id?}]}` -> `{kept, next}`; kinds `week ask pearls call study eve ev`; `t` within a day back and 40 days ahead; sorted; at most 800 (the soonest)
  - `POST /test` -> sends `{kind: "test", t}` now -> `{status}`
  - `GET /status` -> `{sub: bool, key, kept, next}`
  - `DELETE /sub` -> 204, forgets sub, alerts and the claim
  - `scheduled(controller)`: `sendDue(env, controller.scheduledTime)` sends alerts with `at - 60000 < t <= at`; payload `{kind, t, s?, d?, id?}`; TTL `ev` 1800, `call` 3600, else 21600; 404/410 deletes `sub`
  - `handle(req, env, now)` answers 500 with CORS when storage fails
- [ ] Write tests: preflight; one key kept across calls; claim, 401, 400 host, 409 key; alerts cleaned, sorted, capped; a minute's run sends exactly its window and the next minute's sends nothing again; 410 forgets the phone and status says so; test push; delete then a new token claims; storage down gives 500.
- [ ] Run, fail. Implement (`wrangler.toml`: name `gi-hub-agenda`, `workers_dev = true`, `preview_urls = false`, crons `["* * * * *"]`, KV binding `AGENDA`). Run, pass. Commit.

### Task 3: Alerts on each event

**Files:**
- Modify: `agenda.js` (`agItemClean` keeps `al`; `AG_ALERTS = ["eve", "30"]`; `agAlerts(it) -> string[]`)
- Modify: `agenda-view.js` (sheet chips "Evening before", "30 min before" with action `agalert` + `data-al`; all day shows only the first)
- Test: `tools/test/alerts.test.js`

**Interfaces:**
- Produces: `it.al`: `null` (the default: both when timed, "eve" when all day) or an explicit subset; `agAlerts(it)` returns what applies (never "30" for all day).
- [ ] Tests: `"a new event alerts the evening before and 30 minutes before, and the sheet can turn either off"`; `"an all-day event offers only the evening before"`; `"alerts survive a save and a restore"`.
- [ ] Fail, implement, pass, commit.

### Task 4: The plan, the brief and the words

**Files:**
- Create: `alerts.js` (plan part)
- Modify: `remind.js` (`remindBrief` gains `agenda`; `remindNext` reads the plan), `notify.js` (`ev`, `eve`, test text), `sw.js` (tap opens Agenda), `app.js` (`APP_LINKS.agenda`), `index.html` (script after `remind.js`)
- Test: `tools/test/alerts.test.js`

**Interfaces:**
- Produces: `alertPlan(now) -> [{t, kind, s?, d?, id?}]` over `ALERT_DAYS = 35` days from local midnight: Mon 08:00 `week`, Wed 08:00 `ask`, Sun 17:00 `pearls`, `study` at 20:00 when `studyNightKind(day, stretches, [])` is "read", `call` an hour before each stretch (`s`), `ev` 30 minutes before each timed occurrence with its alert (`s`, `id` = item id + "@" + day), one `eve` at 19:00 the day before any day with evening alerts (`d`); `alertOccurrences(now) -> [{id, d, s, t, n, eve}]` for the brief; `noticeFor` for `ev` ("Dentist at 15:30", "In 30 minutes. <note>") and `eve` ("Tomorrow: Dentist at 15:30" or "Tomorrow: 3 things", times listed), generic words when the brief lacks it.
- [ ] Tests: the week's reminders; no reading on a call night; call an hour before; timed, all-day, multi-day, weekly and switched-off events; one evening line for several; same plan all day; notices from the brief and without it; a tap opens Agenda.
- [ ] Fail, implement, pass, commit.

### Task 5: The phone joins the sender

**Files:**
- Modify: `alerts.js` (network part: `ALERTS_URL`, store `gi-alerts-v1` `{tok, key, sent}`, `alertsConnect()`, `alertsSync()`, `alertsCheck()`, `alertsTest()`, `alertsDisconnect()`), `remind.js` (states `off | move | on | reconnect`; the code-sharing step goes), `app.js` (actions `remindon`, `remindtest`, `remindoff`), `settings` copy in `remind.js`, `tools/fellows/build.mjs` (`OWNER_ONLY` + "alerts.js"), `sw.js` (`ASSETS`)
- Modify tests: `tools/test/remind.test.js`, `tools/test/copy.test.js`, `tools/test/fellows-build.test.js`
- Test: `tools/test/alerts.test.js`

**Interfaces:**
- Consumes: Task 2 HTTP, Task 4 `alertPlan`.
- `alertsConnect()`: permission, `GET /vapid`, unsubscribe any old subscription, subscribe with the key, `PUT /sub` (Bearer, new random token unless kept), `PUT /alerts`, `POST /test`. Errors: offline "Couldn't reach GI Hub's sender..."; 401 "...another phone. Ask Claude to free it."
- `alertsSync()`: after each render when on; uploads when `JSON.stringify(plan)` differs from `sent`; one request at a time; a failure waits a minute.
- [ ] Tests: turning on does the five calls in order with the token and key; an old-sender phone shows Move reminders and moves; an Agenda change uploads once, an unchanged redraw never; offline retry; status says gone, Settings says reconnect; 401 message; Send a test; Turn off; fellows' build has none of it.
- [ ] Fail, implement, pass, commit.

### Task 6: Deploy, docs, ship

- [ ] `npx wrangler kv namespace create AGENDA` in `tools/agenda`, id into `wrangler.toml`, `npx wrangler deploy`; check `GET /vapid` answers a key and `GET /status` without a token answers 401.
- [ ] Docs: CLAUDE.md layout row for `tools/agenda/`; APP-BRIEF reminders paragraph.
- [ ] Full suite green; `python tools/ship.py --dry-run`; ask the user.
- [ ] After the user moves the phone and a few days of alerts: with their yes, retire the GitHub path (workflow, `tools/push` sender, timer Worker, the three GitHub secrets).
