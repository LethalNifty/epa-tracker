"""Ships GI Hub: puts this branch on main, which GitHub Pages serves to the phone.

    python tools/ship.py --dry-run     show the plan and change nothing
    python tools/ship.py               show the plan, stop before changing anything
    python tools/ship.py --yes         ship (only after the user has said yes)

Fetches origin and refuses a dirty tree or failing tests. If the branch changes
a file the phone loads (sw.js ASSETS, apart from the network-first guides.json
and studyq.json), it takes the next free epa-vNN from origin/main, so a number
another session shipped first is never reused, and moves sw.js CACHE, app.js
APP_VERSION and the copy.test.js pins together. Then: rebase onto origin/main,
test, commit the bump, tag the main being replaced as vNN-pre-<feature>, push
(plain push, never force) and wait until the live sw.js serves the new version.
Tooling, docs and tests ship without a bump, a tag or a wait.

Exit codes: 0 shipped (or dry run), 1 stopped, 2 plan shown without --yes,
3 pushed but the live site did not show the new version in time.
"""
import argparse
import glob
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REMOTE, MAIN = "origin", "main"
LIVE_URL = "https://lethalnifty.github.io/epa-tracker/sw.js"
# Where the version lives, and how many times each file states it.
PINS = {
    "sw.js": (r'const CACHE = "epa-v(\d+)";', 1),
    "app.js": (r'const APP_VERSION = "epa-v(\d+)";', 1),
    "tools/test/copy.test.js": (r'"epa-v(\d+)"', 2),
}
RELEASE = "chore(release): epa-v{}"


class Stop(Exception):
    pass


def say(msg=""):
    print(msg, flush=True)


def run(args, cwd=None):
    return subprocess.run(args, cwd=cwd or ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")


def git(*args, cwd=None):
    r = run(["git", *args], cwd)
    if r.returncode:
        raise Stop(f"git {' '.join(args)} failed:\n{(r.stderr or r.stdout).strip()}")
    return r.stdout.strip()


def read(rel):
    with open(ROOT / rel, encoding="utf-8", newline="") as f:
        return f.read()


def write(rel, text):
    with open(ROOT / rel, "w", encoding="utf-8", newline="") as f:
        f.write(text)


def version_in(text, rel):
    """The single version a file states, checked against how often it should say it."""
    pat, count = PINS[rel]
    found = re.findall(pat, text)
    if len(found) != count or len(set(found)) != 1:
        raise Stop(f"{rel} should state one version {count} time(s); found {found or 'none'}")
    return int(found[0])


def pinned():
    """The version this checkout states, refusing if the three files disagree."""
    vs = {rel: version_in(read(rel), rel) for rel in PINS}
    if len(set(vs.values())) != 1:
        raise Stop("the version pins disagree: " + ", ".join(f"{k} epa-v{v}" for k, v in vs.items()))
    return next(iter(vs.values()))


def live_version():
    """The version origin/main serves, which is the number the next ship counts from."""
    ref = f"{REMOTE}/{MAIN}"
    sw = version_in(git("show", f"{ref}:sw.js"), "sw.js")
    app = version_in(git("show", f"{ref}:app.js"), "app.js")
    if sw != app:
        raise Stop(f"{ref} disagrees with itself: sw.js epa-v{sw}, app.js epa-v{app}")
    return sw


def bump(new):
    for rel, (pat, _) in PINS.items():
        text = read(rel)
        version_in(text, rel)
        write(rel, re.sub(pat, lambda m: m.group(0).replace(f"epa-v{m.group(1)}", f"epa-v{new}"), text))


def js_list(sw, name):
    m = re.search(r"const %s = \[(.*?)\];" % name, sw, re.S)
    return re.findall(r'"([^"]+)"', m.group(1)) if m else []


def phone_files(sw):
    """Files the service worker caches for the phone. The network-first ones
    (guides.json, studyq.json) reach the phone without a new version."""
    live = {f.lstrip("/") for f in js_list(sw, "LIVE")}
    return {f for f in js_list(sw, "ASSETS") if f != "./"} - live | {"sw.js"}


def next_tag_number():
    nums = [int(m.group(1)) for t in git("tag", "-l", "v*-pre-*").splitlines() if (m := re.match(r"v(\d+)-pre-", t))]
    return max(nums, default=0) + 1


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def tests():
    node = shutil.which("node")
    if not node:
        raise Stop("node is not on PATH, so the tests cannot run")
    files = sorted(glob.glob(str(ROOT / "tools" / "test" / "*.test.js")))
    r = run([node, "--test", *files])
    out = (r.stdout + r.stderr).strip()
    m = re.search(r"^\S* ?pass (\d+)", out, re.M)
    return r.returncode == 0, (m.group(1) if m else "?"), out


def must_pass(when):
    ok, n, out = tests()
    if not ok:
        raise Stop(f"tests fail {when}:\n" + "\n".join(out.splitlines()[-25:]))
    say(f"Tests pass {when} ({n}).")


def predict_conflicts():
    r = run(["git", "merge-tree", "--write-tree", "--name-only", "--no-messages", f"{REMOTE}/{MAIN}", "HEAD"])
    return [f for f in r.stdout.splitlines()[1:] if f] if r.returncode == 1 else []


def push_main():
    return run(["git", "push", REMOTE, f"HEAD:{MAIN}"])


def wait_live(url, version, seconds, every=10):
    want = f"epa-v{version}"
    start, seen = time.time(), None
    while True:
        try:
            req = urllib.request.Request(url, headers={"Cache-Control": "no-cache", "Pragma": "no-cache", "User-Agent": "gi-hub-ship"})
            with urllib.request.urlopen(req, timeout=20) as r:
                m = re.search(r'const CACHE = "(epa-v\d+)";', r.read().decode("utf-8", "replace"))
            seen = m.group(1) if m else "no CACHE line"
        except Exception as e:  # a blip while Pages redeploys is normal; keep asking
            seen = f"no answer ({e})"
        took = time.time() - start
        if seen == want or took >= seconds:
            return seen == want, round(took), seen
        say(f"  {round(took):>3} s: live sw.js says {seen}")
        time.sleep(every)


def sync_local_main(branch):
    """After the push, bring the local main branch up to origin/main where that is safe."""
    if branch == MAIN:
        return
    wt, path = None, None
    for line in git("worktree", "list", "--porcelain").splitlines():
        if line.startswith("worktree "):
            path = line[len("worktree "):]
        elif line == f"branch refs/heads/{MAIN}":
            wt = path
    if wt is None:
        git("branch", "-f", MAIN, f"{REMOTE}/{MAIN}")
        say(f"Local {MAIN} moved to {REMOTE}/{MAIN}.")
    elif run(["git", "status", "--porcelain"], wt).stdout.strip():
        say(f"Local {MAIN} in {wt} has uncommitted changes, so it was left as is. Pull it once it is clean.")
    elif run(["git", "merge", "--ff-only", f"{REMOTE}/{MAIN}"], wt).returncode:
        say(f"Local {MAIN} in {wt} has commits origin does not, so it was left as is.")
    else:
        say(f"Local {MAIN} in {wt} is up to date.")


def plan(a):
    """Checks everything and works out what shipping would do, changing nothing."""
    branch = git("rev-parse", "--abbrev-ref", "HEAD")
    if branch == "HEAD":
        raise Stop("HEAD is detached; check out the branch to ship")
    say(f"Fetching {REMOTE}...")
    git("fetch", REMOTE, "--tags")
    dirty = git("status", "--porcelain")
    if dirty:
        raise Stop("the working tree has changes; commit or stash them first:\n" + dirty)
    must_pass("on this branch")
    base = f"{REMOTE}/{MAIN}"
    commits = git("rev-list", "--reverse", "--oneline", f"{base}..HEAD").splitlines()
    if not commits:
        return None
    changed = git("diff", "--name-only", f"{base}...HEAD").splitlines()
    touches = sorted(set(changed) & (phone_files(read("sw.js")) | phone_files(git("show", f"{base}:sw.js"))))
    do_bump = a.bump if a.bump is not None else bool(touches)
    tag = None
    if (do_bump or a.tag) and not a.no_tag:
        name = a.tag or branch
        if name == MAIN and not a.tag:
            raise Stop("shipping from main: name the rollback tag with --tag <feature> (or pass --no-tag)")
        tag = f"v{next_tag_number()}-pre-{slug(name)}"
    return {
        "branch": branch, "commits": commits, "touches": touches, "bump": do_bump, "tag": tag,
        "behind": int(git("rev-list", "--count", f"HEAD..{base}")),
        "conflicts": predict_conflicts(), "live": live_version(), "old_main": git("rev-parse", "--short", base),
    }


def show(p, a):
    say()
    say("Ship plan")
    say(f"  branch   {p['branch']}, {len(p['commits'])} commit(s) ahead of {REMOTE}/{MAIN}, {p['behind']} behind")
    for c in p["commits"]:
        say(f"             {c}")
    if not p["behind"]:
        say("  rebase   not needed")
    elif p["conflicts"]:
        say(f"  rebase   onto {REMOTE}/{MAIN} {p['old_main']}: likely conflicts in {', '.join(p['conflicts'])}")
    else:
        say(f"  rebase   onto {REMOTE}/{MAIN} {p['old_main']}, no conflicts expected")
    if p["touches"]:
        say(f"  phone    changes {len(p['touches'])} file(s) the phone loads: {', '.join(p['touches'])}")
    else:
        say("  phone    nothing the phone loads changes (tooling, docs, tests or guides.json)")
    if p["bump"]:
        n = p["live"] + 1
        say(f"  version  epa-v{p['live']} -> epa-v{n} in {', '.join(PINS)}")
        say(f"  commit   {RELEASE.format(n)}")
    else:
        say(f"  version  stays epa-v{p['live']}")
    say(f"  tag      {p['tag']} at {p['old_main']}, the main being replaced" if p["tag"] else "  tag      none")
    say(f"  push     git push {REMOTE} HEAD:{MAIN} (plain push, never force)")
    if p["bump"] and not a.no_wait:
        say(f"  wait     up to {a.wait} s for {a.url} to serve epa-v{p['live'] + 1}")


def ship(a):
    p = plan(a)
    if p is None:
        say(f"Nothing to ship: {REMOTE}/{MAIN} already has every commit on this branch.")
        return 0
    show(p, a)
    if a.dry_run:
        say("\nDry run: nothing changed.")
        return 0
    if not a.yes:
        say("\nNot shipped. Show the user this plan, and once they say yes run again with --yes.")
        return 2
    base = f"{REMOTE}/{MAIN}"
    for attempt in range(1, 4):
        if run(["git", "merge-base", "--is-ancestor", base, "HEAD"]).returncode:
            say(f"\nRebasing onto {base}...")
            r = run(["git", "rebase", base])
            if r.returncode:
                run(["git", "rebase", "--abort"])
                raise Stop(f"the rebase onto {base} conflicts; the branch is back as it was. Rebase by hand, then ship again.\n"
                           + (r.stdout + r.stderr).strip())
            must_pass("after the rebase")
        new = None
        if p["bump"]:
            new = live_version() + 1
            if pinned() != new:
                bump(new)
                must_pass(f"at epa-v{new}")
                git("add", *PINS)
                subjects = "\n".join("- " + c.split(" ", 1)[1] for c in git("rev-list", "--reverse", "--oneline", f"{base}..HEAD").splitlines())
                git("commit", "-q", "-m", RELEASE.format(new), "-m", f"Ships {p['branch']}:\n{subjects}")
        old_main = git("rev-parse", base)
        tag = p["tag"] and f"v{next_tag_number()}-pre-{p['tag'].split('-pre-', 1)[1]}"
        if tag:
            git("tag", "-a", tag, old_main, "-m", f"epa-v{live_version()}, the last version before {p['branch']}")
        say(f"\nPushing to {base}...")
        r = push_main()
        if r.returncode == 0:
            break
        out = (r.stdout + r.stderr).strip()
        if tag:
            git("tag", "-d", tag)
        if new and git("log", "-1", "--format=%s") == RELEASE.format(new):
            git("reset", "-q", "--keep", "HEAD~1")
        if not re.search(r"fetch first|non-fast-forward", out) or attempt == 3:
            raise Stop("the push was refused; the bump commit and tag were taken back.\n" + out)
        say(f"{base} moved while shipping (another session shipped). Trying again on top of it.")
        git("fetch", REMOTE, "--tags")
    if tag:
        git("push", REMOTE, f"refs/tags/{tag}")
    sync_local_main(p["branch"])
    say(f"\nShipped: {MAIN} is {git('rev-parse', '--short', 'HEAD')}" + (f", epa-v{new}" if new else "")
        + (f", rollback tag {tag}" if tag else "") + ".")
    if not new:
        say("Nothing the phone loads changed, so there is no new version to wait for.")
        return 0
    if a.no_wait:
        return 0
    say(f"Waiting for {a.url} to serve epa-v{new}...")
    ok, took, seen = wait_live(a.url, new, a.wait)
    if ok:
        say(f"Live: the phone gets epa-v{new} on its next update check ({took} s after the push).")
        return 0
    say(f"Not live after {took} s: the site still says {seen}. GitHub Pages may be slow;"
        " check https://github.com/LethalNifty/epa-tracker/actions and run the wait again later.")
    return 3


def main(argv=None):
    ap = argparse.ArgumentParser(description="Ship GI Hub to main and GitHub Pages.")
    ap.add_argument("--dry-run", action="store_true", help="show the plan and change nothing")
    ap.add_argument("--yes", action="store_true", help="the user said yes: rebase, bump, commit, tag and push")
    ap.add_argument("--tag", help="feature name for the rollback tag vNN-pre-<name> (default: the branch name)")
    ap.add_argument("--no-tag", action="store_true", help="no rollback tag")
    b = ap.add_mutually_exclusive_group()
    b.add_argument("--bump", dest="bump", action="store_true", default=None, help="bump the version even for tooling")
    b.add_argument("--no-bump", dest="bump", action="store_false", help="never bump the version")
    ap.add_argument("--no-wait", action="store_true", help="do not wait for the live site")
    ap.add_argument("--wait", type=int, default=240, help="seconds to wait for the live site (default 240)")
    ap.add_argument("--url", default=LIVE_URL, help=argparse.SUPPRESS)
    a = ap.parse_args(argv)
    try:
        return ship(a)
    except Stop as e:
        say(f"\nSTOPPED: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
