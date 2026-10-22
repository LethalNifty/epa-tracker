"use strict";
// GI Hub report: a small PDF writer (the standard Helvetica fonts, so nothing
// is embedded; charts as vector paths) and the program director report built
// with it, plus the spreadsheet export. No library: the app stays offline.
// Loaded after scope-chart.js, before app.js.

// ---- Helvetica metrics (Adobe AFM widths, 1/1000 em, WinAnsi codes 32..126) ----------------
const PDF_W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,
  278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,
  667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,
  500,722,500,500,500,334,260,334,584];
const PDF_W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,
  333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,
  667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,
  556,778,556,556,500,389,280,389,584];
// Characters outside ASCII that WinAnsi has: [code, regular width, bold width].
const PDF_EXTRA = {"–": [0x96, 556, 556], "·": [0xb7, 278, 278], "’": [0x92, 222, 278], "‘": [0x91, 222, 278],
  "“": [0x93, 333, 500], "”": [0x94, 333, 500], "é": [0xe9, 556, 556], "×": [0xd7, 584, 584], "•": [0x95, 350, 350],
  "è": [0xe8, 556, 556], "ö": [0xf6, 556, 611], "ü": [0xfc, 556, 611]};
const PDF_SUB = {"≥": ">=", "≤": "<=", "→": "->", " ": " ", "—": ", ", "…": "..."};

function pdfChars(s) {
  let out = "";
  for (const ch of String(s)) out += PDF_SUB[ch] !== undefined ? PDF_SUB[ch] : ch;
  return out;
}
function pdfWidth(s, size, bold, spacing) {
  let w = 0, n = 0;
  for (const ch of pdfChars(s)) {
    const c = ch.charCodeAt(0);
    if (c >= 32 && c <= 126) w += (bold ? PDF_W_BOLD : PDF_W_REG)[c - 32];
    else if (PDF_EXTRA[ch]) w += PDF_EXTRA[ch][bold ? 2 : 1];
    else w += 556;
    n++;
  }
  return w * size / 1000 + (spacing || 0) * Math.max(0, n - 1);
}
// A PDF string literal: ASCII as is, WinAnsi extras as octal, the rest "?".
function pdfStr(s) {
  let out = "(";
  for (const ch of pdfChars(s)) {
    const c = ch.charCodeAt(0);
    if (ch === "(" || ch === ")" || ch === "\\") out += "\\" + ch;
    else if (c >= 32 && c <= 126) out += ch;
    else if (PDF_EXTRA[ch]) out += "\\" + PDF_EXTRA[ch][0].toString(8);
    else out += "?";
  }
  return out + ")";
}
const pdfN = v => (Math.round(v * 100) / 100).toString();
function pdfRGB(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map(i => pdfN(parseInt(h.slice(i, i + 2), 16) / 255)).join(" ");
}

// Pages are drawn top-left down, like the screen; the writer flips y.
function PdfDoc(opts = {}) {
  const W = opts.w || 612, H = opts.h || 792, pages = [];
  let ops = null;
  const doc = {
    W, H, pages,
    page() { ops = []; pages.push(ops); return doc; },
    raw(s) { ops.push(s); return doc; },
    rect(x, y, w, h, o = {}) {
      const r = o.r || 0;
      if (o.fill) ops.push(pdfRGB(o.fill) + " rg");
      if (o.stroke) ops.push(pdfRGB(o.stroke) + " RG " + pdfN(o.lw || .6) + " w");
      if (r) {
        const k = r * .5523, x0 = x, y0 = H - y - h, x1 = x + w, y1 = H - y;
        ops.push(`${pdfN(x0 + r)} ${pdfN(y0)} m ${pdfN(x1 - r)} ${pdfN(y0)} l ${pdfN(x1 - r + k)} ${pdfN(y0)} ${pdfN(x1)} ${pdfN(y0 + r - k)} ${pdfN(x1)} ${pdfN(y0 + r)} c ` +
          `${pdfN(x1)} ${pdfN(y1 - r)} l ${pdfN(x1)} ${pdfN(y1 - r + k)} ${pdfN(x1 - r + k)} ${pdfN(y1)} ${pdfN(x1 - r)} ${pdfN(y1)} c ` +
          `${pdfN(x0 + r)} ${pdfN(y1)} l ${pdfN(x0 + r - k)} ${pdfN(y1)} ${pdfN(x0)} ${pdfN(y1 - r + k)} ${pdfN(x0)} ${pdfN(y1 - r)} c ` +
          `${pdfN(x0)} ${pdfN(y0 + r)} l ${pdfN(x0)} ${pdfN(y0 + r - k)} ${pdfN(x0 + r - k)} ${pdfN(y0)} ${pdfN(x0 + r)} ${pdfN(y0)} c h`);
      } else ops.push(`${pdfN(x)} ${pdfN(H - y - h)} ${pdfN(w)} ${pdfN(h)} re`);
      ops.push(o.fill && o.stroke ? "B" : o.fill ? "f" : "S");
      return doc;
    },
    line(x1, y1, x2, y2, o = {}) {
      ops.push(pdfRGB(o.stroke || "#000000") + " RG " + pdfN(o.lw || .6) + " w " + (o.dash ? `[${o.dash.join(" ")}] 0 d` : "[] 0 d") + (o.cap ? " 1 J" : " 0 J"));
      ops.push(`${pdfN(x1)} ${pdfN(H - y1)} m ${pdfN(x2)} ${pdfN(H - y2)} l S`);
      return doc;
    },
    poly(pts, o = {}) {
      if (pts.length < 2) return doc;
      if (o.fill) ops.push(pdfRGB(o.fill) + " rg");
      if (o.stroke) ops.push(pdfRGB(o.stroke) + " RG " + pdfN(o.lw || 1) + " w 1 J 1 j [] 0 d");
      ops.push(pts.map((p, i) => `${pdfN(p[0])} ${pdfN(H - p[1])} ${i ? "l" : "m"}`).join(" ") + (o.close ? " h" : ""));
      ops.push(o.fill && o.stroke ? "B" : o.fill ? "f" : "S");
      return doc;
    },
    circle(cx, cy, r, o = {}) {
      const k = r * .5523, y = H - cy;
      if (o.fill) ops.push(pdfRGB(o.fill) + " rg");
      if (o.stroke) ops.push(pdfRGB(o.stroke) + " RG " + pdfN(o.lw || .6) + " w [] 0 d");
      ops.push(`${pdfN(cx + r)} ${pdfN(y)} m ${pdfN(cx + r)} ${pdfN(y + k)} ${pdfN(cx + k)} ${pdfN(y + r)} ${pdfN(cx)} ${pdfN(y + r)} c ` +
        `${pdfN(cx - k)} ${pdfN(y + r)} ${pdfN(cx - r)} ${pdfN(y + k)} ${pdfN(cx - r)} ${pdfN(y)} c ` +
        `${pdfN(cx - r)} ${pdfN(y - k)} ${pdfN(cx - k)} ${pdfN(y - r)} ${pdfN(cx)} ${pdfN(y - r)} c ` +
        `${pdfN(cx + k)} ${pdfN(y - r)} ${pdfN(cx + r)} ${pdfN(y - k)} ${pdfN(cx + r)} ${pdfN(y)} c h`);
      ops.push(o.fill && o.stroke ? "B" : o.fill ? "f" : "S");
      return doc;
    },
    // y is the baseline. align: left, center, right. spacing: letter spacing in pt.
    text(x, y, s, o = {}) {
      const size = o.size || 10, bold = !!o.bold, sp = o.spacing || 0;
      let str = String(s);
      if (o.maxW) str = pdfFit(str, size, bold, sp, o.maxW);
      const w = pdfWidth(str, size, bold, sp);
      const x0 = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
      ops.push(`BT /${bold ? "F2" : "F1"} ${pdfN(size)} Tf ${pdfRGB(o.color || "#10262a")} rg ${pdfN(sp)} Tc 1 0 0 1 ${pdfN(x0)} ${pdfN(H - y)} Tm ${pdfStr(str)} Tj ET`);
      return w;
    },
    // Wrapped text; returns the y after the last line.
    para(x, y, s, o = {}) {
      const size = o.size || 10, lh = o.lh || size * 1.4;
      for (const ln of pdfWrap(s, size, !!o.bold, o.maxW)) { doc.text(x, y, ln, o); y += lh; }
      return y;
    },
    bytes() {
      const objs = [];
      const add = s => { objs.push(s); return objs.length; };
      add("<< /Type /Catalog /Pages 2 0 R >>");
      add("PAGES");
      add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
      add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
      const kids = [];
      for (const p of pages) {
        const content = p.join("\n");
        const c = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
        kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${c} 0 R >>`));
      }
      objs[1] = `<< /Type /Pages /Kids [${kids.map(k => k + " 0 R").join(" ")}] /Count ${kids.length} >>`;
      const info = add(`<< /Title ${pdfStr(opts.title || "GI Hub report")} /Producer (GI Hub) /Creator (GI Hub) >>`);
      let out = "%PDF-1.4\n%âãÏÓ\n";
      const offs = [];
      objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
      const xref = out.length;
      out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, "0") + " 00000 n \n").join("");
      out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
      const b = new Uint8Array(out.length);
      for (let i = 0; i < out.length; i++) b[i] = out.charCodeAt(i) & 255;
      return b;
    },
  };
  return doc;
}
function pdfFit(s, size, bold, sp, maxW) {
  if (pdfWidth(s, size, bold, sp) <= maxW) return s;
  let t = s;
  while (t.length > 1 && pdfWidth(t + "...", size, bold, sp) > maxW) t = t.slice(0, -1);
  return t.replace(/[\s,·]+$/, "") + "...";
}
function pdfWrap(s, size, bold, maxW) {
  const words = String(s).split(/\s+/), lines = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (!maxW || pdfWidth(t, size, bold) <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---- The report's palette (print) --------------------------------------------------------------
const RP = {ink: "#171a2b", ink2: "#4b4f66", faint: "#80849a", rule: "#dcdee7", hair: "#eceef4", wash: "#f4f4f9",
  accent: "#4c3fc0", accentSoft: "#ebe8fb", accentMid: "#a9a1e8", warm: "#b8642f", grid: "#e7e8ef", dotLo: "#a6a9ba"};
const RP_SERIES = [RP.accent, "#b0479e", RP.warm];

// Draws a chart scene from scope-chart.js at (ox, oy).
function pdfScene(doc, sc, ox, oy) {
  const X = v => ox + v, Y = v => oy + v;
  for (const it of sc.items) {
    const c = it.c;
    if (it.t === "line") {
      const st = {grid: [RP.grid, .6], goal: [RP.accent, .8, [2.2, 2]], axis: ["#c4c6d3", .7], month: ["#eff0f5", .6], mark: [RP.warm, .8, [2, 2]]}[c] || [RP.grid, .6];
      doc.line(X(it.x1), Y(it.y1), X(it.x2), Y(it.y2), {stroke: st[0], lw: st[1], dash: st[2]});
    } else if (it.t === "path") {
      const col = c === "trend" ? RP.accentMid : c === "share" ? RP.accent : /^vol(\d)$/.test(c) ? RP_SERIES[+c.slice(3)] : RP.accent;
      doc.poly(it.pts.map(p => [X(p[0]), Y(p[1])]), {stroke: col, lw: c === "trend" ? 2.4 : 1.5});
    } else if (it.t === "area") doc.poly(it.pts.map(p => [X(p[0]), Y(p[1])]), {fill: RP.accentSoft, close: true});
    else if (it.t === "dot") doc.circle(X(it.x), Y(it.y), it.r * .8, {fill: c === "dothi" ? RP.accent : RP.dotLo, stroke: "#ffffff", lw: .9});
    else if (it.t === "ring") doc.circle(X(it.x), Y(it.y), it.r * .8, {stroke: RP.accent, lw: .8});
    else if (it.t === "text") {
      const vl = /^vlbl(\d)$/.exec(c);
      const size = (it.size || 9) * .82, color = c === "lblhi" ? RP.accent : vl ? RP.ink : c === "mark" ? RP.warm : RP.faint;
      let x = X(it.x);
      if (vl) { doc.line(x, Y(it.y), x + 8, Y(it.y), {stroke: RP_SERIES[+vl[1]], lw: 2, cap: true}); x += 11; }
      doc.text(x, Y(it.y) + size * .35, it.s, {size, bold: !!it.mono || !!vl, color, align: it.a === "end" ? "right" : it.a === "middle" ? "center" : "left", spacing: it.mono ? .3 : 0});
    }
  }
}

// ---- The report ---------------------------------------------------------------------------------
const rpDate = iso => { const d = new Date(iso + "T12:00:00"); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
function scopeReportRange(period, cases, lastReport, today) {
  const t = fmtDate(today), first = cases.length ? cases.slice().sort(scopeByDate)[0].d : t, blk = blockFor(today);
  if (period === "block" && blk) return {from: fmtDate(blockStart(blk.num)), to: t, label: FELLOWS ? `Block ${blk.num}` : `Block ${blk.num} (${blk.name})`};
  if (period === "year") return {from: "2026-07-01", to: t, label: "Academic year 2026 to 2027"};
  if (period === "since" && lastReport) return {from: lastReport, to: t, label: "Since the last report"};
  return {from: first < t ? first : t, to: t, label: period === "since" ? "Since logging began" : "All cases"};
}
const rpPct = (k, n) => n ? Math.round(k / n * 100) + "%" : "–";
// One logbook line's procedure, without the reach (it has its own column).
function scopeReportProc(c) {
  let s = scopeSummary(c);
  for (const say of Object.values(SCOPE_REACH_SAY)) s = s.replace(" to " + say, "");
  return s.replace("polypectomy, large polypectomy", "polypectomy, 10 mm or larger");
}
function scopeReportWhy(c) {
  const why = (c.why || []).map(scopeWhyLabel), found = (c.found || []).map(scopeFoundLabel);
  return [why.join(", "), found.join(", ")].filter(Boolean).join("; ");
}
// opts: {cases, staff, from, to, label, name, today}
function scopeReportPDF(o) {
  const doc = PdfDoc({title: "Endoscopy procedure log" + (o.name ? " · " + o.name : "")});
  const M = 48, CW = doc.W - 2 * M, FOOT = 742, all = o.cases.slice().sort(scopeByDate);
  const inP = all.filter(c => c.d >= o.from && c.d <= o.to), upTo = all.filter(c => c.d <= o.to);
  const whole = inP.length === upTo.length;
  const tP = scopeTotals(inP), tA = scopeTotals(upTo);
  const series = scopeReachSeries(upTo), last20 = series.slice(-20);
  const cec = s => s.filter(x => x.rank >= 5).length, ti = s => s.filter(x => x.reach === "ti").length;
  const staffName = id => { const p = (o.staff || []).find(x => x.id === id); return p ? "Dr. " + String(p.name).split(",")[0].trim() : ""; };
  const period = `${rpDate(o.from)} to ${rpDate(o.to)}`;
  let y = 0;

  const header = () => {
    doc.page();
    doc.text(M, 44, "ENDOSCOPY PROCEDURE LOG", {size: 7.5, bold: true, color: RP.accent, spacing: 1.1});
    doc.text(M + CW, 44, [o.name, period].filter(Boolean).join("  ·  "), {size: 7.5, color: RP.faint, align: "right", maxW: CW - 170});
    doc.line(M, 54, M + CW, 54, {stroke: RP.rule, lw: .6});
    return 84;
  };
  const section = (title, note) => {
    doc.text(M, y, title, {size: 12, bold: true});
    if (note) doc.text(M + CW, y, note, {size: 7.5, color: RP.faint, align: "right", maxW: CW - pdfWidth(title, 12, true) - 24});
    doc.line(M, y + 6, M + CW, y + 6, {stroke: RP.ink, lw: .8});
    y += 22;
  };
  const room = need => { if (y + need > FOOT) y = header(); };

  // ---- Page 1: who, when, the headline figures, every procedure and every technique ----
  doc.page();
  doc.rect(M, 40, 4, 4, {fill: RP.accent});
  doc.text(M + 10, 44.5, "ENDOSCOPY PROCEDURE LOG", {size: 8, bold: true, color: RP.accent, spacing: 1.2});
  doc.text(M, 84, o.name || "Gastroenterology fellow", {size: 22, bold: true, maxW: CW});
  doc.text(M, 103, `${o.label === "All cases" ? "All procedures" : o.label} · ${period}`, {size: 9.5, color: RP.ink2});
  doc.text(M + CW, 103, `Generated ${rpDate(fmtDate(o.today))}`, {size: 8, color: RP.faint, align: "right"});
  doc.line(M, 116, M + CW, 116, {stroke: RP.ink, lw: 1});

  // Headline figures: open numerals between hairlines, no boxes.
  const nTx = inP.filter(scopeIsTherapeutic).length;
  const sub = n => whole ? `since ${rpDate(all.length ? all[0].d : o.from)}` : `${n} in total`;
  const figs = [[String(tP.procs), "Procedures", sub(tA.procs)], [String(tP.colo), "Colonoscopies", sub(tA.colo)],
    [rpPct(cec(last20), last20.length), "Cecal intubation", last20.length ? `${cec(last20)} of the last ${last20.length}` : "no colonoscopies yet"],
    [String(nTx), "Therapeutic cases", whole ? `${rpPct(nTx, tP.cases)} of all cases` : `${upTo.filter(scopeIsTherapeutic).length} in total`]];
  const fw = CW / 4;
  figs.forEach(([v, l, s], i) => {
    const x = M + i * fw + (i ? 14 : 0);
    if (i) doc.line(M + i * fw, 132, M + i * fw, 190, {stroke: RP.rule, lw: .6});
    doc.text(x, 164, v, {size: 26, bold: true, color: i === 2 ? RP.accent : RP.ink});
    doc.text(x, 178, l, {size: 8.5, bold: true, color: RP.ink2});
    doc.text(x, 189, s, {size: 7.5, color: RP.faint, maxW: fw - 18});
  });
  y = 228;

  // Procedures by type, with how many carried a therapeutic intervention.
  section("Procedures");
  // Columns: [label, value of a family or "procs"], then how many of the period's carried a therapy.
  const famTx = (cases, f) => cases.filter(c => scopeFams(c).includes(f) && (c.procs || []).some(p => scopeFam(p) === f && SCOPE_TX_CODES.has(p))).length;
  const pc = whole ? [["Total", tA, M + CW - 100], ["Therapeutic", null, M + CW]]
    : [["This period", tP, M + CW - 200], ["Therapeutic", null, M + CW - 100], ["Total", tA, M + CW]];
  pc.forEach(([l, , x]) => doc.text(x, y, l, {size: 7.5, bold: true, color: RP.faint, align: "right", spacing: .2}));
  y += 15;
  const fams = SCOPE_FAMS.filter(([f]) => tA[f] > 0 || ["egd", "colo"].includes(f));
  for (const [f, label] of fams) {
    doc.text(M, y, label, {size: 10});
    for (const [, t, x] of pc) {
      if (t) { doc.text(x, y, String(t[f]), {size: 10, align: "right"}); continue; }
      const tx = famTx(whole ? upTo : inP, f);
      if (["egd", "colo", "fs", "ercp"].includes(f)) doc.text(x, y, String(tx), {size: 10, align: "right", color: tx ? RP.ink2 : RP.faint});
    }
    doc.line(M, y + 6, M + CW, y + 6, {stroke: RP.hair, lw: .5});
    y += 18;
  }
  doc.text(M, y, "All procedures", {size: 10, bold: true});
  for (const [, t, x] of pc) if (t) doc.text(x, y, String(t.procs), {size: 10, bold: true, align: "right"});
  y += 32;

  // Therapeutic work by technique, in two balanced columns.
  const gP = scopeTxGroups(inP), gA = scopeTxGroups(upTo);
  const showRows = g => (SCOPE_TX_GROUPS.find(x => x[0] === g.label) || [, []])[1].length > 1 || g.rows.some(r => r.note);
  const hOf = g => 17 + (showRows(g) ? g.rows.length * 13.5 : 0) + 9;
  const total = gA.reduce((a, g) => a + hOf(g), 0), left = [], right = [];
  let acc = 0;
  for (const g of gA) { (acc + hOf(g) / 2 <= total / 2 ? left : right).push(g); acc += hOf(g); }
  const colH = Math.max(left.reduce((a, g) => a + hOf(g), 0), right.reduce((a, g) => a + hOf(g), 0));
  room(40 + colH);
  section("Therapeutic procedures", "Cases by technique; a case counts once in each line that applies");
  if (!gA.length) { doc.text(M, y + 2, "No therapeutic procedures logged.", {size: 9.5, color: RP.faint}); y += 24; }
  else {
    const nOf = (list, g, r) => { const G = list.find(x => x.label === g.label); if (!G) return 0; if (!r) return G.n; const R = G.rows.find(x => x.label === r.label); return R ? R.n : 0; };
    const colW = (CW - 28) / 2;
    if (!whole) {
      for (const x of [M, M + colW + 28]) {
        doc.text(x + colW - 34, y - 4, "Period", {size: 6.8, bold: true, color: RP.faint, align: "right", spacing: .2});
        doc.text(x + colW, y - 4, "Total", {size: 6.8, bold: true, color: RP.faint, align: "right", spacing: .2});
      }
      y += 8;
    }
    const drawCol = (x, list) => {
      let yy = y;
      for (const g of list) {
        const nA = String(g.n), nPer = whole ? "" : String(nOf(gP, g));
        doc.text(x, yy, g.label, {size: 9.5, bold: true, maxW: colW - 70});
        if (!whole) doc.text(x + colW - 34, yy, nPer, {size: 9.5, bold: true, align: "right", color: RP.ink2});
        doc.text(x + colW, yy, nA, {size: 9.5, bold: true, align: "right"});
        yy += 4;
        doc.line(x, yy, x + colW, yy, {stroke: RP.rule, lw: .5});
        yy += 13;
        if (showRows(g)) for (const r of g.rows) {
          doc.text(x + 9, yy, r.label, {size: 8.8, color: r.note ? RP.warm : RP.ink2, maxW: colW - 80});
          if (!whole) doc.text(x + colW - 34, yy, String(nOf(gP, g, r)), {size: 8.8, align: "right", color: RP.faint});
          doc.text(x + colW, yy, String(r.n), {size: 8.8, align: "right", color: r.note ? RP.warm : RP.ink});
          yy += 13.5;
        }
        yy += 9;
      }
      return yy;
    };
    y = Math.max(drawCol(M, left), drawCol(M + colW + 28, right));
  }

  room(154);
  y += 14;
  section("Volume over time", "Running totals since logging began");
  if (upTo.length) { pdfScene(doc, scopeVolumeScene(upTo, {w: CW, h: 104, left: 34, right: 110}), M, y); y += 118; }

  // ---- Colonoscopy: cecal intubation, depth, milestones ----
  room(200);
  y += 14;
  section("Cecal intubation", "Reach = how far the fellow advanced the scope before any hand-over");
  const stats = [[rpPct(cec(last20), last20.length), `last ${last20.length || 20} colonoscopies`, `${cec(last20)} of ${last20.length}`],
    [rpPct(cec(series), series.length), "all colonoscopies", `${cec(series)} of ${series.length}`],
    [rpPct(ti(last20), last20.length), "terminal ileum, last " + (last20.length || 20), `${ti(last20)} of ${last20.length}`]];
  stats.forEach(([v, l, s], i) => {
    const x = M + i * (CW / 3);
    doc.text(x, y + 14, v, {size: 18, bold: true, color: i === 0 ? RP.accent : RP.ink});
    doc.text(x + pdfWidth(v, 18, true) + 8, y + 5, l, {size: 8, bold: true, color: RP.ink2});
    doc.text(x + pdfWidth(v, 18, true) + 8, y + 15, s, {size: 7.5, color: RP.faint});
  });
  y += 32;
  const share = scopeCecumShare(series, 20).filter(p => p.n >= 10);
  if (series.length >= 15) {
    doc.text(M, y, "Rolling rate over the previous 20 colonoscopies", {size: 7.5, bold: true, color: RP.faint, spacing: .2});
    pdfScene(doc, scopeShareScene(share, {w: CW, h: 118, left: 40, right: 46}), M, y + 6);
    y += 140;
  } else { doc.text(M, y + 2, "The rolling rate appears after 15 colonoscopies.", {size: 8.5, color: RP.faint}); y += 18; }

  room(240);
  y += 6;
  section("Furthest point reached", `${series.length} colonoscop${series.length === 1 ? "y" : "ies"}, oldest to newest`);
  const depth = scopeDepthScene(series, {w: CW, h: 176, left: 58, right: 12, top: 6, bottom: 20});
  const firstIn = series.find(x => x.d >= o.from);
  if (!whole && firstIn && firstIn.i > 1 && depth.x) {
    const xx = depth.x(firstIn.i) - (series.length > 1 ? (depth.x(2) - depth.x(1)) / 2 : 0);
    depth.items.push({t: "line", x1: xx, y1: 2, x2: xx, y2: 176 - 20, c: "mark"});
    depth.items.push({t: "text", x: xx + 4, y: 8, s: "This period", c: "mark", a: "start", size: 9});
  }
  if (series.length) {
    pdfScene(doc, depth, M, y); y += 186;
    const key = [[RP.accent, "Cecum or terminal ileum"], [RP.dotLo, "Before the cecum"]];
    let kx = M + 58;
    key.forEach(([col, l]) => { doc.circle(kx, y - 2.5, 3, {fill: col}); doc.text(kx + 7, y, l, {size: 7.5, color: RP.ink2}); kx += pdfWidth(l, 7.5) + 26; });
    if (series.length >= 4) { doc.line(kx - 4, y - 2.5, kx + 10, y - 2.5, {stroke: RP.accentMid, lw: 2.4, cap: true}); doc.text(kx + 14, y, "Median of 5", {size: 7.5, color: RP.ink2}); }
    y += 22;
  } else { doc.text(M, y + 2, "No colonoscopies logged yet.", {size: 9, color: RP.faint}); y += 22; }


  const firsts = scopeFirsts(upTo).sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
  if (firsts.length) {
    const rows = Math.ceil(firsts.length / 2);
    room(40 + rows * 14);
    y += 6;
    section("Milestones", "In date order");
    const colW = CW / 2;
    firsts.forEach((f, i) => {
      const x = M + Math.floor(i / rows) * colW, yy = y + (i % rows) * 14;
      doc.text(x, yy, rpDate(f.d), {size: 8.5, bold: true, color: !whole && f.d >= o.from ? RP.accent : RP.ink2});
      doc.text(x + 68, yy, f.label, {size: 9, maxW: colW - 76});
    });
    y += rows * 14 + 8;
  }

  // ---- Case mix, then the logbook ----
  const b = scopeBreadth(all, o.from, o.to, o.staff), hasAge = Object.keys(b.age).some(k => k !== "none");
  room(60 + 14 * Math.max(Math.min(12, b.staff.length) + 1 + (hasAge ? 6 : 0), 8));
  y += 6;
  section("Case mix", `The ${b.n} case${b.n === 1 ? "" : "s"} ${whole ? "logged" : "in this period"}`);
  const bars = (x, yy, w, title, rows) => {
    doc.text(x, yy, title, {size: 7.5, bold: true, color: RP.faint, spacing: .6});
    yy += 14;
    const max = Math.max(1, ...rows.map(r => r.n));
    for (const r of rows) {
      doc.text(x, yy, r.label, {size: 8.8, maxW: 96});
      doc.rect(x + 102, yy - 6.5, Math.max(2, (w - 134) * r.n / max), 6.5, {fill: r.label === "Not recorded" ? "#dcdee7" : RP.accent, r: 1.5});
      doc.text(x + w, yy, String(r.n), {size: 8.8, align: "right"});
      yy += 14;
    }
    return yy;
  };
  const staffRows = b.staff.slice(0, 12).map(r => ({label: r.id === "none" ? "Not recorded" : "Dr. " + String(r.name).split(",")[0].trim(), n: r.n}));
  const mapRows = (obj, list) => list.map(([k, l]) => ({label: l, n: obj[k] || 0})).filter(r => r.n).concat(obj.none ? [{label: "Not recorded", n: obj.none}] : []);
  let yL = bars(M, y, CW / 2 - 16, "SUPERVISING STAFF", staffRows.length ? staffRows : [{label: "Not recorded", n: 0}]);
  if (hasAge) yL = bars(M, yL + 6, CW / 2 - 16, "PATIENT AGE", mapRows(b.age, SCOPE_AGES.map(x => [x[0], x[1]])));
  let yR = bars(M + CW / 2 + 16, y, CW / 2 - 16, "SITE", mapRows(b.site, SCOPE_SITES.map(x => [x[0], x[1]])));
  yR = bars(M + CW / 2 + 16, yR + 6, CW / 2 - 16, "SETTING", mapRows(b.loc, SCOPE_LOCS.map(x => [x[0], x[2] === "Suite" ? "Endoscopy suite" : x[2]]))
    .concat(mapRows(b.urg, [["urgent", "Urgent"], ["elective", "Elective"]]).filter(r => r.label !== "Not recorded")));
  y = Math.max(yL, yR) + 20;

  // The logbook: every case in the period, each cell wrapped in full.
  const lc = [[M, 44, "Date"], [M + 46, 172, "Procedure"], [M + 220, 44, "Reach"], [M + 266, 140, "Indication; findings"], [M + 408, CW - 408, "Supervisor, site"]];
  const multiYear = o.from.slice(0, 4) !== o.to.slice(0, 4);
  const LS = 8.3, LH = 10.4;
  const logHead = () => {
    lc.forEach(([x, , h]) => doc.text(x, y, h, {size: 7.3, bold: true, color: RP.faint, spacing: .2}));
    doc.line(M, y + 5, M + CW, y + 5, {stroke: RP.ink, lw: .7});
    y += 17;
  };
  room(80);
  section("Logbook", `${inP.length} case${inP.length === 1 ? "" : "s"}, oldest first`);
  logHead();
  if (!inP.length) { doc.text(M, y, "No cases in this period.", {size: 9, color: RP.faint}); y += 16; }
  for (const c of inP) {
    const urgent = c.urg === "urgent";
    const cells = [
      [rpDate(c.d).replace(multiYear ? /$/ : / \d{4}$/, ""), {color: RP.ink2}],
      [scopeReportProc(c), {}],
      [scopeHasBase(c) && c.reach ? scopeReachShort(c.reach) : scopeFams(c).includes("colo") && !scopeHasBase(c) ? "Therapy only" : "",
        {bold: scopeHasBase(c) && scopeRank(c.reach) >= 5, color: !scopeHasBase(c) ? RP.faint : scopeRank(c.reach) >= 5 ? RP.accent : RP.ink}],
      [scopeReportWhy(c), {color: RP.ink2}],
      [[staffName(c.staff), scopeSiteShortR(c.site)].filter(Boolean).join(", "), {color: RP.ink2}],
    ];
    const wrapped = cells.map(([s, st], i) => pdfWrap(s, LS, !!st.bold, lc[i][1] - 8));
    if (urgent) wrapped[4].push("Urgent");
    const n = Math.max(1, ...wrapped.map(w => w.length)), h = n * LH + 5;
    if (y + h > FOOT) { y = header(); doc.text(M, y, "Logbook, continued", {size: 9, bold: true, color: RP.ink2}); y += 18; logHead(); }
    wrapped.forEach((lines, i) => lines.forEach((ln, k) => {
      const isUrg = i === 4 && urgent && k === lines.length - 1;
      doc.text(lc[i][0], y + k * LH, ln, {size: isUrg ? 7.3 : LS, bold: isUrg || !!cells[i][1].bold, color: isUrg ? RP.warm : cells[i][1].color || RP.ink, spacing: isUrg ? .3 : 0});
    }));
    doc.line(M, y + h - LH + 2, M + CW, y + h - LH + 2, {stroke: RP.hair, lw: .5});
    y += h;
  }

  // Footers, now that the page count is known.
  const n = doc.pages.length;
  doc.pages.forEach((p, i) => {
    const text = (x, yy, s, al) => p.push(`BT /F1 7.5 Tf ${pdfRGB(RP.faint)} rg 0 Tc 1 0 0 1 ${pdfN(al === "right" ? x - pdfWidth(s, 7.5) : x)} ${pdfN(doc.H - yy)} Tm ${pdfStr(s)} Tj ET`);
    p.push(`${pdfRGB(RP.rule)} RG 0.6 w [] 0 d ${M} ${pdfN(doc.H - 758)} m ${M + CW} ${pdfN(doc.H - 758)} l S`);
    text(M, 770, "No patient identifiers are recorded.");
    text(M + CW, 770, `Page ${i + 1} of ${n}`, "right");
  });
  return doc.bytes();
}
const scopeSiteShortR = k => (SCOPE_SITES.find(x => x[0] === k) || [, , ""])[2];

// ---- Export: the iPhone share sheet, like the backup ---------------------------------------------------
async function scopeShareFile(bytesOrText, name, type, title) {
  const blob = new Blob([bytesOrText], {type});
  if (typeof File === "function" && navigator.canShare) {
    const file = new File([bytesOrText], name, {type});
    if (navigator.canShare({files: [file]})) {
      try { await navigator.share({files: [file], title}); return true; }
      catch (e) { if (e && e.name === "AbortError") return false; throw e; }
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return true;
}
function scopeReportOpts() {
  const s = Store.state.scopes, today = getToday();
  const r = scopeReportRange(scopePeriod, s.cases, s.lastReport, today);
  return {cases: s.cases, staff: s.staff, from: r.from, to: r.to, label: r.label, name: (s.reportName || "").trim(), today,
    items: PART_BY_ID.c8a ? PART_BY_ID.c8a.items : [], lineVal: id => Store.lineOk(id), lastReport: s.lastReport};
}
async function scopeExportReport() {
  scopeErr = null;
  try {
    const bytes = scopeReportPDF(scopeReportOpts());
    const ok = await scopeShareFile(bytes, `Endoscopy-procedure-log-${fmtDate(getToday())}.pdf`, "application/pdf", "Endoscopy procedure log");
    if (ok) { Store.markReport(fmtDate(getToday())); showToast("Report exported"); }
  } catch (e) { console.error(e); scopeErr = "Couldn't make the report. Try again."; }
  route.keepScroll = true; render();
}
async function scopeExportCSV() {
  scopeErr = null;
  try {
    const s = Store.state.scopes;
    const ok = await scopeShareFile(scopeCSV(s.cases, s.staff), `GI-Hub-procedures-${fmtDate(getToday())}.csv`, "text/csv", "Procedure log");
    if (ok) showToast("Spreadsheet exported");
  } catch (e) { console.error(e); scopeErr = "Couldn't make the spreadsheet. Try again."; }
  route.keepScroll = true; render();
}
