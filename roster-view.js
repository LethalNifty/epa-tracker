"use strict";
// GI Hub's call roster on screen: the Claude added row for a shared call
// schedule or swap, the check before Call changes (a new block, a revised
// sheet, a swap), and a sheet's picture full screen. The roster itself is
// roster.js. Owner only: the fellows' edition leaves this file out. Loaded
// after agenda-view.js; uses roster.js, tell.js, call.js and app.js helpers
// when it runs.

// ---- Words -----------------------------------------------------------------------------------------
const rosterN = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const rosterShort = iso => { const d = agDate(iso); return `${DAYS[d.getDay()]} ${d.getDate()}`; };   // "Thu 19"
const rosterBold = t => esc(t).replace(/^(\d+)/, "<b>$1</b>");
const ROSTER_ROLE = {fellows: "fellows", fellow: "fellow", res: "residents", att: "attending", tpn: "TPN consults"};

// What a waiting check would do: the days after it, its dates, your shifts in
// them, and whether it changes days already here (a revised sheet, a swap).
function rosterPlan(r) {
  const st = RosterStore.state, next = rosterNextDays(r), span = rosterSpan(r);
  const inSheet = x => r.kind === "call" && r.sheets.some(sh => x.site === sh.site && x.d >= sh.from && x.d <= sh.to);
  const notes = r.kind === "call" ? st.notes.filter(x => !inSheet(x)).concat(r.notes) : st.notes;
  const lo = span[0].d, hi = span[span.length - 1].d, mine = rosterShifts(next, st.me, lo, hi, notes);
  const over = r.kind === "callswap" || span.some(({d, sites}) => sites.some(k => st.days[d] && st.days[d][k]));
  return {next, span, lo, hi, mine, nights: mine.filter(x => x.uid.endsWith("-n")).length, over};
}
// "5 nights for you", or what's true when there are none.
const rosterForYou = pl => pl.nights ? rosterN(pl.nights, "night") + " for you" :
  pl.mine.length ? rosterN(pl.mine.length, "day shift") + " for you" : "No nights for you";
function rosterChanges(r) {
  const x = rosterDiff(r), n = x.now.length + x.gone.length;
  return {x, mine: n ? rosterN(n, "change") + " for you" : "No changes for you"};
}
// "28 days at both sites", or each site's own.
function rosterDaysAt(pl) {
  const n = ROSTER_SITES.map(k => [k, pl.span.filter(x => x.sites.includes(k)).length]).filter(x => x[1]);
  if (n.length === 1) return `${rosterN(n[0][1], "day")} at ${ROSTER_SITE[n[0][0]]}`;
  return n[0][1] === n[1][1] ? `${rosterN(n[0][1], "day")} at both sites` : `${rosterN(n[0][1], "day")} at HSC, ${n[1][1]} at St. Boniface`;
}
function rosterWhat(r, pl) {
  if (r.kind === "call") return `${pl.over ? "Revised call schedule" : "Call schedule"}, ${rosterDay(pl.lo)} to ${rosterDay(pl.hi)}`;
  const ds = [...new Set(r.slots.map(x => x.d))].sort();
  return ds.length === 1 ? `Call swap on ${rosterDay(ds[0])}` : ds.length === 2 ? `Call swap on ${rosterDay(ds[0])} and ${rosterDay(ds[1])}` :
    `Call swap, ${ds.length} days from ${rosterDay(ds[0])}`;
}
// Every fellow on these days, as the sheets write them: the names to pick from.
function rosterFellows(days, span) {
  const out = [];
  for (const {d} of span) for (const k of ROSTER_SITES) {
    const t = days[d] && days[d][k];
    if (t) for (const n of [...t.day.fellows, ...(t.day.tpn || []), t.night.fellow]) if (n && !out.some(x => rosterSame(x, n))) out.push(n);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

// ---- The row on Week's Claude added card ----------------------------------------------------------
// Waiting: what it is, what it means for you, and Check. Added: what it did,
// with Undo while what it replaced is kept. A check cleared away, or a change
// undone along with an earlier one, has nothing left to say.
function rosterRowHTML(e) {
  const st = RosterStore.state, p = st.pend[e.call];
  if (p) {
    const pl = rosterPlan(p.r), sub = !st.me ? "" : pl.over ? rosterChanges(p.r).mine : rosterForYou(pl);
    return `<div class="tellrow"><div class="tellwhat"><b>${esc(rosterWhat(p.r, pl))}</b>${sub ? `<span class="tellchk mono">${esc(sub)}</span>` : ""}</div>` +
      `<div class="tella"><button class="pick ghost" data-action="rostcheck" data-id="${esc(e.call)}">Check</button></div></div>`;
  }
  const u = e.undo && e.undo.roster;
  if (!u || !st.undo[u]) return "";
  return `<div class="tellrow"><div class="tellwhat"><b>${esc(e.line)}</b></div>` +
    `<div class="tella"><button class="textbtn" data-action="telundo" data-id="${esc(e.id)}">Undo</button></div></div>`;
}

// ---- The check ----------------------------------------------------------------------------------------
const rosterYou = (n, me) => rosterSame(n, me) ? `<span class="tag wli">You</span>` : n ? esc(n) : `<span class="none">None</span>`;
// A stretch of shifts as Call shows it, with a tag on its title.
function rosterStretchHTML(s, tag) {
  return `<article class="cst"><div class="cst-top mono"><span>${callDay(s.s)}${s.e - s.s > 16 * HOUR_MS ? " → " + callDay(s.e) : ""}</span>` +
    `<span>${callHours(s.s, s.e)} h</span></div><h3><span>${callTitle(s)}</span>${tag || ""}</h3>` +
    s.segs.map(x => callSegHTML(x, s.segs.length > 1)).join("") + `</article>`;
}
function rosterAskHTML(pl) {
  return `<section class="sec"><div class="sec-head"><h2>Which one is you?</h2></div><div class="card pad">` +
    `<p class="rost-note">Your name as the sheets write it. GI Hub keeps it on this phone for every block.</p><div class="pickrow">` +
    rosterFellows(pl.next, pl.span).map(n => `<button class="pick ghost" data-action="rostme" data-name="${esc(n)}">${esc(n)}</button>`).join("") +
    `</div></div></section>`;
}
function rosterYoursHTML(pl, me) {
  const list = callStretches(pl.mine);
  return `<section class="sec"><div class="sec-head"><h2>Your shifts</h2><span class="mono">${rosterDay(pl.lo)} to ${rosterDay(pl.hi)}</span></div>` +
    (list.length ? list.map(s => rosterStretchHTML(s)).join("") : `<div class="card pad"><p class="rost-note">No shifts for you on these sheets.</p></div>`) +
    `<button class="textbtn rost-me" data-action="rostme" data-name="">Not ${esc(me)}?</button></section>`;
}
function rosterLookHTML(lines) {
  return lines.length ? `<section class="sec"><div class="sec-head"><h2>Worth a look</h2></div><div class="card pad rost-look">` +
    lines.map(t => `<p>${esc(t)}</p>`).join("") + `</div></section>` : "";
}
// Each night: its fellow (St. Boniface's too when it differs) and both attendings.
function rosterNightsHTML(pl, me) {
  const rows = route.rostAll ? pl.span : pl.span.slice(0, 7);
  const cell = ({d}) => {
    const x = pl.next[d] || {}, a = x.hsc ? x.hsc.night.fellow : "", b = x.stb ? x.stb.night.fellow : "";
    const other = x.hsc && x.stb && !rosterSame(a, b) ? `<i class="rost-gap mono">St B: ${b ? esc(b) : "none"}</i>` : "";
    return `<span class="rost-d">${rosterShort(d)}</span><span>${rosterYou(x.hsc ? a : b, me)}${other}</span>` +
      `<span>${x.hsc ? esc(x.hsc.night.att) : ""}</span><span>${x.stb ? esc(x.stb.night.att) : ""}</span>`;
  };
  return `<section class="sec"><div class="sec-head"><h2>Every night</h2><span class="mono">Day teams read too</span></div><div class="card pad">` +
    `<div class="rost-grid"><span class="h">Night</span><span class="h">Fellow</span><span class="h">HSC</span><span class="h">St. B</span>${rows.map(cell).join("")}</div>` +
    (pl.span.length > 7 ? `<button class="textbtn rost-more" data-action="rostall">${route.rostAll ? "Show fewer" : `Show all ${pl.span.length}`}</button>` : "") +
    `</div></section>`;
}
// Who has a slot on that day now.
function rosterHolders(x, slot) {
  const at = ROSTER_SITES.filter(k => x && x[k]).map(k => [k, slot === "night" ? [x[k].night.fellow].filter(Boolean) : x[k].day.fellows]);
  const all = [...new Set(at.flatMap(a => a[1]))];
  if (!all.length) return `<span class="none">No one listed</span>`;
  return at.every(a => a[1].join() === at[0][1].join()) ? esc(all.join(", ")) :
    at.map(([k, ns]) => `${esc(ns.join(", ") || "no one")} (${ROSTER_SHORT[k]})`).join(", ");
}
function rosterMineHTML(r, pl, x) {
  const now = x.now.map(({d, slot}) => pl.mine.find(s => s.uid === `gi-roster-${d}-${slot === "night" ? "n" : "d"}`)).filter(Boolean)
    .map(s => rosterStretchHTML({s: s.s, e: s.e, segs: [s]}, `<span class="tag wli">Now yours</span>`));
  const gone = x.gone.map(({d, slot}) => `<article class="cst rost-gone"><div class="cst-top mono"><span>${rosterDay(d)}</span><span>was yours</span></div>` +
    `<h3><span>${CALL_WEEKDAYS[agDate(d).getDay()]} ${slot}</span><span class="tag warn">No longer yours</span></h3>` +
    `<div class="cseg"><div class="cseg-site"><span class="mono">Now</span><span>${rosterHolders(pl.next[d], slot)}</span></div></div></article>`);
  return now.length || gone.length ? `<section class="sec"><div class="sec-head"><h2>Changes for you</h2></div>${now.join("")}${gone.join("")}</section>` : "";
}
function rosterOtherHTML(other) {
  if (!other.length) return "";
  const rows = route.rostAll ? other : other.slice(0, 12);
  return `<section class="sec"><div class="sec-head"><h2>Other changes</h2></div><div class="card pad">` +
    rows.map(c => `<div class="rost-chg"><span class="mono">${rosterDay(c.d)}</span><span>${ROSTER_SITE[c.site]} ${c.slot} ${ROSTER_ROLE[c.role]}: ` +
      `${esc(c.now || "none")}, was ${esc(c.was || "none")}</span></div>`).join("") +
    (other.length > 12 ? `<button class="textbtn rost-more" data-action="rostall">${route.rostAll ? "Show fewer" : `Show all ${other.length}`}</button>` : "") +
    `</div></section>`;
}
// A sheet's picture as a tile that opens it; a PDF as a page.
function rosterThumbHTML(pic, sh, note) {
  const pdf = RosterStore.state.types[pic] === "application/pdf";
  return `<button class="rost-sheet" data-action="rostpic" data-id="${esc(pic)}">` +
    (pdf ? `<span class="rost-pdf mono">PDF</span>` : `<img class="rost-thumb" data-rostimg="${esc(pic)}" alt="">`) +
    `<span class="rost-site">${ROSTER_SITE[sh.site]}</span><span class="rost-dates mono">${rosterDay(sh.from)} to ${rosterDay(sh.to)}</span>` +
    (note ? `<span class="rost-chgd">${esc(note)}</span>` : "") + `</button>`;
}
function rosterPicsHTML(r, p) {
  const pics = r.kind === "call" ? r.sheets.filter(x => x.file) : [];
  if (!pics.length && !p.lost) return "";
  return `<section class="sec"><div class="sec-head"><h2>The sheets</h2><span class="mono">Tap one to read it</span></div>` +
    (pics.length ? `<div class="rost-sheets">${pics.map(sh => rosterThumbHTML(sh.file, sh)).join("")}</div>` : "") +
    (p.lost ? `<p class="rost-note">${p.lost === 1 ? "One picture" : p.lost + " pictures"} didn't reach the phone in time. What Claude read is all here.</p>` : "") + `</section>`;
}
// The page for a waiting check, or "" when there's none (done, or thrown away).
function rosterCheckView(id) {
  const st = RosterStore.state, p = st.pend[id];
  if (!p) return "";
  const r = p.r, pl = rosterPlan(r), me = st.me, ch = pl.over ? rosterChanges(r) : null;
  const sites = r.kind === "call" ? ROSTER_SITES.filter(k => r.sheets.some(x => x.site === k)) : [];
  const eyebrow = r.kind === "callswap" ? "Call swap" :
    `Read from the ${pl.over ? "revised " : ""}${sites.map(k => ROSTER_SITE[k]).join(" and ")} sheet${sites.length > 1 ? "s" : ""}`;
  const others = ch ? ch.x.other.length : 0;
  const meta = !pl.over ? [me ? rosterForYou(pl) : "", rosterDaysAt(pl)] :
    !others && !ch.x.now.length && !ch.x.gone.length ? ["Nothing changes"] : [me ? ch.mine : "", others ? rosterN(others, "other") : ""];
  let h = `<header class="ph"><button class="back" data-action="back">${ic("back")}${callBackLabel()}</button>` +
    `<p class="eyebrow mono">${esc(eyebrow)}</p><h1 class="title">${pl.over ? "Check what changed" : "Check the new block"}</h1>` +
    `<div class="ph-meta mono">${meta.filter(Boolean).map(rosterBold).join(" · ")}</div></header>`;
  if (!me) h += rosterAskHTML(pl);
  if (!pl.over) h += (me ? rosterYoursHTML(pl, me) : "") + rosterLookHTML(rosterLook(r, callNow())) + rosterNightsHTML(pl, me);
  else h += (me ? rosterMineHTML(r, pl, ch.x) : "") + rosterOtherHTML(ch.x.other) + rosterLookHTML(rosterLook(r, callNow()));
  return h + rosterPicsHTML(r, p) +
    `<section class="sec"><div class="rbtns"><button class="btn primary" data-action="rostadd" data-id="${esc(id)}">${ic("check")}${pl.over ? "Update Call" : "Add to Call"}</button>` +
    `<button class="btn" data-action="rostnot" data-id="${esc(id)}">Not right</button></div>` +
    `<p class="rost-note">Not right throws away what Claude read${r.kind === "call" ? " and keeps the pictures on Call" : ""}, and Call stays as it is. ` +
    `Then send ${r.kind === "call" ? "the sheets" : "the swap"} to Claude in chat.</p></section>`;
}

// ---- On Call: Who's on, Find someone and the sheets ----------------------------------------------------
// One site on one day: the day team (08:00 to 17:00) with its notes, and the
// night (17:00 to 08:00), Now on the slot on now and You on yours; on a night
// with no fellow there, the site's footer rules; its Call button once Call
// has the site's paging number.
function rosterSiteHTML(d, k, at, me) {
  const st = RosterStore.state, t = st.days[d] && st.days[d][k], tel = callTel(CallStore.state.nums[k]);
  const who = ns => (ns = ns.filter(Boolean)).length ? ns.map(n => rosterYou(n, me)).join(", ") : `<span class=\"none\">None listed</span>`;
  const line = (label, v) => `<div class="cseg-site"><span class="mono">${label}</span><span>${v}</span></div>`;
  const now = slot => at.d === d && at.slot === slot ? ` <span class="tag wli">Now</span>` : "";
  let h = `<article class="cst rost-sitecard"><div class="cst-top mono"><span>${ROSTER_SITE[k]}</span><span>${rosterDay(d)}</span></div>`;
  if (!t) return h + `<p class="rost-note">Not on the sheets you shared.</p></article>`;
  h += `<div class="cseg"><div class="cseg-when mono">Day · 08:00 → 17:00${now("day")}</div>` +
    line(t.day.fellows.length > 1 ? "Fellows" : "Fellow", who(t.day.fellows)) +
    st.notes.filter(x => x.d === d && x.site === k).map(x => `<div class="cseg-site"><span></span><span class="res">${esc(x.who)}: ${esc(x.t)}</span></div>`).join("") +
    line(t.day.res.length > 1 ? "Residents" : "Resident", who(t.day.res)) + line("Attending", who([t.day.att])) +
    (t.day.tpn && t.day.tpn.length ? line("TPN", who(t.day.tpn)) : "") + `</div>`;
  h += `<div class="cseg"><div class="cseg-when mono">Night · 17:00 → 08:00${now("night")}</div>` + line("Fellow", who([t.night.fellow])) +
    (t.night.fellow ? "" : st.rules.filter(x => x.site === k).map(x => `<p class="rost-rule">${esc(x.t)}</p>`).join("")) +
    line(t.night.res.length > 1 ? "Residents" : "Resident", who(t.night.res)) + line("Attending", who([t.night.att])) + `</div>`;
  if (tel) h += `<a class="btn callbtn" href="${tel}">${ic("phone")}Call ${CALL_SITES.find(x => x[0] === k)[1]}</a>`;
  return h + `</article>`;
}
// Who's on: a chip for each day from the slot on now (before 08:00, last
// night) through the roster, and both sites on the day picked; then Find someone.
function rosterWhoHTML(now) {
  const st = RosterStore.state, at = rosterNow(now), today = fmtDate(new Date(now));
  const all = Object.keys(st.days).sort(), days = all.filter(d => d >= at.d).slice(0, 42);
  const head = `<section class="sec rost-who"><div class="sec-head"><h2>Who's on</h2>`;
  if (!days.length) return head + `</div><div class="card pad"><p class="rost-note">Share the call schedule to GI Hub to see who's on.</p></div></section>`;
  const sel = days.includes(route.rostDay) ? route.rostDay : days[0], q = route.rostFind || "";
  return head + `<span class="mono">To ${rosterDay(all[all.length - 1])}</span></div><div class="pickrow chips rost-days">` +
    days.map(d => `<button class="pick ghost${d === sel ? " on" : ""}" data-action="rostday" data-d="${d}" aria-pressed="${d === sel}">` +
      `${d === today ? "Today" : d < today ? "Last night" : rosterShort(d)}</button>`).join("") + `</div>` +
    ROSTER_SITES.map(k => rosterSiteHTML(sel, k, at, st.me)).join("") +
    `<label class="lbl mono rost-find">Find someone<input id="rostfind" type="search" autocomplete="off" placeholder="A name" value="${esc(q)}"></label>` +
    `<div id="rostfound" class="card pad rost-found"${q.trim().length < 2 ? " hidden" : ""}>${rosterFoundHTML(q, now)}</div></section>`;
}
// Every slot from the slot on now where a name, or a full name from the
// footers, has the words: up to 20, next first, each person named when the
// words find more than one.
function rosterFoundHTML(q, now) {
  q = String(q || "").trim().toLowerCase();
  if (q.length < 2) return "";
  const st = RosterStore.state, at = rosterNow(now), key = (d, slot) => d + (slot === "day" ? 0 : 1);
  const full = new Map(st.people.map(p => [p.n.toLowerCase(), p.full.toLowerCase()]));
  const hit = n => !!n && (n.toLowerCase().includes(q) || (full.get(n.toLowerCase()) || "").includes(q));
  const out = [], names = new Set();
  for (const d of Object.keys(st.days).sort()) for (const slot of ROSTER_SLOTS) {
    if (key(d, slot) < key(at.d, at.slot)) continue;
    for (const k of ROSTER_SITES) {
      const t = st.days[d][k];
      if (!t) continue;
      const roles = slot === "day" ? [["fellow", t.day.fellows], ["resident", t.day.res], ["attending", [t.day.att]], ["TPN consults", t.day.tpn || []]] :
        [["fellow", [t.night.fellow]], ["resident", t.night.res], ["attending", [t.night.att]]];
      for (const [role, ns] of roles) for (const n of ns) if (hit(n)) { out.push({d, slot, k, role, n}); names.add(n.toLowerCase()); }
    }
  }
  if (!out.length) return `<p class="rost-note">No one by that name from today on.</p>`;
  return out.slice(0, 20).map(x => `<p class="rost-hit">${rosterDay(x.d)} · ${ROSTER_SITE[x.k]} ${x.slot} · ${x.role}${names.size > 1 ? ` · ${esc(x.n)}` : ""}</p>`).join("") +
    (out.length > 20 ? `<p class="rost-note">and ${out.length - 20} more</p>` : "");
}
// Typing in Find someone keeps the words and redraws only what they find.
function rosterField(t) {
  if (!t || t.id !== "rostfind") return false;
  route.rostFind = t.value;
  const box = document.getElementById("rostfound");
  if (box) { box.innerHTML = rosterFoundHTML(t.value, callNow()); box.hidden = t.value.trim().length < 2; }
  return true;
}
// The sheets as shared, on Call until their last night is over: what changed
// since each (the swaps after it), or that its reading was thrown away.
function rosterSheetsHTML() {
  const st = RosterStore.state, list = st.sheets.filter(x => x.pic);
  if (!list.length) return "";
  return `<section class="sec"><div class="sec-head"><h2>Shared sheets</h2><span class="mono">Tap one to read it</span></div><div class="rost-sheets">` +
    list.map(sh => {
      const ds = [...new Set(st.swaps.filter(w => w.at > sh.at && w.d >= sh.from && w.d <= sh.to && (w.site === "both" || w.site === sh.site)).map(w => w.d))].sort();
      return rosterThumbHTML(sh.pic, sh, sh.unread ? "Its reading was thrown away. Send it to Claude in chat." :
        ds.length ? `Changed since this sheet: ${ds.map(rosterDay).join(", ")}` : "");
    }).join("") + `</div></section>`;
}

// ---- A sheet full screen -----------------------------------------------------------------------------
// Over the page, outside it (render puts it there), so nothing that moves the
// page moves it. Pinch zoom is the page's own.
function rosterSheetOf(pic) {
  for (const p of Object.values(RosterStore.state.pend)) for (const sh of (p.r.sheets || [])) if (sh.file === pic) return sh;
  return RosterStore.state.sheets.find(x => x.pic === pic) || null;
}
function rosterPicHTML() {
  const pic = route.rostPic, sh = rosterSheetOf(pic);
  const what = sh ? `${ROSTER_SITE[sh.site]} sheet, ${rosterDay(sh.from)} to ${rosterDay(sh.to)}` : "Call sheet";
  return `<div class="rostview" role="dialog" aria-label="${esc(what)}"><div class="rostview-top"><span class="mono">${esc(what)}</span>` +
    `<button class="btn" data-action="rostpicx">Close</button></div>` +
    (RosterStore.state.types[pic] === "application/pdf" ? `<iframe class="rostview-pic" data-rostimg="${esc(pic)}" title="${esc(what)}"></iframe>` :
      `<img class="rostview-pic" data-rostimg="${esc(pic)}" alt="${esc(what)}">`) + `</div>`;
}
// Each picture on screen gets its bytes from the phone as an object URL, made
// once while it's on screen and given back once it isn't.
const rosterUrls = new Map();
function rosterAfterRender() {
  const row = route.rostDayX && document.querySelector ? document.querySelector(".rost-days") : null;
  if (row) row.scrollLeft = route.rostDayX;
  if (!document.querySelectorAll || typeof URL === "undefined" || !URL.createObjectURL) return;
  const els = Array.from(document.querySelectorAll("[data-rostimg]")).filter(el => el && el.dataset && el.dataset.rostimg);
  const on = new Set(els.map(el => el.dataset.rostimg));
  for (const [id, u] of rosterUrls) if (!on.has(id)) { URL.revokeObjectURL(u); rosterUrls.delete(id); }
  for (const el of els) {
    const id = el.dataset.rostimg;
    if (rosterUrls.has(id)) { el.src = rosterUrls.get(id); continue; }
    rosterPics.get(id).then(x => {
      if (!x || !x.bytes) { if (el.classList) el.classList.add("gone"); return; }
      if (!rosterUrls.has(id)) rosterUrls.set(id, URL.createObjectURL(new Blob([x.bytes], {type: x.type || "image/jpeg"})));
      el.src = rosterUrls.get(id);
    }).catch(() => {});
  }
}

// ---- Taps ---------------------------------------------------------------------------------------------
// The check's Add to Call or Update Call: the change goes in, the row turns
// into what it did with Undo, and Call opens.
function rosterAdd(id) {
  const st = RosterStore.state, p = st.pend[id], from = route.from || "week", now = callNow();
  if (!p) { go({page: "call", from}); return; }
  const r = p.r, pl = rosterPlan(r);
  let msg;
  if (r.kind === "callswap") msg = rosterSwap(id, r, now).n ? "Call updated" : "Nothing in Call changed";
  else {
    rosterAddCall(id, r, now);
    msg = pl.over ? "Call updated" : !st.me || !pl.mine.length ? "Call schedule added, no shifts for you" :
      pl.nights ? `Call: ${rosterN(pl.nights, "night")} added` : `Call: ${rosterN(pl.mine.length, "day shift")} added`;
  }
  delete st.pend[id];
  RosterStore.save();
  const k = tellLoad(), e = k.added.find(x => x.call === id);
  if (e) { Object.assign(e, {line: msg, at: now, undo: {roster: id}}); tellSave(); }
  showToast(msg, e ? () => tellUndo(e.id) : () => rosterUndo(id));
  go({page: "call", from});
}
// Not right: what Claude read goes, the pictures stay on Call, its row goes.
function rosterNot(id) {
  const p = RosterStore.state.pend[id];
  rosterThrow(id, callNow());
  const k = tellLoad();
  k.added = k.added.filter(x => x.call !== id);
  tellSave();
  showToast(`Thrown away. Send ${p && p.r.kind === "callswap" ? "the swap" : "the sheets"} to Claude in chat.`);
  go({page: route.from || "week"});
}
// Every rost* action. Returns false when it redraws by itself.
function rosterDispatch(act, d) {
  if (act === "rostcheck") { go({page: "call", from: route.page === "call" ? route.from || "week" : route.page, rost: d.id}); return false; }
  if (act === "rostadd") { rosterAdd(d.id); return false; }
  if (act === "rostnot") { rosterNot(d.id); return false; }
  if (act === "rostme") rosterSetMe(d.name || "", callNow());
  else if (act === "rostall") route.rostAll = !route.rostAll;
  else if (act === "rostday") {
    const row = document.querySelector ? document.querySelector(".rost-days") : null;
    route.rostDay = d.d; route.rostDayX = row ? row.scrollLeft : 0;
  }
  else if (act === "rostpic") route.rostPic = d.id;
  else if (act === "rostpicx") delete route.rostPic;
  return true;
}
