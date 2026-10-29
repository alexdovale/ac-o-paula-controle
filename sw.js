// Conteúdo para o arquivo sw.js corrigido

const CACHE_NAME = 'pauta-defensoria-cache-v3'; // Atualizado para limpar o cache anterior

const urlsToCache = [
    './',
    './index.html',
    './mesa_digital.html',
    './manual.html',
    './css/style.css',
    './js/main.js',
    './js/detalhes.js',
    './js/pdfService.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    './assets/logo/logo_sigep.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cache aberto');
                // Faz o cache individualmente para evitar que uma falha externa derrube tudo
                return Promise.allSettled(
                    urlsToCache.map(url => {
                        return cache.add(new Request(url, { mode: 'no-cors' }))
                            .catch(err => console.warn('Não foi possível fazer cache de:', url, err));
                    })
                );
            })
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
    // Não cacheia requisições do Firestore para evitar dados desatualizados
    if (event.request.url.includes('firestore.googleapis.com')) {
        return; 
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Se encontrar no cache, retorna
                if (response) {
                    return response;
                }
                // Senão, busca na rede
                return fetch(event.request).catch(() => {
                    // Fallback opcional caso esteja offline e a página não esteja no cache
                });
            })
    );
});
