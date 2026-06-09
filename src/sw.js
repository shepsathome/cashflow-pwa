const CACHE_NAME = 'bear-finance-v1';
const APP_SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/data.js',
  './js/state.js',
  './js/compute.js',
  './js/charts.js',
  './js/ui.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install — cache app shell, activate immediately
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean old caches, claim clients immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - API/proxy requests: network only (never cache)
// - Fonts: network-first with cache fallback
// - App shell: stale-while-revalidate (serve cache instantly, update in background)
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API and proxy calls — always network, never cache
  if (url.pathname.startsWith('/api/')
      || url.hostname.includes('frankfurter.app')
      || url.hostname.includes('allorigins.win')
      || url.hostname.includes('corsproxy.io')
      || url.hostname.includes('codetabs.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Google Fonts — network-first with cache fallback
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('gstatic.com')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // App shell — stale-while-revalidate
  // Serve cached version immediately for speed, then fetch update in background
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
