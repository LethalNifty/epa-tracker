import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import make_ics  # noqa: E402


class MakeIcsTest(unittest.TestCase):
    def setUp(self):
        self.text = make_ics.build(date(2026, 9, 24), "20260924T180000Z")
        self.lines = self.text.split("\r\n")

    def test_every_remaining_block_week_once(self):
        starts = [l for l in self.lines if l.startswith("DTSTART;")]
        self.assertEqual(len(starts), 39)
        self.assertEqual(starts[0], "DTSTART;TZID=America/Winnipeg:20261001T080000")
        self.assertEqual(starts[-1], "DTSTART;TZID=America/Winnipeg:20270624T080000")

    def test_titles_follow_the_real_thursday_blocks(self):
        self.assertIn("SUMMARY:GI Hub: Block 4 Motility/Nutrition (wk 2/4)", self.lines)
        i = self.lines.index("DTSTART;TZID=America/Winnipeg:20261022T080000")
        self.assertEqual(self.lines[i + 2], "SUMMARY:GI Hub: Block 5 Consults SBH (wk 1/4)")

    def test_plain_text_rules(self):
        self.assertNotIn("\u2014", self.text)
        self.assertNotIn("Elentra", self.text)
        self.assertIn("X-WR-CALNAME:GI Hub Reminders", self.lines)
        self.assertTrue(self.text.endswith("END:VCALENDAR\r\n"))
        self.assertTrue(all(len(l.encode("utf-8")) <= 75 for l in self.lines))


if __name__ == "__main__":
    unittest.main()
