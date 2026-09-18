// همگام‌سازی دوسویه‌ی استور با سرور — fetch کاملاً mock است
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'

const serverState = () => ({
  products: [{ id: 1, title: 'از سرور', cat: 'set', price: 10, stock: 1, sold: 0 }],
  posts: [], coupons: [], requests: [], messages: [], provinces: [],
  settings: { newDiscount: false }, rev: 111,
})

let state, calls, putCount, authedSess
function installFetch({ online = true, me = true } = {}) {
  state = serverState(); calls = []; putCount = 0; authedSess = me
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    const u = String(url); const method = opts.method || 'GET'
    calls.push({ u, method })
    const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data })
    if (u.includes('/health')) return json(online ? { ok: true } : {})
    if (u.includes('/auth/me')) return authedSess ? json({ ok: true, username: 'admin' }) : json({ error: 'no' }, 401)
    if (u.includes('/auth/login')) return json({ ok: true, username: 'admin' })
    if (u.includes('/auth/logout')) { authedSess = false; return json({ ok: true }) }
    if (u.includes('/state') && method === 'PUT') {
      putCount++
      if (calls.filter((c) => c.method === 'PUT').length === 2 && calls[0] && opts.body && opts.body.__fail) return json({ error: 'boom' }, 500)
      Object.assign(state, JSON.parse(opts.body))
      return json({ ok: true, rev: 222 })
    }
    if (u.includes('/state')) return json(state)
    return json({ error: 'nf' }, 404)
  }))
}

async function freshCms() {
  vi.resetModules()
  const { useCms } = await import('../stores/cms.js')
  return useCms()
}

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); setActivePinia(createPinia()) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

const { setActivePinia: sp2 } = { setActivePinia: null } // noop guard

describe('store ⇄ server sync', () => {
  it('initRemote online: flags, session restore, state hydration', async () => {
    installFetch({ online: true, me: true })
    const cms = await freshCms()
    const ok = await cms.initRemote()
    await vi.advanceTimersByTimeAsync(50)
    expect(ok).toBe(true)
    expect(cms.online).toBe(true)
    expect(cms.authed).toBe(true)
    expect(cms.user).toBe('admin')
    expect(cms.products[0].title).toBe('از سرور') // hydrate از سرور
    expect(cms.settings.newDiscount).toBe(false)
  })

  it('initRemote offline: everything keeps working locally', async () => {
    installFetch({ online: false })
    const cms = await freshCms()
    expect(await cms.initRemote()).toBe(false)
    expect(cms.online).toBe(false)
    expect(cms.sync.status).toBe('offline')
    cms.saveProduct({ title: 'محلی بدون سرور', cat: 'set', price: 5, stock: 1 })
    expect(cms.products.some((p) => p.title === 'محلی بدون سرور')).toBe(true)
    expect(calls.some((c) => c.method === 'PUT')).toBe(false) // بدون سرور هیچ push نیست
  })

  it('debounced push after mutations; snapshot prevents echo push', async () => {
    installFetch({ online: true, me: true })
    const cms = await freshCms()
    await cms.initRemote()
    await vi.advanceTimersByTimeAsync(1000)
    expect(putCount).toBe(0) // صرفِ pull نباید push کند

    cms.saveProduct({ title: 'تغییر جدید در محصول', cat: 'set', price: 1234, stock: 2 })
    await nextTick()
    expect(putCount).toBe(0) // debounce — هنوز نه
    await vi.advanceTimersByTimeAsync(1200) // persist 250 + push 600
    expect(putCount).toBe(1)
    expect(cms.sync.status).toBe('ok')
    expect(state.products.some((p) => p.title === 'تغییر جدید در محصول')).toBe(true)

    cms.removeProduct(2)
    await nextTick()
    await vi.advanceTimersByTimeAsync(1200)
    expect(putCount).toBe(2)
    expect(state.products.find((p) => p.id === 2)).toBeFalsy()
  })

  it('login (online): server-wins pull, no destructive auto-push', async () => {
    installFetch({ online: true, me: false })
    const cms = await freshCms()
    await cms.initRemote()
    await vi.advanceTimersByTimeAsync(100)
    const r = await cms.login('admin', 'whatever')
    expect(r.ok).toBe(true)
    expect(cms.authed).toBe(true)
    expect(cms.products[0].title).toBe('از سرور') // pull پس از ورود
    expect(calls.some((c) => c.u.includes('/auth/login') && c.method === 'POST')).toBe(true)
    await vi.advanceTimersByTimeAsync(300)
    expect(putCount).toBe(0) // بدون تغییر محلی، PUT مخرب انجام نمی‌شود
    // اما اولین تغییر بعدی همگام می‌شود
    cms.saveProduct({ title: 'تغییر بعد از ورود', cat: 'set', price: 1, stock: 1 })
    await vi.advanceTimersByTimeAsync(1200)
    expect(putCount).toBe(1)
  })

  it('logout calls api and clears session', async () => {
    installFetch({ online: true, me: true })
    const cms = await freshCms()
    await cms.initRemote()
    await vi.advanceTimersByTimeAsync(100)
    await cms.logout()
    expect(cms.authed).toBe(false)
    expect(authedSess).toBe(false)
  })

  it('push error → toast with retry action → success on retry', async () => {
    installFetch({ online: true, me: true })
    const cms = await freshCms()
    await cms.initRemote()
    await vi.advanceTimersByTimeAsync(100)
    // خطای ساختگی در PUT بعدی
    const realFetch = globalThis.fetch
    let failOnce = true
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
      if (failOnce && opts.method === 'PUT') { failOnce = false; return { ok: false, status: 503, json: async () => ({ error: 'سرور در دسترس نیست' }) } }
      return realFetch(url, opts)
    }))
    cms.saveProduct({ title: 'تغییری که باید سينک شود', cat: 'set', price: 10, stock: 1 })
    await nextTick()
    await vi.advanceTimersByTimeAsync(1200)
    expect(cms.sync.status).toBe('error')
    expect(cms.toasts.length).toBe(1)
    expect(cms.toasts[0].text).toContain('همگام‌سازی')
    // تلاش مجدد از طریق action توست
    cms.runToastAction(cms.toasts[0])
    await vi.advanceTimersByTimeAsync(100)
    expect(cms.sync.status).toBe('ok')
  })

  it('pullState replaces local data and re-baselines snapshot', async () => {
    installFetch({ online: true, me: true })
    const cms = await freshCms()
    await cms.initRemote()
    await vi.advanceTimersByTimeAsync(100)
    state.products.push({ id: 42, title: 'از طرف دیگر سرور', cat: 'set', price: 1, stock: 1 })
    const ok = await cms.pullState()
    expect(ok).toBe(true)
    expect(cms.products.find((p) => p.id === 42)).toBeTruthy()
    await vi.advanceTimersByTimeAsync(1200)
    expect(putCount).toBe(0) // pull نباید push برگشتی ایجاد کند
  })

  it('generateCaption routes through server when online', async () => {
    installFetch({ online: true, me: true })
    const cms = await freshCms()
    await cms.initRemote()
    await vi.advanceTimersByTimeAsync(50)
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
      if (String(url).includes('/ai/caption')) return { ok: true, status: 200, json: async () => ({ caption: 'کپشن سروری خفن', source: 'openai' }) }
      return { ok: true, status: 200, json: async () => ({}) }
    }))
    const r = await cms.generateCaption('لگ تست', 'energetic')
    expect(r).toMatchObject({ caption: 'کپشن سروری خفن' })
    expect(r.source).toContain('OpenAI')
  })
})

describe('concurrency & media (2.5)', () => {
  it('409 conflict → local dirty collections re-applied over fresh server base', async () => {
    let serverProducts = [{ id: 1, title: 'از سرور', cat: 'set', price: 10, stock: 1, sold: 0 }]
    let serverRev = 5
    let putCount = 0
    let conflictSent = false
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
      const u = String(url); const method = opts.method || 'GET'
      const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data })
      const state = () => ({ products: serverProducts, posts: [], coupons: [{ code: 'CONC', percent: 5, maxUses: 0, used: 0, active: true }], requests: [], messages: [], provinces: [], settings: {}, rev: serverRev })
      if (u.includes('/health')) return json({ ok: true })
      if (u.includes('/auth/me')) return json({ ok: true, username: 'admin', role: 'admin', perms: ['state:products'] })
      if (u.includes('/state') && method === 'PUT') {
        putCount++
        const body = JSON.parse(opts.body)
        if (body.rev !== undefined && body.rev !== serverRev) { // force push بدون rev همیشه پذیرفته است
          conflictSent = true
          // تغییر همزمان روی سرور اعمال می‌شود
          serverProducts = [{ id: 1, title: 'از سرور', cat: 'set', price: 10, stock: 1, sold: 0 }, { id: 4, title: 'محصول ادیتور دیگر', cat: 'set', price: 1, stock: 1 }]
          serverRev = 6
          return json({ error: 'conflict', currentRev: 6, state: state() }, 409)
        }
        serverProducts = body.products
        serverRev++
        return json({ ok: true, rev: serverRev })
      }
      if (u.includes('/state')) return json(state())
      return json({ error: 'nf' }, 404)
    }))
    vi.useFakeTimers()
    setActivePinia(createPinia())
    localStorage.clear()
    vi.resetModules()
    const { useCms } = await import('../stores/cms.js')
    const cms = useCms()
    await cms.initRemote()
    await vi.advanceTimersByTimeAsync(50)
    // تغییر محلی (products کثیف می‌شود)
    cms.saveProduct({ title: 'ویرایش محلی من', cat: 'set', price: 99, stock: 2 })
    await nextTick()
    // همزمان — ادیتور دیگر روی سرور چیزی اضافه می‌کند (rev جلو می‌رود)
    serverProducts = [{ id: 1, title: 'از سرور', cat: 'set', price: 10, stock: 1, sold: 0 }, { id: 4, title: 'محصول ادیتور دیگر', cat: 'set', price: 1, stock: 1 }]
    serverRev = 6
    await vi.advanceTimersByTimeAsync(1200) // push → 409 → merge → force push
    expect(conflictSent).toBe(true)
    // تغییر محلی من حفظ شد + محصول ادیتور دیگر از سرور آمد + کوپن سرور هم هست
    expect(cms.products.find((p) => p.title === 'ویرایش محلی من')).toBeTruthy()
    expect(cms.products.find((p) => p.id === 4)?.title).toBe('محصول ادیتور دیگر')
    expect(cms.coupons.map((c) => c.code)).toContain('CONC')
    expect(cms.sync.status).toBe('ok')
    expect(putCount).toBe(2) // یک بار 409، یک بار force موفق
    expect(cms.toasts.some((t) => t.text.includes('هم‌زمانی'))).toBe(true)
  })

  it('force push migrates base64 images to /media before PUT', async () => {
    let lastPutBody = null
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
      const u = String(url); const method = opts.method || 'GET'
      const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data })
      if (u.includes('/health')) return json({ ok: true })
      if (u.includes('/auth/me')) return json({ ok: true, username: 'admin', role: 'admin', perms: [] })
      if (u.includes('/media') && method === 'POST') return json({ path: '/media/abc.png', bytes: 10 })
      if (u.includes('/state') && method === 'PUT') { lastPutBody = JSON.parse(opts.body); return json({ ok: true, rev: 9 }) }
      if (u.includes('/state')) return json({ products: [], posts: [], coupons: [], requests: [], messages: [], provinces: [], settings: {}, rev: 1 })
      return json({ error: 'nf' }, 404)
    }))
    vi.useFakeTimers()
    setActivePinia(createPinia())
    localStorage.clear()
    vi.resetModules()
    const { useCms } = await import('../stores/cms.js')
    const cms = useCms()
    await cms.initRemote()
    await vi.advanceTimersByTimeAsync(50)
    cms.saveProduct({ title: 'با تصویر', cat: 'set', price: 1, stock: 1, image: 'data:image/png;base64,AAAA' })
    await cms.pushToServer()
    expect(cms.products[0].image).toBe('/media/abc.png') // جایگزینی در استور هم شد
    expect(lastPutBody.products[0].image).toBe('/media/abc.png') // و در PUT ارسال شد
  })

  it('BroadcastChannel message from other tab pulls fresh state', async () => {
    const instances = []
    class FakeBC { constructor(name) { this.name = name; this.onmessage = null; instances.push(this) } postMessage() {} close() {} }
    vi.stubGlobal('BroadcastChannel', FakeBC)
    let rev = 1
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
      const u = String(url); const method = opts.method || 'GET'
      const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data })
      if (u.includes('/health')) return json({ ok: true })
      if (u.includes('/auth/me')) return json({ ok: true, username: 'admin', role: 'admin', perms: [] })
      if (u.includes('/state')) return json({ products: [{ id: 5, title: 'از تب دیگر', cat: 'set', price: 2, stock: 1 }], posts: [], coupons: [], requests: [], messages: [], provinces: [], settings: {}, rev })
      return json({ error: 'nf' }, 404)
    }))
    vi.useFakeTimers()
    setActivePinia(createPinia())
    localStorage.clear()
    vi.resetModules()
    const { useCms } = await import('../stores/cms.js')
    const cms = useCms()
    await cms.initRemote()
    expect(instances.length).toBe(1)
    // تب دیگر یک همگام‌سازی جدید را اعلام می‌کند
    rev = 2
    await instances[0].onmessage({ data: { type: 'state', rev: 2 } })
    expect(cms.products.find((p) => p.id === 5)?.title).toBe('از تب دیگر')
  })
})
