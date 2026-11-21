#!/usr/bin/env python3
"""A spreadsheet's cells as text, for Claude filing a call schedule that came
as an .xlsx (tools/agenda/TELL.md). Standard library only.

    python3 tools/agenda/sheet_cells.py /tmp/<id>.xlsx

Prints each sheet in turn, "Sheet 1: HSC", then one line for each row with
anything in it, "row 4: A=2026-11-19 Thu | B=Brook | C=Ames". A merged cell
reads the same in every cell it covers (an attending merged down a week is
on every day of it), and the sheet's merged ranges follow on a "merged:"
line. Dates are YYYY-MM-DD with the weekday, times HH:MM, a line break inside
a cell " / ". A file it can't read gets one line saying so, and exit code 1.
"""
import math
import posixpath
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import date, timedelta

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      "p": "http://schemas.openxmlformats.org/package/2006/relationships"}
RID = "{%s}id" % NS["r"]
PART_MAX = 20 * 1024 * 1024   # the most any one part may unzip to
ROWS_MAX = 2000               # rows printed for each sheet
# Excel's own number formats that show a date, a time, or both.
DATE_IDS = set(range(14, 18)) | set(range(27, 37)) | set(range(50, 59))
TIME_IDS = {18, 19, 20, 21, 45, 46, 47}
BOTH_IDS = {22}
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
UNREADABLE = "Not a spreadsheet Claude can read."


class Unreadable(Exception):
    pass


def part(z, name):
    """One XML part, parsed; None when the file has no such part. A part that
    is too big, damaged, not UTF-8 (as every spreadsheet app writes them),
    declares a DOCTYPE or entities, or isn't XML makes the whole file
    unreadable: a spreadsheet never needs them."""
    try:
        info = z.getinfo(name)
    except KeyError:
        return None
    if info.file_size > PART_MAX:
        raise Unreadable(name)
    try:
        text = z.read(info).decode("utf-8")
    except Exception:
        raise Unreadable(name)
    if "<!DOCTYPE" in text or "<!ENTITY" in text:
        raise Unreadable(name)
    try:
        parser = ET.XMLParser(encoding="utf-8")   # whatever the part says it is
        parser.feed(text.encode("utf-8"))
        return parser.close()
    except ET.ParseError:
        raise Unreadable(name)


def local(tag):
    return tag.rsplit("}", 1)[-1]


def text_of(el):
    """Every piece of text in a string, its runs joined; the phonetic guides
    some sheets carry are left out."""
    tag = local(el.tag)
    if tag == "rPh":
        return ""
    if tag == "t":
        return el.text or ""
    return "".join(text_of(c) for c in el)


def kind_of_code(code):
    """date, time, both or number, from a format's own code (d, y and month
    names mean a date; h and s a time)."""
    s = re.sub(r'"[^"]*"|\\.|\[(?![hms]+\])[^\]]*\]', "", code).lower()
    day, clock = bool(re.search(r"[dy]", s)), bool(re.search(r"[hs]", s))
    if day and clock:
        return "both"
    if day or (not clock and "mmm" in s):
        return "date"
    return "time" if clock else "number"


def whole(s):
    """A count written in the file, or 0 when it isn't one."""
    return int(s) if (s or "").isdigit() else 0


def kinds(styles):
    """What each cell style shows, by its index."""
    if styles is None:
        return []
    custom = {whole(n.get("numFmtId")): n.get("formatCode", "") for n in styles.findall("m:numFmts/m:numFmt", NS)}
    out = []
    for xf in styles.findall("m:cellXfs/m:xf", NS):
        fid = whole(xf.get("numFmtId"))
        if fid in custom:
            out.append(kind_of_code(custom[fid]))
        else:
            out.append("date" if fid in DATE_IDS else "time" if fid in TIME_IDS else "both" if fid in BOTH_IDS else "number")
    return out


def col_index(letters):
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n


def col_letters(n):
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def ref(r):
    m = re.match(r"^([A-Z]+)(\d+)$", r or "")
    return (int(m.group(2)), col_index(m.group(1))) if m else None


def number(v):
    x = float(v)
    return str(int(x)) if x == int(x) and abs(x) < 1e15 else "%.10g" % x


def clock(fraction):
    mins = int(round(fraction * 1440)) % 1440
    return "%02d:%02d" % divmod(mins, 60)


def day_text(d):
    return "%s %s" % (d.isoformat(), WEEKDAYS[d.weekday()])


def day_of(serial, base):
    """The day a serial number stands for; None past the calendar's end."""
    try:
        return day_text(base + timedelta(days=int(serial)))
    except OverflowError:
        return None


def value(c, strings, styles, base):
    """A cell as text: what the sheet shows, not how."""
    t, v = c.get("t", "n"), c.find("m:v", NS)
    raw = v.text if v is not None and v.text is not None else ""
    if t == "s":
        i = int(raw) if raw.isdigit() else -1
        return strings[i] if 0 <= i < len(strings) else ""
    if t == "inlineStr":
        node = c.find("m:is", NS)
        return text_of(node) if node is not None else ""
    if t == "b":
        return "TRUE" if raw == "1" else "FALSE" if raw == "0" else raw
    if t in ("str", "e"):
        return raw
    if t == "d":
        m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", raw)
        try:
            return day_text(date(int(m.group(1)), int(m.group(2)), int(m.group(3))))
        except (AttributeError, ValueError):
            return raw
    if raw == "":
        return ""
    try:
        x = float(raw)
    except ValueError:
        return raw
    if not math.isfinite(x):
        return raw
    s = whole(c.get("s"))
    kind = styles[s] if s < len(styles) else "number"
    day = day_of(x, base) if kind in ("date", "both") and x >= 1 else None
    if day and kind == "both" and x != int(x):
        return day + " " + clock(x - int(x))
    if day:
        return day
    if kind == "time" and 0 <= x < 1:
        return clock(x)
    return number(raw)


def one_line(text):
    """A cell's text on one line: its line breaks as " / ", its runs of spaces as one."""
    return " / ".join(" ".join(p.split()) for p in text.replace("\r", "\n").split("\n") if p.strip())


def rows_of(root):
    """A sheet's rows: (row number, row)."""
    rnum = 0
    for row in root.findall("m:sheetData/m:row", NS):
        rnum = whole(row.get("r")) or rnum + 1
        yield rnum, row


def cells(root):
    """A sheet's cells, written or only styled: (row number, column number, cell)."""
    for rnum, row in rows_of(root):
        cnum = 0
        for c in row.findall("m:c", NS):
            at = ref(c.get("r"))
            r, cnum = at if at else (rnum, cnum + 1)
            yield r, cnum, c


def merged(root):
    """A sheet's merged ranges: (as written, ((first row, first column),
    (last row, last column)), or None for one that can't be read)."""
    out = []
    for m in root.findall("m:mergeCells/m:mergeCell", NS):
        span = m.get("ref", "")
        ends = [ref(x) for x in span.split(":")]
        out.append((span, (ends[0], ends[1]) if len(ends) == 2 and None not in ends else None))
    return out


def sheet_lines(root, book):
    """A sheet's rows as lines, and its merged ranges."""
    rows = {}   # row number: {column number: text}
    for r, cnum, c in cells(root):
        text = one_line(book.text(c))
        if text:
            rows.setdefault(r, {})[cnum] = text
    spans = merged(root)
    merges = [span for span, _ in spans]
    # A merged cell reads once across the columns it covers ("D:H=" for a
    # title over five) and again on every row it covers down (an attending
    # merged over a week is on each day). It reaches only as far as the
    # sheet has anything: one drawn to the sheet's edge stops at its last cell.
    last_row = max(rows) if rows else 0
    last_col = max((max(cols) for cols in rows.values()), default=0)
    across = {}   # (row, first column): last column
    for _, ends in spans:
        if ends is None:
            continue
        (r1, c1), (r2, c2) = ends
        top = rows.get(r1, {}).get(c1)
        if top is None:
            continue
        end = min(c2, last_col)
        for r in range(r1, min(r2, last_row) + 1):
            cols = rows.setdefault(r, {})
            for cc in range(c1 + 1, end + 1):
                cols.pop(cc, None)
            cols[c1] = top
            if end > c1:
                across[(r, c1)] = end

    def label(r, cc):
        end = across.get((r, cc))
        return col_letters(cc) + (":" + col_letters(end) if end else "")

    numbers = sorted(rows)
    lines = ["row %d: %s" % (r, " | ".join("%s=%s" % (label(r, cc), rows[r][cc]) for cc in sorted(rows[r])))
             for r in numbers[:ROWS_MAX]]
    if len(numbers) > ROWS_MAX:
        lines.append("(%d more rows not shown)" % (len(numbers) - ROWS_MAX))
    if merges:
        lines.append("merged: " + " ".join(merges))
    return lines


class Book:
    """A spreadsheet open for reading: its sheets in order (name, hidden, part),
    its shared strings, what each cell style shows, its calendar, and any
    other part by name. Unreadable when it isn't a spreadsheet."""

    def __init__(self, path):
        try:
            self.zip = zipfile.ZipFile(path)
        except Exception:
            raise Unreadable(path)
        try:
            book = self.part("xl/workbook.xml")
            if book is None:
                raise Unreadable("xl/workbook.xml")
            rels = self.part("xl/_rels/workbook.xml.rels")
            targets = {}
            for rel in (rels.findall("p:Relationship", NS) if rels is not None else []):
                t = rel.get("Target", "")
                targets[rel.get("Id")] = t.lstrip("/") if t.startswith("/") else posixpath.normpath(posixpath.join("xl", t))
            pr = book.find("m:workbookPr", NS)
            self.base = date(1904, 1, 1) if pr is not None and pr.get("date1904") in ("1", "true") else date(1899, 12, 30)
            sst = self.part("xl/sharedStrings.xml")
            self.strings = [text_of(si) for si in sst.findall("m:si", NS)] if sst is not None else []
            self.styles = self.part("xl/styles.xml")
            self.kinds = kinds(self.styles)
            self.sheets = [(sh.get("name", ""), sh.get("state") in ("hidden", "veryHidden"), targets.get(sh.get(RID), ""))
                           for sh in book.findall("m:sheets/m:sheet", NS)]
        except BaseException:
            self.zip.close()
            raise

    def part(self, name):
        return part(self.zip, name)

    def sheet(self, n):
        """Sheet n (counting from 1), parsed; None when the file lacks it."""
        return self.part(self.sheets[n - 1][2]) if 1 <= n <= len(self.sheets) else None

    def text(self, c):
        """A cell as the sheet shows it, line breaks and all."""
        return value(c, self.strings, self.kinds, self.base)

    def close(self):
        self.zip.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


def read(path):
    """Every sheet's lines, in the workbook's order."""
    with Book(path) as book:
        out = []
        for n, (name, hidden, _) in enumerate(book.sheets, 1):
            out.append("Sheet %d: %s%s" % (n, name, " (hidden)" if hidden else ""))
            root = book.sheet(n)
            if root is not None:
                out.extend(sheet_lines(root, book))
        return out


def main(argv):
    if len(argv) != 1:
        print("Usage: python3 tools/agenda/sheet_cells.py <file.xlsx>")
        return 2
    try:
        lines = read(argv[0])
    except Unreadable:
        print(UNREADABLE)
        return 1
    for line in lines:
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
