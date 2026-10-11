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
- a "monitor" at the top with the current stage's progress dial
- this week's EPAs to aim for, from a coach that recalculates the block plan from what's logged
- tonight's reading
- the next call shift and who's on at each site
- a weekly recap
- a list of forms still pending in Entrada after 14+ days, so you can chase them

**EPAs:**
- the Checklist: every EPA by stage (Transition to Discipline, Foundations, Core, Transition to Practice) with approved and pending against the required count
- the Year plan: the block calendar
- backup export and import, and reminder settings

**Study:**
- pass 1 of Mayo Board Review across Blocks 4 to 12, with Yamada pages where Mayo is thin, turned into tonight's pages
- three or four Royal College-style short-answer questions on those pages, answered before reading
- buttons for Done, Stopped elsewhere and Not tonight; the plan reflows from a bookmark

**Endo:**
- a scope log: say the case out loud and the app reads the procedure, staff surname, findings, interventions and how far you got; confirm and save
- Progress charts
- a PDF report for the program director and a spreadsheet export, both built in the app

**Guides:**
- a guideline library (titles, years, links and our own one-line notes)
- the local biopsy protocol
- a weekly check adds new guidelines without an app update

**+ (floating button):** log an observation. Pick the EPA (this week's first), the date (Today and Yesterday chips), the assessor's surname (suggested from past entries), a note, and whether it's pending or approved.

**Reminders (Web Push):**
- Monday 8 AM: the week's EPAs
- Wednesday 8 AM: what's still due
- an hour before call: who's on
- 8 PM on reading nights: tonight's pages

## How it's built

- Plain HTML, CSS and JavaScript. No framework, no build step, no dependencies. Classic scripts load in order from `index.html` and share one global scope.
- **Data:**
  - one localStorage store holds observations, the study bookmark, the scope log and guide state
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
- **Tests:** about 290, using Node's built-in runner with a small vm harness and no DOM (`node --test tools/test/*.test.js`).

**File map:**

| File | What it holds |
|---|---|
| `app.js` | the store, the screens, what each tap does |
| `coach.js` | block calendar and weekly plan math (pure) |
| `call.js` | call schedule from a per-block `.ics`, the Call card |
| `study.js`, `study-view.js` | reading plan math, the Study tab |
| `studyq.js` | encrypted pre-reading questions |
| `scope*.js` | Endo: dictation reader, charts, PDF and CSV |
| `guides*.js` | Guides tab and the biopsy protocol |
| `remind.js`, `notify.js` | push reminders on the phone |
| `live.js` | page transitions, sheet stacking, per-tab lighting |

## Privacy, by design

- Names, paging numbers and the call schedule live only on the phone, never in the code, tests or repository.
- Push messages carry no names.
- The study questions are encrypted in the public repo (`studyq.json`). The password lives only on the phone.
- The repo holds guideline titles, links and our own notes, never the guideline text.

## Look

- **Current look ("Lumen"):** dark, like an endoscopy tower.
  - Each tab has its own imaging light: narrow-band cyan, fluorescein yellow-green for reading, white light for Guides.
  - Pages move like iOS pages, and sheets stack over the page.
- **Being tried next ("Afterglow"):** a deep night background with a violet-to-peach sunset glow, glass cards, and a glowing arc for stage progress.

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
