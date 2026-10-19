# GI Hub: app brief

A short description of this app for another fellow (or their Claude) to compare it with their own.

- Code: https://github.com/LethalNifty/epa-tracker (public; no personal data in it, see Privacy)
- Live: https://lethalnifty.github.io/epa-tracker (opens empty on a new phone; anything entered stays on that phone)

## What it is

A one-person iPhone web app for an adult GI fellow in Royal College Competence by Design. It's added to the home screen and works offline. It has no accounts and no server. It does five things:

- tracks EPA observations against the Royal College requirements
- plans each week around them
- runs a board-study reading plan
- logs scopes
- keeps guidelines and the local biopsy protocol one tap away

## The tabs

**Week (home):**
- the block and week ("Block 4 · Week 3 of 4")
- a "monitor" at the top with the current stage's progress dial, and when the last weeks' pace would finish against June 30
- what comes first under it follows the day: What to ask for in the daytime, tonight's reading on a reading-night evening, the Call card on a call afternoon
- What to ask for: pick where you are (follow-ups, new patients, scopes, ward and call) for the EPAs and checklist lines that suit it; it remembers where you were on each weekday and picks Ward and call during a call shift; before you pick, it lists the cases this week still needs
- this week's EPAs to aim for, from a coach that recalculates the block plan from what's logged
- tonight's reading
- the next call shift and who's on at each site
- a weekly recap
- a list of forms still pending in Entrada after 14+ days, so you can chase them; a spare form (one an EPA no longer needs) is shown but not counted
- a gear for Settings: the version (and whether this phone has the live one, with Update now if not), backup export and import, and reminders

**EPAs:**
- the Checklist: every EPA by stage (Transition to Discipline, Foundations, Core, Transition to Practice) by short name, with a ring and approved and pending against the required count; each EPA's page has the Royal College wording
- the Year plan: the block calendar and the finish line

**Study** (Tonight | Plan):
- pass 1 of Mayo Board Review across Blocks 4 to 12, with Yamada pages where Mayo is thin, turned into tonight's pages
- three or four Royal College-style short-answer questions on those pages, a quiz after reading (hidden until Done or Start the quiz)
- buttons for Done, Stopped elsewhere and Not tonight; the plan reflows from a bookmark
- Pearls: teaching points caught on the wards, searchable, sent on as a text file to become Anki cards (`docs/PEARLS.md`)
- Plan: the block's reading, the whole book, the finish, question scores and the bank, and pausing

**Endo:**
- a scope log: say the case out loud and the app reads the procedure, staff surname, findings, interventions and how far you got; confirm and save
- Progress charts; a tap on a colon-depth dot shows that case: the day, how far you got, who with, and what else was done
- a PDF procedure log (totals, therapeutic techniques including EMR and ESD, cecal intubation, milestones, every case in full) for the program or a job application, and a spreadsheet export, both built in the app

**Guides** (Guidelines | Trials | IBD drugs | Biopsy):
- a guideline library (titles, years, links and our own one-line notes), opening on this block's topics with every section folded to one row
- landmark trials, every IBD drug sold in Canada, and the local biopsy protocol
- each trial opens to why they did it, the question, who was in it, who to use it for, the result, what it changed and two or three limitations; the trials the weekly check adds open the same way
- one search box that finds guidelines, trials, drugs, biopsy protocols and your pearls together
- a weekly check adds new guidelines without an app update

**+ (floating button):** Case | EPA | Pearl across the top of one sheet. Case logs a scope by voice. An observation: pick the EPA (this week's first; each chip shows its short name, and the picked one its full title), the date (Today and Yesterday chips), the assessor's surname (suggested from past entries), a note, and whether it's pending or approved. After saving, the toast offers Log another with the same day and assessor.

**Reminders (Web Push):**
- Monday 8 AM: the week's EPAs
- Wednesday 8 AM: what's still due
- an hour before call: who's on
- 8 PM on reading nights: tonight's pages
- Sunday 5 PM: pearls still to send (or a nudge to catch this week's)
- each reminder also puts a badge on the app icon for forms that passed 14 days pending since the app was last open; opening it clears the badge

## How it's built

- Plain HTML, CSS and JavaScript. No framework, no build step, no dependencies. Classic scripts load in order from `index.html` and share one global scope.
- **Data:**
  - one localStorage store holds observations, the study bookmark, the scope log, guide state and pearls
  - backups are a JSON file, handed to the iPhone share sheet
  - the app nudges after 30 days without a backup
- **EPA list:** extracted from the Royal College GI EPA guide PDF (`tools/extract_pdf.py`).
- **Offline:**
  - a cache-first service worker (`sw.js`)
  - the cache name changes with every release, and the app reloads itself when an update lands
- **Hosting:** GitHub Pages from `main`.
- **Reminders:**
  - a GitHub Actions cron (`.github/workflows/reminders.yml`, every 15 minutes) runs `tools/push/send.js`
  - each push carries only the kind of reminder and the time
  - the phone writes the words from what it has saved
- **Tests:** about 360, using Node's built-in runner with a small vm harness and no DOM (`node --test tools/test/*.test.js`).

**File map:**

| File | What it holds |
|---|---|
| `app.js` | the store, the screens, what each tap does |
| `search.js` | one search: matching, ranking and highlighting for every search box |
| `settings.js` | the Settings sheet: version and update check, backup, reminders |
| `coach.js` | block calendar and weekly plan math (pure) |
| `call.js` | call schedule from a per-block `.ics`, the Call card |
| `study.js`, `study-view.js` | reading plan math, the Study tab |
| `studyq.js` | encrypted pre-reading questions |
| `scope*.js` | Endo: dictation reader, charts, PDF and CSV |
| `guides*.js` | Guides tab and the biopsy protocol |
| `pearls.js`, `pearls-view.js` | Pearls: catching, the Pearls page, the file sent on |
| `remind.js`, `notify.js` | push reminders on the phone |
| `live.js` | page transitions, sheet stacking, per-tab lighting |

## Privacy, by design

- Names, paging numbers and the call schedule live only on the phone, never in the code, tests or repository.
- Push messages carry no names.
- The study questions are encrypted in the public repo (`studyq.json`). The password lives only on the phone.
- The repo holds guideline titles, links and our own notes, never the guideline text.

## Look

- **Current look ("Afterglow"):** a deep night background with a violet-to-peach sunset glow, glass cards, and a glowing arc for stage progress.
  - One rounded typeface (Outfit) throughout, served from the app so it works offline.
  - Pages move like iOS pages, and sheets stack over the page.
- **Before it ("Lumen"):** dark, like an endoscopy tower, with an imaging light per tab. Kept at tag `v12-pre-afterglow`.

## Ideas on the list

- Past Royal College exam questions as the nightly pre-questions
- Making the repository private

## For comparing

If you send yours back, the same headings make the comparison easy:
- What it is
- The tabs
- How it's built
- Privacy
- Look
- Ideas
