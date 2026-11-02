// AERS en terreno: permite abrir la app sin internet.
// Al publicar cambios en index.html no hace falta tocar nada: la copia se renueva sola.
const CACHE = 'aers-v1';
const FONTS = 'aers-fuentes-v1';
const SHELL = ['./', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  // Si la sesión expiró, addAll falla (401) y la instalación se reintenta en la próxima visita.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FONTS).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Solo se guarda una respuesta real de la app; nunca la pantalla de ingreso (401) ni redirecciones.
async function refresh(key, request) {
  try {
    const res = await fetch(request, { cache: 'no-cache' });
    if (res.ok && !res.redirected && res.type === 'basic') {
      const c = await caches.open(CACHE);
      await c.put(key, res.clone());
    }
    return res;
  } catch (err) {
    return null;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }).catch(() => new Response('', { status: 504 })));
    return;
  }

  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  const key = req.mode === 'navigate' ? './' : req;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(key, { ignoreSearch: req.mode === 'navigate' });
    if (hit) {
      e.waitUntil(refresh(key, req.mode === 'navigate' ? './' : req)); // copia guardada al instante; se renueva por detrás
      return hit;
    }
    const res = await refresh(key, req.mode === 'navigate' ? req : req);
    return res || new Response('Sin conexión', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  })());
});
