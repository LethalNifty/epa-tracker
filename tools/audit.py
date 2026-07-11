"""Audit: EPA_DATA in index.html must match the source Excel exactly."""
import json, re, sys
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "index.html"

# Expected table derived from GI EPA Tracker.xlsx (Sheet1 B2:H205).
# (partId, required, n_lines, n_headers, n_target2_lines)
EXPECTED = [
    ("d1", 4, 7, 1, 0),  ("d2a", 2, 2, 0, 0), ("d2b", 4, 6, 0, 0),
    ("f1a", 2, 2, 0, 0), ("f1b", 12, 7, 0, 0), ("f2", 2, 2, 0, 0),
    ("f3a", 6, 2, 0, 0), ("f3b", 3, 2, 0, 0), ("f4", 6, 2, 0, 0),
    ("c1", 5, 16, 1, 0), ("c2", 14, 11, 1, 6), ("c3", 10, 18, 0, 0),
    ("c4", 3, 5, 0, 0),  ("c5", 2, 2, 0, 0),  ("c6", 12, 10, 0, 0),
    ("c7", 8, 14, 1, 0), ("c8a", 25, 34, 0, 0), ("c8b", 4, 0, 0, 0),
    ("c9a", 4, 2, 0, 0), ("c9b", 6, 8, 0, 0),  ("p1", 5, 3, 0, 0),
]
EXPECTED_CODES = ["D1","D2","F1","F2","F3","F4","C1","C2","C3","C4","C5","C6","C7","C8","C9","P1"]
STAGE = {"D":"ttd","F":"f","C":"core","P":"ttp"}

def main():
    src = APP.read_text(encoding="utf-8")
    m = re.search(r"/\*EPA_DATA_START\*/\s*const EPA_DATA = (.*?);\s*/\*EPA_DATA_END\*/", src, re.S)
    assert m, "EPA_DATA markers not found"
    data = json.loads(m.group(1))
    errs = []
    codes = [e["code"] for e in data]
    if codes != EXPECTED_CODES:
        errs.append(f"codes {codes} != {EXPECTED_CODES}")
    parts = {p["id"]: p for e in data for p in e["parts"]}
    for e in data:
        if e["stage"] != STAGE[e["code"][0]]:
            errs.append(f"{e['code']}: stage {e['stage']}")
        if not e.get("title"):
            errs.append(f"{e['code']}: empty title")
    for pid, req, nlines, nheads, nt2 in EXPECTED:
        p = parts.get(pid)
        if not p:
            errs.append(f"missing part {pid}"); continue
        lines = [i for i in p["items"] if "id" in i]
        heads = [i for i in p["items"] if "h" in i]
        t2 = [l for l in lines if l["target"] == 2]
        got = (p["required"], len(lines), len(heads), len(t2))
        if got != (req, nlines, nheads, nt2):
            errs.append(f"{pid}: (req,lines,heads,t2)={got} expected {(req, nlines, nheads, nt2)}")
        ids = [l["id"] for l in lines]
        if len(set(ids)) != len(ids):
            errs.append(f"{pid}: duplicate line ids")
        for l in lines:
            if not l["id"].startswith(pid + "-"):
                errs.append(f"{pid}: bad line id {l['id']}")
    if len(parts) != len(EXPECTED):
        errs.append(f"{len(parts)} parts, expected {len(EXPECTED)}")
    for e in data:
        ref = e.get("ref") or {}
        if not ref.get("keyFeatures"):
            errs.append(f"{e['code']}: ref.keyFeatures missing/empty")
        if not ref.get("plan"):
            errs.append(f"{e['code']}: ref.plan missing/empty")
        for pl in ref.get("plan", []):
            if not pl.get("method") or not pl.get("rule"):
                errs.append(f"{e['code']}: plan entry missing method/rule")
        ms = ref.get("milestones", [])
        if sum(len(g["list"]) for g in ms) < 3:
            errs.append(f"{e['code']}: fewer than 3 milestones")
        nparts = len(e["parts"])
        if nparts > 1 and len(ref.get("plan", [])) != nparts:
            errs.append(f"{e['code']}: plan groups != parts")
    if errs:
        print("AUDIT FAIL")
        for e in errs:
            print(" -", e)
        sys.exit(1)
    print(f"AUDIT OK: {len(data)} EPAs, {len(parts)} parts, total required = "
          f"{sum(p['required'] for p in parts.values())}")

if __name__ == "__main__":
    main()
