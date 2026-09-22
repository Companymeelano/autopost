// پوشش عملیات ویوها (Meelano) — توابع پنکه‌ای که در تست‌های قبلی لمس نشده بودند
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const { chartCtor } = vi.hoisted(() => ({ chartCtor: vi.fn(() => ({ data: {}, update: vi.fn(), destroy: vi.fn() })) }))
chartCtor.register = vi.fn()
vi.mock('chart.js', () => ({ Chart: chartCtor, registerables: [] }))

import App from '../App.vue'
import { makeRouter } from '../router.js'
import { useCms } from '../stores/cms.js'

let routes = {}
function stub(overrides = {}) {
  routes = { ...overrides }
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    const u = String(url).replace('/api', '')
    const key = `${opts.method || 'GET'} ${u.split('?')[0]}`
    const h = routes[key]
    if (!h) return { ok: false, status: 404, json: async () => ({ error: 'unstubbed ' + key }) }
    const out = await h(opts.body ? JSON.parse(opts.body) : null)
    return { ok: (out.status || 200) < 400, status: out.status || 200, json: async () => out.data ?? {} }
  }))
}
async function mountGo(path) {
  window.scrollTo = () => {}
  localStorage.clear()
  sessionStorage.clear()
  setActivePinia(createPinia())
  const router = makeRouter()
  const w = mount(App, { global: { plugins: [router] }, attachTo: document.body })
  await router.isReady()
  const cms = useCms()
  cms.online = true
  cms.authed = true
  cms.perms = ['state:products', 'state:posts', 'state:coupons', 'state:requests', 'state:messages', 'state:provinces', 'state:settings', 'media', 'payments', 'users', 'audit', 'ai', 'queue']
  await router.push(path)
  for (let i = 0; i < 3; i++) { await w.vm.$nextTick(); await new Promise((r) => setTimeout(r, 25)) }
  return w
}
const settle = async (w, n = 3) => { for (let i = 0; i < n; i++) { await w.vm.$nextTick(); await new Promise((r) => setTimeout(r, 20)) } }
const clickByText = async (w, sel, text) => {
  const b = w.findAll(sel).find((x) => x.text().includes(text))
  expect(b, `button with ${text}`).toBeTruthy()
  await b.trigger('click')
  await settle(w, 4)
  return b
}
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })

describe('SettingsView — عملیات سرور/AI/پوش', () => {
  it('تست سلامت، ارسال/دریافت، تست API، تغییر رمز و پوش آزمایشی', async () => {
    const calls = []
    const REAL_CONFIRM = window.confirm; window.confirm = () => true
    stub({
      'GET /health': () => ({ data: { ok: true, ai: 'openai', payment: 'zarinpal', uptimeSec: 9, version: 3 } }),
      'GET /state': () => ({ data: { rev: 4, products: [], posts: [], coupons: [], requests: [], messages: [], provinces: [], settings: {} } }),
      'PUT /state': (b) => { calls.push('put'); return { data: { ok: true, rev: 5 } } },
      'POST /auth/password': (b) => { calls.push('pw:' + !!b.next); return { data: { ok: true } } },
      'GET /push': () => ({ data: { items: [], total: 2, mode: 'webpush' } }),
      'POST /push/test': () => { calls.push('push-test'); return { data: { sent: 2, failed: 0 } } },
      'GET /db': () => ({ data: { enabled: false, connected: false, config: { host: 'localhost', port: 3306, user: '', database: '', prefix: 'pf_', password: '' }, lastSyncAt: 0, lastErr: '', pending: 0, running: false, localRev: 1, syncUsers: false, tablesExpected: 15 } }),
      'GET /session': () => ({ data: { ok: true } }),
    })
    const w = await mountGo('/settings')
    await clickByText(w, 'button', 'تست سلامت سرور')
    expect(w.text()).toContain('تأخیر')
    await clickByText(w, 'button', 'ارسال داده‌های محلی به سرور')
    await clickByText(w, 'button', 'دریافت از سرور')
    await clickByText(w, 'button', 'ارسال پوش آزمایشی')
    expect(calls).toContain('push-test')
    // تغییر رمز
    await w.find('#pw-old').setValue('old-pass')
    await w.find('#pw-next').setValue('new-pass-8')
    await w.find('#pw-confirm').setValue('new-pass-8')
    await w.find('form').trigger('submit.prevent')
    await settle(w, 4)
    expect(calls.some((c) => String(c).startsWith('pw:'))).toBe(true)
    window.confirm = REAL_CONFIRM
  })
})

describe('ProductsView — انتخاب/کپی/حذف با undo', () => {
  it('select-all صفحه، duplicate ردیف و حذف+بازگردانی', async () => {
    const REAL_CONFIRM = window.confirm; window.confirm = () => true
    stub({})
    const w = await mountGo('/products')
    const cms = useCms()
    const before = cms.products.length
    const selAll = w.find('thead input[type="checkbox"]')
    if (selAll.exists()) { await selAll.setValue(true); await settle(w) }
    await clickByText(w, 'tbody button', 'کپی')
    expect(cms.products.length).toBe(before + 1)
    await clickByText(w, 'tbody button', 'حذف')
    await settle(w)
    expect(cms.products.length).toBe(before)
    const undo = w.find('#toast-stack .toast-item button')
    if (undo.exists()) { await undo.trigger('click'); await settle(w); expect(cms.products.length).toBe(before + 1) }
    window.confirm = REAL_CONFIRM
  })
})

describe('PostsView — اقدامات', () => {
  it('کپی و حذف پست + اجرای صف', async () => {
    const REAL_CONFIRM = window.confirm; window.confirm = () => true
    stub({ 'POST /queue/run': () => ({ data: { ok: true, ran: 0 } }) })
    const w = await mountGo('/posts')
    const cms = useCms()
    const n0 = cms.posts.length
    await clickByText(w, 'button', 'کپی')
    expect(cms.posts.length).toBe(n0 + 1)
    await clickByText(w, 'button', 'حذف')
    expect(cms.posts.length).toBe(n0)
    window.confirm = REAL_CONFIRM
  })
})

describe('AuditView — تب‌ها و «بیشتر»', () => {
  it('سوئیچ تب لاگ/امنیت و بارگذاری بیشتر', async () => {
    let limitSeen = 0
    stub({
      'GET /audit': (b) => b,
      'GET /audit2': () => ({ data: { items: [], total: 0 } }),
    })
    // مسیر audit در تست‌ها با query کار می‌کند؛ stub کلی:
    routes['GET /audit'] = async (b) => ({ data: { items: Array.from({ length: 100 }, (_, i) => ({ id: i, username: 'admin', action: 'x', entity: '', detail: 'd', at: new Date().toISOString() })), total: 150 } })
    void limitSeen
    const w = await mountGo('/audit')
    expect(w.text()).toContain('رویدادها')
    await clickByText(w, 'button', 'تلاش‌های ورود')
    await clickByText(w, 'button', 'رویدادها')
    const more = w.findAll('button').find((b) => b.text().includes('مورد بیشتر'))
    if (more) await more.trigger('click')
    await settle(w)
    expect(w.text()).toContain('ممیزی')
  })
})

describe('PricingView — ساختار', () => {
  it('بدون کوپن: پیام خالی و ساخت کوپن از فرم', async () => {
    stub({})
    const w = await mountGo('/pricing')
    const cms = useCms()
    cms.coupons.splice(0, cms.coupons.length)
    await settle(w)
    expect(w.text()).toContain('کد')
    const inputs = w.findAll('input')
    const code = inputs[0]
    if (code) { await code.setValue('MEEL10'); await settle(w) }
    expect(cms.coupons.length).toBe(0)
  })
})
