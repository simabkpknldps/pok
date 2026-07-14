/**
 * SERVICE WORKER — SiMAB
 * -----------------------
 * Strategi:
 * - HANYA meng-cache file milik app sendiri (same-origin: html, css, js, ikon).
 * - Request ke backend GAS (script.google.com) dan CDN (Tailwind/FontAwesome/
 *   Chart.js/xlsx) TIDAK disentuh sama sekali — biar selalu ambil data/asset
 *   terbaru dari internet dan tidak ada masalah cache basi / opaque response.
 * - Strategi cache: network-first, fallback ke cache kalau offline.
 *
 * Cara update versi: ganti CACHE_NAME setiap kali deploy perubahan besar,
 * biar service worker lama otomatis dibuang dan cache diisi ulang.
 */

const CACHE_NAME = 'simab-shell-v1';

const APP_SHELL = [
  './',
  './index.html',
  './dashboard.html',
  './manifest.json',
  './css/app.css',
  './js/common.js',
  './js/api.js',
  './js/router.js',
  './js/pages/dashboard.js',
  './js/pages/pok.js',
  './js/pages/kegiatan.js',
  './js/pages/perjadin.js',
  './js/pages/kalender.js',
  './js/pages/statistik.js',
  './pages/dashboard.html',
  './pages/pok.html',
  './pages/kegiatan.html',
  './pages/perjadin.html',
  './pages/kalender.html',
  './pages/statistik.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // addAll akan gagal total kalau salah satu 404 — pakai Promise.allSettled
      // per-item supaya file yang ada tetap ke-cache walau ada yang belum ada.
      Promise.allSettled(APP_SHELL.map((url) => cache.add(url)))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Lewati semua request lintas-origin (backend GAS, CDN Tailwind/FontAwesome/
  // Chart.js/XLSX) — biarkan browser yang menangani langsung tanpa cache.
  if (url.origin !== self.location.origin) return;

  // Hanya urus GET (POST ke API tidak pernah lewat sini karena beda origin,
  // tapi tetap dijaga untuk keamanan).
  if (req.method !== 'GET') return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || caches.match('./index.html'))
      )
  );
});
