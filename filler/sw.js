const V = "assistive-filler-v3";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-512.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const isPage = e.request.mode === "navigate" || /\.html($|\?)|\/$/.test(new URL(e.request.url).pathname);
  if (isPage) {                       // 網頁本體：先連網拿最新，連不到才用快取
    e.respondWith(fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(V).then(c => c.put(e.request, copy)).catch(() => {});
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })
                   .then(hit => hit || caches.match("./index.html"))));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit =>
    hit || fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(V).then(c => c.put(e.request, copy)).catch(() => {});
      return r;
    }).catch(() => caches.match("./index.html"))));
});
