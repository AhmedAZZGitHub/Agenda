// sw.js - Service Worker pour Application Agenda Bac PWA
const CACHE_NAME = "agenda-bac-v19.6";

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/arabic-knowledge.js",
  "./js/jarvis-engine.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/icon-maskable.png"
];

// Installation : mise en cache des ressources critiques
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("Échec partiel mise en cache initiale:", err);
      });
    })
  );
});

// Activation : nettoyage des anciens caches & prise de contrôle immédiate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Stratégie Network-First pour toujours avoir la dernière version si en ligne
self.addEventListener("fetch", (event) => {
  const request = event.request;
  
  // Ignorer les requêtes non-GET et les requêtes Firebase / Google AI / externes
  if (
    request.method !== "GET" ||
    request.url.startsWith("chrome-extension://") ||
    request.url.includes("firestore.googleapis.com") ||
    request.url.includes("generativelanguage.googleapis.com") ||
    request.url.includes("firebaseio.com") ||
    request.url.includes("identitytoolkit.googleapis.com")
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // En cas de coupure internet, récupération depuis le cache
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (request.mode === "navigate") {
            return caches.match("./index.html");
          }
        });
      })
  );
});

// Clic sur une notification système mobile
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow("./index.html");
      }
    })
  );
});
