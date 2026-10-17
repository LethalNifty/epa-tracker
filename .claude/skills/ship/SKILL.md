---
name: ship
description: Use when a GI Hub (epa-tracker) change is ready to go live on the phone, or the user says ship it, push it, deploy, release, put it on main, or /ship.
---

# Ship GI Hub

Shipping puts the current branch on `main`, which GitHub Pages serves to the phone. `tools/ship.py` does every step; this skill is the order and the one question to ask. Run everything from the checkout being shipped (usually its worktree).

## Steps

1. **Dry run.** `python tools/ship.py --dry-run`
   - STOPPED (dirty tree, failing tests, pins that disagree): fix that first, then run it again.
   - A rebase conflict predicted: rebase onto origin/main by hand, resolve, test, and dry-run again.
2. **Ask.** Show the user the plan in a few lines: what ships, `epa-vOLD -> epa-vNEW` (or no bump), the rollback tag, and the push to main. Ask "Ship it?" and wait for a yes. A yes given earlier in the session for different work does not count.
3. **Ship.** `python tools/ship.py --yes` (add the same `--tag`, `--no-tag`, `--bump` or `--no-bump` used in the dry run). Give the command a 5-minute timeout: it waits up to 4 minutes for the live site.
4. **Report** in one or two lines: the version now live (or that it was tooling only), the rollback tag, and the main commit.
5. **Ask about the fellows' site, every time, as its own question.** First build the fellows' edition from origin/main and check no admin is in it (CLAUDE.md, "Before asking, check and itemize"). Then give an itemized list: each change the fellows would see, each change that stays hidden from them (often all of it: Anki, study, pearls, call and anything personal stay hidden there), and the admin check's result. Then ask "Send this to the fellows' version too?" Promote only on a yes to that question: `git push origin origin/main:refs/heads/fellows`, then check https://gi-hub-fellows.pages.dev/sw.js serves the new version. "Ship it" or "push it" alone never covers the fellows.
6. **Tidy, on the user's yes:** remove the shipped worktree and branch (`git worktree remove ..\epa-<name>`, `git branch -d <name>`) and its launch entry.

## Outcomes

| Exit | Meaning | Next |
|---|---|---|
| 0 | shipped, and live if there was a bump | report |
| 1 | STOPPED; nothing was pushed (a failed push takes back its own commit and tag) | read the reason, fix, dry-run again |
| 2 | plan shown without `--yes` | ask the user |
| 3 | pushed, but the live sw.js still shows the old version | Pages is slow: check https://github.com/LethalNifty/epa-tracker/actions; the phone gets it once Pages catches up |

## Never

- `git push --force`, a push without the user's yes, or a version bump on a feature branch (the script takes the next free number from origin/main at ship time).
- Editing the version pins by hand to "reserve" a number: another session may ship first.

`python tools/ship.py --help` lists the options. The version rule and rollback tags are in the repo's CLAUDE.md.
