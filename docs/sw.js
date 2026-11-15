// Octagon Edge offline cache.
// - Versioned files (app.js?v=…, style.css?v=…), flags and icons: served from the saved copy, so a
//   repeat visit opens instantly. A new ?v= is a new address, so updates still arrive.
// - The page and the data: network first, so picks and live results are never stale. The saved copy
//   is used when the phone is offline, or when the network takes more than 4 seconds (bad signal).
const CACHE = "octagon-edge-v2";
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));

const fixed = u => /[?&]v=/.test(u.search) || /\/flags\/|\.(svg|png|webmanifest)$/.test(u.pathname) && !/\/data\//.test(u.pathname);
// data URLs carry ?t=<time>; save one copy per file, not one per minute
const keyOf = u => /\/data\/|\.json$/.test(u.pathname) ? u.origin + u.pathname : u.href;

self.addEventListener("fetch", e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== "GET" || u.origin !== location.origin) return;
  if (fixed(u)) {
    e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) c.put(req, res.clone()); return res; }))));
    return;
  }
  const key = keyOf(u), page = req.mode === "navigate";
  const net = fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(page ? "./" : key, copy)); }
    return res;
  });
  const saved = () => caches.match(page ? "./" : key);
  e.respondWith(new Promise(resolve => {
    let done = false;
    const give = r => { if (!done && r) { done = true; resolve(r); } };
    const t = setTimeout(() => saved().then(give), 4000);
    net.then(r => { clearTimeout(t); give(r); })
       .catch(() => { clearTimeout(t); saved().then(r => give(r || Response.error())); });
  }));
});
