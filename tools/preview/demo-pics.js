"use strict";
// Preview only: each demo sheet's picture, drawn from the demo roster as a
// printed call schedule and kept where the app keeps shared sheets, so Call's
// tiles and a sheet full screen have something to show. The names are the
// demo's made-up ones. shot.mjs and bundle.py add this after demo.json's
// roster; it runs once a page, after the app has loaded.
(() => {
  if (window.__demoPics) return;
  window.__demoPics = true;
  window.addEventListener("load", async () => {
    if (typeof RosterStore !== "object" || typeof rosterPics !== "object") return;
    const st = RosterStore.state, all = [];
    for (const sh of st.sheets) if (sh.pic) all.push([sh.pic, sh, d => st.days[d] && st.days[d][sh.site]]);
    for (const p of Object.values(st.pend)) {
      const days = new Map(((p.r && p.r.days) || []).map(x => [x.d, x]));
      for (const sh of (p.r && p.r.sheets) || []) if (sh.file) all.push([sh.file, sh, d => days.get(d) && days.get(d)[sh.site]]);
    }
    let drew = 0;
    for (const [id, sh, team] of all) {
      if (await rosterPics.get(id)) continue;
      const rows = [];
      for (let d = sh.from; d <= sh.to; d = agAddDays(d, 1)) rows.push([d, team(d)]);
      const c = document.createElement("canvas"), g = c.getContext("2d");
      c.width = 1000; c.height = 200 + rows.length * 38;
      g.fillStyle = "#fbfaf7"; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = "#16161d"; g.font = "600 34px Arial, sans-serif";
      g.fillText(`${ROSTER_SITE[sh.site]} GI call schedule`, 40, 62);
      g.fillStyle = "#555"; g.font = "20px Arial, sans-serif";
      g.fillText(`${rosterDay(sh.from)} to ${rosterDay(sh.to)} · made-up demo names`, 40, 98);
      const cols = [40, 200, 470, 640, 830];
      g.fillStyle = "#16161d"; g.font = "600 18px Arial, sans-serif";
      ["Date", "Day fellow", "Day attending", "Night fellow", "Night attending"].forEach((t, i) => g.fillText(t, cols[i], 156));
      g.font = "18px Arial, sans-serif";
      rows.forEach(([d, t], r) => {
        const y = 196 + r * 38;
        if (r % 2 === 0) { g.fillStyle = "#efede6"; g.fillRect(30, y - 26, 940, 38); }
        g.fillStyle = "#16161d";
        const v = t ? [rosterDay(d), t.day.fellows.join(", "), t.day.att, t.night.fellow || "(none)", t.night.att] : [rosterDay(d)];
        v.forEach((s, i) => g.fillText(s, cols[i], y));
      });
      const blob = await new Promise(ok => c.toBlob(ok, "image/png"));
      if (!blob) continue;
      await rosterPics.put(id, {type: "image/png", bytes: await blob.arrayBuffer()});
      st.types[id] = "image/png";
      drew++;
    }
    if (drew) { RosterStore.save(); route.keepScroll = true; render(); }
  });
})();
