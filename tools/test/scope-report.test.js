"use strict";
// The report: the PDF writer's structure, the report's content, and the exports.
const test = require("node:test");
const assert = require("node:assert/strict");
const {load, state} = require("./harness");

const STAFF = [{id: "sb", name: "Brook, Casey", aliases: [], hidden: false}];
const CASES = [
  {id: "1", d: "2026-07-22", staff: "sb", site: "hsc", loc: "suite", urg: "elective", procs: ["colo.dx"], reach: "hf", why: [], found: ["normal"], ts: "1"},
  {id: "2", d: "2026-08-26", staff: "sb", site: "stb", loc: "suite", urg: "elective", procs: ["colo.dx", "colo.poly"], reach: "cecum", why: ["surv"], found: ["polyp"], ts: "2"},
  {id: "3", d: "2026-09-10", staff: null, site: "grace", loc: "icu", urg: "urgent", procs: ["egd.dx", "egd.nv.clip"], why: ["melena"], found: ["du", "active"], ts: "3"},
  {id: "4", d: "2026-09-12", staff: "sb", procs: ["colo.dx"], reach: "ti", why: [], found: [], ts: "4"},
];
const withScopes = (cases, extra = {}) => state({}, {scopes: {cases, staff: STAFF, learned: [], lastReport: null, reportName: "Test Fellow", hintOff: null, ...extra}});
const latin1 = bytes => Buffer.from(bytes).toString("latin1");

function checkPdf(pdf) {
  assert.ok(pdf.startsWith("%PDF-1.4\n"));
  assert.ok(pdf.trimEnd().endsWith("%%EOF"));
  const xref = +/startxref\n(\d+)\n/.exec(pdf)[1];
  assert.ok(pdf.slice(xref).startsWith("xref\n"));
  const table = pdf.slice(xref).split("\n");
  const count = +table[1].split(" ")[1];
  for (let i = 1; i < count; i++) {
    const off = +table[2 + i].slice(0, 10);
    assert.ok(pdf.slice(off).startsWith(`${i} 0 obj`), "object " + i + " offset");
  }
  // Every stream's /Length matches its bytes.
  for (const m of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const start = m.index + m[0].length;
    assert.equal(pdf.slice(start + +m[1], start + +m[1] + 10), "\nendstream");
  }
  return pdf;
}

test("the PDF writer: structure, escaping and WinAnsi characters", () => {
  const h = load({today: "2026-09-28"});
  const pdf = latin1(h.val(`Array.from((() => { const d = PdfDoc({title: "T (x)"}); d.page(); d.text(10, 20, "A (b) \\\\ c – d · e"); d.rect(5, 5, 50, 20, {fill: "#0e8a7a", r: 4}); d.circle(30, 30, 5, {stroke: "#000000"}); d.page(); d.line(0, 0, 10, 10); return d.bytes(); })())`));
  checkPdf(pdf);
  assert.match(pdf, /\/Count 2/);
  assert.ok(pdf.includes("(A \\(b\\) \\\\ c \\226 d \\267 e) Tj"));
  assert.match(pdf, /\/Title \(T \\\(x\\\)\)/);
});

test("text widths follow Helvetica", () => {
  const h = load({today: "2026-09-28"});
  assert.equal(h.val(`pdfWidth("AB", 10)`), (667 + 667) / 100);
  assert.equal(h.val(`pdfWidth("AB", 10, true)`), (722 + 722) / 100);
  assert.equal(h.val(`pdfFit("Colonoscopy to HF · polypectomy", 10, false, 0, 60)`).endsWith("..."), true);
});

test("the report: three pages, the name, the period, the numbers and every case", () => {
  const h = load({today: "2026-09-28", state: withScopes(CASES)});
  const pdf = checkPdf(latin1(h.val(`Array.from(scopeReportPDF({...scopeReportOpts(), from: "2026-07-01", to: "2026-09-28", label: "Academic year"}))`)));
  assert.match(pdf, /\/Count 3/);
  for (const s of ["(Endoscopy logbook) Tj", "(Test Fellow) Tj", "(Colon depth) Tj", "(Totals) Tj", "(Reached the cecum) Tj", "(Therapeutics) Tj",
    "(Firsts) Tj", "(Breadth) Tj", "(Cases) Tj", "(Dr. Brook \\267 HSC) Tj", "(Page 3 of 3) Tj", "(Non-variceal hemostasis) Tj"])
    assert.ok(pdf.includes(s), s);
  assert.ok(pdf.includes("(4 procedures in this period, 3 of them colonoscopies. You reached the cecum yourself in 2 of your last 3) Tj"));
  assert.ok(pdf.includes("(colonoscopies \\(67%\\).) Tj"));
  assert.doesNotMatch(pdf, /—/);
});

test("an empty period still makes a valid report", () => {
  const h = load({today: "2026-09-28", state: withScopes([])});
  const pdf = checkPdf(latin1(h.val(`Array.from(scopeReportPDF(scopeReportOpts()))`)));
  assert.ok(pdf.includes("(No colonoscopies logged yet.) Tj"));
  assert.ok(pdf.includes("(No cases in this period.) Tj"));
});

test("many cases continue onto more pages", () => {
  const many = Array.from({length: 90}, (_, i) => ({id: "m" + i, d: "2026-09-" + String(1 + (i % 27)).padStart(2, "0"), staff: "sb", procs: ["egd.dx"], why: [], found: [], ts: String(i)}));
  const h = load({today: "2026-09-28", state: withScopes(many)});
  const pdf = checkPdf(latin1(h.val(`Array.from(scopeReportPDF({...scopeReportOpts(), from: "2026-09-01", to: "2026-09-28", label: "September"}))`)));
  assert.ok(+/\/Count (\d+)/.exec(pdf)[1] >= 4);
  assert.ok(pdf.includes("(Cases, continued) Tj"));
});

test("report periods", () => {
  const h = load({today: "2026-09-28", state: withScopes(CASES, {lastReport: "2026-09-01"})});
  const r = p => h.val(`scopeReportRange(${JSON.stringify(p)}, Store.state.scopes.cases, Store.state.scopes.lastReport, getToday())`);
  assert.deepEqual(r("since"), {from: "2026-09-01", to: "2026-09-28", label: "Since the last report"});
  assert.equal(r("block").from, "2026-09-24");
  assert.equal(r("year").from, "2026-07-01");
  assert.equal(r("all").from, "2026-07-22");
});

test("exporting the report and the spreadsheet hands files to the share sheet", async () => {
  const h = load({today: "2026-09-28", state: withScopes(CASES)});
  h.run(`globalThis.__shared = []; navigator.canShare = () => true; navigator.share = async o => { __shared.push(o.files[0]); };`);
  await h.run(`scopeExportReport()`);
  assert.equal(h.val(`__shared[0].name`), "GI-Hub-endoscopy-report-2026-09-28.pdf");
  assert.equal(h.val(`__shared[0].type`), "application/pdf");
  assert.equal(h.saved().scopes.lastReport, "2026-09-28");
  assert.match(h.val("toast.msg"), /Report exported/);
  await h.run(`scopeExportCSV()`);
  assert.equal(h.val(`__shared[1].name`), "GI-Hub-procedures-2026-09-28.csv");
  assert.match(h.val(`__shared[1].parts[0]`), /^﻿Date,Procedure/);
});

test("a cancelled share doesn't count as a report", async () => {
  const h = load({today: "2026-09-28", state: withScopes(CASES)});
  h.run(`navigator.canShare = () => true; navigator.share = async () => { const e = new Error("x"); e.name = "AbortError"; throw e; };`);
  await h.run(`scopeExportReport()`);
  assert.equal(h.saved().scopes.lastReport, null);
});
