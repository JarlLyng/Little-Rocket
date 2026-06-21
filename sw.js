/**
 * Service worker — makes Little Rocket genuinely installable and offline-capable.
 *
 * Strategy:
 *   - Precache the app shell (HTML, CSS, every JS module, manifest, icon) on
 *     install so a cold offline load works.
 *   - Runtime cache-first for everything else GET: the Three.js CDN module and
 *     the audio loops get cached the first time they're fetched, then served
 *     from cache on later visits.
 *   - `/api/*` always goes to the network — the collective counter must never
 *     be served stale, and POSTs must never be intercepted.
 *
 * Bump CACHE when the precache list or any shipped asset changes; the activate
 * step deletes every older cache so clients don't get a stale shell.
 */

const CACHE = 'little-rocket-v2';

const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/styles/main.css',
  '/vendor/iamjarl-tokens.css',
  '/src/main.js',
  '/src/scene.js',
  '/src/rocket.js',
  '/src/planets.js',
  '/src/asteroids.js',
  '/src/controls.js',
  '/src/audio.js',
  '/src/exhaust.js',
  '/src/motion.js',
  '/src/music.js',
  '/src/story.js',
  '/src/analytics.js',
  '/src/stats.js',
  '/src/milestones.js',
  '/src/names.js',
  '/src/textures.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Don't let one 404 abort the whole precache.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache or intercept the API — the counter must stay live.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  // Skip analytics so cached pageviews don't replay.
  if (url.hostname.includes('umami')) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Only cache successful, cacheable responses (skip opaque/errors).
        if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => {
        // Offline and uncached: fall back to the shell for navigations.
        if (request.mode === 'navigate') return caches.match('/');
        return Response.error();
      });
    })
  );
});
