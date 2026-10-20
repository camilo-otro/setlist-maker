// The web app used to live at /app/, with its service worker here. Browsers that opened it there
// still check this file for updates; this version removes that old worker and reloads its pages,
// which /app/ now redirects to the app's new home at the site's root (see _redirects).
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: 'window' })) {
        client.navigate(client.url);
      }
    })(),
  );
});
