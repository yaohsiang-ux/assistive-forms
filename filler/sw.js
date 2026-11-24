/* 輔具報告填寫器的離線快取。
   · 快取名稱一律以 "assistive-filler-" 開頭；清舊快取時只清自己的，
     不碰同一個網址底下其他網頁的快取（同網址的網頁共用同一個快取空間）。
   · 只存「成功的回應」：GitHub 偶爾回錯誤頁時，不能把離線可用的那一版蓋掉。
   · 網頁本體先連網拿最新，連不到才用快取。改版要把下面的版號加一。 */
const PREFIX = "assistive-filler-";
const V = PREFIX + "v7";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-512.png"];
const FONTS = PREFIX + "font-kai-20261028";      // 照片標註用的楷體（約 4MB）：放自己的快取，填寫器改版時不用重抓；字型換版才改這個名字

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k.startsWith(PREFIX) && k !== V && k !== FONTS).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
function keep(req, res) {
  if (res && res.ok && res.type === "basic") {
    const copy = res.clone();
    caches.open(V).then(c => c.put(req, copy)).catch(() => {});
  }
  return res;
}
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;      // 只管自己網址的讀取；PDF 轉檔等跨網址請求不經手
  if (!url.pathname.startsWith(new URL("./", self.location).pathname)) return;        // 只管填寫器這個資料夾
  if (/\/kai\.woff$/.test(url.pathname)) {          // 字型：有就用快取的，沒有才上網抓，抓到存起來
    e.respondWith(caches.open(FONTS).then(c => c.match(e.request, { ignoreSearch: true }).then(hit =>
      hit || fetch(e.request).then(r => { if (r && r.ok && r.type === "basic") e.waitUntil(c.put(e.request, r.clone()).catch(() => {})); return r; }))));      // waitUntil：請瀏覽器等字型存完
    return;
  }
  const isPage = e.request.mode === "navigate" || /\.html($|\?)|\/$/.test(url.pathname);
  if (isPage) {
    e.respondWith(fetch(e.request).then(r => r.ok ? keep(e.request, r) : Promise.reject(new Error("bad")))
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match("./index.html"))));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit =>
    hit || fetch(e.request).then(r => keep(e.request, r))));
});
