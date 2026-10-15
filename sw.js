importScripts("notify.js");
const CACHE = "epa-v42";
// Kept across updates: the brief remind.js saves for writing notifications.
const BRIEF = "gi-brief";
const ASSETS = ["./", "index.html", "app.css", "search.js", "coach.js", "call.js", "study.js", "studyq.js", "studyq.json", "guides.js", "guides.json", "guides-view.js", "ibd.js", "ibd-view.js", "trials.js", "trials-view.js", "pearls.js", "pearls-view.js", "scope.js", "notify.js", "remind.js", "settings.js", "study-view.js", "scope-chart.js", "scope-view.js", "scope-report.js", "fellows.js", "live.js", "app.js", "manifest.webmanifest", "icon.svg",
  "icon-180.png", "icon-192.png", "icon-512.png",
  "fonts/outfit-var.woff2"];
// Straight from the server, past the browser's own cache: GitHub Pages lets
// files sit there for 10 minutes, and an update installed inside that window
// would otherwise save the previous version's files under the new name.
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, {cache: "reload"}))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE && k !== BRIEF).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// The study questions and the guideline library change without an app
// update, so they come from the network first; the cached copy covers the
// phone when it's offline.
const LIVE = ["/studyq.json", "/guides.json"];
self.addEventListener("fetch", e => {
  const path = new URL(e.request.url).pathname;
  // Settings asks the server which version it serves by reading sw.js; that
  // answer must never come from, or be kept in, this cache.
  if (path.endsWith("/sw.js")) return;
  if (LIVE.some(f => path.endsWith(f))) {
    e.respondWith(fetch(e.request).then(res => { if (res.ok) { const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; })
      .catch(() => caches.match(e.request, {ignoreSearch: true})));
    return;
  }
  e.respondWith(caches.match(e.request, {ignoreSearch: true}).then(hit => hit ||
    fetch(e.request).then(res => { const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })));
});
// A reminder arrives with only its kind and time; the words come from the
// brief on this phone. iPhone requires every push to show a notification.
self.addEventListener("push", e => {
  let msg = {};
  try { msg = e.data ? e.data.json() : {}; } catch (err) {}
  e.waitUntil((async () => {
    let brief = null;
    try { const r = await (await caches.open(BRIEF)).match("__gi-brief.json"); brief = r ? await r.json() : null; } catch (err) {}
    const n = noticeFor(msg, brief, Date.now());
    try { await (await caches.open(BRIEF)).put("__gi-push.json", new Response(JSON.stringify({at: Date.now(), kind: msg.kind || null}))); } catch (err) {}
    await self.registration.showNotification(n.title, {body: n.body, tag: n.tag, data: {url: n.url}, icon: "icon-192.png"});
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type: "window", includeUncontrolled: true}).then(list => {
    const w = list[0];
    if (w) {
      const go = ["call", "study", "pearls"].find(p => url.includes("#" + p));
      if (go) w.postMessage({go});
      return w.focus();
    }
    return self.clients.openWindow(url);
  }));
});
