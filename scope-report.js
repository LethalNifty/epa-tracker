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
const RP = {ink: "#10262a", ink2: "#4a5f5c", faint: "#7c8f8c", rule: "#d5dfdd", wash: "#f1f6f5", teal: "#0e8a7a", tealWash: "#e2f3f0",
  indigo: "#4c5fd5", brown: "#b5702f", brownWash: "#f6ebe0", grid: "#e3eae8", dotLo: "#97aaa7", urgent: "#c9503f"};
const RP_SERIES = [RP.teal, RP.indigo, RP.brown];

// Draws a chart scene from scope-chart.js at (ox, oy).
function pdfScene(doc, sc, ox, oy) {
  const X = v => ox + v, Y = v => oy + v;
  for (const it of sc.items) {
    const c = it.c;
    if (it.t === "line") {
      const st = {grid: [RP.grid, .6], goal: [RP.teal, .8, [2.2, 2]], axis: ["#b7c6c3", .7], month: ["#edf2f1", .6], mark: [RP.brown, .8, [2, 2]]}[c] || [RP.grid, .6];
      doc.line(X(it.x1), Y(it.y1), X(it.x2), Y(it.y2), {stroke: st[0], lw: st[1], dash: st[2]});
    } else if (it.t === "path") {
      const col = c === "trend" ? "#8fcfc4" : c === "share" ? RP.teal : /^vol(\d)$/.test(c) ? RP_SERIES[+c.slice(3)] : RP.teal;
      doc.poly(it.pts.map(p => [X(p[0]), Y(p[1])]), {stroke: col, lw: c === "trend" ? 2.4 : 1.5});
    } else if (it.t === "area") doc.poly(it.pts.map(p => [X(p[0]), Y(p[1])]), {fill: RP.tealWash, close: true});
    else if (it.t === "dot") doc.circle(X(it.x), Y(it.y), it.r * .8, {fill: c === "dothi" ? RP.teal : RP.dotLo, stroke: "#ffffff", lw: .9});
    else if (it.t === "ring") doc.circle(X(it.x), Y(it.y), it.r * .8, {stroke: RP.teal, lw: .8});
    else if (it.t === "text") {
      const vl = /^vlbl(\d)$/.exec(c);
      const size = (it.size || 9) * .82, color = c === "lblhi" ? RP.teal : vl ? RP.ink : c === "mark" ? RP.brown : RP.faint;
      let x = X(it.x);
      if (vl) { doc.line(x, Y(it.y), x + 8, Y(it.y), {stroke: RP_SERIES[+vl[1]], lw: 2, cap: true}); x += 11; }
      doc.text(x, Y(it.y) + size * .35, it.s, {size, bold: !!it.mono || !!vl, color, align: it.a === "end" ? "right" : it.a === "middle" ? "center" : "left", spacing: it.mono ? .3 : 0});
    }
  }
}
// The GI Hub mark: a ring of ticks, some lit.
function pdfMark(doc, cx, cy, r) {
  const n = 44, lit = 17;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i + .5) * 2 * Math.PI / n, on = i < lit, r1 = on ? r * .8 : r * .86;
    doc.line(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a), cx + r * Math.cos(a), cy + r * Math.sin(a), {stroke: on ? RP.teal : "#c4d2cf", lw: on ? .9 : .7, cap: true});
  }
  doc.circle(cx, cy, r * .15, {fill: RP.teal});
}

// ---- The report ---------------------------------------------------------------------------------
const rpDate = iso => { const d = new Date(iso + "T12:00:00"); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
function scopeReportRange(period, cases, lastReport, today) {
  const t = fmtDate(today), first = cases.length ? cases.slice().sort(scopeByDate)[0].d : t, blk = blockFor(today);
  if (period === "block" && blk) return {from: fmtDate(blockStart(blk.num)), to: t, label: `Block ${blk.num} (${blk.name})`};
  if (period === "year") return {from: "2026-07-01", to: t, label: "Academic year 2026 to 2027"};
  if (period === "since" && lastReport) return {from: lastReport, to: t, label: "Since the last report"};
  return {from: first < t ? first : t, to: t, label: period === "since" ? "Since logging began" : "All cases"};
}
// opts: {cases, staff, from, to, label, name, today, items, lineVal, lastReport}
function scopeReportPDF(o) {
  const doc = PdfDoc({title: "Endoscopy logbook" + (o.name ? " · " + o.name : "")});
  const M = 48, CW = doc.W - 2 * M, all = o.cases.slice().sort(scopeByDate);
  const inP = all.filter(c => c.d >= o.from && c.d <= o.to), upTo = all.filter(c => c.d <= o.to);
  const tP = scopeTotals(all, o.from, o.to), tY = scopeTotals(all, "2026-07-01", o.to), tA = scopeTotals(upTo);
  const series = scopeReachSeries(upTo), last20 = series.slice(-20), cec = last20.filter(x => x.rank >= 5).length;
  const therapy = scopeTherapy(upTo, o.items, o.lineVal), therapyP = scopeTherapy(inP, o.items, o.lineVal);
  const staffName = id => { const p = (o.staff || []).find(x => x.id === id); return p ? "Dr. " + String(p.name).split(",")[0].trim() : ""; };
  const section = (y, title, note) => {
    doc.text(M, y, title, {size: 12.5, bold: true});
    if (note) doc.text(M + CW, y, note, {size: 8, color: RP.faint, align: "right"});
    doc.line(M, y + 6, M + CW, y + 6, {stroke: RP.rule, lw: .6});
    return y + 22;
  };
  const header = sub => {
    doc.page();
    pdfMark(doc, M + 9, 50, 9);
    doc.text(M + 24, 54, "GI Hub", {size: 10, bold: true});
    doc.text(M + 62, 54, "Procedure logbook", {size: 10, color: RP.faint});
    doc.text(M + CW, 54, sub, {size: 9, color: RP.faint, align: "right"});
    doc.line(M, 68, M + CW, 68, {stroke: RP.rule, lw: .6});
  };

  // Page 1: who, when, the headline numbers, the colon depth, the totals.
  header(`${rpDate(o.from)} to ${rpDate(o.to)}`);
  let y = 104;
  doc.text(M, y, "Endoscopy logbook", {size: 24, bold: true});
  y += 22;
  doc.text(M, y, o.name || "Gastroenterology fellow", {size: 12.5, color: RP.ink2});
  y += 16;
  doc.text(M, y, `${o.label} · ${rpDate(o.from)} to ${rpDate(o.to)} · generated ${rpDate(fmtDate(o.today))}`, {size: 9, color: RP.faint});
  y += 22;
  // The change since the last report, in one sentence.
  const ch = scopeChange(upTo, o.from);
  let sentence = `${tP.procs} procedure${tP.procs === 1 ? "" : "s"} in this period, ${tP.colo} of them colonoscop${tP.colo === 1 ? "y" : "ies"}.`;
  if (ch.shareNow !== null) sentence += ` You reached the cecum yourself in ${cec} of your last ${last20.length} colonoscop${last20.length === 1 ? "y" : "ies"} (${ch.shareNow}%)` +
    (ch.shareThen !== null && ch.shareThen !== ch.shareNow ? `, ${ch.shareNow > ch.shareThen ? "up" : "down"} from ${ch.shareThen}% at the start of the period.` : ".");
  const lines = pdfWrap(sentence, 10.5, false, CW - 28);
  doc.rect(M, y, CW, 16 + lines.length * 15, {fill: RP.wash, r: 6});
  doc.rect(M, y, 3, 16 + lines.length * 15, {fill: RP.teal});
  lines.forEach((ln, i) => doc.text(M + 16, y + 20 + i * 15, ln, {size: 10.5, color: RP.ink}));
  y += 30 + lines.length * 15;
  // Headline tiles.
  const nTx = inP.filter(c => scopeC8(c).size).length;
  const tiles = [[String(tP.procs), "Procedures", "this period"], [String(tP.colo), "Colonoscopies", "this period"],
    [last20.length ? `${Math.round(cec / last20.length * 100)}%` : "–", "Reached the cecum", last20.length ? `last ${last20.length}, yourself` : "no colonoscopies yet"],
    [String(nTx), "Therapeutic cases", "this period"]];
  const tw = (CW - 3 * 10) / 4;
  tiles.forEach(([v, l, s], i) => {
    const x = M + i * (tw + 10);
    doc.rect(x, y, tw, 62, {stroke: RP.rule, lw: .7, r: 6});
    doc.text(x + 12, y + 30, v, {size: 22, bold: true, color: i === 2 ? RP.teal : RP.ink});
    doc.text(x + 12, y + 44, l, {size: 8.5, bold: true, color: RP.ink2});
    doc.text(x + 12, y + 55, s, {size: 7.5, color: RP.faint, maxW: tw - 20});
  });
  y += 84;
  y = section(y, "Colon depth", "Every colonoscopy you drove, placed at how far you got");
  const firstIn = series.find(x => x.d >= o.from);
  const depth = scopeDepthScene(series, {w: CW, h: 196, left: 58, right: 12, top: 6, bottom: 20});
  if (firstIn && firstIn.i > 1 && depth.x) {
    const xx = depth.x(firstIn.i) - (series.length > 1 ? (depth.x(2) - depth.x(1)) / 2 : 0);
    depth.items.push({t: "line", x1: xx, y1: 2, x2: xx, y2: 196 - 20, c: "mark"});
    depth.items.push({t: "text", x: xx + 4, y: 8, s: "This period", c: "mark", a: "start", size: 9});
  }
  if (series.length) pdfScene(doc, depth, M, y);
  else { doc.rect(M, y, CW, 60, {fill: RP.wash, r: 6}); doc.text(M + CW / 2, y + 34, "No colonoscopies logged yet.", {size: 10, color: RP.faint, align: "center"}); }
  y += series.length ? 206 : 74;
  if (series.length) {
    doc.circle(M + 62, y - 2, 3, {fill: RP.teal}); doc.text(M + 69, y + 1, "Cecum or terminal ileum", {size: 8, color: RP.ink2});
    doc.circle(M + 180, y - 2, 3, {fill: RP.dotLo}); doc.text(M + 187, y + 1, "Before the cecum", {size: 8, color: RP.ink2});
    doc.line(M + 272, y - 2, M + 286, y - 2, {stroke: "#8fcfc4", lw: 2.4, cap: true}); doc.text(M + 290, y + 1, "Trend (median of 5)", {size: 8, color: RP.ink2});
    y += 20;
  }
  y = section(y, "Totals", "Procedures by type");
  const cols = [["This period", tP], ["Year to date", tY], ["All time", tA]];
  const cx = [M + 250, M + 340, M + 430];
  cols.forEach(([l], i) => doc.text(cx[i] + 60, y, l, {size: 8, bold: true, color: RP.faint, align: "right", spacing: .2}));
  y += 14;
  const fams = SCOPE_FAMS.filter(([f]) => tA[f] > 0 || ["egd", "colo"].includes(f));
  for (const [f, label] of fams) {
    doc.line(M, y - 10, M + CW, y - 10, {stroke: RP.grid, lw: .5});
    doc.text(M, y, label, {size: 10});
    cols.forEach(([, t], i) => doc.text(cx[i] + 60, y, String(t[f]), {size: 10, align: "right"}));
    y += 17;
  }
  doc.line(M, y - 10, M + CW, y - 10, {stroke: RP.ink2, lw: .7});
  doc.text(M, y + 1, "All procedures", {size: 10, bold: true});
  cols.forEach(([, t], i) => doc.text(cx[i] + 60, y + 1, String(t.procs), {size: 10, bold: true, align: "right"}));

  // Page 2: the cecum share, volume, therapeutics, firsts.
  header("Progress");
  y = 100;
  y = section(y, "Reached the cecum", "Share of your previous 20 colonoscopies, case by case");
  if (series.length >= 3) { pdfScene(doc, scopeShareScene(scopeCecumShare(series, 20), {w: CW, h: 130, left: 40, right: 46}), M, y); y += 142; }
  else { doc.text(M, y + 4, "Shown once three colonoscopies are logged.", {size: 9.5, color: RP.faint}); y += 24; }
  y = section(y, "Volume", "Running totals since logging began");
  if (upTo.length) { pdfScene(doc, scopeVolumeScene(upTo, {w: CW, h: 150, left: 34, right: 110}), M, y); y += 162; }
  y = section(y, "Therapeutics", "Against the C8 case-mix minimums");
  doc.text(M + 218, y, "Period", {size: 8, bold: true, color: RP.faint, align: "right"});
  doc.text(M + 272, y, "All", {size: 8, bold: true, color: RP.faint, align: "right"});
  doc.text(M + 300, y, "Observed of minimum", {size: 8, bold: true, color: RP.faint});
  y += 14;
  therapy.forEach((r, k) => {
    doc.line(M, y - 10, M + CW, y - 10, {stroke: RP.grid, lw: .5});
    doc.text(M, y, r.label, {size: 9.5});
    doc.text(M + 218, y, String(therapyP[k].done), {size: 9.5, align: "right"});
    doc.text(M + 272, y, String(r.done), {size: 9.5, bold: true, align: "right"});
    const bw = 150, cell = bw / r.min;
    for (let j = 0; j < r.min; j++) doc.rect(M + 300 + j * cell, y - 7, cell - 1.6, 7, {fill: j < r.observed ? RP.teal : j < r.done ? RP.tealWash : "#eef2f1"});
    doc.text(M + 300 + bw + 10, y, `${r.observed}/${r.min}`, {size: 8.5, color: RP.ink2});
    y += 16;
  });
  y += 2;
  y = doc.para(M, y + 4, "Done counts logged cases. The bar fills pale for cases done and solid for observations ticked on the C8 checklist for Entrada.", {size: 8, color: RP.faint, maxW: CW});
  y += 10;
  const firsts = scopeFirsts(upTo);
  if (firsts.length && y < 700) {
    y = section(y, "Firsts", `${firsts.length} so far`);
    const colW = CW / 2;
    firsts.forEach((f, i) => {
      const x = M + (i % 2) * colW, yy = y + Math.floor(i / 2) * 15;
      if (yy > 740) return;
      doc.text(x, yy, rpDate(f.d), {size: 8.5, bold: true, color: f.d >= o.from ? RP.teal : RP.faint});
      doc.text(x + 66, yy, f.label, {size: 9, maxW: colW - 72});
    });
  }

  // Page 3: breadth, then every case in the period.
  header("Breadth and cases");
  y = 100;
  const b = scopeBreadth(all, o.from, o.to, o.staff);
  y = section(y, "Breadth", `The ${b.n} case${b.n === 1 ? "" : "s"} in this period`);
  const bars = (x, yy, w, title, rows) => {
    doc.text(x, yy, title, {size: 8, bold: true, color: RP.faint, spacing: .3});
    yy += 14;
    const max = Math.max(1, ...rows.map(r => r.n));
    for (const r of rows) {
      doc.text(x, yy, r.label, {size: 9, maxW: 92});
      doc.rect(x + 98, yy - 7, Math.max(2, (w - 130) * r.n / max), 7, {fill: r.label === "Not recorded" ? "#dbe3e1" : RP.teal, r: 1.5});
      doc.text(x + w, yy, String(r.n), {size: 9, align: "right"});
      yy += 15;
    }
    return yy;
  };
  const staffRows = b.staff.slice(0, 12).map(r => ({label: r.id === "none" ? "Not recorded" : "Dr. " + String(r.name).split(",")[0].trim(), n: r.n}));
  const mapRows = (obj, list) => list.map(([k, l]) => ({label: l, n: obj[k] || 0})).filter(r => r.n).concat(obj.none ? [{label: "Not recorded", n: obj.none}] : []);
  const yL = bars(M, y, CW / 2 - 16, "STAFF", staffRows.length ? staffRows : [{label: "Not recorded", n: 0}]);
  let yR = bars(M + CW / 2 + 16, y, CW / 2 - 16, "SITE", mapRows(b.site, SCOPE_SITES.map(x => [x[0], x[1]])));
  yR = bars(M + CW / 2 + 16, yR + 8, CW / 2 - 16, "SETTING", mapRows(b.loc, SCOPE_LOCS.map(x => [x[0], x[2] === "Suite" ? "Endoscopy suite" : x[2]]))
    .concat(mapRows(b.urg, [["urgent", "Urgent"], ["elective", "Elective"]]).filter(r => r.label !== "Not recorded")));
  y = Math.max(yL, yR) + 14;
  // The cases.
  const colX = [M, M + 58, M + 238, M + 296, M + 408, M + CW];
  const head = yy => {
    ["Date", "Procedure", "How far", "Why / found", "Staff · site"].forEach((h, i) => doc.text(colX[i], yy, h, {size: 7.5, bold: true, color: RP.faint, spacing: .2}));
    doc.line(M, yy + 5, M + CW, yy + 5, {stroke: RP.rule, lw: .6});
    return yy + 17;
  };
  y = section(y, "Cases", `${inP.length} in this period`);
  y = head(y);
  if (!inP.length) doc.text(M, y, "No cases in this period.", {size: 9, color: RP.faint});
  for (const c of inP) {
    if (y > 742) { header("Cases, continued"); y = head(100); }
    const why = (c.why || []).map(scopeWhyLabel).concat((c.found || []).map(scopeFoundLabel)).join(", ");
    const who = [staffName(c.staff), scopeSiteShortR(c.site), c.urg === "urgent" ? "urgent" : ""].filter(Boolean).join(" · ");
    doc.text(colX[0], y, rpDate(c.d).replace(/ \d{4}$/, ""), {size: 8.5, color: RP.ink2});
    doc.text(colX[1], y, scopeSummary(c), {size: 8.5, maxW: colX[2] - colX[1] - 8});
    doc.text(colX[2], y, scopeHasBase(c) && c.reach ? scopeReachShort(c.reach) : "", {size: 8.5, bold: scopeRank(c.reach) >= 5, color: scopeRank(c.reach) >= 5 ? RP.teal : RP.ink});
    doc.text(colX[3], y, why, {size: 8.5, color: RP.ink2, maxW: colX[4] - colX[3] - 8});
    doc.text(colX[4], y, who, {size: 8.5, color: RP.ink2, maxW: colX[5] - colX[4]});
    doc.line(M, y + 5, M + CW, y + 5, {stroke: "#eef2f1", lw: .5});
    y += 15.5;
  }
  // Footers, now that the page count is known.
  const n = doc.pages.length;
  doc.pages.forEach((p, i) => {
    const text = (x, yy, s, al) => p.push(`BT /F1 7.5 Tf ${pdfRGB(RP.faint)} rg 0 Tc 1 0 0 1 ${pdfN(al === "right" ? x - pdfWidth(s, 7.5) : x)} ${pdfN(doc.H - yy)} Tm ${pdfStr(s)} Tj ET`);
    p.push(`${pdfRGB(RP.rule)} RG 0.6 w [] 0 d ${M} ${pdfN(doc.H - 758)} m ${M + CW} ${pdfN(doc.H - 758)} l S`);
    text(M, 770, "Logged in GI Hub by the fellow. No patient identifiers are recorded.");
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
    items: PART_BY_ID.c8a ? PART_BY_ID.c8a.items : [], lineVal: id => Store.lineVal(id), lastReport: s.lastReport};
}
async function scopeExportReport() {
  scopeErr = null;
  try {
    const bytes = scopeReportPDF(scopeReportOpts());
    const ok = await scopeShareFile(bytes, `GI-Hub-endoscopy-report-${fmtDate(getToday())}.pdf`, "application/pdf", "Endoscopy logbook");
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
