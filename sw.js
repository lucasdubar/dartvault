// ═══════════════════════════════════════════════════════════
//  DartVault — Service Worker  v2.1
//  Cache-first strategy, full offline support
//  Polices auto-hébergées, lang.js et pages profil inclus
// ═══════════════════════════════════════════════════════════
//
//  ⚠️  IMPORTANT : incrémenter CACHE_VERSION à chaque déploiement
//  pour forcer le rechargement complet sur tous les appareils.
// ═══════════════════════════════════════════════════════════

const CACHE_VERSION = '2.37'; // ← incrémenter à chaque déploiement
const CACHE_DATE = '24/03/2026 04:21'; // ← mettre à jour à chaque déploiement (heure FR)
const CACHE = 'dartvault-v' + CACHE_VERSION;

const PRECACHE = [
  '/',
  '/index.html',
  '/home.html',
  '/horloge.html',
  '/501.html',
  '/bataille.html',
  '/blackjack.html',
  '/cricket.html',
  '/dartspong.html',
  '/race500.html',
  '/shanghai.html',
  '/shooter.html',
  '/territoire.html',
  '/profil.html',
  '/classement.html',
  '/stats-joueur.html',
  '/tournament.html',
  '/privacy.html',
  '/blog.html',
  '/robots.txt',
  '/theme.css',
  '/shared.css',
  '/shared-utils.js',
  '/lang.js',
  '/manifest.json',
  '/icons/favicon.ico',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png',
  '/icons/logo-hub.png',
  // Polices auto-hébergées
  '/fonts/fonts.css',
  '/fonts/rajdhani-400.woff2',
  '/fonts/rajdhani-600.woff2',
  '/fonts/rajdhani-700.woff2',
  '/fonts/exo2-300.woff2',
  '/fonts/exo2-400.woff2',
  '/fonts/exo2-600.woff2',
  '/fonts/exo2-700.woff2',
  '/fonts/exo2-900.woff2',
];

// ── INSTALL : pré-cache tous les assets ─────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE : purge les anciens caches ─────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH : cache-first pour tout ───────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;

      return fetch(e.request).then(res => {
        if (!res || res.status !== 200) return res;
        // Mettre en cache toute ressource valide (y compris cross-origin si besoin)
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => {
        // Offline fallback → renvoyer index.html pour les pages
        if (e.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// ── MESSAGE : SKIP_WAITING + GET_VERSION ────────
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (e.data && e.data.type === 'GET_VERSION') {
    e.source.postMessage({ type: 'VERSION', version: CACHE_VERSION, date: CACHE_DATE });
  }
});
