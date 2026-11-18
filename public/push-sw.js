// Подключается в сгенерированный service worker через workbox importScripts.
self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { /* пустое или битое тело */ }
  event.waitUntil(self.registration.showNotification(d.title || 'Life RPG', {
    body: d.body || 'Тень не дремлет. Загляни в приложение.',
    tag: d.tag || 'life-rpg',
    icon: 'pwa-192x192.png',
    badge: 'pwa-64x64.png',
    data: { url: d.url || '/life-rpg/' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/life-rpg/', self.location.origin).href
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus()
    return self.clients.openWindow(url)
  }))
})
