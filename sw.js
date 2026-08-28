const CACHE_NAME = 'kaijugymlog-v6';
const BASE = '/Gymlog';

/* ── FIREBASE CLOUD MESSAGING (push real, funciona con la app cerrada) ──
   Mismo service worker que ya cachea la app: le sumamos el manejo de
   notificaciones push que llegan del backend (Cloud Function
   checkMuscleReminders). Cuando el navegador recibe el mensaje con la app
   cerrada o en segundo plano, dispara onBackgroundMessage acá. */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCgPk8QisGhFz7z4ow2AaTzDwx3ddc2rng',
  authDomain: 'kaijugymlog.firebaseapp.com',
  projectId: 'kaijugymlog',
  storageBucket: 'kaijugymlog.firebasestorage.app',
  messagingSenderId: '1037263046321',
  appId: '1:1037263046321:web:149f37ea6a5c30d3e38490',
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  self.registration.showNotification(n.title || 'KaishuGymLog', {
    body: n.body || '',
    icon: BASE + '/icons/icon-192x192.png',
    badge: BASE + '/icons/icon-192x192.png',
    tag: 'muscle-reminder',
  });
});

const ASSETS = [
  BASE + '/gymlog.html',
  BASE + '/manifest.json',
  BASE + '/icons/icon-192x192.png',
  BASE + '/icons/icon-512x512.png',
  BASE + '/kaishu-login-bg.jpg',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(ASSETS.map(url => cache.add(url)));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  if (url.hostname.includes('firebase') ||
      url.hostname.includes('googleapis.com') && url.pathname.includes('firestore') ||
      url.hostname.includes('identitytoolkit')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response.ok && e.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        if (e.request.mode === 'navigate') {
          return caches.match(BASE + '/gymlog.html');
        }
      });
    })
  );
});

/* ── RECORDATORIOS DE MÚSCULOS ──
   La página nos manda por postMessage un "snapshot" (lista de músculos hace cuántos
   días que no se entrenan) cada vez que se abre o vuelve a foreground. Lo guardamos en
   IndexedDB porque el service worker se apaga entre eventos y pierde variables en memoria.
   Si el navegador nos llega a dar un "periodic background sync" (best-effort, no
   garantizado — depende de cuánto se usa la app, es una limitación de Android/Chrome,
   no de esta app), lo usamos para volver a mostrar una notificación con el último dato
   que tengamos guardado. */
const DB_NAME = 'kaijugymlog-reminders';

function idbSet(key, value) {
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => {
      const tx = req.result.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    };
    req.onerror = () => resolve();
  });
}

function idbGet(key) {
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => {
      const tx = req.result.transaction('kv', 'readonly');
      const getReq = tx.objectStore('kv').get(key);
      getReq.onsuccess = () => resolve(getReq.result || null);
      getReq.onerror = () => resolve(null);
    };
    req.onerror = () => resolve(null);
  });
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'muscle-snapshot') {
    event.waitUntil(idbSet('snapshot', event.data.payload));
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'muscle-reminder-check') return;
  event.waitUntil((async () => {
    const snap = await idbGet('snapshot');
    if (!snap || !snap.neglected || !snap.neglected.length) return;
    // Don't nag with a stale snapshot — if the page hasn't updated it in over 3 days,
    // skip rather than show outdated info.
    if (Date.now() - (snap.updatedAt || 0) > 3 * 24 * 60 * 60 * 1000) return;
    const neglected = snap.neglected;
    const title = neglected.length === 1 ? `💪 ${neglected[0].muscle} sin entrenar` : `💪 ${neglected.length} músculos sin entrenar`;
    const body = neglected.slice(0, 3).map(m => `${m.muscle}: hace ${m.days} días`).join(' · ');
    await self.registration.showNotification(title, {
      body,
      icon: BASE + '/icons/icon-192x192.png',
      badge: BASE + '/icons/icon-192x192.png',
      tag: 'muscle-reminder'
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((list) => {
      for (const c of list) {
        if (c.url.includes(BASE) && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(BASE + '/gymlog.html');
    })
  );
});
