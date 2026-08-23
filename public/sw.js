/* Kynthai Service Worker
 *
 * Goals:
 * - New deploys take over immediately (skipWaiting + clients.claim)
 * - HTML navigations are always network-first (no stale shells)
 * - Static assets revalidate; offline fallback only when network fails
 * - DEPLOY_ID is injected at build time by scripts/cache-bust.js
 */

// BUILD: cache-bust rewrites this constant on every deploy
const DEPLOY_ID = '20260823-closedapp-v3'

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
  const isDose = String(tag).startsWith('reminder-') || String(tag).startsWith('missed-')
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: isDose ? [200, 100, 200, 100, 200] : [100, 50, 100],
    data: { url: data.url || '/', type: data.type || tag },
    tag,
    renotify: true,
    requireInteraction: isDose,
    // Android shows app name from manifest; title+body is the OLX/Zomato pattern
    silent: false,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus()
        }
      }
      for (const client of clientList) {
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
