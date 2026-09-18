/* eslint-env serviceworker */
// PanahFit CMS — service worker (فاز ۲.۵)
// استراتژی: shell/network-first با fallback به کش (آفلاین شدن پنل) · استت‌ها cache-first · API هیچ‌وقت کش نمی‌شود
const SHELL_CACHE = 'pf-shell-v1'
const ASSET_CACHE = 'pf-assets-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icons/icon-192.png'])).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => ![SHELL_CACHE, ASSET_CACHE].includes(k)).map((k) => caches.delete(k)))))
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return // داده هرگز کش نمی‌شود

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { caches.open(SHELL_CACHE).then((c) => c.put('./index.html', res.clone())); return res })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    )
    return
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/media/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => { caches.open(ASSET_CACHE).then((c) => c.put(req, res.clone())); return res }))
    )
  }
})

/* ---- فاز ۴: پوش نوتیفیکیشن ---- */
self.addEventListener('push', (e) => {
  let data = {}
  try { data = e.data ? e.data.json() : {} } catch { data = { title: 'پناه‌فیت', body: e.data ? e.data.text() : '' } }
  const opts = {
    body: data.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: data.tag || 'panahfit',
    renotify: true,
    data: { url: data.url || './' },
    actions: [{ action: 'open', title: 'مشاهده' }],
  }
  e.waitUntil(self.registration.showNotification(data.title || 'پناه‌فیت ⚡', opts))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const url = e.notification.data?.url || './'
      for (const c of list) { if ('focus' in c) { c.navigate(url); return c.focus() } }
      return self.clients.openWindow(url)
    })
  )
})
