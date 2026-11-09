/*
 * PWA-02: Caissa's service worker. Network first; the cache is only a fallback when offline.
 * Cached: pages, built assets, and the player's library and game answers.
 * Never cached: sign-in, the bot check, progress, jobs, and anything that is not a GET.
 * Sign-out sends "clear" and every cached page and API answer is deleted.
 */
const VERSION = "caissa-v1";
const PAGES = `${VERSION}-pages`;
const STATIC = `${VERSION}-static`;
const API = `${VERSION}-api`;
const CACHED_API = /^\/api\/caissa\/(?:library|games)\//;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear") {
    event.waitUntil(Promise.all([caches.delete(API), caches.delete(PAGES)]));
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC));
    return;
  }
  if (CACHED_API.test(url.pathname)) {
    event.respondWith(networkFirst(request, API));
    return;
  }
  if (request.mode === "navigate" && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/signin")) {
    event.respondWith(networkFirst(request, PAGES));
  }
});

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok && !response.redirected) {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
  return response;
}
