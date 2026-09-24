/* =========================================================
   sw.js — Service Worker do TV IPTV Player (PWA)
   - Precache do app shell (estratégia cache-first)
   - Rede direta para streams (.m3u8/.ts) e API Xtream
     (nunca cachear conteúdo de vídeo / credenciais)
   ========================================================= */

const CACHE_NAME = 'tv-iptv-cache-v1';
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Instala: pré-cacheia o app shell e ativa imediatamente.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Ativação: remove caches de versões anteriores.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch:
// 1. Nunca intercepta /api/* (proxy Xtream) nem URLs de stream.
// 2. Navegação: network-first com fallback ao cache.
// 3. Assets estáticos: cache-first com revalidação em background.
self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Pass-through total para o proxy Xtream e qualquer rota de API.
  if (url.pathname.startsWith('/api/')) return;

  // Pass-through para streams de vídeo (.m3u8 / .ts / .mp4), internos ou externos.
  if (/\.(m3u8|m3u|ts|mp4)(\?|$)/i.test(url.pathname + url.search)) return;

  // Somente requisições do mesmo origin entram no cache.
  if (url.origin !== self.location.origin) return;

  // Navegação (documentos HTML): network-first.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/')))
    );
    return;
  }

  // Assets estáticos: cache-first + revalidação em background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});
