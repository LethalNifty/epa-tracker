"""tools/agenda/sheet_pdf.py: a call schedule spreadsheet drawn as one PDF page
for GI Hub to show in its place (tools/agenda/TELL.md). Made-up names only."""
import io
import re
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zlib
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_sheet_cells import MAIN, SCHEDULE, workbook  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "agenda"))
import sheet_pdf  # noqa: E402

# St. Boniface's look: bold white headers on dark grey, a bold red name on
# yellow, a green weekend from the theme with its tint, boxes with a heavier top.
STYLES = (f'<?xml version="1.0"?><styleSheet xmlns="{MAIN}">'
          '<fonts><font><sz val="11"/><name val="Calibri"/></font>'
          '<font><b/><sz val="28"/><color rgb="FFFF0000"/><name val="Calibri"/></font>'
          '<font><b/><sz val="14"/><color indexed="9"/><name val="Verdana"/></font></fonts>'
          '<fills><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
          '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/></patternFill></fill>'
          '<fill><patternFill patternType="solid"><fgColor theme="9" tint="0.39997558519241921"/></patternFill></fill>'
          '<fill><patternFill patternType="solid"><fgColor indexed="63"/></patternFill></fill></fills>'
          '<borders><border/><border><left style="thin"><color indexed="64"/></left><right style="thin"><color indexed="64"/></right>'
          '<top style="medium"><color indexed="64"/></top><bottom style="thin"><color indexed="64"/></bottom></border></borders>'
          '<cellXfs><xf fontId="0" fillId="0" borderId="0"/>'
          '<xf fontId="1" fillId="2" borderId="1"><alignment horizontal="center" vertical="center"/></xf>'
          '<xf fontId="2" fillId="4" borderId="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
          '<xf fontId="0" fillId="3" borderId="1"/><xf fontId="1" fillId="0" borderId="0"/></cellXfs></styleSheet>')


def cell(at, text, s=0):
    return '<c r="%s" s="%d" t="inlineStr"><is><t>%s</t></is></c>' % (at, s, text)


COLS = ('<cols><col min="1" max="1" width="14" customWidth="1"/><col min="2" max="2" width="16" customWidth="1"/>'
        '<col min="3" max="3" width="30" customWidth="1" hidden="1"/><col min="4" max="4" width="20" customWidth="1"/></cols>')
ST_B = workbook([("St B",
                  '<row r="1" ht="90">' + cell("A1", "DATE", 2) + cell("B1", "GI Consults / Bleeds 0800-1700 1st Call FELLOW", 2)
                  + cell("D1", "ATTENDING", 2) + '</row>'
                  '<row r="2" hidden="1">' + cell("A2", "Secret row") + '</row>'
                  '<row r="3" ht="31.5"><c r="A3" s="3"><v>19</v></c>' + cell("B3", "Brook", 1) + cell("C3", "Secret col")
                  + cell("D3", "Ames ✓ (Ward)", 3) + '</row>'
                  '<row r="4">' + cell("A4", "A NAME FAR TOO LONG FOR ITS CELL", 4) + cell("B4", "x") + '</row>'
                  '<row r="5">' + cell("A5", "A note that runs on into the empty cells") + '</row>', [], COLS)],
                styles=STYLES)
THEME = ('<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme name="Made up">'
         '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>'
         '<a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2>'
         + "".join('<a:accent%d><a:srgbClr val="%s"/></a:accent%d>' % (i, v, i)
                   for i, v in enumerate(["4F81BD", "C0504D", "9BBB59", "8064A2", "4BACC6", "F79646"], 1))
         + '<a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink>'
         '</a:clrScheme></a:themeElements></a:theme>')


def drawn(data, *nums):
    """What sheet_pdf says and writes for these sheets: (exit code, lines, the PDF or None)."""
    with tempfile.TemporaryDirectory() as d:
        src, out = Path(d) / "sheet.xlsx", Path(d) / "sheet.pdf"
        src.write_bytes(data)
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = sheet_pdf.main([str(src), str(out), *map(str, nums)])
        return code, buf.getvalue().splitlines(), out.read_bytes() if out.exists() else None


def page(pdf):
    """The page's width, height and drawing, read back through the PDF's own index."""
    assert pdf.startswith(b"%PDF-1.4\n") and pdf.rstrip().endswith(b"%%EOF")
    at = int(pdf.rsplit(b"startxref", 1)[1].split()[0])
    lines = pdf[at:].split(b"\n")
    assert lines[0] == b"xref", lines[0]
    for i in range(1, int(lines[1].split()[1])):
        assert pdf[int(lines[2 + i][:10]):].startswith(b"%d 0 obj" % i), i
    w, h = (float(x) for x in re.search(rb"/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]", pdf).groups())
    m = re.search(rb"/Length (\d+) /Filter /FlateDecode >>\nstream\n", pdf)
    return w, h, zlib.decompress(pdf[m.end():m.end() + int(m.group(1))]).decode("latin-1")


def shown(content):
    """Every piece of text the page shows, in the order drawn."""
    return [re.sub(r"\\(.)", r"\1", s) for s in re.findall(r"\(((?:[^\\)]|\\.)*)\) Tj", content)]


def blocks(content):
    """Each text block, BT to ET."""
    return re.findall(r"BT\n(.*?)\nET", content, re.S)


class SheetPdfTest(unittest.TestCase):
    def test_one_pdf_page_with_every_object_where_its_index_says(self):
        code, lines, pdf = drawn(SCHEDULE, 1)
        self.assertEqual(code, 0)
        self.assertTrue(lines[0].startswith("Drew sheet 1"), lines)
        w, h, _ = page(pdf)
        self.assertEqual(w, 612)
        self.assertGreater(h, 100)
        self.assertEqual(pdf.count(b"/Type /Page /"), 1)

    def test_each_cell_drawn_once_and_a_merge_once_across_and_down(self):
        texts = shown(page(drawn(SCHEDULE, 1)[2])[2])
        self.assertEqual(texts[0], "HSC", "the sheet's name above it")
        self.assertEqual(texts.count("Block 6 call"), 1)
        self.assertEqual(texts.count("Ames"), 1, "merged down two days, drawn once")
        self.assertIn("Brook (No call 1200-1700)", texts)
        self.assertIn("2026-11-19 Thu", texts)
        self.assertEqual([t for t in texts if t in ("Casey", "and Quill")], ["Casey", "and Quill"], "its line break")

    def test_colours_from_rgb_indexed_and_the_theme_with_its_tint(self):
        def c(xml):
            return sheet_pdf.color(ET.fromstring(xml), sheet_pdf.INDEXED, sheet_pdf.THEME)
        self.assertEqual(c('<c rgb="FFFFFF00"/>'), (255, 255, 0))
        self.assertEqual(c('<c indexed="22"/>'), (192, 192, 192))
        self.assertEqual(c('<c indexed="64"/>'), (0, 0, 0))
        self.assertEqual(c('<c theme="1"/>'), (0, 0, 0))
        self.assertEqual(c('<c theme="0" tint="-0.24994659260841701"/>'), (191, 191, 191))
        for got, want in zip(c('<c theme="9" tint="0.39997558519241921"/>'), (0xA9, 0xD0, 0x8E)):   # as Excel shows it
            self.assertLessEqual(abs(got - want), 2)

    def test_the_sheets_own_theme_colours(self):
        styles = STYLES.replace('<fgColor theme="9" tint="0.39997558519241921"/>', '<fgColor theme="9"/>')
        data = workbook([("St B", '<row r="1">' + cell("A1", "Sat", 3) + '</row>', [])], styles=styles,
                        extra={"xl/theme/theme1.xml": THEME})
        self.assertIn("0.969 0.588 0.275 rg", page(drawn(data, 1)[2])[2])

    def test_fills_fonts_and_borders_as_the_sheet_sets_them(self):
        content = page(drawn(ST_B, 1)[2])[2]
        self.assertRegex(content, r"1 1 0 rg\n[\d. ]+ re f", "yellow behind the name")
        brook = next(b for b in blocks(content) if "(Brook) Tj" in b)
        self.assertIn("/F2 ", brook, "bold")
        self.assertIn("1 0 0 rg", brook, "red")
        self.assertTrue([b for b in blocks(content) if "(DATE) Tj" in b and "/F2 " in b and "1 1 1 rg" in b], "bold white header")
        self.assertGreaterEqual(len(re.findall(r" l S", content)), 4 * 5, "each boxed cell's four sides")
        self.assertGreater(len({float(w) for w in re.findall(r"([\d.]+) w\n", content)}), 1, "a medium border heavier than a thin one")

    def test_a_wrapped_cell_breaks_into_lines_that_fit_its_column(self):
        texts = shown(page(drawn(ST_B, 1)[2])[2])
        lines = texts[texts.index("DATE") + 1:texts.index("ATTENDING")]
        self.assertGreater(len(lines), 1)
        self.assertEqual(" ".join(lines), "GI Consults / Bleeds 0800-1700 1st Call FELLOW")

    def test_hidden_rows_and_columns_are_left_out(self):
        texts = shown(page(drawn(ST_B, 1)[2])[2])
        self.assertNotIn("Secret row", texts)
        self.assertNotIn("Secret col", texts)

    def test_a_long_name_shrinks_beside_a_full_cell_and_runs_on_into_empty_ones(self):
        content = page(drawn(ST_B, 1)[2])[2]

        def size(text):
            return float(re.search(r"/F\d ([\d.]+) Tf", next(b for b in blocks(content) if "(%s) Tj" % text in b)).group(1))
        s = size("DATE") / 14
        self.assertAlmostEqual(size("A note that runs on into the empty cells"), 11 * s, places=1)
        self.assertLess(size("A NAME FAR TOO LONG FOR ITS CELL"), 28 * s * 0.99)
        self.assertGreaterEqual(size("A NAME FAR TOO LONG FOR ITS CELL"), 28 * s * 0.5 - 0.01)

    def test_characters_the_pdf_fonts_lack_become_question_marks_and_brackets_stay_text(self):
        self.assertIn(r"(Ames ? \(Ward\)) Tj", page(drawn(ST_B, 1)[2])[2])

    def test_two_sheets_stack_on_one_page_each_under_its_name(self):
        code, _, pdf = drawn(SCHEDULE, 1, 2)
        self.assertEqual(code, 0)
        _, h, content = page(pdf)
        self.assertEqual(pdf.count(b"/Type /Page /"), 1)
        texts = shown(content)
        self.assertLess(texts.index("HSC"), texts.index("St B"))
        self.assertIn("Rowan", texts)
        self.assertGreater(h, page(drawn(SCHEDULE, 1)[2])[1])

    def test_what_it_cant_draw(self):
        self.assertEqual(drawn(SCHEDULE, 9), (1, ["No sheet 9 in this spreadsheet."], None))
        self.assertEqual(drawn(b"%PDF-1.7\n", 1), (1, ["Not a spreadsheet Claude can read."], None))
        self.assertEqual(drawn(SCHEDULE)[0], 2)
        self.assertEqual(drawn(SCHEDULE, "six")[0], 2)


if __name__ == "__main__":
    unittest.main()
