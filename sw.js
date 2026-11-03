// Service worker do wireframe: guarda o app no aparelho para abrir sem internet.
const VERSION = 'painel-wf-0.2.0';
const SHELL = ['./', './index.html', './app.css', './app.js', './data.js', './icons.js', './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

// Instala com cópias novas (ignora o cache HTTP de 10 min do GitHub Pages), para não guardar a versão anterior.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Página: rede primeiro (até 3 s), senão a cópia do aparelho. Assim um deploy novo chega na próxima abertura.
    e.respondWith(caches.open(VERSION).then(async (cache) => {
      try { const res = await Promise.race([fetch(req, { cache: 'no-cache' }), timeout(3000)]); if (res.ok) cache.put('./index.html', res.clone()); return res; }
      catch { return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error(); }
    }));
    return;
  }
  // Arquivos: o que está guardado abre na hora; a versão nova é buscada em segundo plano, até o fim.
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req, { cache: 'no-cache' }).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net.catch(() => Response.error());
  }));
});
// Lembretes reais virão do servidor (Web Push). Este manipulador já está pronto para eles.
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Painel', { body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.tag, data: { url: d.url || './#/hoje' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './#/hoje';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
