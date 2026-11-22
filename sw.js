const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./js/version.js",
  "./js/presets.js",
  "./js/ballistics.js",
  "./js/app.js",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable.png",
];

async function versionName() {
  const response = await fetch("./js/version.js", { cache: "no-cache" });
  const text = await response.text();
  const match = text.match(/VERSION\s*=\s*"([^"]+)"/);
  return match ? match[1] : "0";
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(`poicalc-${await versionName()}`);
      await cache.addAll(ASSETS);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = `poicalc-${await versionName()}`;
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith("poicalc-") && key !== keep).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

async function appCache() {
  const keys = await caches.keys();
  const name = keys.find((key) => key.startsWith("poicalc-"));
  return name ? caches.open(name) : null;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith("/sw.js")) return;

  event.respondWith(
    (async () => {
      const cache = await appCache();
      if (cache) {
        const hit = await cache.match(request);
        if (hit) return hit;
      }
      try {
        const fresh = await fetch(request);
        if (cache && fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      } catch (error) {
        if (cache && request.mode === "navigate") {
          return (await cache.match("./index.html")) || (await cache.match("./")) || Promise.reject(error);
        }
        throw error;
      }
    })(),
  );
});
