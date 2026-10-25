# Agenda, step 1: the tab on the phone

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sixth tab, Agenda, that shows call, reading nights, work hours, Manitoba stat holidays and the user's own events in Days and Month views, with the + back in the middle of the bar, an event sheet, a usual-week sheet, .ics import, and a "Next" line on Week. No server, no reminders yet (step 3).

**Architecture:** `agenda.js` holds the pure model (cleaning, occurrences, holidays, a day's rows, .ics reading) over `Store.state.agenda`; `agenda-view.js` draws the page and sheets and owns the `ag*` actions, the same split as `pearls.js` / `pearls-view.js`. `app.js` wires the route, the bar, the store whitelist and the input/change/file handlers.

**Tech Stack:** classic scripts, no build; Node `node --test` with `tools/test/harness.js`.

**Spec:** the Claude Doc "GI Hub Agenda: design" (https://claude.ai/artifact/DmaJd4ZHcsPGz3A3Ne5gz4), step 1 of its build order.

## Global Constraints

- Full app only: fellows keep their bar (Home, EPAs, Endo, Guides + floating +) and never reach `route.page === "agenda"`.
- No em-dashes in UI copy (copy.test.js checks app files); no real names in code, tests or fixtures; no "Dr.".
- A new state field joins `importJSON`'s whitelist; a new file the phone loads goes in `index.html` (before `app.js`), `sw.js` `ASSETS` and copy.test.js's lists.
- No version bump on the branch; `tools/ship.py` bumps at ship time.
- Usual week defaults (from the user): Mon, Tue, Wed, Fri work 08:00 to 18:00; Thu work 08:00 to 12:00, then "Half day" 12:00 to 17:00; Sat, Sun nothing; nothing before 07:00 or after 22:00.
- Weeks start on Monday (strip and month grid), like Study's Nights.

## Review Focus

1. A multi-day all-day event across a month end (Oct 30 to Nov 2) shows on every day it covers and marks both months. → Task 1 test.
2. A monthly repeat on the 31st skips short months; a yearly repeat on Feb 29 shows only in leap years. → Task 1 test.
3. A timed event past midnight (22:00 to 02:00 next day) shows on its first day from 22:00 and on the next day until 02:00. → Task 1 test.
4. An Outlook invite with a Windows TZID ("Central Standard Time") imports at the written local time instead of failing; an IANA TZID (America/New_York) converts. → Task 3 test.
5. A backup from before Agenda restores with default agenda; one from after keeps its items. → Task 1 test.

---

### Task 1: The model (`agenda.js`)

**Files:** Create `agenda.js`; modify `app.js` (Store.migrate, importJSON), `index.html`, `sw.js`, `tools/test/copy.test.js`; test `tools/test/agenda.test.js`.

**Interfaces (produces):**
- `Item = {id, t, d, d2, s, e, rep, n, uid, ts}`: `d`/`d2` ISO dates (`d2` inclusive last day or null), `s`/`e` "HH:MM" or null (null `s` = all day), `rep` null | "w" | "m" | "y", `uid` from a file or null.
- `Usual = {days: {"0".."6": [{a, b, t}]}, early: "07:00", late: "22:00"}`.
- `agBlank()`, `agClean(raw) -> {items, usual}`, `agItemClean(x) -> Item | null`.
- `agSpan(item, iso) -> null | {allDay, from, to, cont, more}`: whether and how an item covers that day (repeats, multi-day, past midnight).
- `agHolidays(year) -> [{d, name}]` (Manitoba general holidays), `agHoliday(iso) -> name | null`.
- Store side: `agAdd(fields) -> id`, `agUpdate(id, fields)`, `agRemove(id)`, `agSnapshot()`, `agRestore(snap)`, `agSetUsual(usual)`.

- [ ] **Step 1: Write the failing tests** in `agenda.test.js`: `agClean(undefined)` gives the user's usual week; a dirty list drops items with no title or bad date; `agSpan` for a weekly item (on and off weeks, never before `d`), monthly on the 31st (Oct 31 yes, Nov none, Dec 31 yes), yearly Feb 29 (2028 yes, 2027 no), multi-day all-day Oct 30 to Nov 2 (covers Oct 31 with `cont` and `more`), past-midnight 22:00 to 02:00 (`to: "24:00", more` on day 1; `from: null, to: "02:00", cont` on day 2); `agHolidays(2026)` includes Thanksgiving Oct 12, Truth and Reconciliation Sep 30, Remembrance Day Nov 11, Christmas Dec 25; `agHolidays(2027)` has Louis Riel Day Feb 15, Good Friday Mar 26, Victoria Day May 24; a backup without `agenda` restores with defaults, one with items keeps them.
- [ ] **Step 2: Run** `node --test tools/test/agenda.test.js`; expect ReferenceError on `agClean`.
- [ ] **Step 3: Implement** in `agenda.js`; `Store.migrate` adds `this.state.agenda = agClean(this.state.agenda)`; `importJSON` passes `agenda: s.agenda`. Easter by the anonymous Gregorian algorithm for Good Friday.
- [ ] **Step 4: Run** the file and the whole suite; all pass.
- [ ] **Step 5: Commit** `feat(agenda): the model: events, repeats, holidays, the usual week`.

### Task 2: A day's rows and marks

**Interfaces:** consumes Task 1. Produces `agDay(iso, ctx?) -> [{k, t, sub, from, to, id?}]` with `k` in "hol" | "all" | "work" | "call" | "read" | "ev", sorted all-day first then by `from`; `agMarks(iso) -> {call, read, ev, hol}`; `agNext(nowMs) -> null | {iso, from, t, id}` (next own timed or all-day event within 7 days).

- [ ] **Step 1: Failing tests:** on Tue Oct 27 2026 the rows hold work "Consults SBH" 08:00 to 18:00 (the block's name, not "Work"), the reading row "Mayo 7" with pages, and an own event; on Thanksgiving no work row and a "hol" row; a call stretch starting that day gives a "call" row from its start with "to Tue 08:00" in `sub`, and the night's reading row says on call; on the day after, the call row runs until 08:00; `agMarks` flags call, read and events; `agNext` skips past events and returns the next one.
- [ ] **Step 2: Run, see them fail. Step 3: implement** (`ctx` defaults to `{stretches: callStretches(CallStore.list()), study: Store.state.study}`; reading from `studyNightKind` and the block's `studyNights`). **Step 4: pass. Step 5: commit** `feat(agenda): a day's rows from call, reading, work and your events`.

### Task 3: Add from file (.ics)

**Interfaces:** consumes `parseICS`, `icsTime`, `icsEnd`, `icsUnescape`, `icsText`, `callImport` (call.js). Produces `agZonedMs(y, mo, d, h, mi, tz) -> ms | null`, `agParseICS(text) -> {ok, call, items, cancelled, error?}`, `agImport(text, name)` (stores, toasts with Undo), `agReadFile(file)`.

- [ ] **Step 1: Failing tests:** a call file (X-GI-CALL fields) goes to `callImport`; a generic VEVENT with SUMMARY, DTSTART/DTEND becomes an item; DATE values with exclusive DTEND become an all-day item ending the day before; `TZID=America/New_York:20261117T093500` lands at `Date.UTC(2026, 10, 17, 14, 35)`; `TZID=Central Standard Time` keeps the written wall time; `RRULE:FREQ=YEARLY` sets `rep: "y"`; importing the same UID again updates, `STATUS:CANCELLED` removes; a file with no events says so; the toast offers Undo.
- [ ] **Steps 2 to 5** as above; commit `feat(agenda): add events from an .ics file, call files go to Call`.

### Task 4: The bar

**Files:** `app.js` (NAV, navHTML, render route, go guard), `index.html` (new `i-dial` symbol), `app.css`; test `tools/test/agenda-ui.test.js`.

- [ ] **Step 1: Failing tests:** full app bar = Week (dial icon), Agenda (calendar icon), EPAs, the + (`fab mid`, `data-action="scopeopen"`), Study, Endo, Guides, in that order, no `fab float`; the fellows' bar is unchanged (four tabs + `fab float`); tapping Agenda renders the Agenda page; fellows sent to "agenda" get Week.
- [ ] **Steps 2 to 5**; commit `feat(agenda): a sixth tab, with the + back in the middle of the bar`.

### Task 5: The Agenda page

**Files:** create `agenda-view.js`; `app.js` (render, dispatch `ag*`); `app.css`.

**Interfaces:** state `agView` ("d" | "m"), `agSel` (ISO), `agMonth` ("YYYY-MM"); actions `agview`, `agday` (data-day), `agweek` (data-step ±1), `agmonth` (data-step ±1), `agopen` (data-id), `agcall`, `agstudy`.

- [ ] **Step 1: Failing tests:** Days shows a Monday-first strip of the selected week with today and the selected day marked, the selected day's rows, and "Later this week" grouped by day; `agday` changes the day; `agweek` moves a week; Month shows a Monday-first grid with call, reading and event marks, today and selected day, and the selected day's rows under it; tapping an own event opens its sheet, a call row goes to Call, a reading row to Study.
- [ ] **Steps 2 to 5**; commit `feat(agenda): Days and Month views`.

### Task 6: The event sheet

**Interfaces:** `agSheet = {mode, id?, t, d, d2, s, e, allDay, multi, rep, n, err}`; actions `agnew`, `agclose`, `agsave`, `agdelete`, `agallday`, `agmulti`, `agrep` (data-rep); fields `data-ag="t|d|d2|s|e|n"` via `agField` / `agFieldChange`.

- [ ] **Step 1: Failing tests:** Add opens a sheet on the selected day, 09:00 to 10:00; saving with no title says "Give it a name first."; an end before its start says "It ends before it starts."; saving adds the item with a toast and Undo; editing changes it; All day hides the times; Ends another day shows the end date; Repeats picks weekly, monthly, yearly; Delete removes with Undo; an imported item says where it came from.
- [ ] **Steps 2 to 5**; commit `feat(agenda): add, edit and delete events`.

### Task 7: Your usual week

**Interfaces:** `agUsual` sheet state (a copy of `Usual`); actions `agusual`, `agusualclose`, `agusualsave`, `agblockadd` (data-day), `agblockdel` (data-day, data-i); fields `data-agu="a|b|t"` with `data-day`, `data-i`.

- [ ] **Step 1: Failing tests:** the sheet lists Mon to Sun with their blocks; changing Thursday's half day to end at 16:00 saves and the Thursday rows follow; adding and removing a block works; a block that ends before it starts is refused with a message.
- [ ] **Steps 2 to 5**; commit `feat(agenda): your usual week`.

### Task 8: Week's Next line

- [ ] **Step 1: Failing tests:** with an own event in the next 7 days Week shows `Next · <day> <time> · <title>` that opens Agenda on that day; with none, nothing; fellows never see it.
- [ ] **Steps 2 to 5**; commit `feat(agenda): the next thing on Week`.

### Task 9: Finish

- [ ] Add Agenda to `tools/preview/tour.json`; two example events in `tools/preview/demo.json` (invented); `docs/APP-BRIEF.md` (tabs, Agenda section, file map) and `CLAUDE.md` tab list.
- [ ] Full suite, the tour (no errors, no sideways scroll), phone screenshots of Days, Month, the sheet and the bar; fellows build admin check unaffected.
- [ ] Commit `docs(agenda): brief, tour and demo`; `python tools/ship.py --dry-run --tag agenda-1`.
