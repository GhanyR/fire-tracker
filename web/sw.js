/* Siaga Api: penyimpanan offline untuk regu lapangan.
   - Aplikasi, batas wilayah, dan citra dasar disimpan saat pertama dibuka.
   - Data (data/*.json) diambil dari jaringan dulu; bila sinyal hilang, pakai salinan terakhir.
   - Ubin citra satelit (Esri/EOX), ubin relief, dan paket 3D disimpan saat dilihat, atau lewat tombol "Simpan area untuk offline". */
const V = 'pantau-api-v6';
// Refresh the app shell while retaining downloaded field data and imagery.
const CACHE = {shell: V + '-shell', data: 'pantau-api-v5-data', tiles: 'pantau-api-v5-tiles', pkg: 'pantau-api-v5-pkg'};
const SHELL = ['./', 'index.html', 'img/world.jpg', 'img/imagery.jpg', 'img/terrain.jpg',
  'geo/adm1.json', 'geo/adm2.json', 'geo/neighbors.json', 'geo/peat.json', 'geo/places.json', 'geo/world.json', 'geo/world_cities.json',
  'https://cdn.jsdelivr.net/npm/deck.gl@9.1.14/dist.min.js'];
const TILE_MAX = 4000;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE.shell).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => /^pantau-api-v\d+-/.test(k) && !Object.values(CACHE).includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function networkFirst(req, cacheName, ms) {
  const c = await caches.open(cacheName);
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    const r = await fetch(req, { signal: ctl.signal, cache: 'no-cache' });
    clearTimeout(t);
    if (r.ok) c.put(req, r.clone());
    return r;
  } catch (e) {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw e;
  }
}
async function cacheFirst(req, cacheName, limit) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok || r.type === 'opaque') {
    c.put(req, r.clone());
    if (limit) c.keys().then(ks => { if (ks.length > limit) ks.slice(0, ks.length - limit).forEach(k => c.delete(k)); });
  }
  return r;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.hostname === 'server.arcgisonline.com' || u.hostname === 'tiles.maps.eox.at' || u.hostname.endsWith('s3.amazonaws.com') || u.hostname === 'gibs.earthdata.nasa.gov') {
    e.respondWith(cacheFirst(req, CACHE.tiles, TILE_MAX));
    return;
  }
  if (u.origin !== self.location.origin && u.hostname !== 'cdn.jsdelivr.net') return;
  if (/\/data\/inc3d\/|\/data\/basemap\//.test(u.pathname)) { e.respondWith(cacheFirst(req, CACHE.pkg, 1500)); return; }
  if (/\/data\//.test(u.pathname)) { e.respondWith(networkFirst(req, CACHE.data, 6000)); return; }
  if (req.mode === 'navigate') { e.respondWith(networkFirst(req, CACHE.shell, 5000)); return; }
  e.respondWith(cacheFirst(req, CACHE.shell));
});
