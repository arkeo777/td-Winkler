/* Social Media Dashboard service worker — offline caching + notification handling.
   Bump CACHE when you change any cached file; installed apps pick up the new
   version automatically on the next launch. */
var CACHE = "social-dashboard-v1";
var ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-180.png"
];

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).catch(function () {}));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  var sameOrigin = url.origin === self.location.origin;

  // Navigations: network first, fall back to cached shell when offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(function () { return caches.match("./index.html"); })
    );
    return;
  }

  if (sameOrigin) {
    // Cache-first for our own assets.
    e.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
          return res;
        });
      }).catch(function () { return caches.match("./index.html"); })
    );
  } else {
    // Cross-origin (fonts): stale-while-revalidate.
    e.respondWith(
      caches.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
          return res;
        }).catch(function () { return hit; });
        return hit || net;
      })
    );
  }
});

// The page asks the SW to show a notification (works when the page is visible
// or recently backgrounded, and is the delivery path for scheduled triggers).
self.addEventListener("message", function (e) {
  var d = e.data || {};
  if (d.type === "notify" && d.title) {
    self.registration.showNotification(d.title, d.options || {});
  }
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) { if ("focus" in list[i]) return list[i].focus(); }
      if (self.clients.openWindow) return self.clients.openWindow("./index.html");
    })
  );
});
