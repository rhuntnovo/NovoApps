// The build inserts the complete release manifest, including Vite's hashed JS/CSS.
// Do not register this source template directly; use npm run build / preview.
const PRECACHE = __NOVOAPPS_PRECACHE__;
const CACHE_PREFIX = "novo-apps-shell-";
const CACHE_NAME = `${CACHE_PREFIX}${PRECACHE.revision}`;

async function saveAsset(cache, url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Bypass the HTTP cache when assembling a new release snapshot.
    const response = await fetch(url, { cache: "reload", signal: controller.signal });
    if (!response.ok) throw new Error(`Cannot save ${url}: ${response.status}`);
    await cache.put(url, response);
  } finally {
    clearTimeout(timeout);
  }
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      // A release becomes usable only after ALL required files are saved.
      await Promise.all(PRECACHE.core.map(url => saveAsset(cache, url, 8000)));
    } catch (error) {
      // Leave the previous working release installed if the update is incomplete.
      await caches.delete(CACHE_NAME);
      throw error;
    }
    // Optional media must not prevent the text lesson from working offline.
    await Promise.all(PRECACHE.optional.map(url => saveAsset(cache, url, 5000).catch(() => {})));
    // Updates wait until the user has saved their work and tapped Update.
    // The first installation activates automatically without skipWaiting.
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type === "ACTIVATE_UPDATE") event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function cachedResponse(request, response) {
  // Mobile media players can request only part of a saved recording.
  const range = request.headers.get("Range");
  if (!range || response.status !== 200) return response;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return response;
  const body = await response.arrayBuffer();
  const size = body.byteLength;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  const headers = new Headers(response.headers);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(body.slice(start, end + 1), { status: 206, headers });
}

async function respond(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const navigation = request.mode === "navigate";
  // These are public same-origin release files. A CDN's Vary: Origin must not
  // hide precached JS/CSS when module/CORS requests add an Origin header.
  const cached = await cache.match(navigation ? "/" : request, { ignoreVary: true });
  // Startup never waits for an update check or a failed network connection.
  // Keep HTML, code, and curriculum together until a new worker is installed.
  if (cached) return cachedResponse(request, cached);

  if (self.navigator.onLine !== false) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(request, { signal: controller.signal });
      const path = new URL(request.url).pathname;
      // Recover media that could not be downloaded during installation.
      // Never replace core files individually or store partial (206) responses.
      if (response.status === 200 && PRECACHE.optional.includes(path)) {
        event.waitUntil(cache.put(path, response.clone()).catch(() => {}));
      }
      return response;
    } catch {
      // Fall through to a bounded, explicit offline response.
    } finally {
      clearTimeout(timeout);
    }
  }
  return new Response(navigation
    ? "This app has not finished downloading for offline use. Open it once with an internet connection, then try again."
    : "This file is not saved offline.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(respond(event.request, event));
});
