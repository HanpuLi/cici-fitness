const CACHE = 'cici-fitness-v81';

// ── Local assets: always pre-cached on install ──
const LOCAL_ASSETS = [
  './Index.html', './core.js', './app.js', './style.css',
  './manifest.json', './icon.svg', './dev.js'
];

// ── External CDN assets to pre-cache ──
const CDN_ASSETS = [
  // Firebase SDK
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js',
  // Google Fonts CSS
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300..700;1,300..700&family=DM+Mono:wght@300;400&family=Noto+Serif+SC:wght@300;400;600;700&family=Outfit:wght@300;400;500;600;700&family=ZCOOL+XiaoWei&display=swap',
  // Tabler Icons CSS
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css',
];

// ── Domains that get stale-while-revalidate (font files, icon woff2, etc.) ──
const SWR_DOMAINS = ['fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE).then(c => {
    // Pre-cache local assets (must succeed)
    const localP = c.addAll(LOCAL_ASSETS);
    // Pre-cache CDN assets (best-effort, don't block install if offline)
    const cdnP = Promise.allSettled(CDN_ASSETS.map(url =>
      fetch(url, { mode: 'cors' }).then(r => { if (r.ok) return c.put(url, r) }).catch(() => { })
    ));
    return Promise.all([localP, cdnP]);
  }).then(() => self.skipWaiting())
));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith('http')) return;
  const url = new URL(e.request.url);

  // ── Stale-while-revalidate for font files & icon assets ──
  // Serves cached version immediately, updates cache in background
  if (SWR_DOMAINS.some(d => url.hostname === d || url.hostname.endsWith('.' + d))) {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          const fetchP = fetch(e.request).then(r => {
            if (r.ok) cache.put(e.request, r.clone());
            return r;
          }).catch(() => cached);
          return cached || fetchP;
        })
      )
    );
    return;
  }

  // ── CDN assets (Firebase SDK, Google Fonts CSS, Tabler CSS): cache-first ──
  if (CDN_ASSETS.some(a => e.request.url === a || e.request.url.split('?')[0] === a.split('?')[0])) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(r => {
          if (r.ok) { const c = r.clone(); caches.open(CACHE).then(cache => cache.put(e.request, c)) }
          return r;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // ── Local assets: network-first, fall back to cache ──
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const c = r.clone(); caches.open(CACHE).then(cache => cache.put(e.request, c)) }
      return r;
    }).catch(() => caches.match(e.request))
  );
});
