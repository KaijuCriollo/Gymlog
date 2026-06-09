const CACHE_NAME = 'kaijugymlog-v1';
const BASE = '/Gymlog';

const ASSETS = [
  BASE + '/gymlog.html',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
];

// Install: cache all assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(ASSETS.map(url => cache.add(url)));
    }).then(() => self.skipWaiting())
  );
});

// Activate: delete old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for app, network-first for Firebase
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Firebase requests: always network (never cache auth/firestore)
  if (url.hostname.includes('firebase') ||
      url.hostname.includes('googleapis.com') && url.pathname.includes('firestore') ||
      url.hostname.includes('identitytoolkit')) {
    return; // let browser handle normally
  }

  // App assets: cache-first, fallback to network
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Cache successful GET responses
        if (response.ok && e.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback: return cached HTML for navigation
        if (e.request.mode === 'navigate') {
          return caches.match(BASE + '/gymlog.html');
        }
      });
    })
  );
});
