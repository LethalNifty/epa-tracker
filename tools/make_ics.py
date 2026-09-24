"""Write the GI Hub weekly reminder calendar.

One event every block week (Thursday 08:00 America/Winnipeg) after --from
through the end of Year 1. The events only point at the app: the week's list
lives in GI Hub, where it is recalculated from what has been logged.

  python tools/make_ics.py --out "C:/Users/jared/My Drive/Fellowship/GI-Hub-Reminders.ics"
"""
import argparse
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ANCHOR = date(2026, 7, 2)  # Block 1 day 1, a Thursday
NAMES = {1: "Consults HSC", 2: "Consults SBH", 3: "Hepatology", 4: "Motility/Nutrition",
         5: "Consults SBH", 6: "Radiology", 7: "Consults SBH", 8: "Advanced Endoscopy",
         9: "Pathology", 10: "Consults HSC", 11: "Consults Grace", 12: "Hepatology",
         13: "Consults HSC"}
URL = "https://lethalnifty.github.io/epa-tracker/"
VTIMEZONE = [
    "BEGIN:VTIMEZONE", "TZID:America/Winnipeg",
    "BEGIN:DAYLIGHT", "TZOFFSETFROM:-0600", "TZOFFSETTO:-0500", "TZNAME:CDT",
    "DTSTART:19700308T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU", "END:DAYLIGHT",
    "BEGIN:STANDARD", "TZOFFSETFROM:-0500", "TZOFFSETTO:-0600", "TZNAME:CST",
    "DTSTART:19701101T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU", "END:STANDARD",
    "END:VTIMEZONE",
]


def block_weeks(after):
    """(block, week, first day) for every block week starting strictly after `after`."""
    for n in range(1, 14):
        for w in range(1, 5):
            day = ANCHOR + timedelta(days=(n - 1) * 28 + (w - 1) * 7)
            if day > after:
                yield n, w, day


def build(after, stamp):
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GI Hub//weekly reminders//EN",
             "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:GI Hub Reminders", *VTIMEZONE]
    for n, w, day in block_weeks(after):
        summary = f"GI Hub: Block {n} {NAMES[n]} (wk {w}/4)"
        lines += ["BEGIN:VEVENT", f"UID:gi-hub-{day:%Y%m%d}@lethalnifty-epa-tracker", f"DTSTAMP:{stamp}",
                  f"DTSTART;TZID=America/Winnipeg:{day:%Y%m%d}T080000",
                  f"DTEND;TZID=America/Winnipeg:{day:%Y%m%d}T081500",
                  f"SUMMARY:{summary}", "DESCRIPTION:Open GI Hub for this week's list.", f"URL:{URL}",
                  "BEGIN:VALARM", "ACTION:DISPLAY", f"DESCRIPTION:{summary}", "TRIGGER:-PT0M", "END:VALARM",
                  "END:VEVENT"]
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


def main():
    ap = argparse.ArgumentParser(description="Write the GI Hub weekly reminder calendar.")
    ap.add_argument("--from", dest="after", type=date.fromisoformat, default=date.today())
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    a.out.write_text(build(a.after, stamp), encoding="utf-8", newline="")
    print(f"wrote {sum(1 for _ in block_weeks(a.after))} events to {a.out}")


if __name__ == "__main__":
    main()
