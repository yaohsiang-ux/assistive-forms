/* shared_autofill.js — 跨表單共用資料層 + 合併匯出
 *
 * 解決「一個個案要填多份報告，共同欄位重複輸入」：
 *   1. 評估者四欄自動帶預設值（單位/姓名/職稱/今日民國日期）
 *   2. 任一表單按「複製/匯出 JSON」時，把共同欄位存進 localStorage；
 *      開下一份表單時自動帶入（只填空欄，不覆蓋已填值）
 *   3. 每份匯出的報告 JSON 也暫存起來；浮動列「📦 合併匯出」一次吐出
 *      {"r01":…,"r16":…} 合併格式 —— 輔具報告一鍵產出.py 原生支援
 *   4. 換新個案前按「🗑 清除」；暫存資料 12 小時自動過期
 *
 * 掛載方式：各表單 </body> 前 <script src="shared_autofill.js"></script>
 */
(function () {
  "use strict";

  var KEY_SHARED = "af_shared";
  var KEY_REPORTS = "af_reports";
  var TTL_MS = 12 * 60 * 60 * 1000; // 12 小時過期

  var DEFAULTS = {
    f_eval_unit: "臺北市西區輔具資源中心",
    f_evaluator: "莊博文",
    f_eval_title: "甲類輔具評估人員",
  };

  // 共用的文字欄（id）。報告專屬的文字欄（需求原因、免評項目、各式說明）絕不同步。
  var TEXT_KEYS = [
    "f_height", "f_weight", "f_eval_unit", "f_evaluator", "f_eval_title", "f_eval_date",
    "dx_stroke_side", "dx_sci_level", "dx_tbi_side", "dx_other_text",
    "hip_w", "butt_knee", "cur_years", "result_yes_detail",
  ];

  // 勾選類採「name+value 完全相同才帶入」的通用規則；以下前綴為報告專屬，不同步
  var SKIP_PREFIX = ["item", "spec", "reason_", "policy", "cover", "acc_",
    "param", "sz", "pz", "cane", "walker", "rollator", "roll_", "posture",
    "pw_", "pa_", "tw_", "ta_", "trunk", "gait", "i1", "wheel", "frame",
    "front_", "rear_", "armrest", "legrest", "backrest", "seat_", "headrest",
    "brake", "pushrim", "dim_", "belt", "tray", "exempt"];

  function skip(name) {
    if (!name) return true;
    for (var i = 0; i < SKIP_PREFIX.length; i++)
      if (name.indexOf(SKIP_PREFIX[i]) === 0) return true;
    return false;
  }

  function load(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (obj._ts && Date.now() - obj._ts > TTL_MS) { localStorage.removeItem(key); return null; }
      return obj;
    } catch (e) { return null; }
  }
  function store(key, obj) {
    obj._ts = Date.now();
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
  }

  function rocToday() {
    var d = new Date();
    var mm = ("0" + (d.getMonth() + 1)).slice(-2);
    var dd = ("0" + d.getDate()).slice(-2);
    return (d.getFullYear() - 1911) + "/" + mm + "/" + dd;
  }

  // ── 1. 評估者預設值 ──
  function applyDefaults() {
    Object.keys(DEFAULTS).forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.value.trim()) el.value = DEFAULTS[id];
    });
    var dt = document.getElementById("f_eval_date");
    if (dt && !dt.value.trim()) dt.value = rocToday();
  }

  // ── 2. 共同欄位 存/取 ──
  function saveShared() {
    var s = { texts: {}, boxes: [] };
    TEXT_KEYS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.value.trim()) s.texts[id] = el.value.trim();
    });
    var sel = 'input[type="radio"]:checked, input[type="checkbox"]:checked';
    document.querySelectorAll(sel).forEach(function (el) {
      var name = el.name || el.id;
      if (skip(name)) return;
      s.boxes.push({ n: name, v: el.value, t: el.type });
    });
    store(KEY_SHARED, s);
  }

  function restoreShared() {
    var s = load(KEY_SHARED);
    if (!s) return 0;
    var n = 0;
    Object.keys(s.texts || {}).forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.value.trim()) { el.value = s.texts[id]; n++; }
    });
    (s.boxes || []).forEach(function (b) {
      if (skip(b.n)) return;
      var el = document.querySelector('input[name="' + b.n + '"][value="' + b.v + '"]');
      if (!el) return;
      if (el.type === "radio") {
        // 同組已有人為勾選就不動
        var grp = document.querySelectorAll('input[name="' + b.n + '"]:checked');
        if (grp.length) return;
      }
      if (!el.checked) { el.checked = true; n++; }
    });
    return n;
  }

  // ── 3. 報告 JSON 暫存 + 合併匯出 ──
  function reportCode(d) {
    var r = (d && d._report) || "";
    var m = r.match(/編號\s*0?(\d+)/);
    if (m) return "r" + ("0" + m[1]).slice(-2);
    if (r.indexOf("總結") >= 0) return "rS";
    return null;
  }

  function saveReport(d) {
    var code = reportCode(d);
    if (!code) return;
    var all = load(KEY_REPORTS) || {};
    all[code] = d;
    store(KEY_REPORTS, all);
    renderBar();
  }

  function savedCodes() {
    var all = load(KEY_REPORTS) || {};
    return Object.keys(all).filter(function (k) { return k.charAt(0) === "r"; }).sort();
  }

  function mergedJSON() {
    var all = load(KEY_REPORTS) || {};
    delete all._ts;
    return JSON.stringify(all, null, 2);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast("已複製合併 JSON"); },
        function () { legacyCopy(text); });
    } else legacyCopy(text);
  }
  function legacyCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { document.execCommand("copy"); toast("已複製合併 JSON"); }
    catch (e) { if (typeof showCopyModal === "function") showCopyModal(text); }
    document.body.removeChild(ta);
  }
  function toast(msg) {
    if (typeof showToast === "function") { showToast(msg); return; }
    var t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText = "position:fixed;bottom:70px;left:50%;transform:translateX(-50%);" +
      "background:#333;color:#fff;padding:8px 16px;border-radius:6px;z-index:99999;font-size:14px";
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }

  // ── 4. 浮動列 ──
  function renderBar() {
    var bar = document.getElementById("af-shared-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "af-shared-bar";
      bar.style.cssText = "position:fixed;bottom:0;left:0;right:0;z-index:99998;" +
        "background:rgba(40,44,52,.96);color:#fff;padding:7px 10px;font-size:13px;" +
        "display:flex;align-items:center;gap:8px;flex-wrap:wrap";
      document.body.appendChild(bar);
      document.body.style.paddingBottom = "52px";
    }
    var codes = savedCodes();
    var label = codes.length
      ? "本案已存：" + codes.map(function (c) { return c.replace("r", "") ; }).join("、")
      : "本案尚未匯出任何報告";
    bar.innerHTML =
      '<span style="opacity:.85">' + label + "</span>" +
      '<button id="af-merge" style="margin-left:auto;padding:5px 12px;border:0;border-radius:5px;' +
      'background:#4a9eff;color:#fff;font-size:13px">📦 合併匯出 (' + codes.length + ")</button>" +
      '<button id="af-clear" style="padding:5px 10px;border:0;border-radius:5px;' +
      'background:#666;color:#fff;font-size:13px">🗑 清除(換個案)</button>';
    document.getElementById("af-merge").onclick = function () {
      if (!savedCodes().length) { toast("還沒有暫存的報告——先按各表單的「複製 JSON」"); return; }
      copyText(mergedJSON());
    };
    document.getElementById("af-clear").onclick = function () {
      if (!confirm("清除本案暫存（共同欄位＋已匯出報告）？換新個案前請按此。")) return;
      localStorage.removeItem(KEY_SHARED);
      localStorage.removeItem(KEY_REPORTS);
      renderBar(); toast("已清除，可開始新個案");
    };
  }

  // ── 掛鉤 collectData：任何 複製/匯出/暫存 動作都會經過它 ──
  if (typeof window.collectData === "function") {
    var orig = window.collectData;
    window.collectData = function () {
      var d = orig();
      try { saveShared(); saveReport(d); } catch (e) {}
      return d;
    };
  }

  function init() {
    applyDefaults();
    var n = restoreShared();
    renderBar();
    if (n > 0) toast("已帶入 " + n + " 個共同欄位（上一份表單填過的）");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
