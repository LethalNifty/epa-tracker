"use strict";
// GI Hub "Live view": what makes the app feel like a scope tower switched on.
// Each tab has its own imaging light, pages move like iOS pages, sheets stack
// over the page, the monitor keeps time and boots once per launch. Every piece
// checks for its browser feature first and otherwise does nothing, so the app
// (and the tests, which have no DOM) work without it.

// The light each page is seen in: NBI cyan, fluorescein for reading, white
// light for the library and call.
const LIVE_MODE = {week: "nbi", epas: "nbi", epa: "nbi", plan: "nbi", endo: "nbi", study: "flu", guides: "wli", call: "wli"};
const LIVE_DOC = typeof document !== "undefined" && document.documentElement && document.documentElement.style ? document : null;
const liveCalm = () => !!(typeof window !== "undefined" && window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

// ---- The last tap -------------------------------------------------------------------------
// Remembered so the EPA chip that was tapped can grow into its ring.
let liveLastTap = null;
function liveTap(act, el) { liveLastTap = el || null; }

// ---- Page moves ---------------------------------------------------------------------------
// Tabs cross-fade; opening an EPA or the call screen pushes in from the right
// and Back slides it away, as on iOS. The bar, the title bar and the light
// stay where they are; the bar's lens slides to the new tab.
const LIVE_DEEP = new Set(["epa", "call"]);
function liveKind(from, to) {
  if (LIVE_DEEP.has(to) && !LIVE_DEEP.has(from)) return "push";
  if (LIVE_DEEP.has(from) && !LIVE_DEEP.has(to)) return "pop";
  // Checklist and Year plan are two views of one tab: the segment slides.
  if ((NAV_HOME[from] || from) === (NAV_HOME[to] || to)) return "seg";
  return "fade";
}
// One element per page may carry a shared name, so it morphs into its
// counterpart on the next page: the open segment, or an EPA's code chip
// growing into its ring.
function liveName(el, name) { if (el && el.style) el.style.viewTransitionName = name; }
function liveHeroFrom(kind) {
  const t = liveLastTap;
  if (kind === "push" && t && t.isConnected && t.dataset.action === "open") return t.querySelector(".code, .cc") || t;
  if (kind === "pop") return document.querySelector(".epa-hero .dial-wrap");
  return null;
}
function liveHeroTo(kind, code) {
  if (kind === "push") return document.querySelector(".epa-hero .dial-wrap");
  const row = kind === "pop" && code ? document.querySelector(`[data-action="open"][data-code="${code}"]`) : null;
  if (row) return row.querySelector(".code, .cc") || row;
  return null;
}
let liveMoving = false;
function liveSwap(fn, kind) {
  if (!LIVE_DOC || !document.startViewTransition || liveCalm() || liveMoving) return fn();
  const root = document.documentElement, hero = document.querySelector(".epa-hero");
  const code = hero && hero.dataset ? hero.dataset.code : null;   // the EPA being left, on Back
  const from = liveHeroFrom(kind);
  liveName(from, "hero");
  if (kind === "seg") liveName(document.querySelector(".segtabs button.on"), "seg");
  root.dataset.vt = kind; liveMoving = true;
  let tr;
  const swap = () => {
    fn();
    const to = from ? liveHeroTo(kind, code) : null;
    if (to) liveName(to, "hero");
    if (kind === "seg") liveName(document.querySelector(".segtabs button.on"), "seg");
  };
  try { tr = document.startViewTransition(swap); } catch (e) { liveMoving = false; delete root.dataset.vt; liveName(from, ""); return fn(); }
  // The transition was the page's entrance, so its own fade-in must not start again afterwards.
  // A transition that never ends would leave its overlay taking every tap, so
  // one still running after 1.5 s is finished at once.
  const dog = setTimeout(() => { try { tr.skipTransition(); } catch (e) {} }, 1500);
  const done = () => { clearTimeout(dog); liveMoving = false; document.querySelectorAll("main.page.enter").forEach(m => m.classList.remove("enter")); delete root.dataset.vt; };
  tr.finished.then(done, done);
}

// ---- Sheets stack over the page --------------------------------------------------------------
// While a sheet is up the page sinks back behind it; when the sheet goes, a
// copy of it slides away so the close is as smooth as the open.
let liveStacked = false;
const liveStackNow = () => !!(sheet || studySheet || scopeSheet);
function liveStackClass() {
  const now = liveStackNow();
  return now ? (liveStacked ? " under" : " under sink") : liveStacked ? " rise" : "";
}
function liveBeforeSwap(app) {
  if (!LIVE_DOC || !app || !app.querySelectorAll) return;
  const now = liveStackNow();
  const root = document.documentElement;
  if (now && !liveStacked) { root.style.setProperty("--sy", Math.round(window.scrollY || 0) + "px"); liveLift(0); }
  if (!now && liveStacked && !liveCalm()) {
    const parts = app.querySelectorAll(":scope > .scrim, :scope > .sheet");
    if (parts.length) {
      const g = document.createElement("div");
      g.className = "sheetghost"; g.setAttribute("aria-hidden", "true");
      parts.forEach(p => g.appendChild(p.cloneNode(true)));
      document.body.appendChild(g);
      setTimeout(() => g.remove(), 420);
    }
  }
  root.classList.toggle("stacked", now);
}
function liveAfterSwap() {
  const was = liveStacked;
  liveStacked = liveStackNow();
  // Once the page has risen, the drag that started it is forgotten.
  if (was && !liveStacked) setTimeout(() => { if (!liveStacked) liveLift(0); }, 480);
}
// How far a dragged sheet has let the page come forward, 0 to 1.
function liveLift(p, ease) {
  if (!LIVE_DOC) return;
  const m = ease && document.querySelector("main.page.under");
  if (m) { m.style.transition = "transform .2s cubic-bezier(.2, .8, .2, 1)"; setTimeout(() => { m.style.transition = ""; }, 220); }
  document.documentElement.style.setProperty("--lift", Math.max(0, Math.min(1, p)).toFixed(3));
}

// ---- The title bar ----------------------------------------------------------------------
// Glass appears under the clock once the page scrolls, and the page's title
// settles into it when the big title has scrolled away. Tap it to go to the top.
let liveBar = null, liveTitleEnd = 0, liveScrollQueued = false;
function liveTopbar() {
  if (liveBar || !LIVE_DOC || !document.body) return liveBar;
  // The imaging light sits behind everything; it cross-fades between tabs.
  const amb = document.createElement("div");
  amb.className = "amb"; amb.setAttribute("aria-hidden", "true");
  document.body.insertBefore(amb, document.body.firstChild);
  liveBar = document.createElement("div");
  liveBar.className = "topbar";
  liveBar.innerHTML = `<button type="button" tabindex="-1" aria-hidden="true"><b></b></button>`;
  liveBar.firstChild.addEventListener("click", () => window.scrollTo({top: 0, behavior: liveCalm() ? "auto" : "smooth"}));
  document.body.appendChild(liveBar);
  window.addEventListener("scroll", () => {
    if (liveScrollQueued) return;
    liveScrollQueued = true;
    requestAnimationFrame(() => { liveScrollQueued = false; liveScrolled(); });
  }, {passive: true});
  return liveBar;
}
function liveScrolled() {
  const y = window.scrollY || 0, root = document.documentElement;
  root.classList.toggle("scrolled", y > 4);
  root.classList.toggle("titled", liveTitleEnd > 0 && y > liveTitleEnd);
}

// ---- The monitor's clock -----------------------------------------------------------------
// Like the time on a scope monitor's overlay; the colon breathes.
let liveClockTimer = null;
function liveClockText(now = new Date(callNow())) {
  const p = n => String(n).padStart(2, "0");
  return `${p(now.getHours())}<i>:</i>${p(now.getMinutes())}`;
}
function liveClock() {
  const el = document.querySelector("[data-clock]");
  if (el) el.innerHTML = liveClockText();
}

// ---- Ticks that changed light up ---------------------------------------------------------
// Coming back to Week after logging, the new tick ignites.
let liveDialWas = null;
function liveDial() {
  const ts = document.querySelectorAll(".monitor .dial .t");
  if (!ts.length) return;
  const now = Array.from(ts, t => t.classList.contains("lit") ? 2 : t.classList.contains("pend") ? 1 : 0);
  if (liveDialWas && liveDialWas.length === now.length && !liveCalm())
    now.forEach((v, i) => { if (v > liveDialWas[i]) ts[i].classList.add("ignite"); });
  liveDialWas = now;
}

// ---- After every draw ------------------------------------------------------------------------
function liveAfterRender(page) {
  if (!LIVE_DOC || !document.querySelector) return;
  const root = document.documentElement;
  root.dataset.mode = LIVE_MODE[page] || "nbi";
  // The bar shows the page's title, or a short name the page offers (an EPA).
  const bar = liveTopbar(), title = document.querySelector(".page [data-bar]") || document.querySelector(".page .title");
  if (bar) bar.querySelector("b").textContent = title ? title.dataset.bar || title.textContent : "";
  liveTitleEnd = title ? title.getBoundingClientRect().bottom + (window.scrollY || 0) - (bar ? bar.offsetHeight : 0) : 0;
  liveScrolled();
  liveClock();
  if (!liveClockTimer) liveClockTimer = setInterval(liveClock, 15000);
  if (page === "week") liveDial();
}
