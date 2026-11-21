'use strict';

/* Service Worker：缓存静态资源，让 APP 可离线打开外壳（数据仍需连后端） */
const CACHE = 'liti-app-v1';
const ASSETS = [
  '/mobile.html',
  '/css/app.css',
  '/css/mobile.css',
  '/app-config.js',
  '/js/api.js',
  '/js/app.js',
  '/js/mobile.js',
  '/icon-512.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // API 请求走网络，不缓存（保证数据实时）
  if (url.pathname.startsWith('/api/')) return;
  // 静态资源：缓存优先
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(resp => {
      if (resp && resp.status === 200 && url.origin === self.location.origin) {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return resp;
    }).catch(() => caches.match('/mobile.html')))
  );
});
