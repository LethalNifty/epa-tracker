"use strict";
// Builds studyq.json, the encrypted question file the Study tab opens.
//   node tools/studyq/build.js [--src <dir>] [--password <file>] [--out <file>]
// The questions (b4.json, b5.json, ...) and the password live outside this
// public repository, in the fellow's Drive; only the ciphertext is committed.
// Every question is checked against the reading plan in study.js first.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..", "..");
const DRIVE = path.join(process.env.USERPROFILE || process.env.HOME || "", "My Drive", "Fellowship", "GI Hub");
const ITER = 210000;

// The plan's items, read from study.js itself so the two never disagree.
function planItems() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "study.js"), "utf8") + "\n;this.__items = STUDY_BY_ID;", ctx);
  return ctx.__items;
}

// Problems with a list of questions, as readable lines; empty when all is well.
function validate(questions, items) {
  const bad = [], seen = new Set();
  questions.forEach((x, n) => {
    const at = `#${n + 1}${x && x.id ? " (" + x.id + ")" : ""}`;
    if (!x || typeof x !== "object") { bad.push(`${at}: not a question`); return; }
    if (!x.id || typeof x.id !== "string") bad.push(`${at}: needs an id`);
    else if (seen.has(x.id)) bad.push(`${at}: duplicate id`);
    else seen.add(x.id);
    const it = items[x.item];
    if (!it) bad.push(`${at}: unknown item "${x.item}"`);
    else if (!Number.isInteger(x.page) || x.page < it.p[0] || x.page > it.p[1]) bad.push(`${at}: page ${x.page} is outside ${x.item} (pp. ${it.p[0]}-${it.p[1]})`);
    if (!x.q || typeof x.q !== "string") bad.push(`${at}: needs question text`);
    if (!Array.isArray(x.a) || !x.a.length || x.a.some(a => typeof a !== "string" || !a.trim())) bad.push(`${at}: needs model answer points`);
    if (x.marks !== undefined && !(typeof x.marks === "number" && x.marks > 0)) bad.push(`${at}: marks must be a positive number`);
    if (/—/.test(JSON.stringify(x))) bad.push(`${at}: contains an em-dash`);
  });
  return bad;
}

function encrypt(payload, password, opts = {}) {
  const salt = opts.salt || crypto.randomBytes(16), iv = opts.iv || crypto.randomBytes(12), iter = opts.iter || ITER;
  const key = crypto.pbkdf2Sync(password, salt, iter, 32, "sha256");
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(payload), "utf8"), c.final(), c.getAuthTag()]);
  return {v: 1, kdf: "PBKDF2-SHA256", iter, salt: salt.toString("base64"), iv: iv.toString("base64"), ct: ct.toString("base64")};
}

function readQuestions(dir) {
  const files = fs.readdirSync(dir).filter(f => /^b\d+\.json$/.test(f)).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
  return files.flatMap(f => {
    const list = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (!Array.isArray(list)) throw new Error(f + " should hold a list of questions");
    return list;
  });
}

function main(argv) {
  const arg = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const src = arg("--src") || path.join(DRIVE, "questions");
  const pwFile = arg("--password") || path.join(DRIVE, "study-password.txt");
  const out = arg("--out") || path.join(ROOT, "studyq.json");
  const password = fs.readFileSync(pwFile, "utf8").trim();
  if (password.length < 12) throw new Error("The study password should be at least 12 characters.");
  const questions = readQuestions(src), bad = validate(questions, planItems());
  if (bad.length) { console.error(bad.join("\n")); process.exitCode = 1; return; }
  fs.writeFileSync(out, JSON.stringify(encrypt({v: 1, made: new Date().toISOString().slice(0, 10), q: questions}, password)) + "\n");
  console.log(`Wrote ${path.basename(out)}: ${questions.length} questions, encrypted.`);
}

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = {validate, encrypt, planItems, readQuestions, ITER};
