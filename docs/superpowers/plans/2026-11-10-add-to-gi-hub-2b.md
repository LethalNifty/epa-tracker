# Add to GI Hub, part 2b (sharing and call schedules) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Share the call schedule pictures (or anything else) to GI Hub from the Share Sheet; Claude's cloud task reads the whole block, GI Hub checks it with you once, and Call then shows Who's on at both sites, your shifts with who you're on with, and the sheets themselves.

**Architecture:** The sender (`tools/agenda/worker.mjs`) takes files into Tell's inbox: the bytes go in KV as `file:<item id>` with a 3-day expiry, the item in the `Tell` Durable Object. The cloud task reads them per `TELL.md` and files a `call` result (the whole roster) or a `callswap`. The phone picks the result up with the pictures it keeps and holds it for a check. A new owner-only pair, `roster.js` (store, your shifts, diff, swaps, Worth a look, pictures) and `roster-view.js` (the checks, Who's on, Find someone, the sheets), plugs into `call.js`, `tell.js` and `app.js` through guarded hooks.

**Tech Stack:** Classic browser scripts (no build), Cloudflare Workers + KV + the existing SQLite Durable Object (free plan), IndexedDB on the phone for pictures, headless Chrome (already used by `tools/preview/shot.mjs`) to draw the made-up test sheets, `node --test`.

**Spec:** "Add to GI Hub (Part 2b design)", https://claude.ai/artifact/HXhTnzDJ5cE9VKbVfUyh6L (approved 2026-11-10: "yeah build it"). Mockup with made-up names: https://claude.ai/artifact/7XUTLj432wqZjbQFqypEfC.

## Global Constraints

- Free only: Cloudflare's free plan (KV 1,000 writes and deletes a day, values to 25 MiB; the Durable Object's SQLite storage) and the user's Pro plan.
- Owner-only: `roster.js` and `roster-view.js` join `OWNER_ONLY` in `tools/fellows/build.mjs`; every call into them from a shared file is guarded (`!FELLOWS` or `typeof fn === "function"`).
- No real names in code, tests, fixtures, demo data, the test sheets or commit messages. Fellows: Brook, Casey, Quill, Rowan, Sage, Tamsin. Residents: Resident G, Resident K, Resident M. Attendings: Ames, Birch, Cole, Dunn, Ellis, Frost.
- No em-dashes in prose or UI copy (copy.test.js). "Entrada", never Elentra. No "Dr." in the app.
- Names, the roster, which fellow is you, and the pictures stay on the phone: `gi-roster-v1` in localStorage and IndexedDB `gi-roster-pics`, never in the backup. The sender keeps a file until the phone confirms the result that keeps it, 3 days at most (KV `expirationTtl: 259200`). No name in any notification or result line.
- Claude never gets the user's name: `"me"` in a `callswap` is the only way it refers to them.
- Your shifts: every night you're the night fellow at either site, 17:00 to 08:00 the next day; day slots (08:00 to 17:00) only on Saturdays, Sundays and `agStat` days. Weekday day slots are never shifts. TPN consults never count.
- Files are JPEG, PNG or PDF, known by their first bytes, at most 10 MB (`FILE_MAX = 10485760`).
- Never bump `APP_VERSION`/`CACHE` on the branch: `tools/ship.py` does it.
- New phone files go in `sw.js` `ASSETS`, `index.html` (`roster.js` right after `tell.js`, `roster-view.js` right after `agenda-view.js`) and the copy.test.js lists.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Before 08:00 the slot on now is the night that began the evening before: Who's on opens on yesterday with Now on its night (test in Task 8).
- Signal lost between a result and its pictures: the result is taken at the next pickup, never confirmed without its pictures (test in Task 6).
- A revised sheet for one site only: the other site's days, notes and picture stay, and your shifts still come from both (test in Task 5).
- A block you're not on, or before you've said which fellow is you: no shifts, the check asks or says you're not on these sheets, and Add still keeps Who's on (test in Task 7).
- The roster replaces every shift in the sheet's dates even when you have none in it (an .ics shift in range goes) and leaves shifts outside alone (test in Task 5).

---

### Task 1: Files into the inbox

**Files:**
- Modify: `tools/agenda/tell.mjs` (ops `share`, `fileok`; `items` lists files)
- Modify: `tools/agenda/worker.mjs` (`POST /inbox` with a file body, `GET /file/<id>`, the route list, header comment)
- Test: `tools/test/tell.test.js`, `tools/test/share-worker.test.js` (new)

**Interfaces:**
- Produces (tell.mjs): `export const FILE_TYPES = ["image/jpeg", "image/png", "application/pdf"]`, `export const FILE_MAX = 10485760`.
- Produces op `share` (who: shortcut or phone; body `{id, type, size, at}`): `id` matches `/^i[a-z0-9]{10}$/`, `type` in `FILE_TYPES`, `1 <= size <= FILE_MAX`, else 400; 429 when `INBOX_MAX` items wait; else stores `{id, file: {type, size}, said, off, got}` and answers 200 `{ok: true}`.
- Produces op `items`: a file item comes out as `{id, said, file: {type, size}}` (text items unchanged).
- Produces op `fileok` (who: claude or phone; body `{id}`): 200 `{type}` when Claude asks and the item waits, or the phone asks and a result not yet confirmed lists `id` in its `keep`; else 404.
- Produces (worker.mjs): `export function sniff(bytes: Uint8Array) -> "image/jpeg" | "image/png" | "application/pdf" | "text" | null`: JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, PDF `%PDF-`, text when `new TextDecoder("utf-8", {fatal: true})` decodes it and it holds no NUL.
- Produces route `POST /inbox`: `Content-Type: application/json` works as now. Any other body: over `FILE_MAX` is 413; `sniff` text goes to `say` with `{text, at}` (`at` from the `X-At` header); a file gets `id = tellId("i")`, `AGENDA.put("file:" + id, bytes, {expirationTtl: 259200})`, then `share`, and a non-200 answer deletes the KV copy and is passed on; `null` is 415.
- Produces route `GET /file/<id>` (`id` as above, else 400): `fileok`, then `AGENDA.get("file:" + id, "arrayBuffer")`; 200 with the bytes, `HEADERS` and `Content-Type: <type>`, or 404 when either says no.

- [ ] **Step 1: Write the failing tests.** In `tell.test.js`: `a shared file waits as an item with its type and size` (share then `items` gives `{id, said, file: {type: "image/jpeg", size: 1234}}`, no `text`); `share refuses an unknown type, an empty or oversize file, a bad id and a full inbox` (400, 400, 400, 400, 429); `fileok lets Claude read a waiting file and nobody else` (claude 200 `{type}`, shortcut 401, phone 404 before any result keeps it). In `share-worker.test.js`, over a KV mock whose `put(k, v, opts)` keeps `v` as given plus `opts`, and whose `get(k, "arrayBuffer")` returns it: `a JPEG body becomes a file item and its bytes wait in KV for 3 days` (expirationTtl 259200, `said` from `X-At`); `a text body becomes something said`; `an unknown body is refused 415 and an oversize one 413`; `GET /file/<id> gives Claude the bytes with their type, and the phone nothing yet`; `a refused share leaves nothing in KV` (inbox full).
- [ ] **Step 2: Run them to see them fail.** Run: `node --test tools/test/tell.test.js tools/test/share-worker.test.js`. Expected: FAIL (no `share` op, 404 or 400 from the routes).
- [ ] **Step 3: Implement** the ops in `tell.mjs` and `sniff` plus the two routes in `worker.mjs`. `/file/` joins the paths that go to `tellRoute`. The header comments list the new routes and the `file:<id>` KV key.
- [ ] **Step 4: Run them to see them pass.** Run: `node --test tools/test/tell.test.js tools/test/share-worker.test.js`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add tools/agenda tools/test/tell.test.js tools/test/share-worker.test.js && git commit -m "feat(share): the inbox takes pictures and PDFs, kept 3 days at most"`

### Task 2: Call results, results from several items, files kept and dropped

**Files:**
- Modify: `tools/agenda/tell.mjs` (`resultClean`, `resultLine`, ops `file` and `ack`, `pendingAlerts`)
- Modify: `tools/agenda/worker.mjs` (deletes dropped files after `POST /results` and after the plan upload's `ack`)
- Test: `tools/test/tell.test.js`, `tools/test/share-worker.test.js`

**Interfaces:**
- Consumes: Task 1's file items.
- Produces `resultClean(raw, item)` for `kind: "call"`: `{kind, sheets, days, notes, people, rules, look}`, where `sheets` is 1 to 6 of `{site: "hsc" | "stb", from, to, file?}` (real days, `from <= to`, at most 62 days apart); `days` is 1 to 62 of `{d, hsc?, stb?}` with each site `{day: {fellows, res, att, tpn?}, night: {fellow, res, att}}` (names cut to 40, `fellows` and `res` lists of at most 4, empty strings for blanks); `notes` up to 100 `{d, site, who, t}` (`t` to 120); `people` up to 80 `{n, full}` (`full` to 80); `rules` up to 6 `{site, t}` (`t` to 300); `look` up to 20 strings to 200. Days outside 60 days before to 400 days after `said` are dropped, and no days left is `null`.
- Produces `resultClean` for `kind: "callswap"`: `slots`, 1 to 8 of `{d, site: "both" | "hsc" | "stb", slot: "night" | "day", from, to}`, names to 40 and `"me"` allowed; `chk` kept as for other kinds.
- Produces, on any result: `with` (up to 10 item ids, `/^i[a-z0-9]{10}$/`) and `keep` (the ids among `item` and `with` that are file items).
- Produces `resultLine`: a call is `Call schedule, Thu 19 Nov to Wed 16 Dec, check it in Call` (earliest `from`, latest `to`); a swap of one day is `Call swap on Mon 30 Nov, check it in Call`, of several `Call swap, 2 days, check it in Call`.
- Produces op `file`: a result's `with` items leave the inbox with its `item` and count as filed (never in `left`). The answer adds `drop`: every file item filed in this call minus every id some result keeps (test items never drop). A file item whose results can't be used gets the note `A shared file Claude couldn't read`.
- Produces op `ack`: the answer adds `drop`, the `keep` ids of the results it just confirmed.
- `pendingAlerts` gives nothing for `call` and `callswap`.
- Produces in worker.mjs: after `POST /results` and after `PUT /alerts`'s `ack`, `AGENDA.delete("file:" + id)` for each `drop`.

- [ ] **Step 1: Write the failing tests.** `a call result from two sheets files both items and keeps both pictures` (item + `with`, `keep` both, `left` empty, `drop` empty, one result); `a booking picture filed as an event drops its file`; `the call line and the swap line carry dates only` (assert the lines exactly, and that no placeholder name appears in either); `callswap needs a day, a slot and two names` (each missing gives the note fallback); `a call result is cut to size` (70 days in gives 62, a 50-character name gives 40); `confirming a call result lets the sender delete its pictures` (worker: KV keys gone after `PUT /alerts` with its `ack`); `Claude's result drops the files it doesn't keep` (worker: KV key gone after `POST /results`).
- [ ] **Step 2: Run them to see them fail.** Run: `node --test tools/test/tell.test.js tools/test/share-worker.test.js`. Expected: FAIL (`call` is null today).
- [ ] **Step 3: Implement** in `tell.mjs` and `worker.mjs` as the Interfaces say.
- [ ] **Step 4: Run them to see them pass.** Run: `node --test "tools/test/*.test.js"`. Expected: PASS, no 2a test broken.
- [ ] **Step 5: Commit.** `git commit -am "feat(share): call schedules and swaps as results, pictures kept for the phone"`

### Task 3: The test set gains made-up sheets and swaps

**Files:**
- Modify: `tools/agenda/tell-tests.mjs` (`TELL_SHEET`, three swaps in `TELL_TESTS`, scoring)
- Create: `tools/agenda/test-sheets/make.mjs`, `tools/agenda/test-sheets/hsc.png`, `tools/agenda/test-sheets/stb.png`
- Modify: `tools/agenda/tell.mjs` (op `test` adds the two sheets; `items` gives `repo`)
- Modify: `tell.js` (`tellTestHTML` wording)
- Test: `tools/test/tell.test.js`

**Interfaces:**
- Produces `export const TELL_SHEET = {at: "2026-12-10T09:00:00-05:00", from: "2026-12-17", to: "2027-01-13", files: [{site: "hsc", repo: "tools/agenda/test-sheets/hsc.png"}, {site: "stb", repo: "tools/agenda/test-sheets/stb.png"}], days, notes, rules, people}`, with `days` in the Task 2 shape, built by a small deterministic function from the placeholder names. It must include a St. Boniface night left blank (Dec 31) while HSC has a fellow, a 17:00 attending change (Dec 22 HSC), a note `No call 1200-1700` on a day fellow (Dec 21 HSC), two notes in all, and the St. Boniface footer rule `No fellow overnight: the junior resident takes inside calls, the attending outside calls`.
- Produces three swaps in `TELL_TESTS`, each with `want: [{kind: "callswap", slots: [...]}]`: `Casey is taking my call on November 30th and I'm taking theirs on December 3rd` (said 2026-11-20 12:00, slots 30 Nov night me to Casey and 3 Dec night Casey to me); `I swapped my Saturday day on the 5th with Quill` (said 2026-11-24 09:00, 5 Dec day me to Quill); `Brook and Rowan switched nights, Brook has December 8 now and Rowan has December 14` (said 2026-11-25 10:00, 8 Dec night Rowan to Brook and 14 Dec night Brook to Rowan). Slots match as a set on `d`, `slot`, `from`, `to`, case-insensitive; `site` only when the want gives it.
- Produces `tellScore(tests, got, sheetGot?)`: unchanged for the said tests; the sheet counts as one more test, right when every night fellow and every attending at both sites matches `TELL_SHEET` (case-insensitive, blank for none) and both notes are found by `d`, `site`, `who`. Its miss lists at most 5 differences in words (`Thu 31 Dec St. Boniface night: wanted none, got Casey`).
- Produces op `test`: also puts the two sheet items, `{id, said: TELL_SHEET.at, off: -300, got, test: true, repo, file: {type: "image/png"}}`; `items` gives them as `{id, said, repo, file: {type}}`; `score` scores the result filed for them.
- Produces `make.mjs`: `node tools/agenda/test-sheets/make.mjs` writes each sheet as an HTML page in the real layout (date column; day 0800-1700: 1st call fellow(s), junior resident(s), attending; overnight 1700-0800: fellow, junior resident, attending; St. Boniface adds TPN Consults and a footer of full names and the rule; weekends shaded, HSC orange, St. Boniface green) and screenshots it with Chrome's `--headless --screenshot` at 1100 px wide into the folder.

- [ ] **Step 1: Write the failing tests.** `the test set puts the made-up sheets in the inbox with their repository paths`; `a sheet read right scores right, and a wrong night fellow is a miss in words`; `a swap read as the same slots in any order scores right`.
- [ ] **Step 2: Run them to see them fail.** Run: `node --test tools/test/tell.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `TELL_SHEET`, the swaps, the scoring, the `test` and `items` changes and the wording (`The test set: 23 made-up things said and a pair of made-up call sheets, to see how Claude files them.`). Run `make.mjs` and look at both PNGs (Read them) before committing.
- [ ] **Step 4: Run them to see them pass.** Run: `node --test "tools/test/*.test.js"`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add tools/agenda tell.js tools/test && git commit -m "test(share): made-up call sheets and swaps in the test set"`

### Task 4: Claude's rules and the setup steps

**Files:**
- Modify: `tools/agenda/TELL.md`, `tools/agenda/TELL-SETUP.md`, `CLAUDE.md` (the `tools/agenda` row names files and `roster*`), `docs/APP-BRIEF.md` (file map)

**Interfaces:**
- Consumes: the result shapes of Tasks 2 and 3.
- Produces TELL.md: items may be files (`curl -s -o /tmp/<id>.<jpg|png|pdf> https://gi-hub-agenda.lethalnifty.workers.dev/file/<id>`, then read it; an item with `repo` is read from this checkout; never keep or commit either); files that came together share the same `said`; call sheets become one `call` result per share with `with` and `keep`; the reading rules of the spec's "Reading the sheets" with placeholder names (both sites every day, the night fellow covers both, a note belongs to the name before it and "both" to both, blanks stay blank, full names and the rule from the footer, Worth a look lines for anything unclear); swaps, said or shared, become `callswap` with `"me"` for the user; anything else shared is filed as if said; a file it can't read is a note. A worked `call` example and a `callswap` example, placeholder names only.
- Produces TELL-SETUP.md: a section "Add to GI Hub (the Share Sheet)": a new shortcut, Show in Share Sheet, receives Images and PDFs; Format Date (Current Date, ISO 8601, with the time) once, before Repeat with Each, so every file of one share carries the same time (the share's mark); inside it, Get Details of Files (File Extension), If it is `pdf` the Repeat Item goes as it is, Otherwise Convert Image to JPEG (so HEIC works), then Get Contents of URL `POST /inbox` with `Authorization` (the same Shortcut key) and `X-At` (the Formatted Date) headers and Request Body File; then Show Notification "Sent to GI Hub", and on a failed send "Not sent. Share it again when you have signal.". Text is not taken: a texted swap is shared as a screenshot or said to Tell GI Hub. The test-set count becomes 23 sentences and two sheets.

- [ ] **Step 1: Write both docs and the two map rows.** Placeholder names only; no em-dashes.
- [ ] **Step 2: Check them.** Run: `node --test tools/test/copy.test.js` and search the two docs for any non-placeholder name. Expected: PASS, none.
- [ ] **Step 3: Commit.** `git add tools/agenda/*.md CLAUDE.md docs/APP-BRIEF.md && git commit -m "docs(share): Claude's rules for sheets and swaps, and the Share Sheet shortcut"`

### Task 5: The roster on the phone

**Files:**
- Create: `roster.js`
- Modify: `index.html`, `sw.js`, `tools/fellows/build.mjs` (`OWNER_ONLY`), `tools/test/copy.test.js`, `tools/test/fellows-build.test.js`, `call.js` (`callclear` also clears the roster, guarded)
- Test: `tools/test/roster.test.js` (new, through `harness.load`)

**Interfaces:**
- Consumes: `CallStore`, `agStat`, `agState().off`, `fmtDate`, `agAddDays`, `agDate`.
- Produces `ROSTER_KEY = "gi-roster-v1"` and `RosterStore = {state, load(), save(), clear()}`, state `{v: 1, me: "", days: {<iso>: {hsc?, stb?}}, notes: [], people: [], rules: [], sheets: [{site, from, to, pic, at}], swaps: [{d, site, slot, at}], pend: {}, undo: {}}`.
- Produces `rosterClean(r) -> object | null`: the phone's own check of a `call` or `callswap` result, the same shape and caps as Task 2.
- Produces `rosterShifts(days, me, from, to) -> shift[]` in CallStore's shape: night `{uid: "gi-roster-<iso>-n", s: <iso> 17:00 local, e: next day 08:00, hsc: {att, res}, stb: {att, res}, so}`; weekend or stat day `{uid: "gi-roster-<iso>-d", s: 08:00, e: 17:00, ..., so: ""}`. `res` is the residents joined with `", "`, `""` for none. On a night whose day attending at a site isn't the night one, that site also keeps `day: <the day attending>`, and `callSegHTML` (call.js) shows it as `Birch from 17:00 (Ames until then)`. `so` is the day fellows on that date at each site, without you and without anyone whose note says no call through 17:00 (a `no call` note with no times, or one whose range ends at 1700 or later), written `Brook (HSC) + Rowan (St B)`.
- Produces `rosterAddCall(id, r, now) -> {n}`: for each sheet, that site's days, notes and rules in `from..to` are replaced; `people` merge by `n`; the site's sheets overlapping the range are replaced by `{site, from, to, pic, at: now}`, where `pic` is the sheet's file id or, for a sheet with none (a file made in chat), the picture of the sheet it replaces, so a kept picture survives Not right and the chat file; then `rosterApplyShifts(lo, hi)` removes every CallStore shift whose `s` falls in [lo 08:00, the day after hi 08:00) and adds `rosterShifts` for that range. `CallStore.state.last = {at, file: "Shared sheets", n}`. `state.undo[id] = {roster, call}` (both as they were, the last 3 kept). `n` is your shifts in the range.
- Produces `rosterSwap(id, r, now) -> {n}`: each slot changes `from` (`"me"` is `state.me`) to `to` in that day's slot, the night at both sites for `"both"`; each is recorded in `swaps`; shifts are recomputed for the days touched; undo kept as above.
- Produces `rosterUndo(id) -> bool`: puts both stores back from `state.undo[id]`.
- Produces `rosterDiff(r) -> {now: [{d, slot}], gone: [{d, slot}], other: [{d, site, slot, role, was, now}]}`, against the stored days, for your slots and everyone else's.
- Produces `rosterLook(r, now) -> string[]`: Claude's `look` lines; a night whose fellow differs between the two sites, or is blank at one; on your shifts, a night attending who isn't that day's attending (`HSC attending changes from Ames to Birch at 17:00 on Tue 22 Dec`); your nights on a Thursday and your shifts on a day in `agState().off`; for a swap, a `from` that isn't who the roster has, or a day with no roster; `You're not on these sheets` when `me` is set and has no slot.
- Produces `rosterNow(now) -> {d, slot}`: before 08:00 the day before and `"night"`, 08:00 to 17:00 today and `"day"`, after 17:00 today and `"night"`.
- Produces `rosterTidy(now)`: drops days, notes and sheets more than 28 days past their sheet's `to`, and through `rosterPics` (Task 6) each sheet's picture once its last night is over (08:00 the day after `to`) and pictures no sheet points to.

- [ ] **Step 1: Write the failing tests** in `roster.test.js` (placeholder names, Block 6 dates): `a night is 17:00 to 08:00 with both sites' night team and the sign-out`; `a night with a 17:00 attending change says so on the shift card`; `a roster without pictures keeps the pictures already there`; `weekend and stat day slots are yours, weekday ones aren't` (Sat 21 Nov and Fri 25 Dec yes, Wed 25 Nov day no); `a no call note keeps that fellow off the sign-out`; `adding a block replaces every shift in its dates, even an .ics one, and leaves the rest` (also with no shifts for you in it); `a sheet for one site leaves the other site alone`; `a swap moves the night and your shift with it, and Undo puts both back`; `Worth a look names a blank night, a 17:00 attending change, a Thursday and a day off`; `the diff lists nights now yours, no longer yours and other changes`; `tidy drops a picture after the last night and the roster 4 weeks later`; `the roster isn't in the backup and goes with Clear call data`.
- [ ] **Step 2: Run them to see them fail.** Run: `node --test tools/test/roster.test.js`. Expected: FAIL (`RosterStore` is not defined).
- [ ] **Step 3: Implement `roster.js`** and add it to `index.html` (after `tell.js`), `ASSETS`, `OWNER_ONLY`, the copy.test.js lists and an assertion in fellows-build.test.js that the fellows' build has no `roster.js`. Header comment: what it keeps, that it stays on the phone, owner-only.
- [ ] **Step 4: Run them to see them pass.** Run: `node --test "tools/test/*.test.js"`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add roster.js index.html sw.js call.js tools && git commit -m "feat(roster): the whole block on the phone, and your shifts from it"`

### Task 6: Picking up call results and their pictures

**Files:**
- Modify: `alerts.js` (`alertsBytes`), `roster.js` (`rosterPics`, `rosterTake`), `tell.js` (`tellPick`, `tellWaits`, `tellRowHTML`, `tellUndo`)
- Test: `tools/test/roster-pick.test.js` (new, over the real sender as in `tell-phone.test.js`)

**Interfaces:**
- Produces `alertsBytes(p, tok = alertsLoad().tok) -> Promise<{status, bytes: ArrayBuffer | null, type}>`: a GET to the sender with the Bearer token; `status: 0` when there's no connection.
- Produces `rosterPics = {put(id, {type, bytes}), get(id), del(id), keys()}`, all returning promises: IndexedDB database `gi-roster-pics`, store `pics`, ArrayBuffers (not Blobs); a Map when `indexedDB` isn't there (the tests).
- Produces `rosterTake(res, now) -> Promise<entry | null | undefined>`: `undefined` when a kept file didn't come (status 0 or 500 and over), so the result is left for the next pickup; a 404 picture (expired) is skipped and counted in `pend[id].lost`; `null` when `rosterClean` refuses it. Otherwise `state.pend[res.id] = {r, at: now}`, each picture in `rosterPics` under its file id, and the entry `{id, kind, line, at, call: res.id}`.
- Changes `tellPick`: a `call` or `callswap` result goes through `await rosterTake(res, callNow())` before it is marked seen or confirmed; `undefined` leaves it for next time.
- Changes `tellWaits(e)`: also true while `e.call` is still in `RosterStore.state.pend`.
- Changes `tellRowHTML(e)`: a row with `e.call` is `rosterRowHTML(e)` (Task 7).
- Changes `tellUndo`: `undo.roster` calls `rosterUndo(id)`.

- [ ] **Step 1: Write the failing tests:** `a call result is held for a check with its two pictures, and confirmed`; `no signal for the pictures: the result waits for the next pickup, unconfirmed` (first pickup's `/file` fails with status 0: nothing seen or acked; the second pickup takes it); `an expired picture doesn't stop the check`; `the Claude added row waits until the check is done`.
- [ ] **Step 2: Run them to see them fail.** Run: `node --test tools/test/roster-pick.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** as the Interfaces say.
- [ ] **Step 4: Run them to see them pass.** Run: `node --test "tools/test/*.test.js"`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -am "feat(roster): pick up call schedules with their pictures, never one without the other"`

### Task 7: The checks

**Files:**
- Create: `roster-view.js`
- Modify: `call.js` (`viewCall` hands over to `rosterCheckView` when `route.rost` is set, guarded), `app.js` (dispatch prefix `rost`, guarded by `!FELLOWS`; `rosterField` in the input listener; `rosterAfterRender` after `tellAfterRender`), `app.css` (styles before `/* Backup */`), `index.html`, `sw.js`, `tools/fellows/build.mjs`, `tools/test/copy.test.js`, `tools/test/fellows-build.test.js`
- Test: `tools/test/roster-ui.test.js` (new)

**Interfaces:**
- Consumes: Tasks 5 and 6.
- Produces `rosterRowHTML(e) -> html`: waiting, `Call schedule, Thu 19 Nov to Wed 16 Dec · 5 nights for you` (the count only once `me` is set) with Check (`rostcheck`); a swap, `Call swap on Mon 30 Nov` with Check; after Add, `Call: 5 nights added` or `Call updated` with Undo.
- Produces `rosterCheckView(id) -> html`: the page, Back to Week. Before `me` is set: "Which one is you?" with a chip for each fellow on the sheets (`rostme`). A `call` against no stored days: **Check the new block**, `5 nights for you · 28 days at both sites`, Your shifts (`callSegHTML` cards), Worth a look, Every night (7 rows, Show all 28 with `rostall`), the sheets, then Add to Call (`rostadd`) and Not right (`rostnot`). A `call` over stored days, or a `callswap`: **Check what changed**, with Now yours, No longer yours, Other changes and Worth a look, then Update Call (`rostadd`) and Not right.
- Produces `rosterDispatch(act, d) -> bool` for `rostcheck {id}` (`go({page: "call", from: route.page, rost: id})`), `rostme {name}`, `rostall`, `rostadd {id}`, `rostnot {id}`, `rostday {d}`, `rostpic {id}`, `rostpicx`. It returns false after a `go`.
- Toasts: `Call: 5 nights added` (singular `1 night`), `Call updated`, and for Not right `Thrown away. Send the sheets to Claude in chat.` Not right deletes `pend[id]` and keeps its pictures as sheets with `unread: true`.

- [ ] **Step 1: Write the failing tests:** `Check opens the new block with your shifts, Worth a look and every night`; `the first check asks which fellow is you and remembers it`; `not on these sheets: no shifts, it says so, and Add still keeps Who's on`; `Add to Call fills Call and the row turns into Undo, and Undo empties it again`; `Not right throws the reading away and keeps the pictures`; `a revised sheet opens Check what changed and Update Call applies it`; `a swap opens Check what changed`.
- [ ] **Step 2: Run them to see them fail.** Run: `node --test tools/test/roster-ui.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `roster-view.js` and the hooks. Reuse `callSegHTML`, `.sec`, `.card`, `.pick`, `.btn` and the mockup's look.
- [ ] **Step 4: Run them to see them pass.** Run: `node --test "tools/test/*.test.js"`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add roster-view.js call.js app.js app.css index.html sw.js tools && git commit -m "feat(roster): check a new block, a revised sheet or a swap before Call changes"`

### Task 8: Who's on, Find someone and the sheets on Call

**Files:**
- Modify: `roster-view.js`, `call.js` (`viewCall` puts `rosterWhoHTML` under the live card or the header, and `rosterSheetsHTML` above Paging numbers, guarded), `app.css`
- Test: `tools/test/roster-ui.test.js`

**Interfaces:**
- Produces `rosterWhoHTML(now) -> html`: "Who's on", day chips from the slot on now (`rosterNow`) through the stored days (`rostday`, `route.rostDay`); for each site a card with Day (08:00 to 17:00: fellows, residents, attending, and TPN consults at St. Boniface) and Night (17:00 to 08:00: fellow, residents, attending); Now on the slot on now, You on yours; the site's footer rule on a night with no fellow there; the site's Call button when Call has its paging number (`callTel`). No roster: `Share the call schedule to GI Hub to see who's on.`
- Produces Find someone: an input `#rostfind` (`rosterField` keeps the words in `route.rostFind` and redraws only the results under it); matches any name or full name, case-insensitive; lists up to 20 slots, next first: `Thu 19 Nov · HSC night · fellow`.
- Produces `rosterSheetsHTML() -> html`: each kept sheet as a thumbnail with its site and dates; under it `Changed since this sheet: Mon 30 Nov, Thu 3 Dec` when swaps came after it; a sheet whose reading was thrown away says so. Tapping opens it full screen (`rostpic`), close with `rostpicx`. Pinch zoom is the page's own (the viewport allows it).
- Produces `rosterAfterRender()`: fills thumbnails and the viewer from `rosterPics` as object URLs, and revokes old ones.

- [ ] **Step 1: Write the failing tests:** `Who's on shows both sites' day and night teams, with Now and You` (20:00: Now on Night); `before 08:00 Who's on opens on last night with Now on it`; `a night with no fellow at a site shows the footer rule`; `Find someone lists when a person is on`; `the sheets sit at the bottom of Call and say which nights changed since`; `Call with no roster says to share the sheets`.
- [ ] **Step 2: Run them to see them fail.** Run: `node --test tools/test/roster-ui.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to see them pass.** Run: `node --test "tools/test/*.test.js"`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -am "feat(roster): Who's on, Find someone and the sheets on Call"`

### Task 9: A roster file from chat

**Files:**
- Modify: `call.js` (`callReadFile`: a JSON file whose `kind` is `call` goes to `rosterImport`, guarded), `roster.js` (`rosterImport`)
- Test: `tools/test/roster-ui.test.js`

**Interfaces:**
- Produces `rosterImport(obj, name, now) -> id | null`: `rosterClean`, then a waiting check under `f` + 10 random letters and digits (no pictures), and opens it (`go` to the check). Anything else gives `callError = "That file isn't a call schedule GI Hub can read."`.

- [ ] **Step 1: Write the failing tests:** `a roster file opens the same check`; `an .ics file still imports as before`; `a JSON file that isn't a roster says so`.
- [ ] **Step 2: Run them to see them fail.** Run: `node --test tools/test/roster-ui.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to see them pass.** Run: `node --test "tools/test/*.test.js"`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -am "feat(roster): Call's Import reads a roster file made in chat"`

### Task 10: Preview with a demo roster

**Files:**
- Modify: `tools/preview/demo.json` (`roster`, made-up, around the demo's week), `tools/preview/shot.mjs` and `tools/preview/bundle.py` (seed `gi-roster-v1` like `gi-call-v1`), `tools/preview/tour.json` (Call with Who's on)

- [ ] **Step 1: Add the demo roster and the seeding.**
- [ ] **Step 2: Run the tour.** Run: `node tools/preview/shot.mjs tools/preview/tour.json <scratchpad>/shots2b <worktree url>`. Expected: no `ERRORS`, no sideways scroll; look at Call and a check.
- [ ] **Step 3: Run every test.** Run: `node --test "tools/test/*.test.js"` and `python -m unittest tools/test/test_ship.py tools/test/test_make_ics.py`. Expected: PASS.
- [ ] **Step 4: Commit.** `git commit -am "chore(preview): a made-up roster for the demo and the tour"`

After the tasks: the whole-branch review, then (each on the user's yes) deploy the sender from `tools/agenda` (`npx wrangler deploy`), ship with `/ship`, and walk the user through the Add to GI Hub shortcut, the test set and sharing the Block 6 sheets.
