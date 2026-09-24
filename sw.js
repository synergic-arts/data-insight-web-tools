const CACHE = 'data-insight-v15';
const ASSETS = ['./', './index.html', './dashboard-studio/index.html', './herramientas/data-profiler/index.html', './herramientas/transform-lab/index.html', './herramientas/pivot-lab/index.html', './herramientas/pivot-lab/app.js', './herramientas/pivot-lab/styles.css', './shared/styles.css?v=20260925-13', './shared/ux.css?v=20260925-13', './shared/app.js?v=20260925-13', './shared/data.js', './shared/charts.js', './manifest.webmanifest', './favicon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('data-insight-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const versioned = new URL(event.request.url).searchParams.has('v');
  event.respondWith(versioned
    ? fetch(event.request).then(response => { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request))
    : caches.match(event.request).then(cached => cached || fetch(event.request).then(response => { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response; }).catch(() => caches.match('./index.html'))));
});
