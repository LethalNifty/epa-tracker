#!/usr/bin/env python3
"""A call schedule spreadsheet drawn as one PDF page, for GI Hub to show in
the spreadsheet's place (tools/agenda/TELL.md). Standard library only.

    python3 -I tools/agenda/sheet_pdf.py /tmp/<id>.xlsx /tmp/<id>.pdf 6 [7 ...]

Draws the sheets it's given by number (as sheet_cells.py numbers them, up to
6) one under another on a page 612 points wide, each under its name: the
part of the sheet with anything in it, at its columns' widths and rows'
heights, merged cells as one, with the fills, borders, fonts and alignment
the sheet sets, in the PDF's own Helvetica. Hidden rows and columns are left
out, and so are pictures. Text too long for its cell runs on into empty
cells beside it as in Excel, then shrinks a little, then is cut off at the
edge. It looks close to the sheet, not the same. A file or sheet it can't
draw gets one line saying so, exit code 1, and no PDF.
"""
import colorsys
import math
import os
import re
import sys
import unicodedata
import zlib
from collections import namedtuple

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import sheet_cells as sc  # noqa: E402

NS = sc.NS
TRUE = ("1", "true")

PAGE_W = 612.0              # the page's width in points, US Letter's
PAGE_H_MAX = 14400.0        # the tallest page a PDF may have
MARGIN = 18.0
CAPTION, CAPTION_H = 9.0, 14.0   # each sheet's name above it: its size and its room
GAP = 14.0                       # between sheets
FOOTER = "Claude's drawing of the spreadsheet"
FOOT, FOOT_H = 7.0, 12.0
SCALE_MAX = 2.0
SHEETS_MAX = 6
ROWS_MAX = 400
COLS_MAX = 60
TEXT_MAX = 2000             # characters drawn from any one cell
SHRINK_MIN = 0.55           # text shrinks no smaller than this against its own size
# In the sheet's own points:
COL_W = 48.0                # Excel's default column, 64 pixels
ROW_H = 15.0                # and row, 20 pixels
ROW_H_MAX = 409.5           # Excel's tallest row
COL_CHARS_MAX = 255.0       # and widest column, in characters
PAD, VPAD = 2.25, 0.75      # between a cell's text and its sides, and its top and bottom
INDENT = 7.5                # each level of indent
LINE = 1.2                  # line spacing, against the font's size
CAP, DESC = 0.72, 0.21      # Helvetica's capitals above the line, descenders below

HEX = re.compile(r"^[0-9A-Fa-f]{6}$")


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# Excel's palette for colours given by number, then the system's foreground
# (64) and background (65).
INDEXED = [rgb(h) for h in (
    "000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF "
    "000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF "
    "800000 008000 000080 808000 800080 008080 C0C0C0 808080 "
    "9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCFF "
    "000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF "
    "00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 "
    "3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 "
    "003366 339966 003300 333300 993300 993366 333399 333333 "
    "000000 FFFFFF").split()]
# The theme's colours in the order cells number them (light 1 first, then
# dark 1), and Office's own, for a file that carries no theme.
THEME_SLOTS = ("lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3",
               "accent4", "accent5", "accent6", "hlink", "folHlink")
THEME = [rgb(h) for h in "FFFFFF 000000 E7E6E6 44546A 4472C4 ED7D31 A5A5A5 FFC000 5B9BD5 70AD47 0563C1 954F72".split()]
# Helvetica's widths in thousandths of its size, for the characters space to
# tilde; any other is given an average one.
HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
        556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
        1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
        667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
        333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
        556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584]
HELV_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
             556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
             975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
             667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
             333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
             611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584]
FONTS = ("Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique")
# How much wider or narrower than Helvetica each font the sheet names runs, in
# percent: Helvetica is stretched or squeezed that much to take its room.
SQUEEZE = (("narrow", 82), ("condensed", 82), ("calibri", 88), ("aptos", 95), ("verdana", 112),
           ("tahoma", 98), ("times", 88), ("cambria", 95), ("georgia", 100), ("garamond", 86))
# A border's width in points by its style, and the least each is drawn at
# however small the page makes it, so a phone still shows it.
WIDTHS = {"hair": 0.25, "thin": 0.75, "dashed": 0.75, "dotted": 0.75, "dashDot": 0.75, "dashDotDot": 0.75,
          "medium": 1.5, "mediumDashed": 1.5, "mediumDashDot": 1.5, "mediumDashDotDot": 1.5,
          "slantDashDot": 1.5, "thick": 2.25, "double": 2.25}
THINNEST = {0.25: 0.3, 0.75: 0.5, 1.5: 0.9, 2.25: 1.3}
# How much of a patterned fill is its foreground colour.
PATTERNS = {"gray0625": 0.0625, "gray125": 0.125, "lightGray": 0.25, "mediumGray": 0.5, "darkGray": 0.75}
ALIGN = {"left": "left", "right": "right", "center": "center", "centerContinuous": "center",
         "fill": "left", "justify": "left", "distributed": "center"}
WHITE = (255, 255, 255)
NO_ROW = (None, False, None)

Font = namedtuple("Font", "size bold italic under ink squeeze")
Text = namedtuple("Text", "font size lines clip")   # lines: (x, baseline, text, width)
DEFAULT_FONT = Font(11.0, False, False, False, (0, 0, 0), 88)   # Calibri 11


def amount(s):
    """A size written in the file, or None when it isn't one."""
    try:
        x = float(s)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) and x >= 0 else None


def chars(w):
    """A column's width in characters as points, the way Excel draws it."""
    return None if w is None else round(min(w, COL_CHARS_MAX) * 7) * 0.75


def pick(seq, s):
    i = sc.whole(s)
    return seq[i] if i < len(seq) else None


def color(el, indexed, theme):
    """A colour as (red, green, blue) from 0 to 255, by its own value, its
    number in the palette, or its place in the theme, lightened or darkened
    by its tint as Excel does; None when it sets none."""
    if el is None:
        return None
    found = None
    if el.get("rgb") is not None:
        v = el.get("rgb")[-6:]
        found = rgb(v) if HEX.match(v) else None
    else:
        for attr, table in (("theme", theme), ("indexed", indexed)):
            v = el.get(attr)
            if v is not None:
                found = table[int(v)] if v.isdigit() and int(v) < len(table) else None
                break
    if found is None:
        return None
    try:
        tint = float(el.get("tint") or 0)
    except ValueError:
        tint = 0.0
    if tint and math.isfinite(tint):
        tint = max(-1.0, min(1.0, tint))
        h, l, s = colorsys.rgb_to_hls(*(c / 255.0 for c in found))
        l = l * (1 + tint) if tint < 0 else l * (1 - tint) + tint
        found = tuple(int(round(c * 255)) for c in colorsys.hls_to_rgb(h, l, s))
    return found


def theme_of(root):
    """The theme's colours in the order cells number them."""
    found = {}
    scheme = next((el for el in root.iter() if sc.local(el.tag) == "clrScheme"), None) if root is not None else None
    for slot in (scheme if scheme is not None else []):
        for c in slot:
            tag = sc.local(c.tag)
            v = c.get("val") if tag == "srgbClr" else c.get("lastClr") if tag == "sysClr" else None
            if v and HEX.match(v):
                found[sc.local(slot.tag)] = rgb(v)
    return [found.get(name, d) for name, d in zip(THEME_SLOTS, THEME)]


def squeeze(name):
    n = name.lower()
    return next((v for key, v in SQUEEZE if key in n), 100)


def font_of(f, palette, theme):
    def flag(tag):
        el = f.find("m:" + tag, NS)
        return el is not None and el.get("val", "1") not in ("0", "false")
    sz, u, name = f.find("m:sz", NS), f.find("m:u", NS), f.find("m:name", NS)
    size = amount(sz.get("val")) if sz is not None else None
    return Font(min(max(size, 1.0), 409.0) if size else 11.0, flag("b"), flag("i"),
                u is not None and u.get("val", "single") != "none",
                color(f.find("m:color", NS), palette, theme) or (0, 0, 0),
                squeeze(name.get("val", "") if name is not None else "Calibri"))


def fill_of(f, palette, theme):
    """A fill's one colour: a solid fill's own, a pattern's two mixed as the
    eye sees them, a gradient's first; None for none."""
    p = f.find("m:patternFill", NS)
    if p is not None:
        kind = p.get("patternType", "none")
        fg = color(p.find("m:fgColor", NS), palette, theme)
        if kind == "none":
            return None
        if kind == "solid":
            return fg
        bg = color(p.find("m:bgColor", NS), palette, theme) or WHITE
        k = PATTERNS.get(kind, 0.5)
        return tuple(int(round(a * k + b * (1 - k))) for a, b in zip(fg or (0, 0, 0), bg))
    stop = f.find("m:gradientFill/m:stop", NS)
    return color(stop.find("m:color", NS), palette, theme) if stop is not None else None


def sides_of(b, palette, theme):
    """A border's sides: {side: (width, colour)} for each it draws."""
    out = {}
    for side, other in (("left", "start"), ("right", "end"), ("top", None), ("bottom", None)):
        el = b.find("m:" + side, NS)
        if el is None and other:
            el = b.find("m:" + other, NS)
        style = el.get("style") if el is not None else None
        if style in WIDTHS:
            out[side] = (WIDTHS[style], color(el.find("m:color", NS), palette, theme) or (0, 0, 0))
    return out


class Look:
    """What a cell style shows: its font, fill, borders and alignment."""

    def __init__(self, xf, fonts, fills, borders):
        get = xf.get if xf is not None else (lambda k, d=None: d)
        a = xf.find("m:alignment", NS) if xf is not None else None
        aget = a.get if a is not None else (lambda k, d=None: d)
        self.font = pick(fonts, get("fontId")) or fonts[0]
        self.fill = pick(fills, get("fillId"))
        self.sides = pick(borders, get("borderId")) or {}
        h, v = aget("horizontal", "general"), aget("vertical", "bottom")
        self.h = ALIGN.get(h)   # None: by what the cell holds, as Excel's general does
        self.v = "top" if v == "top" else "bottom" if v == "bottom" else "center"
        self.wrap = aget("wrapText") in TRUE or h in ("justify", "distributed")
        self.fit = aget("shrinkToFit") in TRUE
        self.indent = min(sc.whole(aget("indent")), 15) * INDENT


def looks_of(book):
    """Each cell style's Look, by its number."""
    st = book.styles
    find = (lambda path: st.findall(path, NS)) if st is not None else (lambda path: [])
    palette = list(INDEXED)
    for i, c in enumerate(find("m:colors/m:indexedColors/m:rgbColor")[:64]):
        v = (c.get("rgb") or "")[-6:]
        if HEX.match(v):
            palette[i] = rgb(v)
    theme = theme_of(book.part("xl/theme/theme1.xml"))
    fonts = [font_of(f, palette, theme) for f in find("m:fonts/m:font")] or [DEFAULT_FONT]
    fills = [fill_of(f, palette, theme) for f in find("m:fills/m:fill")]
    borders = [sides_of(b, palette, theme) for b in find("m:borders/m:border")]
    return [Look(xf, fonts, fills, borders) for xf in find("m:cellXfs/m:xf")] or [Look(None, fonts, fills, borders)]


def kind(cell):
    """Where Excel's general alignment puts a cell's text: a number or a date
    to the right, TRUE, FALSE or an error in the middle, words to the left."""
    t = cell.get("t", "n")
    return "right" if t in ("n", "d") else "center" if t in ("b", "e") else "left"


def drawn_text(s):
    """Text as the PDF's fonts show it: its line breaks as one kind, other
    control characters as spaces, and characters the fonts lack as "?"."""
    s = unicodedata.normalize("NFC", s.replace("\r\n", "\n").replace("\r", "\n"))
    s = "".join(" " if ch < " " and ch != "\n" else ch for ch in s)
    return s.encode("cp1252", "replace").decode("cp1252")


def literal(s):
    """drawn_text's text as a PDF string's inside."""
    b = s.encode("cp1252")
    return b.replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)").decode("latin-1")


def width(s, font, size):
    table, other = (HELV_BOLD, 611) if font.bold else (HELV, 556)
    return sum(table[o - 32] if 32 <= o <= 126 else other for o in map(ord, s)) * size * font.squeeze / 100000.0


def wrap(text, room, font, size):
    """Text in lines no wider than room at this size: broken at spaces and at
    its own line breaks, and a word too long for a line where it must be."""
    out, space = [], width(" ", font, size)
    for para in text.split("\n"):
        line, lw = None, 0.0
        for word in para.split(" "):
            ww = width(word, font, size)
            if line is not None and lw + space + ww <= room:
                line, lw = line + " " + word, lw + space + ww
                continue
            if line is not None:
                out.append(line)
            while ww > room and len(word) > 1:
                n, acc = 0, 0.0
                for ch in word:
                    cw = width(ch, font, size)
                    if n and acc + cw > room:
                        break
                    n, acc = n + 1, acc + cw
                out.append(word[:n])
                word, ww = word[n:], ww - acc
            line, lw = word, ww
        out.append(line if line is not None else "")
    return out


def block(n):
    """How tall n lines of text stand, from the first's capitals to the last's
    descenders, against the font's size."""
    return (n - 1) * LINE + CAP + DESC


def place(text, side, look, box, rooms):
    """Where one cell's text goes in its box: wrapped if the cell wraps;
    otherwise run on into the empty cells rooms() says lie to its left and
    right (None when it can't), as Excel does; then shrunk to fit, but no
    smaller than SHRINK_MIN; then cut off at the edge."""
    x0, y0, x1, y1 = box
    f = look.font
    h = look.h or side
    indent = look.indent if h in ("left", "right") else 0.0
    room, tall = x1 - x0 - 2 * PAD - indent, y1 - y0 - 2 * VPAD
    lo, hi, k = x0, x1, 1.0
    if look.wrap:
        lines = wrap(text, room, f, f.size)
        while block(len(lines)) * f.size * k > tall and k > SHRINK_MIN:
            k = max(SHRINK_MIN, round(k - 0.05, 2))
            lines = wrap(text, room, f, f.size * k)
    else:
        lines = text.split("\n")
        natural = max(width(line, f, f.size) for line in lines)
        if natural > room and rooms is not None and not look.fit:
            left, right = rooms()
            if h == "left":
                hi += right
            elif h == "right":
                lo -= left
            else:
                lo, hi = lo - min(left, right), hi + min(left, right)
            room += (hi - lo) - (x1 - x0)
        if natural > room:
            k = max(SHRINK_MIN, room / natural) if room > 0 else SHRINK_MIN
        if block(len(lines)) * f.size * k > tall:
            k = max(SHRINK_MIN, min(k, tall / (block(len(lines)) * f.size))) if tall > 0 else SHRINK_MIN
    size = f.size * k
    ext = block(len(lines)) * size
    over = ext > tall + 1e-9   # still too tall: show its start
    v = "top" if over else look.v
    if v == "top":
        first = y0 + VPAD + CAP * size
    elif v == "center":
        first = (y0 + y1 - ext) / 2 + CAP * size
    else:
        first = y1 - VPAD - DESC * size - (len(lines) - 1) * LINE * size
    placed = []
    for i, line in enumerate(lines):
        w = width(line, f, size)
        x = x0 + PAD + indent if h == "left" else x1 - PAD - indent - w if h == "right" else (x0 + x1 - w) / 2
        if line.strip():
            placed.append((x, first + i * LINE * size, line, w))
    clip = over or any(x < lo or x + w > hi for x, _, _, w in placed)
    return Text(f, size, placed, (lo, y0, hi, y1) if clip else None)


def num(v):
    s = ("%.2f" % v).rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def ink(c):
    return " ".join(("%.3f" % (x / 255.0)).rstrip("0").rstrip(".") for x in c)


class Drawn:
    """One sheet drawn in its own points, from the top left of the part with
    anything in it: its size, its fills and border lines, and its text."""

    def __init__(self, book, root, looks):
        self.width = self.height = 0.0
        self.fills, self.lines, self.texts = [], [], []
        pr = root.find("m:sheetFormatPr", NS)
        pget = pr.get if pr is not None else (lambda k, d=None: d)
        row_h = min(amount(pget("defaultRowHeight")) or ROW_H, ROW_H_MAX)
        col_w = chars(amount(pget("defaultColWidth"))) or COL_W
        rows = {}   # row: (height or None, hidden, the row's own style or None)
        for r, row in sc.rows_of(root):
            ht = amount(row.get("ht"))
            rows[r] = (None if ht is None else min(ht, ROW_H_MAX), row.get("hidden") in TRUE or ht == 0,
                       sc.whole(row.get("s")) if row.get("customFormat") in TRUE else None)
        spans, known = [], {}
        for col in root.findall("m:cols/m:col", NS):
            lo, hi, w = sc.whole(col.get("min")), sc.whole(col.get("max")), amount(col.get("width"))
            if 1 <= lo <= hi:
                spans.append((lo, hi, w, col.get("hidden") in TRUE or w == 0,
                              sc.whole(col.get("style")) if col.get("style") is not None else None))

        def column(c):   # (width in characters or None, hidden, the column's style or None)
            if c not in known:
                known[c] = next(((w, hd, s) for lo, hi, w, hd, s in spans if lo <= c <= hi), (None, False, None))
            return known[c]

        styles, texts = {}, {}
        for r, c, cell in sc.cells(root):
            styles[(r, c)] = sc.whole(cell.get("s"))
            t = book.text(cell)
            if t.strip():
                texts[(r, c)] = (drawn_text(t)[:TEXT_MAX], kind(cell))
        shown = [(r, c) for r, c in texts if not rows.get(r, NO_ROW)[1] and not column(c)[1]]
        if not shown:
            return
        r1, r2 = min(r for r, _ in shown), max(r for r, _ in shown)
        c1, c2 = min(c for _, c in shown), max(c for _, c in shown)
        r2, c2 = min(r2, r1 + ROWS_MAX - 1), min(c2, c1 + COLS_MAX - 1)

        def look_at(r, c):
            # A cell's own style; a cell the file doesn't write takes its row's, then its column's.
            s = styles.get((r, c))
            if s is None:
                s = rows.get(r, NO_ROW)[2]
            if s is None:
                s = column(c)[2]
            return looks[s] if s is not None and s < len(looks) else looks[0]

        xs = [0.0]
        for c in range(c1, c2 + 1):
            w, hidden, _ = column(c)
            xs.append(xs[-1] + (0.0 if hidden else chars(w) if w is not None else col_w))

        # Merged cells, cut to the part drawn: each draws once as its first
        # cell, over all it covers. A file can't make this take long: it stops
        # once it has covered the part drawn twice over.
        cover, boxes, budget = set(), {}, 2 * (r2 - r1 + 1) * (c2 - c1 + 1)
        for _, ends in sc.merged(root):
            if ends is None:
                continue
            (ra, ca), (rb, cb) = ends
            ra, rb = sorted((ra, rb))
            ca, cb = sorted((ca, cb))
            top, left, bottom, right = max(ra, r1), max(ca, c1), min(rb, r2), min(cb, c2)
            if top > bottom or left > right or (top, left) in cover or (top, left) in boxes:
                continue
            budget -= (bottom - top + 1) * (right - left + 1)
            if budget < 0:
                break
            boxes[(top, left)] = (bottom, right, (ra, ca))
            cover.update((r, c) for r in range(top, bottom + 1) for c in range(left, right + 1))
            cover.discard((top, left))

        # A row the file gives no height is as tall as its text, as Excel makes it.
        need = {}
        for (r, c), (t, _) in texts.items():
            if (r1 <= r <= r2 and c1 <= c <= c2 and rows.get(r, NO_ROW)[0] is None and not column(c)[1]
                    and (r, c) not in cover and (r, c) not in boxes):
                look = look_at(r, c)
                n = t.count("\n") + 1
                room = xs[c - c1 + 1] - xs[c - c1] - 2 * PAD - look.indent
                if look.wrap and room > 1:
                    n = len(wrap(t, room, look.font, look.font.size))
                need[r] = max(need.get(r, 0.0), ((n - 1) * LINE + 1.3) * look.font.size)
        ys = [0.0]
        for r in range(r1, r2 + 1):
            ht, hidden, _ = rows.get(r, NO_ROW)
            ys.append(ys[-1] + (0.0 if hidden else ht if ht is not None else min(max(row_h, need.get(r, 0.0)), ROW_H_MAX)))
        self.width, self.height = xs[-1], ys[-1]

        def room(r, c, step):   # how far text may run on from (r, c), through empty cells
            total, cc = 0.0, c + step
            while c1 <= cc <= c2 and (r, cc) not in texts and (r, cc) not in cover and (r, cc) not in boxes:
                total += xs[cc - c1 + 1] - xs[cc - c1]
                cc += step
            return total

        writing = []
        for r in range(r1, r2 + 1):
            for c in range(c1, c2 + 1):
                if (r, c) in cover:
                    continue
                if (r, c) in boxes:   # a merged cell: its first cell's look, its far sides' borders
                    bottom, right, own = boxes[(r, c)]
                    look, text, spill = look_at(*own), texts.get(own), False
                    far_right, far_bottom = look_at(r, right), look_at(bottom, c)
                else:
                    bottom, right = r, c
                    look, text, spill = look_at(r, c), texts.get((r, c)), True
                    far_right = far_bottom = look
                x0, y0, x1, y1 = xs[c - c1], ys[r - r1], xs[right - c1 + 1], ys[bottom - r1 + 1]
                if x1 <= x0 or y1 <= y0:
                    continue
                self.fill(x0, y0, x1, y1, look.fill)
                self.edge(look.sides.get("left"), x0, y0, x0, y1)
                self.edge(look.sides.get("top"), x0, y0, x1, y0)
                self.edge(far_right.sides.get("right") or look.sides.get("right"), x1, y0, x1, y1)
                self.edge(far_bottom.sides.get("bottom") or look.sides.get("bottom"), x0, y1, x1, y1)
                if text:
                    rooms = (lambda r=r, c=c: (room(r, c, -1), room(r, c, 1))) if spill else None
                    writing.append((text, look, (x0, y0, x1, y1), rooms))
        self.texts = [place(t, side, look, b, rooms) for (t, side), look, b, rooms in writing]

    def fill(self, x0, y0, x1, y1, c):
        if c is None or c == WHITE:
            return
        if self.fills:   # one rectangle for a run of the same colour along a row
            a0, b0, a1, b1, last = self.fills[-1]
            if last == c and b0 == y0 and b1 == y1 and abs(a1 - x0) < 1e-9:
                self.fills[-1] = (a0, b0, x1, y1, c)
                return
        self.fills.append((x0, y0, x1, y1, c))

    def edge(self, side, xa, ya, xb, yb):
        if side:
            self.lines.append((side[0], side[1], xa, ya, xb, yb))

    def paint(self, ops, ox, oy, scale, page_h):
        """The sheet's drawing on the page, its top left at (ox, oy) from the
        page's top left, its points grown or shrunk by scale."""
        def X(x):
            return ox + x * scale

        def Y(y):
            return page_h - (oy + y * scale)

        last = None
        for x0, y0, x1, y1, c in sorted(self.fills, key=lambda f: f[4]):
            if c != last:
                ops.append("%s rg" % ink(c))
                last = c
            ops.append("%s %s %s %s re f" % (num(X(x0)), num(Y(y1)), num((x1 - x0) * scale), num((y1 - y0) * scale)))
        last = None
        for w, c, xa, ya, xb, yb in sorted(self.lines, key=lambda line: (line[0], line[1])):   # heavier on top
            if (w, c) != last:
                ops += ["%s w" % num(max(w * scale, THINNEST[w])), "%s RG" % ink(c)]
                last = (w, c)
            ops.append("%s %s m %s %s l S" % (num(X(xa)), num(Y(ya)), num(X(xb)), num(Y(yb))))
        for t in self.texts:
            if not t.lines:
                continue
            if t.clip:
                lo, y0, hi, y1 = t.clip
                ops += ["q", "%s %s %s %s re W n" % (num(X(lo)), num(Y(y1)), num((hi - lo) * scale), num((y1 - y0) * scale))]
            f = t.font
            ops += ["BT", "/F%d %s Tf" % (1 + f.bold + 2 * f.italic, num(t.size * scale)), "%s rg" % ink(f.ink),
                    "%d Tz" % f.squeeze]
            for x, base, line, _ in t.lines:
                ops += ["1 0 0 1 %s %s Tm" % (num(X(x)), num(Y(base))), "(%s) Tj" % literal(line)]
            ops.append("ET")
            if f.under:
                ops += ["%s w" % num(max(0.05 * t.size * scale, 0.3)), "%s RG" % ink(f.ink)]
                for x, base, _, w in t.lines:
                    y = Y(base + 0.1 * t.size)
                    ops.append("%s %s m %s %s l S" % (num(X(x)), num(y), num(X(x + w)), num(y)))
            if t.clip:
                ops.append("Q")


def label(ops, text, x, y, size, bold, gray):
    ops += ["BT", "/F%d %s Tf" % (2 if bold else 1, num(size)), "%s rg" % ink((gray,) * 3), "100 Tz",
            "1 0 0 1 %s %s Tm" % (num(x), num(y)), "(%s) Tj" % literal(drawn_text(text)), "ET"]


def drawing(book, nums, roots):
    """The sheets as one page: (the PDF, the sheets' names)."""
    looks = looks_of(book)
    sheets = [Drawn(book, root, looks) for root in roots]
    names = [book.sheets[n - 1][0] for n in nums]
    scale = min(SCALE_MAX, (PAGE_W - 2 * MARGIN) / max([s.width for s in sheets] + [1.0]))
    fixed = 2 * MARGIN + len(sheets) * CAPTION_H + (len(sheets) - 1) * GAP + FOOT_H
    tall = sum(s.height for s in sheets)
    if tall and fixed + tall * scale > PAGE_H_MAX:
        scale = (PAGE_H_MAX - fixed) / tall
    page_h = fixed + tall * scale
    ops, top = ["2 J"], MARGIN   # square line ends, so borders meet at the corners
    for name, s in zip(names, sheets):
        label(ops, name, MARGIN, page_h - (top + CAPTION), CAPTION, True, 90)
        top += CAPTION_H
        s.paint(ops, MARGIN, top, scale, page_h)
        top += s.height * scale + GAP
    label(ops, FOOTER, MARGIN, page_h - (top - GAP + 9), FOOT, False, 128)
    return pdf("\n".join(ops).encode("latin-1"), page_h, ", ".join(names)), names


def pdf(content, height, title):
    """One page as a PDF file: its drawing, its four fonts and its title."""
    stream = zlib.compress(content, 9)
    fonts = " ".join("/F%d %d 0 R" % (i, 4 + i) for i in range(1, 5))
    bodies = [b"<< /Type /Catalog /Pages 2 0 R >>",
              b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
              ("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %s %s] /Resources << /Font << %s >> >> /Contents 4 0 R >>"
               % (num(PAGE_W), num(height), fonts)).encode("ascii"),
              b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(stream) + stream + b"\nendstream"]
    bodies += [("<< /Type /Font /Subtype /Type1 /BaseFont /%s /Encoding /WinAnsiEncoding >>" % f).encode("ascii")
               for f in FONTS]
    bodies.append(("<< /Title (%s) /Producer (GI Hub) >>" % literal(drawn_text(title))).encode("latin-1"))
    out, at = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"), []
    for i, body in enumerate(bodies, 1):
        at.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(bodies) + 1)
    out += b"".join(b"%010d 00000 n \n" % a for a in at)
    out += b"trailer\n<< /Size %d /Root 1 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        len(bodies) + 1, len(bodies), xref)
    return bytes(out)


USAGE = ("Usage: python3 tools/agenda/sheet_pdf.py <file.xlsx> <out.pdf> <sheet number> "
         "[more sheet numbers, up to %d in all]" % SHEETS_MAX)


def main(argv):
    if not 3 <= len(argv) <= 2 + SHEETS_MAX or not all(re.fullmatch(r"[0-9]{1,6}", a) for a in argv[2:]):
        print(USAGE)
        return 2
    src, out, nums = argv[0], argv[1], [int(a) for a in argv[2:]]
    try:
        with sc.Book(src) as book:
            roots = [book.sheet(n) for n in nums]
            missing = [n for n, root in zip(nums, roots) if root is None]
            if missing:
                print("No sheet %d in this spreadsheet." % missing[0])
                return 1
            data, names = drawing(book, nums, roots)
    except sc.Unreadable:
        print(sc.UNREADABLE)
        return 1
    try:
        with open(out, "wb") as f:
            f.write(data)
    except OSError:
        print("Couldn't save the drawing to %s." % out)
        return 1
    for n, name in zip(nums, names):
        print("Drew sheet %d: %s" % (n, name))
    print("Saved %s (%d KB)." % (out, (len(data) + 1023) // 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
