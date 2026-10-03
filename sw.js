/* Board Craft 서비스 워커
   - 화면(index.html): 네트워크 우선 → 3초 안에 응답이 없거나 실패하면 저장본(오프라인·약한 신호에서도 바로 실행)
     저장본을 먼저 띄운 경우에도 네트워크 요청은 끝까지 기다려 저장본을 새 버전으로 갱신한다(다음 실행 때 반영).
   - 아이콘·manifest: 저장본 우선
   - 새 버전을 올리면 다음 실행 때 네트워크에서 새 index.html 을 받아 저장본도 갱신된다.
   - 주소 하위 경로(예: https://아이디.github.io/BoardCraft/)에서도 동작하도록 모든 경로는 상대 경로. */
const VERSION = 'bc-35';
const CACHE = 'boardcraft-' + VERSION;
const NET_TIMEOUT = 3000; // 화면 요청을 기다리는 최대 시간(ms). 저장본이 없으면(첫 실행) 끝까지 기다림.
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
    // 네트워크 우선(새 버전 바로 반영). 단, 3초 넘게 걸리면 저장본을 먼저 보여 준다.
    const net = (async () => {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res && res.ok && res.type === 'basic') {
        const cache = await caches.open(CACHE);
        const copy = res.clone();
        await Promise.all([cache.put('./', copy.clone()), cache.put('./index.html', copy)]);
      }
      return res;
    })();
    e.waitUntil(net.catch(() => {})); // 저장본을 먼저 보여 줘도 새 버전 저장은 끝까지
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const saved = (await cache.match('./index.html')) || (await cache.match('./'));
      if (!saved) {
        try { return await net; } catch (err) { return Response.error(); }
      }
      let timer;
      const late = new Promise((resolve) => { timer = setTimeout(() => resolve(saved), NET_TIMEOUT); });
      try {
        const res = await Promise.race([net, late]);
        // 서버 오류(5xx 등)면 저장본이 낫다
        return (res && (res.ok || res.type === 'opaqueredirect' || res.status === 304)) ? res : saved;
      } catch (err) {
        return saved;
      } finally {
        clearTimeout(timer);
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
