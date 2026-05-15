// ════════════════════════════════════════════════════════════════════════════
// SERVICE WORKER — Prezzi Carburante
// Strategia: network-first per HTML, cache-first per asset statici
// Versione: 2.0.0
// ════════════════════════════════════════════════════════════════════════════
// 💡 COME FORZARE L'AGGIORNAMENTO PER TUTTI GLI UTENTI:
//    Cambia il numero di CACHE_VERSION (es. da "v2" a "v3").
//    Al prossimo refresh, i browser:
//      1. Scaricano questa nuova versione del sw.js
//      2. Cancellano la cache vecchia
//      3. Mostrano un banner "Aggiorna" all'utente
// ════════════════════════════════════════════════════════════════════════════

const CACHE_VERSION = "v4";
const CACHE_STATIC  = `carburante-static-${CACHE_VERSION}`;
const CACHE_RUNTIME = `carburante-runtime-${CACHE_VERSION}`;

// File statici precachati all'installazione (NO index.html, va sempre da rete)
const STATIC_ASSETS = [
  "./manifest.json",
  "./og-image.png",
  "./icon-192.png",
  "./icon-512.png",
  "./fonts/bebas-neue.woff2",
  "./fonts/dm-sans-400.woff2",
  "./fonts/dm-sans-500.woff2",
  "./fonts/dm-sans-600.woff2",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"
];

// ────────────────────────────────────────────────────────────────────────────
// INSTALL — precache asset statici, poi prendi subito il controllo
// ────────────────────────────────────────────────────────────────────────────
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())  // attivati subito, non aspettare riavvio
      .catch(err => console.warn("[SW] Install error:", err))
  );
});

// ────────────────────────────────────────────────────────────────────────────
// ACTIVATE — cancella le cache delle versioni precedenti
// ────────────────────────────────────────────────────────────────────────────
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_STATIC && key !== CACHE_RUNTIME)
          .map(key => {
            console.log("[SW] Cancello cache vecchia:", key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim())  // prendi il controllo di tutte le tab
  );
});

// ────────────────────────────────────────────────────────────────────────────
// FETCH — strategia per tipo di risorsa
// ────────────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo richieste GET via http(s)
  if (req.method !== "GET" || !url.protocol.startsWith("http")) return;

  // ─── 1. NAVIGATION (index.html e simili) → NETWORK-FIRST ───────────────
  // Strategia: prova la rete. Se va, aggiorna la cache e servi.
  //            Se la rete fallisce (offline), servi la cache.
  // Questo garantisce che l'utente veda SEMPRE l'ultima versione dell'app.
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      fetch(req)
        .then(response => {
          // Salva una copia in runtime cache per fallback offline
          const clone = response.clone();
          caches.open(CACHE_RUNTIME).then(c => c.put(req, clone));
          return response;
        })
        .catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
    );
    return;
  }

  // ─── 2. CSV (dati MIMIT) → NETWORK-FIRST ───────────────────────────────
  // I CSV vengono aggiornati ogni mattina, vogliamo sempre la versione più
  // fresca. Se la rete fallisce, fallback a cache.
  if (url.pathname.endsWith(".csv")) {
    event.respondWith(
      fetch(req)
        .then(response => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_RUNTIME).then(c => c.put(req, clone));
          }
          return response;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // ─── 3. ASSET STATICI (font, JS, CSS, immagini) → CACHE-FIRST ───────────
  // Questi non cambiano spesso, li serviamo dalla cache per velocità.
  // Se non sono in cache, scarichiamo e cachiamo.
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;

      return fetch(req).then(response => {
        // Cacha solo risposte valide
        if (response && response.status === 200) {
          const isSameOrigin = url.origin === self.location.origin;
          const isTrustedCdn = url.hostname === "cdnjs.cloudflare.com";

          if (isSameOrigin || isTrustedCdn) {
            const clone = response.clone();
            caches.open(CACHE_RUNTIME).then(c => c.put(req, clone));
          }
        }
        return response;
      }).catch(() => {
        // Offline e non in cache → fallback gentile per immagini
        if (req.destination === "image") {
          return new Response("", { status: 200, headers: { "Content-Type": "image/svg+xml" } });
        }
        return new Response("Risorsa non disponibile offline", { status: 503 });
      });
    })
  );
});

// ────────────────────────────────────────────────────────────────────────────
// MESSAGE — riceve comandi dal client (es. "salta installazione")
// ────────────────────────────────────────────────────────────────────────────
self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

