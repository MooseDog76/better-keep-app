// AbleMemo service worker.
// It keeps a copy of the app itself so it opens quickly and can be installed.
// It never stores your notes: those go straight to Supabase.
// When something is shared to AbleMemo from another app, it holds it briefly until you press Save.
const CACHE = 'better-keep-shell-v3'
const SHARE = 'better-keep-share'
const SHELL = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== SHARE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Android's share sheet sends the shared page, text or files here. Keep them, then open the Save screen.
async function receiveShare(request) {
  const form = await request.formData()
  const cache = await caches.open(SHARE)
  for (const key of await cache.keys()) await cache.delete(key)
  const files = form.getAll('files').filter((f) => f && typeof f === 'object' && f.size > 0)
  const meta = {
    title: String(form.get('title') || ''),
    text: String(form.get('text') || ''),
    url: String(form.get('url') || ''),
    files: files.map((f, i) => ({ key: `./__share/file-${i}`, name: f.name || `Shared file ${i + 1}`, type: f.type || '' })),
    at: Date.now(),
  }
  for (const [i, f] of files.entries()) {
    await cache.put(meta.files[i].key, new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream' } }))
  }
  await cache.put('./__share/meta', new Response(JSON.stringify(meta), { headers: { 'content-type': 'application/json' } }))
  return Response.redirect('./?share=1', 303)
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method === 'POST' && new URL(request.url).pathname.endsWith('/share-target')) {
    event.respondWith(receiveShare(request).catch(() => Response.redirect('./?share=failed', 303)))
    return
  }
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Version files must always come fresh from the web, never from the saved copy.
  if (url.pathname.endsWith('version.json') || url.pathname.endsWith('notices.json')) return

  // The page itself: try the network first so updates arrive, fall back to the saved copy.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put('./', copy))
          return response
        })
        .catch(() => caches.match('./')),
    )
    return
  }

  // Scripts, styles, fonts and icons: use the saved copy if there is one, otherwise fetch and save.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})

// A reminder alert from the "send-reminders" helper. It is shown even when AbleMemo is closed.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Reminder', body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Reminder', {
      body: data.body || 'Reminder from AbleMemo',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: data.noteId ? `reminder-${data.noteId}` : 'reminder',
      requireInteraction: true,
      data: { noteId: data.noteId || '' },
    }),
  )
})

// Pressing the alert opens AbleMemo at that note.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const noteId = event.notification.data?.noteId || ''
  const target = new URL(noteId ? `./?note=${encodeURIComponent(noteId)}` : './', self.registration.scope).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.registration.scope))
      if (open) {
        open.postMessage({ type: 'open-note', noteId })
        return open.focus()
      }
      return self.clients.openWindow(target)
    }),
  )
})
