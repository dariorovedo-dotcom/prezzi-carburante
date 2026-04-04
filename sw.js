const CACHE = "carburante-v1";
const CORE = [
  "/prezzi-carburante/",
  "/prezzi-carburante/index.html",
  "/prezzi-carburante/manifest.json",
  "/prezzi-carburante/og-image.png",
  "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600&display=swap",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"
];

// Installazione: precache dei file core
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

// Attivazione: rimuove cache vecchie
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first per i CSV (sempre aggiornati), cache-first per il resto
self.addEventListener("fetch", e => {
  const url = e.request.url;

  // CSV dati: sempre dalla rete (aggiornati ogni mattina)
  if (url.endsWith(".csv")) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // Tutto il resto: cache-first con fallback network
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Salva in cache solo risposte valide
        if (response && response.status === 200 && response.type !== "opaque") {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback per navigazione
        if (e.request.mode === "navigate") {
          return caches.match("/prezzi-carburante/index.html");
        }
      });
    })
  );
});
