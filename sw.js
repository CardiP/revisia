/* Révisia — service worker : l'appli marche hors-ligne, se met à jour seule, et reçoit les rappels push */
const CACHE = "revisia-v2";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Rappels push (envoyés chaque matin par l'action GitHub) */
self.addEventListener("push", e => {
  let data = { title: "📚 Révisia", body: "Tes révisions t'attendent !" };
  try { data = e.data.json(); } catch (_) {}
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    lang: "fr"
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(ws => {
      for (const w of ws) { if ("focus" in w) return w.focus(); }
      return clients.openWindow("./");
    })
  );
});

/* Réseau d'abord (pour recevoir les mises à jour), cache en secours (pour le hors-ligne) */
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return r;
      })
      .catch(() =>
        caches.match(e.request, { ignoreSearch: true })
          .then(m => m || caches.match("./index.html"))
      )
  );
});
