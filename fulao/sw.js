/* 扶老圖片工具的離線快取。
   · 快取名稱一律以 "fulao-tool-" 開頭；清舊快取時只清自己的，不碰同一個網址底下其他網頁的快取。
   · 只存「成功的回應」。網頁本體先連網拿最新，但最多等 2.5 秒——訊號很差時不要讓人對著白畫面等，先用手機裡存的那一份。
   · 改版要把下面的版號加一。 */
const PREFIX = "fulao-tool-";
const V = PREFIX + "v3";
const CORE = ["./", "./index.html", "./manifest.webmanifest"];      // 少一個就裝不起來
const EXTRA = ["./icon-180.png", "./icon-512.png"];                 // 抓不到也不影響安裝
const WAIT = 2500;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(CORE).then(() => Promise.all(EXTRA.map(u => c.add(u).catch(() => {})))))
    .then(() => self.skipWaiting()));
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
    const net = fetch(e.request).then(r => r.ok ? keep(e, e.request, r) : Promise.reject(new Error("bad")));
    e.waitUntil(net.catch(() => {}));              // 逾時先用快取之後，晚到的回應照樣存起來（下次開就是新的）
    const slow = new Promise((_, rej) => setTimeout(() => rej(new Error("slow")), WAIT));
    e.respondWith(Promise.race([net, slow])
      .catch(() => hit(e.request).then(h => h || hit("./index.html")).then(h => h || net)));     // 連不到或太慢 → 用快取；連快取都沒有（第一次開）只能繼續等網路
    return;
  }
  e.respondWith(hit(e.request).then(h => h || fetch(e.request).then(r => keep(e, e.request, r))));
});
