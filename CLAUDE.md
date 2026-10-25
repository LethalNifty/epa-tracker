# GI Hub (epa-tracker)

A one-person offline iPhone web app for a PGY-4 adult GI fellow in Royal College Competence by Design. Live at https://lethalnifty.github.io/epa-tracker (GitHub Pages serves `main`; the repo is public).

- What it does, every tab, how it's built, privacy: [docs/APP-BRIEF.md](docs/APP-BRIEF.md)
- Pearls, from the phone to Anki cards: [docs/PEARLS.md](docs/PEARLS.md)

Tabs: **Week** (home), **Agenda** (calendar), **EPAs**, then the **+** in the middle of the bar (log a case, an EPA observation or a pearl), **Study** (with Pearls), **Endo** (scope log), **Guides** (Guidelines | Trials | IBD drugs | Biopsy). The fellows' edition keeps four tabs and a floating +.

## The user's rules

- No real names in code, tests, fixtures, demo data or commit messages. Staff names, paging numbers and the call schedule live only on the phone. Use invented names (tests use placeholders like "Brook, Casey").
- No em-dashes in prose or UI copy (copy.test.js checks the app files).
- The EPA system is **Entrada**, never Elentra (a test checks). No "Dr." in the app.
- Reply brief first, with a recommendation. Propose before building anything new.
- Ask before pushing to main. Never force-push, rewrite history or set GitHub secrets without an explicit yes.

## Layout

Plain HTML, CSS and JavaScript: no framework, no build step, no dependencies. Classic scripts load in order from `index.html` and share one global scope, so a top-level name in one file is visible in all of them.

| Where | What |
|---|---|
| `index.html` | shell, SVG icons, script order, `EPA_DATA` (verbatim Royal College; `tools/audit.py` checks it) |
| `app.js` | the Store (localStorage `epa-state-v1`), routing, render, dispatch by action prefix, sheets, backup. A new state field joins `importJSON`'s whitelist or a restore drops it |
| `app.css` | every style; feature blocks sit just before `/* Backup */` |
| `sw.js` | service worker: `CACHE`, the `ASSETS` it caches, the network-first `LIVE` files |
| feature files | `search` (every search box), `settings` (the gear on Week), `coach`, `call`, `study`/`study-view`, `studyq`, `scope*`, `guides*` + `guides.json`, `ibd*`, `trials*`, `pearls*`, `agenda`/`agenda-view` (the Agenda tab), `remind`/`notify`, `live`, `fellows` (the fellows' edition, below), `watch` (the owner's view of the fellows' codes, full app only); the brief has the full file map |
| `tools/test/` | tests; `harness.js` boots the real page scripts in a Node vm (`load`, `click`, `html`, `saved`) |
| `tools/push/` | Web Push sender, run by `.github/workflows/reminders.yml` every 15 minutes |
| `tools/ship.py` | shipping, below |
| `tools/preview/` | phone screenshots and the one-file phone preview, below |

## Tests

```
node --test "tools/test/*.test.js"
python -m unittest tools/test/test_ship.py tools/test/test_make_ics.py
```

About 375 node tests in under a second. All must pass before shipping.

## Versions

- `sw.js` `CACHE` and `app.js` `APP_VERSION` are always the same `epa-vNN`, and `tools/test/copy.test.js` pins both (it also lists every file in `ASSETS`).
- A new number is what makes phones update. **Bump only when shipping, never on a feature branch.** Parallel sessions ship too, so the number is the next free one on origin/main at ship time. `tools/ship.py` takes it for you.
- Only files the phone loads need a bump. `guides.json` and `studyq.json` are network-first and reach the phone without one (the Sunday guideline watch relies on this). Tools, docs and tests never need one.
- A new file the phone loads goes in `sw.js` `ASSETS`, in `index.html` (scripts in order), and in the copy.test.js lists.

## Working on a change

1. Read the shared notes folder named in your brief, if any, and `git log origin/main` for what just shipped.
2. Branch and worktree beside the repo: `git worktree add -b <name> ..\epa-<name> origin/main`. To preview it, add a launch entry for that folder (Claude Code repo `.claude/launch.json`; the `epa` entry on port 8742 serves this main checkout).
3. Show the user on their phone before shipping (one-file preview, below).
4. Ship with `/ship`, on the user's yes. Afterwards, with their yes, remove the worktree and branch.

## Shipping: `/ship`

The skill (`.claude/skills/ship/SKILL.md`) drives `python tools/ship.py`:

1. `--dry-run` fetches origin, refuses a dirty tree or failing tests, and prints the plan: commits, rebase, files the phone loads, `epa-vOLD -> epa-vNEW`, rollback tag, push.
2. Show the user the plan and ask. Without `--yes` the script stops before changing anything.
3. `--yes` rebases onto origin/main, bumps, tests, commits `chore(release): epa-vNN`, tags the main being replaced, pushes with a plain push (if another session pushed meanwhile, it takes back its commit and tag and tries again on top), pushes the tag, fast-forwards local main, then waits up to 4 minutes until https://lethalnifty.github.io/epa-tracker/sw.js serves the new version.

Options: `--tag <feature>` names the rollback tag (default: the branch name; required when shipping from main), `--no-tag`, `--bump` / `--no-bump` to override the "does the phone load it" check, `--no-wait`.

## Rollback tags

`vNN-pre-<feature>` marks main as it was just before a ship (its own sequence, apart from epa-vNN), e.g. `v12-pre-afterglow` is the last Lumen look. To roll back without rewriting history: on a branch, `git revert --no-edit <tag>..origin/main`, then `/ship` (it bumps, so phones take the old code as a new version).

## Phone preview (`tools/preview/`)

- **Screenshots:** `node tools/preview/shot.mjs tools/preview/tour.json <outDir> [url]`. Headless Chrome at iPhone size (390 x 844, 2x). The url defaults to the `epa` server (http://localhost:8742/index.html); pass your worktree's server or a bundle's `file:///` path. The scenario format is in the file's header; `"demo": true` seeds `demo.json`. `tour.json` walks every tab and the + sheet, then the empty first run, and checks for sideways scroll. Page errors print as `ERRORS`. Write shots to your scratchpad, never into the repo.
- **One-file preview for the user's phone:** `python tools/preview/bundle.py <scratchpad>\gi-hub-preview.html` from your worktree inlines every script, the CSS, the font and the demo data (dated to the demo's week; `--today now` for the real clock), then publish that file with the Artifact tool.
- `demo.json` is fictional (invented staff, 555 phone numbers). Keep it that way.
- On localhost the app's own service worker caches every file it serves, so the browser pane can show a stale copy after an edit until the worker is unregistered. shot.mjs bypasses the worker.

## The fellows' edition

A trimmed GI Hub for the other fellows in the program: EPAs, Endo and Guides, with a Home tab (and a finish line toward the fellow's own date), first-run setup, a catch-up from Entrada and a calendar reminder (`reminder.ics`, built by the build script). Study, Pearls, the call card, push reminders and the year plan are hidden. Same code: `fellows.js` reads `window.GI_EDITION = "fellows"` into `FELLOWS`, and that edition saves under `gihub-fellows-v1`.

- **Invite codes:** `functions/_middleware.js` runs `tools/fellows/access.mjs` on Cloudflare before every request: no valid code, no app (only the icons, manifest, font, `sw.js` and `notify.js` are open). A code opens GI Hub on **one phone**: the first phone to enter it claims it, and another phone that tries it is refused and noted. On an iPhone in Safari the invite page asks for the home screen first (Safari and the home-screen app keep separate cookies). The first codes live in the Cloudflare secret `GI_CODES` (`f01:ABCD-2345 f02:...`), never in the repo; the user's list of who has which is in `My Drive\Fellowship\GI Hub`. Each code's phone, state and attempts live in the KV namespace bound as `GI_KV`. There is **no admin page on the fellows' site**: the user manages codes from their own GI Hub, Settings → Fellows' codes (`watch.js`, left out of the fellows' build), which asks one address worked out from the admin key (secret `GI_ADMIN`) with the key as a Bearer token: which phone and city, last opened, attempts from other phones (also an alert on Week), and Free for new phone, Turn off, Add a code. The app asks `/__access` on each launch online and locks on a 401, keeping the data and Export backup.

- **Hosting:** Cloudflare Pages builds the `fellows` branch (build command `node tools/fellows/build.mjs`, output `dist`) at an address that carries no GitHub name. Preview deployments are off.
- **Promote, never push to it directly, and always ask:** after every ship, ask separately whether to send it to the fellows' version; a yes to shipping never covers it. Then `git push origin origin/main:refs/heads/fellows` (plain push, fast-forward only); Cloudflare redeploys within a minute.
- **Before asking, check and itemize.** Build the fellows' edition from origin/main (`node tools/fellows/build.mjs <tmp>`) and confirm no admin is in it: no `watch.js`, no codes-list styles, none of the owner's address, key or path code (`fellows-build.test.js` searches every built file for these; it must pass), and no change to `functions/` or `tools/fellows/access.mjs` you haven't named. Then ask with an itemized list, every time: (1) each change the fellows would see, (2) each change in the ship that stays hidden from them, (3) the admin check and its result. The user decides from that list.
- **New features stay out of the fellows' version by default:** hide them with `!FELLOWS` unless the user says they're for fellows. Anki, study, pearls, the call card and anything personal never show there. `watch.js` (the user's view of the codes) isn't even copied into the fellows' build.
- **Preview:** `python tools/preview/bundle.py <out.html> --edition fellows`.
- Anything personal (the user's name, GitHub links, staff, call or study data) never goes into the fellows' build.

## Weekly tasks (outside this repo)

| Task | Runbook | Touches this repo |
|---|---|---|
| `gi-hub-guideline-watch` (the Sunday watch), Sun 08:00 | `C:\Users\jared\My Drive\Fellowship\GI Hub\guidelines\WATCH.md` (trials part: `..\trials\TRIALS.md`) | trials first, then guidelines; one rebuild of `guides.json` (topics, plus the kept trials as `tr` for Trials' "New from the weekly watch"), one commit `chore(guides): weekly watch <date>` to main, no bump. Card fixes go to the GI Studio, never to Anki directly |
| `gi-hub-pearl-cards`, Sun 20:00 | `tools/anki/CARDS.md` in the Claude Code repo (run from the stable copy `C:\Users\jared\Claude\gi-tools`) | no; reads the pearl files the phone saved to Drive, then sends the one Sunday notification |

## Never commit

Real call files (`GI-Call*.ics`), scope exports (`GI-Scopes*.json`), backups, the study password or the plain study questions (only the encrypted `studyq.json` belongs here). `.gitignore` covers the usual names; check `git status` before committing anything new.
