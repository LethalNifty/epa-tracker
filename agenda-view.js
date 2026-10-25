"use strict";
// The Agenda tab: Days and Month, the event sheet, your usual week and Add
// from file, over agenda.js. Full app only.

// ---- The page --------------------------------------------------------------------------------
function viewAgenda() {
  const blk = blockFor(getToday());
  return `<header class="ph"><p class="eyebrow mono">${blk ? `Block ${blk.num} · ${esc(blk.name)}` : "GI Hub"}</p><h1 class="title">Agenda</h1></header>`;
}
