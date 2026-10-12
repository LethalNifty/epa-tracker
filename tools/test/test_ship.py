"""tools/ship.py against throwaway repos: a bare origin, the clone that ships,
and a second clone standing in for another session that ships too.
Run: python -m unittest tools/test/test_ship.py"""
import contextlib
import http.server
import io
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import ship  # noqa: E402

REAL_ROOT = ship.ROOT
PINS_TEST = """const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = f => fs.readFileSync(path.join(__dirname, "..", "..", f), "utf8");
test("the versions agree", () => {
  assert.ok(read("sw.js").includes("const CACHE = " + JSON.stringify("epa-v38") + ";"));
  assert.ok(read("app.js").includes("const APP_VERSION = " + JSON.stringify("epa-v38") + ";"));
  assert.ok(!fs.existsSync(path.join(__dirname, "..", "..", "FAIL")));
});
"""
FILES = {
    "sw.js": 'const CACHE = "epa-v38";\nconst ASSETS = ["./", "index.html", "app.js", "guides.json"];\n'
             'const LIVE = ["/guides.json"];\n',
    "app.js": 'const APP_VERSION = "epa-v38";\nlet a = 1;\n',
    "index.html": "<p>GI Hub</p>\n",
    "guides.json": "[]\n",
    "tools/test/copy.test.js": PINS_TEST,
    "tools/notes.txt": "tooling\n",
}


def sh(cwd, *args):
    r = subprocess.run(args, cwd=cwd, capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        raise AssertionError(f"{args} failed: {r.stderr}")
    return r.stdout.strip()


@unittest.skipUnless(shutil.which("node") and shutil.which("git"), "needs node and git")
class ShipTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.origin = self.tmp / "origin.git"
        sh(self.tmp, "git", "init", "-q", "--bare", "-b", "main", str(self.origin))
        seed = self.tmp / "seed"
        sh(self.tmp, "git", "init", "-q", "-b", "main", str(seed))
        self.write(seed, FILES)
        self.config(seed)
        sh(seed, "git", "add", "-A")
        sh(seed, "git", "commit", "-q", "-m", "start")
        sh(seed, "git", "remote", "add", "origin", str(self.origin))
        sh(seed, "git", "push", "-q", "origin", "main")
        self.work, self.other = self.clone("work"), self.clone("other")
        ship.ROOT = self.work

    def tearDown(self):
        ship.ROOT = REAL_ROOT
        shutil.rmtree(self.tmp, ignore_errors=True)

    def clone(self, name):
        d = self.tmp / name
        sh(self.tmp, "git", "clone", "-q", "-c", "core.autocrlf=false", str(self.origin), str(d))
        self.config(d)
        return d

    def config(self, d):
        sh(d, "git", "config", "user.name", "Test")
        sh(d, "git", "config", "user.email", "test@example.com")
        sh(d, "git", "config", "core.autocrlf", "false")

    def write(self, d, files):
        for rel, text in files.items():
            p = d / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text, encoding="utf-8", newline="")

    def commit(self, d, files, msg):
        self.write(d, files)
        sh(d, "git", "add", "-A")
        sh(d, "git", "commit", "-q", "-m", msg)

    def feature(self, files, branch="feature"):
        sh(self.work, "git", "checkout", "-q", "-b", branch)
        self.commit(self.work, files, "feat: something")

    def other_ships(self, frm=38, to=39):
        """Another session ships first, taking the next number."""
        sh(self.other, "git", "pull", "-q", "--rebase")
        files = {rel: (self.other / rel).read_text(encoding="utf-8").replace(f"epa-v{frm}", f"epa-v{to}")
                 for rel in ("sw.js", "app.js", "tools/test/copy.test.js")}
        files["index.html"] = "<p>GI Hub</p>\n<p>other</p>\n"
        self.commit(self.other, files, f"chore(release): epa-v{to}")
        sh(self.other, "git", "push", "-q", "origin", "main")

    def ship(self, *args):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = ship.main(list(args))
        return code, buf.getvalue()

    def origin_file(self, rel):
        return sh(self.tmp, "git", "--git-dir", str(self.origin), "show", f"main:{rel}")

    def origin_main(self):
        return sh(self.tmp, "git", "--git-dir", str(self.origin), "rev-parse", "main")

    def test_dry_run_shows_the_plan_and_changes_nothing(self):
        self.feature({"app.js": FILES["app.js"] + "let b = 2;\n"})
        self.other_ships()
        head, before = sh(self.work, "git", "rev-parse", "HEAD"), self.origin_main()
        code, out = self.ship("--dry-run")
        self.assertEqual(code, 0, out)
        self.assertIn("epa-v39 -> epa-v40", out)
        self.assertIn("v1-pre-feature", out)
        self.assertIn("changes 1 file(s) the phone loads: app.js", out)
        self.assertIn("1 behind", out)
        self.assertIn("Dry run: nothing changed.", out)
        self.assertEqual(sh(self.work, "git", "rev-parse", "HEAD"), head)
        self.assertEqual(self.origin_main(), before)
        self.assertEqual(sh(self.work, "git", "tag"), "")

    def test_without_yes_it_stops_before_changing_anything(self):
        self.feature({"app.js": FILES["app.js"] + "let b = 2;\n"})
        before = self.origin_main()
        code, out = self.ship()
        self.assertEqual(code, 2, out)
        self.assertIn("run again with --yes", out)
        self.assertEqual(self.origin_main(), before)

    def test_ships_a_phone_change_on_top_of_what_another_session_shipped(self):
        self.feature({"app.js": FILES["app.js"] + "let b = 2;\n"})
        self.other_ships()
        old_main = self.origin_main()
        code, out = self.ship("--yes", "--no-wait")
        self.assertEqual(code, 0, out)
        self.assertIn('const CACHE = "epa-v40";', self.origin_file("sw.js"))
        app = self.origin_file("app.js")
        self.assertIn('const APP_VERSION = "epa-v40";', app)
        self.assertIn("let b = 2;", app)
        self.assertEqual(self.origin_file("tools/test/copy.test.js").count('"epa-v40"'), 2)
        self.assertIn("other", self.origin_file("index.html"))
        log = sh(self.tmp, "git", "--git-dir", str(self.origin), "log", "--format=%s", "main").splitlines()
        self.assertEqual(log[:3], ["chore(release): epa-v40", "feat: something", "chore(release): epa-v39"])
        self.assertEqual(sh(self.tmp, "git", "--git-dir", str(self.origin), "rev-list", "--merges", "main"), "")
        tag = sh(self.tmp, "git", "--git-dir", str(self.origin), "rev-parse", "v1-pre-feature^{commit}")
        self.assertEqual(tag, old_main)

    def test_tooling_and_guides_json_ship_without_a_bump_or_tag(self):
        self.feature({"tools/notes.txt": "more tooling\n", "guides.json": "[1]\n"})
        code, out = self.ship("--yes", "--no-wait")
        self.assertEqual(code, 0, out)
        self.assertIn("nothing the phone loads changes", out)
        self.assertIn('const CACHE = "epa-v38";', self.origin_file("sw.js"))
        self.assertEqual(self.origin_file("guides.json"), "[1]")
        self.assertEqual(sh(self.work, "git", "ls-remote", "--tags", "origin"), "")

    def test_refuses_a_dirty_tree(self):
        self.feature({"app.js": FILES["app.js"] + "let b = 2;\n"})
        (self.work / "index.html").write_text("changed\n", encoding="utf-8")
        code, out = self.ship("--dry-run")
        self.assertEqual(code, 1)
        self.assertIn("the working tree has changes", out)

    def test_refuses_failing_tests(self):
        self.feature({"app.js": FILES["app.js"] + "let b = 2;\n", "FAIL": "x\n"})
        before = self.origin_main()
        code, out = self.ship("--yes", "--no-wait")
        self.assertEqual(code, 1)
        self.assertIn("tests fail on this branch", out)
        self.assertEqual(self.origin_main(), before)

    def test_a_rebase_conflict_stops_and_leaves_the_branch_as_it_was(self):
        self.feature({"index.html": "<p>GI Hub</p>\n<p>mine</p>\n"})
        self.other_ships()
        head, before = sh(self.work, "git", "rev-parse", "HEAD"), self.origin_main()
        code, out = self.ship("--yes", "--no-wait")
        self.assertEqual(code, 1, out)
        self.assertIn("the rebase onto origin/main conflicts", out)
        self.assertEqual(sh(self.work, "git", "rev-parse", "HEAD"), head)
        self.assertEqual(sh(self.work, "git", "status", "--porcelain"), "")
        self.assertEqual(self.origin_main(), before)

    def test_if_another_session_pushes_mid_ship_it_retries_with_the_next_number(self):
        self.feature({"app.js": FILES["app.js"] + "let b = 2;\n"})
        real, calls = ship.push_main, []

        def racing_push():
            if not calls:
                self.other_ships()
            calls.append(1)
            return real()
        ship.push_main = racing_push
        try:
            code, out = self.ship("--yes", "--no-wait")
        finally:
            ship.push_main = real
        self.assertEqual(code, 0, out)
        self.assertEqual(len(calls), 2)
        self.assertIn("Trying again on top of it", out)
        self.assertIn('const CACHE = "epa-v40";', self.origin_file("sw.js"))
        self.assertIn("let b = 2;", self.origin_file("app.js"))
        self.assertIn("other", self.origin_file("index.html"))
        tags = sh(self.work, "git", "ls-remote", "--tags", "origin")
        self.assertEqual(len(tags.splitlines()), 2)  # the tag and its peeled commit, pushed once
        self.assertIn("refs/tags/v1-pre-feature", tags)

    def test_on_main_a_phone_change_needs_a_tag_name(self):
        self.commit(self.work, {"app.js": FILES["app.js"] + "let b = 2;\n"}, "fix: something")
        code, out = self.ship("--dry-run")
        self.assertEqual(code, 1)
        self.assertIn("--tag <feature>", out)
        code, out = self.ship("--dry-run", "--tag", "small fix")
        self.assertEqual(code, 0, out)
        self.assertIn("v1-pre-small-fix", out)

    def test_nothing_to_ship(self):
        code, out = self.ship("--yes")
        self.assertEqual(code, 0)
        self.assertIn("Nothing to ship", out)


class PureTest(unittest.TestCase):
    def test_phone_files_leave_out_network_first_files(self):
        sw = 'const ASSETS = ["./", "index.html", "app.js",\n  "guides.json", "studyq.json"];\nconst LIVE = ["/studyq.json", "/guides.json"];'
        self.assertEqual(ship.phone_files(sw), {"index.html", "app.js", "sw.js"})

    def test_the_real_repo_pins_agree(self):
        self.assertGreater(ship.pinned(), 37)

    def test_wait_live_sees_the_new_version_arrive(self):
        bodies = iter(['const CACHE = "epa-v38";'] * 2 + ['const CACHE = "epa-v39";'] * 9)

        class H(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                b = next(bodies).encode()
                self.send_response(200)
                self.send_header("Content-Length", str(len(b)))
                self.end_headers()
                self.wfile.write(b)

            def log_message(self, *a):
                pass
        srv = http.server.HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            url = f"http://127.0.0.1:{srv.server_port}/sw.js"
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(ship.wait_live(url, 39, 5, every=0.05)[0], True)
                self.assertEqual(ship.wait_live(url, 41, 0.2, every=0.05)[::2], (False, "epa-v39"))
        finally:
            srv.shutdown()


if __name__ == "__main__":
    unittest.main()
