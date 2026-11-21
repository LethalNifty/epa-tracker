"""tools/agenda/sheet_cells.py: a call schedule shared as a spreadsheet,
printed as text for Claude to read (tools/agenda/TELL.md). Made-up names only."""
import io
import sys
import tempfile
import time
import unittest
import zipfile
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "agenda"))
import sheet_cells  # noqa: E402

MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG = "http://schemas.openxmlformats.org/package/2006/relationships"


def workbook(sheets, strings=(), date1904=False, styles=None):
    """An .xlsx in memory: sheets is [(name, rows xml, merges)], as Excel writes them."""
    parts = {
        "[Content_Types].xml": '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
        "xl/workbook.xml": f'<?xml version="1.0"?><workbook xmlns="{MAIN}" xmlns:r="{REL}">'
        + (f'<workbookPr date1904="1"/>' if date1904 else "")
        + "<sheets>" + "".join(f'<sheet name="{n}" sheetId="{i + 1}" r:id="rId{i + 1}"/>' for i, (n, _, _) in enumerate(sheets))
        + "</sheets></workbook>",
        "xl/_rels/workbook.xml.rels": f'<?xml version="1.0"?><Relationships xmlns="{PKG}">'
        + "".join(f'<Relationship Id="rId{i + 1}" Target="worksheets/sheet{i + 1}.xml"/>' for i in range(len(sheets)))
        + "</Relationships>",
        "xl/sharedStrings.xml": f'<?xml version="1.0"?><sst xmlns="{MAIN}">' + "".join(strings) + "</sst>",
        "xl/styles.xml": styles or (
            f'<?xml version="1.0"?><styleSheet xmlns="{MAIN}">'
            '<numFmts><numFmt numFmtId="164" formatCode="ddd\\ mmm\\ d"/><numFmt numFmtId="165" formatCode="0.00&quot;h&quot;"/></numFmts>'
            '<cellXfs><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="165"/><xf numFmtId="20"/></cellXfs></styleSheet>'),
    }
    for i, (_, rows, merges) in enumerate(sheets):
        cells = "".join('<mergeCell ref="%s"/>' % m for m in merges)
        merged = "<mergeCells>%s</mergeCells>" % cells if merges else ""
        parts[f"xl/worksheets/sheet{i + 1}.xml"] = f'<?xml version="1.0"?><worksheet xmlns="{MAIN}"><sheetData>{rows}</sheetData>{merged}</worksheet>'
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, text in parts.items():
            z.writestr(name, text)
    return buf.getvalue()


SCHEDULE = workbook(
    [("HSC", '<row r="1"><c r="A1" t="s"><v>0</v></c></row>'
             '<row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" t="s"><v>2</v></c><c r="C3" t="s"><v>3</v></c></row>'
             '<row r="4"><c r="A4" s="1"><v>46345</v></c><c r="B4" t="s"><v>4</v></c><c r="C4" t="inlineStr"><is><t>Ames</t></is></c></row>'
             '<row r="5"><c r="A5" s="2"><v>46346</v></c><c r="B5" t="s"><v>5</v></c></row>'
             '<row r="6"><c r="A6" s="3"><v>7.5</v></c><c r="B6" t="b"><v>1</v></c><c r="D6"><v>3</v></c><c r="E6" s="4"><v>0.708333333333</v></c></row>',
      ["A1:C1", "C4:C5"]),
     ("St B", '<row r="2"><c r="B2" t="str"><f>A1</f><v>Rowan</v></c></row>', [])],
    strings=['<si><t>Block 6 call</t></si>', '<si><t>Date</t></si>', '<si><t>Night fellow</t></si>', '<si><t>Attending</t></si>',
             '<si><r><t>Brook</t></r><r><t xml:space="preserve"> (No call 1200-1700)</t></r></si>',
             '<si><t>Casey\nand Quill</t></si>'])


def rewritten(data, changes):
    """The same .xlsx stored without compression, with some parts' bytes replaced."""
    buf = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data)) as src, zipfile.ZipFile(buf, "w") as dst:
        for info in src.infolist():
            dst.writestr(info.filename, changes.get(info.filename, src.read(info)))
    return buf.getvalue()


ONE = workbook([("HSC", '<row r="1"><c r="A1" t="inlineStr"><is><t>Brook</t></is></c></row>', [])])
SHEET1 = "xl/worksheets/sheet1.xml"


def printed(data, name="sheet.xlsx"):
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / name
        p.write_bytes(data)
        out = io.StringIO()
        with redirect_stdout(out):
            code = sheet_cells.main([str(p)])
        return code, out.getvalue().splitlines()


class SheetCellsTest(unittest.TestCase):
    def test_every_sheet_in_order_with_its_rows_and_columns(self):
        code, lines = printed(SCHEDULE)
        self.assertEqual(code, 0)
        self.assertEqual(lines[0], "Sheet 1: HSC")
        self.assertIn("row 3: A=Date | B=Night fellow | C=Attending", lines)
        self.assertIn("Sheet 2: St B", lines)
        self.assertIn("row 2: B=Rowan", lines, "a formula's result, not its formula")

    def test_dates_come_out_as_days_with_their_weekday(self):
        _, lines = printed(SCHEDULE)
        self.assertIn("row 4: A=2026-11-19 Thu | B=Brook (No call 1200-1700) | C=Ames", lines)
        self.assertTrue(any(l.startswith("row 5: A=2026-11-20 Fri") for l in lines), "a custom date format counts too")

    def test_a_merged_cell_reads_once_across_and_on_every_row_down(self):
        _, lines = printed(SCHEDULE)
        self.assertIn("row 1: A:C=Block 6 call", lines)
        self.assertIn("row 5: A=2026-11-20 Fri | B=Casey / and Quill | C=Ames", lines, "an attending merged down two days, and a line break")
        self.assertIn("merged: A1:C1 C4:C5", lines)

    def test_numbers_times_and_true_or_false(self):
        _, lines = printed(SCHEDULE)
        self.assertIn("row 6: A=7.5 | B=TRUE | D=3 | E=17:00", lines)

    def test_the_1904_calendar(self):
        data = workbook([("HSC", '<row r="1"><c r="A1" s="1"><v>44883</v></c></row>', [])], date1904=True)
        self.assertIn("row 1: A=2026-11-19 Thu", printed(data)[1])

    def test_not_a_spreadsheet(self):
        code, lines = printed(b"%PDF-1.7\n", "sheet.pdf")
        self.assertEqual(code, 1)
        self.assertEqual(lines, ["Not a spreadsheet Claude can read."])

    def test_a_part_with_a_doctype_is_never_parsed(self):
        with zipfile.ZipFile(io.BytesIO(ONE)) as z:
            sheet = z.read(SHEET1).replace(b"<worksheet", b'<!DOCTYPE x [<!ENTITY a "aaaa">]><worksheet', 1)
        self.assertEqual(printed(rewritten(ONE, {SHEET1: sheet})), (1, ["Not a spreadsheet Claude can read."]))

    def test_a_doctype_hidden_in_another_encoding_is_never_parsed_either(self):
        sheet = ('<?xml version="1.0" encoding="UTF-16"?><!DOCTYPE x [<!ENTITY a "Brook">]>'
                 '<worksheet xmlns="%s"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&a;</t></is></c></row>'
                 '</sheetData></worksheet>' % MAIN).encode("utf-16")
        self.assertEqual(printed(rewritten(ONE, {SHEET1: sheet})), (1, ["Not a spreadsheet Claude can read."]))

    def test_a_damaged_file_says_so_instead_of_crashing(self):
        damaged = rewritten(ONE, {}).replace(b"Brook", b"Brool")   # its check (CRC) no longer matches
        self.assertEqual(printed(damaged), (1, ["Not a spreadsheet Claude can read."]))

    def test_a_cell_no_calendar_can_hold_prints_as_it_is(self):
        data = workbook([("HSC", '<row r="1"><c r="A1" s="1"><v>99999999</v></c><c r="B1" t="d"><v>2026-13-40</v></c>'
                                 '<c r="C1"><v>NaN</v></c></row>', [])])
        self.assertEqual(printed(data), (0, ["Sheet 1: HSC", "row 1: A=99999999 | B=2026-13-40 | C=NaN"]))

    def test_merges_reaching_the_sheet_edge_stop_at_its_last_cell(self):
        data = workbook([("HSC", '<row r="1"><c r="A1" t="inlineStr"><is><t>Block 6 call</t></is></c></row>'
                                 '<row r="3"><c r="B3" t="inlineStr"><is><t>Brook</t></is></c><c r="C3" t="inlineStr"><is><t>Ames</t></is></c></row>',
                          ["A1:XFD1", "C3:C1048576"])])
        start = time.monotonic()
        self.assertEqual(printed(data), (0, ["Sheet 1: HSC", "row 1: A:C=Block 6 call",
                                             "row 3: B=Brook | C=Ames", "merged: A1:XFD1 C3:C1048576"]))
        self.assertLess(time.monotonic() - start, 5)

    def test_a_merge_across_and_down_reads_once_across_on_every_row(self):
        cell = '<c r="%s" t="inlineStr"><is><t>%s</t></is></c>'
        rows = ('<row r="1">' + cell % ("A1", "19") + cell % ("B1", "Brook") + cell % ("C1", "stray") + cell % ("D1", "Ames")
                + '</row><row r="2">' + cell % ("A2", "20") + "</row>")
        self.assertEqual(printed(workbook([("HSC", rows, ["B1:C2"])]))[1],
                         ["Sheet 1: HSC", "row 1: A=19 | B:C=Brook | D=Ames", "row 2: A=20 | B:C=Brook", "merged: B1:C2"])

    def test_runs_of_spaces_inside_a_cell_read_as_one(self):
        data = workbook([("HSC", '<row r="1"><c r="D1" t="inlineStr"><is><t>Period 6        NOV 19 - DEC 16    2026</t></is></c></row>', [])])
        self.assertEqual(printed(data)[1][1], "row 1: D=Period 6 NOV 19 - DEC 16 2026")


if __name__ == "__main__":
    unittest.main()
