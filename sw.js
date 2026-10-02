/* Board Craft 서비스 워커
   - 화면(index.html): 네트워크 우선 → 실패하면 저장본(오프라인에서도 실행)
   - 아이콘·manifest: 저장본 우선
   - 새 버전을 올리면 다음 실행 때 네트워크에서 새 index.html 을 받아 저장본도 갱신된다.
   - 주소 하위 경로(예: https://아이디.github.io/BoardCraft/)에서도 동작하도록 모든 경로는 상대 경로. */
const VERSION = 'bc-29';
const CACHE = 'boardcraft-' + VERSION;
const CORE = ['./', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './maskable-192.png', './maskable-512.png', './apple-180.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('boardcraft-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const scopePath = new URL(self.registration.scope).pathname;
const isPage = (req, url) => req.mode === 'navigate' || url.pathname === scopePath || url.pathname.endsWith('/index.html');

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isPage(req, url)) {
    // 네트워크 우선 (새 버전 바로 반영), 오프라인이면 저장본
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res && res.ok) { const copy = res.clone(); cache.put('./', copy.clone()); cache.put('./index.html', copy); }
        return res;
      } catch (err) {
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // 그 밖의 같은 주소 파일: 저장본 우선, 없으면 받아서 저장
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
