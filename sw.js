const CACHE = 'cici-fitness-v162';   // 数字要和 core.js 的 APP_BUILD、index.html 页脚的 build 一致(check-static 会查)
// 动作演示 GIF:单独一个缓存,只留最近 GIF_MAX 张。来源锁在固定 commit(见 core.js GIF_BASE),内容不会变,
// 所以缓存优先、跨版本保留;以前走 SWR 进主缓存,看过的每张都存着,越积越多
const GIF_CACHE = 'cici-fitness-gif-v1';
const GIF_MAX = 80;
const GIF_PREFIX = '/gh/hasaneyldrm/exercises-dataset@';

// ── Local assets: always pre-cached on install ──
const LOCAL_ASSETS = [
  './index.html', './skin.js', './skin-sport.js', './ui.js', './core.js', './app.js', './coach.js', './push.js', './style.css', './skin-sport.css',
  './manifest.json', './icon.svg', './dev.js'
];

// ── External CDN assets to pre-cache ──
const CDN_ASSETS = [
  // Firebase SDK
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js',
  // Google Fonts CSS —— 必须和 index.html 里实际加载的那条一字不差(以前写的是旧字体,预缓存白做;check-static 会查)
  'https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&family=EB+Garamond:ital,wght@0,400..600;1,400..600&family=Noto+Serif+SC:wght@400;600&display=swap',
  // 「运动」风格的字体:index.html 开机脚本按风格插入(不是静态 <link>);离线切到运动也要有样式表,所以一样预缓存。
  // 字体文件本身走下面 fonts.gstatic.com 的 SWR,用过一次就离线可用;没用过时退回系统无衬线
  'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@500;600;700;800&family=Noto+Sans+SC:wght@400..900&display=swap',
  // Tabler Icons CSS(jsDelivr,运行时走 SWR;这里预缓存一份,离线首开也有样式)。ui-v3 起不再加载霞鹜文楷
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css'
];

// ── 肌肉解剖图:已本地化到 ./muscles/(原 wger.de 外链无 CORS → 缓存不上、每次实时连 wger,网络不稳就"图解全不可用") ──
const MUSCLE_ASSETS = [
  './muscles/m1-main.svg', './muscles/m1-sec.svg', './muscles/m2-main.svg', './muscles/m2-sec.svg',
  './muscles/m4-main.svg', './muscles/m4-sec.svg', './muscles/m5-main.svg', './muscles/m5-sec.svg',
  './muscles/m6-main.svg', './muscles/m6-sec.svg', './muscles/m7-main.svg', './muscles/m7-sec.svg',
  './muscles/m8-main.svg', './muscles/m8-sec.svg', './muscles/m9-main.svg', './muscles/m9-sec.svg',
  './muscles/m10-main.svg', './muscles/m10-sec.svg', './muscles/m11-main.svg', './muscles/m11-sec.svg',
  './muscles/m12-main.svg', './muscles/m12-sec.svg', './muscles/m14-main.svg', './muscles/m14-sec.svg'
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
    // 本地肌肉图:同源,best-effort 预缓存(不进原子 addAll,免得个别文件缺失拖垮整个安装)
    const muscleP = Promise.allSettled(MUSCLE_ASSETS.map(url =>
      fetch(url).then(r => { if (r.ok) return c.put(url, r) }).catch(() => { })
    ));
    return Promise.all([localP, cdnP, muscleP]);
  }).then(() => self.skipWaiting())
));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== GIF_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith('http')) return;
  const url = new URL(e.request.url);

  // 认证/账号/数据库流量:绝不拦截、绝不缓存 —— SW 插手会破坏谷歌 OAuth/令牌流程导致登录失败
  const AUTH_HOSTS = ['accounts.google.com', 'apis.google.com', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com', 'oauth2.googleapis.com', 'firebaseinstallations.googleapis.com', 'firestore.googleapis.com', 'www.googleapis.com', 'node.tail95239f.ts.net'];  // 最后一个是 AI 教练后端
  if (AUTH_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h)) || url.pathname.startsWith('/__/auth') || url.pathname.startsWith('/__/firebase')) return;

  // ── 动作 GIF:缓存优先 + 只留最近 GIF_MAX 张 ──
  if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith(GIF_PREFIX) && url.pathname.endsWith('.gif')) {
    e.respondWith(
      caches.open(GIF_CACHE).then(cache =>
        cache.match(e.request).then(hit => hit || fetch(e.request).then(r => {
          if (r.ok) cache.put(e.request, r.clone()).then(() => trimCache(GIF_CACHE, GIF_MAX)).catch(() => { });
          return r;
        }))
      )
    );
    return;
  }

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
  // 只缓存同源的(本 app 自己的文件);别的跨域 GET 照常走网络,不往缓存里无上限地塞
  const sameOrigin = url.origin === self.location.origin;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok && sameOrigin) { const c = r.clone(); caches.open(CACHE).then(cache => cache.put(e.request, c)) }
      return r;
    }).catch(() => caches.match(e.request))
  );
});

// ── 「主动找你」推送(push.js 订阅,后端 ~/fitness-coach/push.py 发):收到就弹通知;点通知打开 app 到对应页 ──
// 内容 {title, body, tag, url: './index.html#go=today'};iOS 要求每条推送都弹出通知,所以这里不做任何「静默」分支
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || '教练', {
    body: d.body || '', tag: d.tag || 'fit-coach', icon: './icon.png', data: { url: d.url || './index.html' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './index.html', self.registration.scope).href;
  const tab = (/[#&]go=(\w+)/.exec(url) || [])[1] || '';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list.find(w => w.url.startsWith(self.registration.scope));
    if (c) { if (tab) c.postMessage({ type: 'wp-open', tab }); return c.focus(); }   // app 开着:切到那一页
    return self.clients.openWindow(url);   // 没开着:冷启动,push.js 读地址里的 #go=
  }));
});

// 按放进去的先后删最旧的,只留 max 条
async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}
