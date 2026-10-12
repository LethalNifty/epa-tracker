"use strict";
// GI Hub search: one way to match, rank and light up words, shared by every
// search box (guidelines, landmark trials, IBD drugs, biopsy protocols and
// pearls). Loaded before the feature files, which build their word lists with it.

// Lower case, accents and punctuation off: "H. pylori" finds "h pylori",
// "Crohn's" finds "crohns".
function searchNorm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
const searchWords = q => searchNorm(q).split(" ").filter(Boolean);
// Text ready to search, padded so a word's start is found as " " + word.
const searchHay = s => " " + searchNorm(s) + " ";

// Every word must match somewhere. fields(item) gives [hay, weight] pairs; a
// word scores the weight of the best field it is in, doubled at the start of a
// word. opts.bonus(item, words) adds to an item's score. Best first, ties in
// list order; with opts.keep, matches stay in list order.
function searchScored(list, q, fields, opts = {}) {
  const words = searchWords(q);
  if (!words.length) return list.map((item, i) => ({item, score: 0, i}));
  const out = [];
  list.forEach((item, i) => {
    const fs = fields(item);
    let score = 0;
    for (const w of words) {
      let best = 0;
      for (const [hay, weight] of fs) best = Math.max(best, hay.includes(" " + w) ? weight * 2 : hay.includes(w) ? weight : 0);
      if (!best) return;
      score += best;
    }
    out.push({item, score: score + (opts.bonus ? opts.bonus(item, words) : 0), i});
  });
  return opts.keep ? out : out.sort((a, b) => b.score - a.score || a.i - b.i);
}
const searchFind = (list, q, fields, opts) => searchScored(list, q, fields, opts).map(x => x.item);

// The search words lit in a piece of HTML, never inside a tag. One-letter
// words stay dark, or every "a" would light up.
function searchHi(html, q) {
  const words = searchWords(q).filter(w => w.length > 1);
  if (!words.length) return html;
  const re = new RegExp("(" + words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?![^<]*>)", "ig");
  return html.replace(re, "<mark>$1</mark>");
}
