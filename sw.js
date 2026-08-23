const CACHE_NAME = 'certive-cache-v20260823_push';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/app.html',
  '/styles.css',
  '/app_v8.js',
  '/svg_templates.js',
  '/laudo_pdf_v2.js',
  '/supabase-db.js',
  '/manifest.webmanifest',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/selo_procedencia.png',
  'https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://unpkg.com/pdf-lib/dist/pdf-lib.min.js',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js'
];

// Instalação do Service Worker e cache inicial dos assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pré-cacheando App Shell e dependências...');
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[Service Worker] Falha ao pré-cachear alguns recursos: ', err);
      });
    }).then(() => self.skipWaiting())
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

// Estratégia Network-First com Fallback de Cache
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // NUNCA cachear chamadas da API do Supabase (supabase.co) nem dados dinâmicos REST
  if (url.hostname.includes('supabase.co') || url.pathname.includes('/rest/v1/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Apenas cachear requisições HTTP/HTTPS (ignora file:// e esquemas locais de desenvolvedor)
  if (!event.request.url.startsWith('http')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Estratégia Network-First: Tenta rede primeiro. Se falhar, busca no cache.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Se a resposta for válida, atualiza o cache em segundo plano
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Se a rede falhar, tenta buscar no cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // Se for uma navegação e falhar totalmente (sem cache e sem rede)
          if (event.request.mode === 'navigate') {
            return caches.match('/app.html');
          }

          // Retorna erro básico de rede se não houver cache
          return new Response('Sem conexão e sem cache disponível.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain' })
          });
        });
      })
  );
});
