// رگرسیون e2e: ریلود صفحه با سشن معتبر نباید گارد را به /login بفراند.
// باگ واقعی: initRemote در main.js await نمی‌شد و اولین ناوبری با authed=false اجرا می‌شد.
// راه‌حل: گارد قبل از بررسی auth، یک‌بار Promise مقداردهی (cms.ready) را await می‌کند.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { makeRouter } from '../router.js'
import { useCms } from '../stores/cms.js'

function jsonOk(data, status = 200) {
  return { ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) }
}
const PERMS = ['state:products', 'state:posts', 'state:coupons', 'state:requests', 'state:messages', 'state:provinces', 'state:settings', 'media', 'payments', 'users', 'audit', 'ai', 'queue']

function stubServer({ sessionOk }) {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const path = String(url).replace('/api', '').split('?')[0]
    if (path === '/health') return jsonOk({ ok: true })
    if (path === '/auth/me') return sessionOk
      ? jsonOk({ ok: true, username: 'admin', role: 'admin', roleLabel: 'مدیر کل', perms: PERMS })
      : jsonOk({ error: 'unauthorized' }, 401)
    if (path === '/state') return jsonOk({ rev: 5, products: [{ id: 1, title: 'لگ پناه', cat: 'legging', price: 100000, stock: 3, sold: 0, desc: '', image: '' }], posts: [], coupons: [], requests: [], messages: [], provinces: [], settings: {} })
    if (path === '/public/site') return jsonOk({ ok: true })
    return jsonOk({}, 404)
  }))
}

async function bootLikeReload(sessionOk, landing) {
  localStorage.clear()
  setActivePinia(createPinia())
  const cms = useCms()
  // دقیقاً مثل main.js: first mount-navigation while init promise is in flight
  cms.ready = cms.initRemote()
  const router = makeRouter()
  await router.push(landing).catch(() => {})
  await cms.ready
  return router
}

beforeEach(() => { window.history.replaceState({}, '', '/') })
afterEach(() => { vi.unstubAllGlobals() })

describe('گارد نشست پس از ریلود', () => {
  it('سشن معتبر روی /products: در login فرور نمی‌ماند و همان‌جا می‌ماند', async () => {
    stubServer({ sessionOk: true })
    const router = await bootLikeReload(true, '/products')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/products'))
  }, 10_000)

  it('سشن منقضی → /login با query.to برای بازگشت', async () => {
    stubServer({ sessionOk: false })
    const router = await bootLikeReload(false, '/products')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
    expect(router.currentRoute.value.query.to).toBe('/products')
  }, 10_000)

  it('/login با سشن معتبر → replace به مقصد query.to', async () => {
    stubServer({ sessionOk: true })
    const router = await bootLikeReload(true, '/login?to=/products')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/products'))
  }, 10_000)
})
