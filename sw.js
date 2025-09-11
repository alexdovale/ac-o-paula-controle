const CACHE_NAME = 'pauta-defensoria-cache-v2';
const urlsToCache = [
    '',
    'index.html',
    'pautas.html',
    'app.html',
    'cssstyle.css',
    'jsauth.js',
    'jspautas.js',
    'jsapp.js',
    'jsutils.js',
    'jsfirebase-config.js',
    'httpsalexdovale.github.ioac-o-paula-controleimagem.png',
    'httpscdn.tailwindcss.com',
    'httpsfonts.googleapis.comcss2family=Interwght@400;500;600;700&display=swap'
];

self.addEventListener('install', event = {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache = {
                console.log('Cache aberto');
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', event = {
    if (event.request.url.includes('firestore.googleapis.com')  event.request.url.includes('firebaseapp.com')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response = {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});

self.addEventListener('activate', event = {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames = {
      return Promise.all(
        cacheNames.map(cacheName = {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

