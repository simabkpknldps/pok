/**
 * sw-dokumen.js
 * -----------------------------------------------------------------------
 * Service worker khusus halaman dokumen-scan.html.
 *
 * Strategi sengaja dibuat sederhana & aman:
 * - App shell (html, manifest, icon, library CDN) di-cache supaya halaman
 *   tetap bisa kebuka meski sinyal lagi jelek (misal pas di lapangan).
 * - Semua request ke backend GAS (apiPost/apiGet, mengandung "script.google.com"
 *   atau "/exec") SENGAJA TIDAK di-cache dan selalu network-only, supaya data
 *   kegiatan & hasil pencarian selalu fresh, dan upload dokumen tidak pernah
 *   "sukses palsu" gara-gara nyangkut di cache.
 * -----------------------------------------------------------------------
 */

const CACHE_NAME = 'simab-dokumen-shell-v1';
const APP_SHELL = [
    './dokumen-scan.html',
    './manifest-dokumen.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
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
    const url = event.request.url;

    // Jangan pernah cache request ke backend GAS -> selalu network-only.
    if (url.includes('script.google.com') || url.includes('/exec') || url.includes('/dev')) {
        return; // biarkan browser handle langsung, tidak di-intercept
    }

    // App shell & aset statis: cache-first, fallback ke network.
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((response) => {
                // simpan salinan ke cache utk aset statis same-origin
                if (event.request.method === 'GET' && response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => cached);
        })
    );
});
