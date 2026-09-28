const CACHE_NAME = 'certive-cache-v20260928_fase4';
// Bibliotecas com versão no nome do arquivo: nunca mudam, podem vir direto do cache
const RE_IMUTAVEL = /\/js\/vendor\/|\/icons\/|\/assets\//;
// Rede lenta: se o servidor não responder a tempo, usa a cópia guardada
const TEMPO_REDE_MS = 4000;
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/app.html',
  '/styles.css',
  '/app_v8.js',
  '/supabase-config.js',
  '/supabase-db.js',
  '/laudo_pdf_v2.js',
  '/js/laudo_certive.js',
  '/manifest.webmanifest',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/selo_procedencia.png',
  '/assets/laudo/capa_carro.png',
  '/js/vendor/remixicon-3.5.0/remixicon.css',
  '/js/vendor/remixicon-3.5.0/remixicon.woff2',
  '/js/vendor/jspdf-2.5.1.umd.min.js',
  '/js/vendor/pdf-lib-1.17.1.min.js',
  '/js/vendor/marked-18.0.14.umd.js',
  '/js/vendor/supabase-js-2.117.2.js',
  '/js/vendor/html2pdf-0.10.1.bundle.min.js',
  '/js/vendor/qrcodejs-1.0.0.min.js',
  '/js/vendor/pdfjs-3.11.174.min.js',
  '/js/vendor/purify.min.js',
  '/js/vendor/html2canvas.min.js'
];

// Instalação: guarda o app e as bibliotecas (um arquivo que falhar não impede os demais)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(ASSETS_TO_CACHE.map((url) =>
        cache.add(url).catch((err) => console.warn('[Service Worker] Não guardou', url, err))
      ))
    ).then(() => self.skipWaiting())
  );
});

// Ativação do Service Worker e limpeza de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deletando cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

function guardar(request, response) {
  if (response && response.status === 200 && response.type === 'basic') {
    const copia = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, copia));
  }
  return response;
}

// A cópia guardada ignora o "?v=" dos arquivos (a versão nova substitui a antiga)
function doCache(request) {
  return caches.match(request).then((r) => r || caches.match(request, { ignoreSearch: true }));
}

function semConexao(request) {
  if (request.mode === 'navigate') return caches.match('/app.html');
  return new Response('Sem conexão e sem cópia disponível.', {
    status: 503, statusText: 'Service Unavailable', headers: new Headers({ 'Content-Type': 'text/plain' })
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Só GET do próprio site passa pelo cache. API do Supabase, fontes externas e
  // envios (POST) vão direto para a rede.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Bibliotecas e imagens fixas: cache primeiro
  if (RE_IMUTAVEL.test(url.pathname)) {
    event.respondWith(
      doCache(request).then((r) => r || fetch(request).then((resp) => guardar(request, resp)))
        .catch(() => semConexao(request))
    );
    return;
  }

  // App (HTML, JS, CSS): rede primeiro, mas sem travar a tela em rede lenta
  event.respondWith(new Promise((resolve) => {
    let respondeu = false;
    const usarCache = () => doCache(request).then((r) => {
      if (respondeu) return;
      if (r) { respondeu = true; resolve(r); }
    });
    const timer = setTimeout(usarCache, TEMPO_REDE_MS);
    fetch(request).then((resp) => {
      clearTimeout(timer);
      guardar(request, resp);
      if (!respondeu) { respondeu = true; resolve(resp); }
    }).catch(() => {
      clearTimeout(timer);
      doCache(request).then((r) => {
        if (respondeu) return;
        respondeu = true;
        resolve(r || semConexao(request));
      });
    });
  }));
});

// ==========================================================
// NOTIFICAÇÕES PUSH (Web Push)
// ==========================================================
self.addEventListener('push', (event) => {
  let dados = { title: 'Certive Vistorias', body: '', url: '/app.html' };
  try {
    if (event.data) {
      const p = event.data.json();
      dados = { title: p.title || dados.title, body: p.body || '', url: p.url || '/app.html' };
    }
  } catch (e) {
    if (event.data) dados.body = event.data.text();
  }

  const options = {
    body: dados.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [120, 60, 120],
    tag: 'certive-caixa',
    renotify: true,
    data: { url: dados.url }
  };

  event.waitUntil(self.registration.showNotification(dados.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const alvo = (event.notification.data && event.notification.data.url) || '/app.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const c of lista) {
        if ('focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(alvo);
    })
  );
});
