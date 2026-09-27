/*
 * Service Worker：外壳预缓存 + 页面/文档「网络优先、断网回落缓存」。
 * 厨房里没信号时也能翻食谱。
 *
 * __V__ / __BASE__ 由 scripts/build-static.mjs 在构建时替换。
 * 注意：这个文件必须放在站点根目录才能拿到整站 scope。
 */
var VERSION = '__V__';
var BASE = '__BASE__';
var CACHE = 'easyvlog-' + VERSION;

var SHELL = [
  BASE,
  BASE + 'index.html',
  BASE + 'site.json',
  BASE + 'manifest.webmanifest',
  BASE + 'assets/style.css?v=' + VERSION,
  BASE + 'assets/app.js?v=' + VERSION,
  BASE + 'assets/theme-init.js',
  BASE + 'assets/marked.min.js',
  BASE + 'assets/favicon.svg',
  BASE + 'assets/favicon.ico',
  BASE + 'assets/apple-touch-icon.png',
  BASE + 'assets/icon-192.png',
  BASE + 'assets/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil((async function () {
    var c = await caches.open(CACHE);
    await Promise.all(SHELL.map(function (u) {
      return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf(BASE) !== 0) return;

  /* 页面导航：网络优先，断网时回落到缓存（离线也能翻上次看过的页） */
  if (req.mode === 'navigate') {
    e.respondWith((async function () {
      try {
        var res = await fetch(req);
        if (res && res.ok) {
          var c = await caches.open(CACHE);
          c.put(req, res.clone());
        }
        return res;
      } catch (err) {
        var hit = (await caches.match(req)) || (await caches.match(BASE)) ||
          (await caches.match(BASE + 'index.html'));
        if (hit) return hit;
        throw err;
      }
    })());
    return;
  }

  /* 其余资源：缓存优先，后台顺带更新 */
  e.respondWith((async function () {
    var cached = await caches.match(req);
    var network = fetch(req).then(function (res) {
      if (res && res.ok) {
        caches.open(CACHE).then(function (c) { c.put(req, res.clone()); });
      }
      return res;
    }).catch(function () { return null; });
    return cached || (await network) || Response.error();
  })());
});
