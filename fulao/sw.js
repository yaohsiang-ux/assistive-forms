/* 扶老圖片工具的離線快取。
   · 快取名稱一律以 "fulao-tool-" 開頭；清舊快取時只清自己的，不碰同一個網址底下其他網頁的快取。
   · 只存「成功的回應」。網頁本體先連網拿最新，連不到才用快取。改版要把下面的版號加一。 */
const PREFIX = "fulao-tool-";
const V = PREFIX + "v1";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k.startsWith(PREFIX) && k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
function keep(e, req, res) {                       // 把新拿到的存進快取；要跟瀏覽器說「等我存完」，不然回應一送出就可能被中斷
  if (res && res.ok && res.type === "basic") {
    const copy = res.clone();
    e.waitUntil(caches.open(V).then(c => c.put(req, copy)).catch(() => {}));
  }
  return res;
}
const hit = req => caches.open(V).then(c => c.match(req, { ignoreSearch: true }));     // 只查這一版自己的快取
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(new URL("./", self.location).pathname)) return;        // 只管這個工具自己的資料夾
  const isPage = e.request.mode === "navigate" || /\.html($|\?)|\/$/.test(url.pathname);
  if (isPage) {
    e.respondWith(fetch(e.request).then(r => r.ok ? keep(e, e.request, r) : Promise.reject(new Error("bad")))
      .catch(() => hit(e.request).then(h => h || hit("./index.html"))));
    return;
  }
  e.respondWith(hit(e.request).then(h => h || fetch(e.request).then(r => keep(e, e.request, r))));
});
