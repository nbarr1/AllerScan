// AllerScan service worker.
//
// The install guide promises the app keeps working offline, and Chrome only offers its install
// prompt (`beforeinstallprompt`) to pages backed by a service worker with a fetch handler. This
// supplies both.
//
// Caching rules, in order of how much correctness matters:
//   1. `/api/*` is never cached. Pollen, AQI and scan results are time-sensitive; a stale risk
//      score is worse than no risk score.
//   2. Navigations are network-first. The served HTML carries the Maps Platform key injected at
//      request time, so a cached shell would pin a rotated key. The cache is the offline fallback
//      only.
//   3. Hashed build assets are stale-while-revalidate — safe because the filenames change.

const VERSION = 'v1';
const SHELL_CACHE = `allerscan-shell-${VERSION}`;
const ASSET_CACHE = `allerscan-assets-${VERSION}`;
const SHELL_URL = '/';

// Every deploy produces new hashed filenames and VERSION never changes, so without a cap the asset
// cache kept every build's bundles forever. A few builds' worth is plenty for offline use.
const MAX_ASSET_ENTRIES = 60;

/** Drops the oldest entries (Cache keys come back in insertion order) once the cap is passed. */
function trimCache(cacheName, maxEntries) {
  return caches.open(cacheName).then((cache) =>
    cache.keys().then((keys) => Promise.all(keys.slice(0, Math.max(0, keys.length - maxEntries)).map((key) => cache.delete(key))))
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add(SHELL_URL))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Only same-origin traffic. Maps tiles, Google Fonts and the pollen APIs manage their own.
  if (url.origin !== self.location.origin) return;

  // Never cache API responses.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(SHELL_URL, copy)).catch(() => undefined);
          return response;
        })
        .catch(() =>
          caches
            .match(SHELL_URL)
            .then(
              (cached) =>
                cached ||
                new Response(
                  '<!doctype html><meta charset="utf-8"><title>AllerScan is offline</title>' +
                    '<body style="font-family:system-ui;padding:2rem;color:#0f172a">' +
                    '<h1>AllerScan is offline</h1>' +
                    '<p>Reconnect to load live pollen and air quality data. Your saved profile, ' +
                    'shot schedule and logs are still on this device.</p></body>',
                  { headers: { 'Content-Type': 'text/html' }, status: 503 }
                )
            )
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches
              .open(ASSET_CACHE)
              .then((cache) => cache.put(request, copy))
              .then(() => trimCache(ASSET_CACHE, MAX_ASSET_ENTRIES))
              .catch(() => undefined);
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});
