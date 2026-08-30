/* Kynthai Service Worker
 *
 * Goals:
 * - New deploys take over immediately (skipWaiting + clients.claim)
 * - HTML navigations are always network-first (no stale shells)
 * - Static assets revalidate; offline fallback only when network fails
 * - DEPLOY_ID is injected at build time by scripts/cache-bust.js
 */

// BUILD: cache-bust rewrites this constant on every deploy
const DEPLOY_ID = '9905db5-mtfmoxxn'

const VERSION = `kynthai-${DEPLOY_ID}`
const STATIC_CACHE = `${VERSION}-static`
const RUNTIME_CACHE = `${VERSION}-runtime`
const flag = (value) => value === true || value === '1' || value === 'true'

const PRECACHE_URLS = [
  '/offline.html',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/icon.svg',
  '/logo.svg',
  '/med-chime.wav',
  '/med-chime.wav',
  '/sounds/med-chime.wav',
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
  const body = data.body || ''
  const tag = data.tag || data.type || 'kynthai-default'
  const typeStr = String(data.type || tag || title).toLowerCase()
  // Generic payloads carry the dose signal in structured fields — detect those
  // FIRST so PHI-free titles ("Medication reminder") still get alarm treatment.
  const embedded = data.data && typeof data.data === 'object' ? data.data : {}
  const isDose =
    flag(data.isDose) ||
    flag(embedded.isDose) ||
    !!data.reminderId ||
    !!embedded.reminderId ||
    String(tag) === 'reminder' ||
    typeStr.includes('dose') ||
    typeStr.includes('remind') ||
    typeStr.includes('missed') ||
    typeStr.includes('escalat') ||
    String(title).toLowerCase().includes('time to take') ||
    String(tag).startsWith('reminder-') ||
    String(tag).startsWith('missed-')
  const isEmergency =
    flag(data.isEmergency) ||
    typeStr.includes('sos') ||
    typeStr.includes('emerg') ||
    typeStr.includes('alert') ||
    String(title).toLowerCase().includes('sos')
  const isClinical =
    isDose ||
    isEmergency ||
    typeStr.includes('appoint') ||
    typeStr.includes('consult') ||
    typeStr.includes('lab') ||
    typeStr.includes('booking') ||
    typeStr.includes('family')

  // Wake any open client into full-screen critical UI
  const wakeClients = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((list) => {
      for (const client of list) {
        try {
          client.postMessage({
            type: isDose || isEmergency ? 'SHOW_MED_ALARM' : 'SHOW_CRITICAL_ALERT',
            title,
            body,
            tag,
            medName: data.medName || embedded.medName || title,
            time: data.time || embedded.time || '',
            dosage: data.dosage || embedded.dosage || '',
            reminderId: data.reminderId || embedded.reminderId || null,
            medicationId: data.medicationId || embedded.medicationId || null,
            clinical: isClinical,
            emergency: isEmergency,
          })
        } catch (_) {}
      }
      return list.length
    })

  let openUrl = data.url || '/'
  const rid = data.reminderId || embedded.reminderId
  const mid = data.medicationId || embedded.medicationId
  if (isDose || isEmergency) {
    const base = (openUrl.split('?')[0] || '/patient')
    // Only rebuild when the payload did not provide a full deep link already
    openUrl = data.url && data.url.includes('alarm=1') ? data.url : base + '?alarm=1'
    if (data.medName && !openUrl.includes('med=')) openUrl += '&med=' + encodeURIComponent(String(data.medName).slice(0, 80))
    if (rid && !openUrl.includes('rid=')) openUrl += '&rid=' + encodeURIComponent(String(rid))
    if (mid && !openUrl.includes('mid=')) openUrl += '&mid=' + encodeURIComponent(String(mid))
  }

  // iOS PWA: requireInteraction + notification actions often leave sticky /
  // "floating" banners that will not dismiss cleanly. Keep those Android-only.
  const ua = (self.navigator && self.navigator.userAgent) || ''
  const isIOS =
    /iPad|iPhone|iPod/i.test(ua) ||
    (self.navigator && self.navigator.platform === 'MacIntel' && (self.navigator.maxTouchPoints || 0) > 1)

  const options = {
    body: body || (isDose ? 'Open to mark Taken or Skip' : 'Open Kynthai'),
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: {
      url: openUrl,
      type: data.type || tag,
      isDose,
      isEmergency,
      isClinical,
      medName: data.medName || embedded.medName || title,
      time: data.time || embedded.time || '',
      dosage: data.dosage || embedded.dosage || '',
      reminderId: data.reminderId || embedded.reminderId || null,
      medicationId: data.medicationId || embedded.medicationId || null,
    },
    tag: isDose ? 'kynthai-dose-alarm' : isEmergency ? 'kynthai-emergency' : String(tag),
    // Replace prior same-tag alert instead of stacking broken floaters on iOS
    renotify: !isIOS,
    requireInteraction: isIOS ? false : isClinical,
    silent: false,
    // Browsers that honor custom sounds use the clinical chime; Chrome/Android
    // fall back to the system default (still audible because silent=false).
    // iOS system banners are ALWAYS silent for web push (Apple platform
    // limitation) — the chime rings in-app when the alarm screen opens.
    sound: isClinical ? '/sounds/med-chime.wav' : undefined,
  }
  if (!isIOS) {
    options.vibrate = isClinical
      ? [500, 200, 500, 200, 500]
      : [120, 60, 120]
    options.actions = isDose
      ? [
          { action: 'open-alarm', title: 'Open reminder' },
          { action: 'taken', title: 'Taken' },
        ]
      : isClinical
        ? [{ action: 'open', title: 'Open' }]
        : []
  }

  event.waitUntil(
    Promise.all([wakeClients, self.registration.showNotification(title, options)]),
  )
})

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {}
  const isDose = flag(data.isDose) || event.notification.tag === 'kynthai-dose-alarm'
  const isEmergency = flag(data.isEmergency) || event.notification.tag === 'kynthai-emergency'
  // Do NOT close clinical notifications until app is focused — keep visible if open fails
  if (!data.isClinical) event.notification.close()
  else event.notification.close()

  let targetUrl = data.url || '/'
  if (isDose || isEmergency) {
    targetUrl = data.url && data.url.includes('alarm=1') ? data.url : '/patient?alarm=1'
    if (data.medName && !targetUrl.includes('med=')) {
      targetUrl += '&med=' + encodeURIComponent(String(data.medName).slice(0, 80))
    }
    if (data.reminderId && !targetUrl.includes('rid=')) {
      targetUrl += '&rid=' + encodeURIComponent(String(data.reminderId))
    }
    if (data.medicationId && !targetUrl.includes('mid=')) {
      targetUrl += '&mid=' + encodeURIComponent(String(data.medicationId))
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
            medicationId: data.medicationId,
            fromNotification: true,
            emergency: isEmergency,
            action: event.action || 'open',
          })
        } catch (_) {}
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
