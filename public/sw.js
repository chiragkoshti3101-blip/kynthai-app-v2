/* Kynthai Service Worker
 *
 * Goals:
 * - New deploys take over immediately (skipWaiting + clients.claim)
 * - HTML navigations are always network-first (no stale shells)
 * - Static assets revalidate; offline fallback only when network fails
 * - DEPLOY_ID is injected at build time by scripts/cache-bust.js
 */

// BUILD: cache-bust rewrites this constant on every deploy
const DEPLOY_ID = 'alarm-fullscreen-v4'

const VERSION = `kynthai-${DEPLOY_ID}`
const STATIC_CACHE = `${VERSION}-static`
const RUNTIME_CACHE = `${VERSION}-runtime`

const PRECACHE_URLS = [
  '/offline.html',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/icon.svg',
  '/logo.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
        const cache = await caches.open(STATIC_CACHE)
        await cache.addAll(PRECACHE_URLS)
      } catch (e) {
        console.warn('[sw] precache partial failure', e)
      }
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
      )
      await self.clients.claim()
      const clients = await self.clients.matchAll({ type: 'window' })
      for (const client of clients) {
        client.postMessage({ type: 'SW_ACTIVATED', version: VERSION })
      }
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  let url
  try {
    url = new URL(req.url)
  } catch {
    return
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return

  // Never intercept Next internals or API — always network
  if (url.pathname.startsWith('/_next/') || url.pathname.startsWith('/api/')) {
    return
  }

  // Navigations: network-first, offline fallback only
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req, { cache: 'no-store' })
          if (fresh && fresh.ok) {
            const cache = await caches.open(RUNTIME_CACHE)
            cache.put(req, fresh.clone()).catch(() => {})
          }
          return fresh
        } catch {
          const cache = await caches.open(RUNTIME_CACHE)
          const cached = (await cache.match(req)) || (await cache.match('/offline.html'))
          if (cached) return cached
          return new Response('You are offline. Please reconnect to use Kynthai.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        }
      })(),
    )
    return
  }

  // Icons / offline page / manifest-ish static: stale-while-revalidate
  const isStaticAsset =
    url.pathname.startsWith('/_next/static/') ||
    /\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|gif|webp|svg|ico)$/i.test(url.pathname) ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/offline.html'

  if (isStaticAsset) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE)
        const cached = await cache.match(req)
        const networkPromise = fetch(req)
          .then((fresh) => {
            if (fresh && fresh.ok) {
              cache.put(req, fresh.clone()).catch(() => {})
            }
            return fresh
          })
          .catch(() => null)

        if (cached) {
          // Prefer network when available; fall back to cache
          const fresh = await networkPromise
          return fresh || cached
        }
        const fresh = await networkPromise
        if (fresh) return fresh
        return new Response('', { status: 504 })
      })(),
    )
  }
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Kynthai', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Kynthai'
  const tag = data.tag || 'kynthai-default'
  const isDose =
    String(tag).startsWith('reminder-') ||
    String(tag).startsWith('missed-') ||
    String(data.type || '').includes('remind') ||
    String(title).toLowerCase().includes('time to take')

  // If any app window is open (even background tab), wake full-screen alarm + ring
  const wakeClients = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const client of list) {
      try {
        client.postMessage({
          type: 'SHOW_MED_ALARM',
          title,
          body: data.body || '',
          tag,
          medName: data.medName || title,
          time: data.time || '',
          dosage: data.dosage || '',
          reminderId: data.reminderId || null,
        })
      } catch (_) { /* ignore */ }
    }
    return list.length
  })

  const alarmUrl = isDose
    ? (data.url || '/patient') + (String(data.url || '/patient').includes('?') ? '&' : '?') + 'alarm=1'
    : (data.url || '/')

  const options = {
    body: data.body || (isDose ? 'Open Kynthai — full-screen alarm' : ''),
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: isDose ? [400, 200, 400, 200, 400, 200, 400] : [100, 50, 100],
    data: {
      url: alarmUrl,
      type: data.type || tag,
      isDose,
      medName: data.medName || title,
      time: data.time || '',
      dosage: data.dosage || '',
      reminderId: data.reminderId || null,
    },
    tag: isDose ? 'kynthai-dose-alarm' : tag,
    renotify: true,
    requireInteraction: isDose,
    silent: false,
    // Android action buttons — still open full-screen alarm for Taken/Skip UI
    actions: isDose
      ? [
          { action: 'open-alarm', title: 'Open alarm' },
          { action: 'taken', title: 'Taken' },
        ]
      : [],
  }

  event.waitUntil(
    Promise.all([
      wakeClients,
      self.registration.showNotification(title, options),
    ]),
  )
})

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {}
  const isDose = data.isDose || event.notification.tag === 'kynthai-dose-alarm'
  event.notification.close()

  // Taken from notification tray — still open app so user confirms on full screen
  let targetUrl = data.url || '/'
  if (isDose) {
    targetUrl = '/patient?alarm=1'
    if (data.medName) {
      targetUrl += '&med=' + encodeURIComponent(String(data.medName).slice(0, 80))
    }
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        try {
          client.postMessage({
            type: 'SHOW_MED_ALARM',
            title: event.notification.title,
            body: event.notification.body,
            medName: data.medName,
            time: data.time,
            dosage: data.dosage,
            reminderId: data.reminderId,
            fromNotification: true,
            action: event.action || 'open',
          })
        } catch (_) { /* ignore */ }
        if ('focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
      return undefined
    }),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_VERSION' && event.ports?.[0]) {
    event.ports[0].postMessage(VERSION)
  }
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
