"""Extract the Royal College GI EPA guide to plain text for curation."""
from pypdf import PdfReader
from pathlib import Path

SRC = r"C:\Users\jared\Downloads\epa-guide-gastroenterology-adult-v-1-1-e.pdf"
OUT = Path(__file__).resolve().parent / "epa-pdf.txt"

r = PdfReader(SRC)
with OUT.open("w", encoding="utf-8") as f:
    for i, p in enumerate(r.pages, 1):
        f.write(f"\n===== PAGE {i} =====\n{p.extract_text() or ''}")
print(f"{len(r.pages)} pages -> {OUT}")
