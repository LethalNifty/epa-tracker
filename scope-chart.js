"use strict";
// GI Hub scope charts as scenes: plain lists of lines, dots, paths, bars and
// labels in a w x h box (y down). scope-view.js draws a scene as SVG for the
// Endo tab; scope-report.js draws the same scene into the PDF, so the app and
// the report show the same picture. Pure: no DOM.
// Classes (c): grid, goal, axis, lbl, lblhi, dot, dothi, last, trend, share,
// area, month, bar, barobs, min.

const SC_R = v => Math.round(v * 10) / 10;

// The colon as the fellow's scope travels it, in a 28 x 28 box, one path per
// landmark so a reach lights everything up to it. Patient's right on the left.
const SCOPE_COLON_SEGS = [
  ["sig", "M14.4 26.6V23.4C14.4 21 16.6 20.4 18.4 20.9C20.4 21.5 21.6 20.6 21.6 18.6"],
  ["desc", "M21.6 18.6V9.4"],
  ["sf", "M21.6 9.4C21.6 7.2 20.6 6 18.6 6"],
  ["tverse", "M18.6 6C16.2 6 15.6 8.8 13.6 8.8C11.6 8.8 11.4 6 9.4 6"],
  ["hf", "M9.4 6C7.4 6 6.4 7.2 6.4 9.4"],
  ["cecum", "M6.4 9.4V19.6C6.4 21.6 7.4 22.6 9 22.6C10.6 22.6 11.2 21.6 11.2 20.2"],
  ["ti", "M11.2 20.2C11.2 18.8 12.2 18.2 13.8 18.2"],
];
// Where the scope tip sits for each reach (the end of that segment).
const SCOPE_COLON_TIP = {sig: [21.6, 18.6], desc: [21.6, 9.4], sf: [18.6, 6], tverse: [9.4, 6], hf: [6.4, 9.4],
  cecum: [11.2, 20.2], ti: [13.8, 18.2]};
// Upper tract in the same box: esophagus, stomach, duodenal sweep.
const SCOPE_UPPER_SEGS = [
  ["esoph", "M12.6 2V10.4"],
  ["stomach", "M12.6 10.4C12.6 8.6 15.4 7.8 18 8.8C21.4 10.2 21.8 15 19.6 18.2C17.8 20.8 13.8 21.2 11.8 19.4C10.6 18.4 10.6 16.8 12 16.2"],
  ["duod", "M12 16.2C10.2 16.6 8.6 17.6 7.8 19.4C7 21.4 7.8 24 10.4 24.6C12.6 25.2 14.8 24.4 16 23.2"],
];
const SCOPE_BILIARY = "M9.6 21.8C10.4 18.6 11.4 15.4 13.6 12.6M13.6 12.6L11.8 9.4M13.6 12.6L16.2 10";

// Rolling median of the last k values (smooths the reach trend without
// inventing points).
function scMedian(vals, k) {
  return vals.map((_, i) => {
    const w = vals.slice(Math.max(0, i - k + 1), i + 1).slice().sort((a, b) => a - b);
    return w.length % 2 ? w[(w.length - 1) / 2] : (w[w.length / 2 - 1] + w[w.length / 2]) / 2;
  });
}
const SC_MON = d => MONTHS[+d.slice(5, 7) - 1];

// Colon depth: every colonoscopy the fellow drove, in case order, placed at its
// reach. The y axis is the colon straightened out, sigmoid at the bottom.
function scopeDepthScene(series, o = {}) {
  const w = o.w || 340, h = o.h || 200;
  const L = o.left || 46, R = o.right || 12, T = o.top || 10, B = o.bottom || 22;
  const iw = w - L - R, ih = h - T - B, n = series.length;
  const y = rank => T + (6 - rank) * ih / 6;
  const x = i => n <= 1 ? L + iw / 2 : L + (i - 1) / (n - 1) * iw;
  const items = [];
  SCOPE_REACH.forEach(([code, , short], rank) => {
    items.push({t: "line", x1: L, y1: SC_R(y(rank)), x2: w - R, y2: SC_R(y(rank)), c: code === "cecum" ? "goal" : "grid"});
    items.push({t: "text", x: L - 8, y: SC_R(y(rank)), s: short, c: rank >= 5 ? "lblhi" : "lbl", a: "end", size: 9.5, mono: true});
  });
  if (!n) return {w, h, items, empty: true};
  // Month marks where the month changes.
  let lastMon = "";
  for (const p of series) {
    const mon = p.d.slice(0, 7);
    if (mon !== lastMon) {
      const xx = x(p.i);
      if (lastMon) items.push({t: "line", x1: SC_R(xx), y1: T, x2: SC_R(xx), y2: T + ih, c: "month"});
      items.push({t: "text", x: SC_R(Math.min(Math.max(xx, L + 8), w - R - 8)), y: h - 6, s: SC_MON(p.d), c: "lbl", a: n <= 1 ? "middle" : "start", size: 9.5, mono: true});
      lastMon = mon;
    }
  }
  if (n >= 4) {
    const med = scMedian(series.map(p => p.rank), 5);
    items.push({t: "path", pts: series.map((p, k) => [SC_R(x(p.i)), SC_R(y(med[k]))]), c: "trend"});
  }
  const r = n > 80 ? 2.6 : n > 40 ? 3.2 : 4;
  series.forEach((p, k) => items.push({t: "dot", x: SC_R(x(p.i)), y: SC_R(y(p.rank)), r, c: p.rank >= 5 ? "dothi" : "dot",
    id: p.id, k, last: k === n - 1}));
  const lp = series[n - 1];
  items.push({t: "ring", x: SC_R(x(lp.i)), y: SC_R(y(lp.rank)), r: r + 4, c: "last"});
  return {w, h, items, n, x, y};
}

// Reached the cecum: the share of the last 20 colonoscopies, over case number.
function scopeShareScene(share, o = {}) {
  const w = o.w || 340, h = o.h || 132;
  const L = o.left || 34, R = o.right || 40, T = o.top || 10, B = o.bottom || 20;
  const iw = w - L - R, ih = h - T - B, n = share.length;
  const x = k => n <= 1 ? L + iw / 2 : L + k / (n - 1) * iw;
  const y = v => T + (100 - v) / 100 * ih;
  const items = [];
  for (const v of [0, 50, 100]) {
    items.push({t: "line", x1: L, y1: SC_R(y(v)), x2: w - R, y2: SC_R(y(v)), c: v === 0 ? "axis" : "grid"});
    items.push({t: "text", x: L - 7, y: SC_R(y(v)), s: v + "%", c: "lbl", a: "end", size: 9.5, mono: true});
  }
  if (!n) return {w, h, items, empty: true};
  const pts = share.map((p, k) => [SC_R(x(k)), SC_R(y(p.share))]);
  items.push({t: "area", pts: pts.concat([[pts[n - 1][0], SC_R(y(0))], [pts[0][0], SC_R(y(0))]]), c: "area"});
  items.push({t: "path", pts, c: "share"});
  const lp = pts[n - 1];
  items.push({t: "dot", x: lp[0], y: lp[1], r: 4, c: "dothi", last: true});
  items.push({t: "text", x: lp[0] + 9, y: lp[1], s: share[n - 1].share + "%", c: "lblhi", a: "start", size: 11, mono: true});
  items.push({t: "text", x: L, y: h - 5, s: "Case " + share[0].i, c: "lbl", a: "start", size: 9.5, mono: true});
  if (n > 1) items.push({t: "text", x: w - R, y: h - 5, s: "Case " + share[n - 1].i, c: "lbl", a: "end", size: 9.5, mono: true});
  return {w, h, items, n};
}

// Running totals by family over the dates logged (report page 2).
function scopeVolumeScene(cases, o = {}) {
  const w = o.w || 340, h = o.h || 150;
  const L = o.left || 34, R = o.right || 78, T = o.top || 10, B = o.bottom || 20;
  const iw = w - L - R, ih = h - T - B;
  const sorted = cases.slice().sort(scopeByDate), items = [];
  if (!sorted.length) return {w, h, items, empty: true};
  const d0 = new Date(sorted[0].d + "T12:00:00"), d1 = new Date(sorted[sorted.length - 1].d + "T12:00:00");
  const span = Math.max(1, Math.round((d1 - d0) / 86400000));
  const x = d => L + Math.round((new Date(d + "T12:00:00") - d0) / 86400000) / span * iw;
  const fams = [["egd", "Gastroscopy"], ["colo", "Colonoscopy"], ["rest", "Other"]];
  const runs = {egd: [], colo: [], rest: []}, cnt = {egd: 0, colo: 0, rest: 0};
  for (const c of sorted) {
    const f = scopeFams(c);
    if (f.includes("egd")) cnt.egd++;
    if (f.includes("colo")) cnt.colo++;
    if (f.some(x => !["egd", "colo"].includes(x))) cnt.rest++;
    for (const k in runs) runs[k].push([c.d, cnt[k]]);
  }
  const max = Math.max(4, cnt.egd, cnt.colo, cnt.rest), step = max <= 10 ? 2 : max <= 40 ? 10 : max <= 100 ? 25 : 50;
  const top = Math.ceil(max / step) * step, y = v => T + (1 - v / top) * ih;
  for (let v = 0; v <= top; v += step) {
    items.push({t: "line", x1: L, y1: SC_R(y(v)), x2: L + iw, y2: SC_R(y(v)), c: v ? "grid" : "axis"});
    items.push({t: "text", x: L - 7, y: SC_R(y(v)), s: String(v), c: "lbl", a: "end", size: 9, mono: true});
  }
  const labels = [];
  fams.forEach(([k, label], j) => {
    if (!cnt[k]) return;
    const pts = [[SC_R(L), SC_R(y(0))]];
    for (const [d, v] of runs[k]) { pts.push([SC_R(x(d)), pts[pts.length - 1][1]]); pts.push([SC_R(x(d)), SC_R(y(v))]); }
    items.push({t: "path", pts, c: "vol" + j});
    labels.push({y: y(cnt[k]), s: label + " " + cnt[k], j});
  });
  // Direct labels at the line ends, nudged apart so they never collide.
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 12) labels[i].y = labels[i - 1].y + 12;
  for (const l of labels) items.push({t: "text", x: L + iw + 6, y: SC_R(l.y), s: l.s, c: "vlbl" + l.j, a: "start", size: 9.5});
  items.push({t: "text", x: L, y: h - 5, s: SC_MON(sorted[0].d) + " " + +sorted[0].d.slice(8), c: "lbl", a: "start", size: 9, mono: true});
  items.push({t: "text", x: L + iw, y: h - 5, s: SC_MON(sorted[sorted.length - 1].d) + " " + +sorted[sorted.length - 1].d.slice(8), c: "lbl", a: "end", size: 9, mono: true});
  return {w, h, items};
}
