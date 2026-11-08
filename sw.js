importScripts("notify.js");
const CACHE = "epa-v73";
// Kept across updates: the brief remind.js saves for writing notifications.
const BRIEF = "gi-brief";
const ASSETS = ["./", "index.html", "app.css", "search.js", "coach.js", "call.js", "study.js", "studyq.js", "studyq.json", "guides.js", "guides.json", "guides-view.js", "ibd.js", "ibd-view.js", "trials.js", "trials-view.js", "pearls.js", "pearls-view.js", "agenda.js", "agenda-view.js", "scope.js", "notify.js", "remind.js", "alerts.js", "settings.js", "watch.js", "backup.js", "study-view.js", "scope-chart.js", "scope-view.js", "scope-report.js", "review.js", "fellows.js", "live.js", "app.js", "manifest.webmanifest", "icon.svg",
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
// phone when it's offline, and after 3 seconds on wifi that connects but
// passes nothing (hospital guest networks). A copy that lands after that is
// kept, and the app is told so it can read it.
const LIVE = ["/studyq.json", "/guides.json"], LIVE_WAIT = 3000;
function liveAnswer(e, path) {
  let late = false;
  const net = fetch(e.request).then(res => {
    if (res.ok) {
      const copy = res.clone();
      const kept = caches.open(CACHE).then(c => c.put(e.request, copy));
      if (late) kept.then(() => self.clients.matchAll({type: "window"}))
        .then(list => { for (const w of list) w.postMessage({fresh: path.slice(path.lastIndexOf("/") + 1)}); });
    }
    return res;
  });
  const mine = () => caches.match(e.request, {ignoreSearch: true});
  e.respondWith(new Promise((resolve, reject) => {
    const timer = setTimeout(() => mine().then(hit => { if (hit) { late = true; resolve(hit); } }), LIVE_WAIT);
    net.then(res => { clearTimeout(timer); resolve(res); },
      err => { clearTimeout(timer); mine().then(hit => (hit ? resolve(hit) : reject(err))); });
  }));
  // The worker stays up until the network's copy is saved.
  if (e.waitUntil) e.waitUntil(net.catch(() => {}));
}
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url), path = url.pathname;
  // Only this app's own files: another site and anything but a plain GET go
  // straight to the network.
  if (e.request.method !== "GET" || url.origin !== new URL(self.registration.scope).origin) return;
  // Settings asks the server which version it serves by reading sw.js, and the
  // fellows' app asks whether its invite code still works at /__access; those
  // answers must never come from, or be kept in, this cache.
  if (path.endsWith("/sw.js") || path.endsWith("/__access")) return;
  if (LIVE.some(f => path.endsWith(f))) { liveAnswer(e, path); return; }
  e.respondWith(caches.match(e.request, {ignoreSearch: true}).then(hit => hit ||
    fetch(e.request).then(res => { if (res.ok) { const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; })));
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
    const count = badgeCount(brief, Date.now());
    try { if (count && self.navigator && self.navigator.setAppBadge) await self.navigator.setAppBadge(count); } catch (err) {}
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type: "window", includeUncontrolled: true}).then(list => {
    const w = list[0];
    if (w) {
      const go = ["call", "study", "pearls", "agenda"].find(p => url.includes("#" + p));
      if (go) w.postMessage({go});
      return w.focus();
    }
    return self.clients.openWindow(url);
  }));
});
