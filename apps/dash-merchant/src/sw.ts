/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
clientsClaim();

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

// SPA navigations: network only; branded offline page if the fetch fails.
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkOnly({
    plugins: [
      {
        handlerDidError: async () =>
          (await caches.match('/offline.html', { ignoreSearch: true })) || Response.error(),
      },
    ],
  }),
);

// Live backends — never cache auth or business payloads.
registerRoute(
  ({ url }) =>
    url.hostname.endsWith('supabase.co') ||
    url.hostname.includes('stripe.com') ||
    url.hostname.includes('paypal.com') ||
    url.hostname.includes('wipayfinancial.com') ||
    url.hostname.includes('mapbox.com') ||
    url.hostname.includes('sentry.io'),
  new NetworkOnly(),
);

registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'roam-partner-images',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 64,
        maxAgeSeconds: 60 * 60 * 24 * 7,
      }),
    ],
  }),
);

// Web push — merged from retired public/sw.js
self.addEventListener('push', (event) => {
  let payload = { title: 'New order', body: 'You have a new order', url: '/orders' };

  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch {
    // use defaults
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url || '/orders';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          void client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }),
  );
});
