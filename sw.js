// Conteúdo para o arquivo sw.js

const CACHE_NAME = 'pauta-defensoria-cache-v2'; // Mudei a versão para forçar a atualização
const urlsToCache = [
    '/',
    './index.html', // Adicionei para garantir que a página principal seja cacheada
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    'https://alexdovale.github.io/ac-o-paula-controle/imagem.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cache aberto');
                return cache.addAll(urlsToCache.map(url => new Request(url, { mode: 'no-cors' })))
                    .catch(err => console.warn('Falha ao armazenar um ou mais itens em cache durante a instalação:', err));
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
                return fetch(event.request);
            })
    );
});
