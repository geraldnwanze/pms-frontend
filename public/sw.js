/* EstateHub push service worker.
 * Receives Web Push messages and shows OS notifications; focuses/opens the app
 * on click. Payload shape (from the Laravel WebPushService):
 *   { title, body, url, tag, kind }
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'EstateHub', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'EstateHub';
  const options = {
    body: data.body || '',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: { url: data.url || '/notifications' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/notifications';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        const url = new URL(client.url);
        if (url.origin === self.location.origin && 'focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
