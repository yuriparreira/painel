// Service worker do Painel: guarda o app no aparelho para abrir sem internet.
const VERSION = 'painel-0.7.0';
const SHELL = ['./', './index.html', './app.css', './app.js', './data.js', './sync.js', './nuvem.js', './icons.js', './manifest.webmanifest',
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
    // Página: a da versão instalada, igual aos arquivos dela (uma página nova com o app.js antigo podia quebrar).
    // Um deploy novo chega inteiro: o navegador confere o sw.js ao abrir, instala a versão nova e o app oferece recarregar.
    e.respondWith(caches.open(VERSION).then(async (cache) => {
      const hit = (await cache.match('./index.html')) || (await cache.match('./'));
      if (hit) return hit;
      try { return await Promise.race([fetch(req), timeout(8000)]); } catch { return Response.error(); }
    }));
    return;
  }
  // Arquivos: só os da versão instalada, sem troca um a um em segundo plano. Assim o app nunca mistura arquivos de
  // versões diferentes (um app.js novo com um sync.js que não está no aparelho deixava a tela em branco sem internet).
  // A versão nova chega inteira quando este arquivo muda: todo deploy sobe o VERSION lá em cima.
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try { const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res; } catch { return Response.error(); }
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
