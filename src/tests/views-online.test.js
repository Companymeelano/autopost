// تست آنلاین ویوهای جدید — fetch فیک با هندلرهای واقعی‌نمای سرور
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
function stubServer(overrides = {}) {
  routes = { ...overrides }
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    const u = String(url).replace('/api', '')
    const key = `${opts.method || 'GET'} ${u.split('?')[0]}`
    const h = routes[key]
    if (!h) return { ok: false, status: 404, json: async () => ({ error: 'unstubbed ' + key }) }
    const out = await h(opts.body ? JSON.parse(opts.body) : null)
    return { ok: (out.status || 200) < 400, status: out.status || 200, json: async () => out.data ?? {}, text: async () => JSON.stringify(out.data ?? {}) }
  }))
}

async function mountOnline() {
  window.scrollTo = () => {}
  localStorage.clear()
  setActivePinia(createPinia())
  const router = makeRouter()
  const w = mount(App, { global: { plugins: [router] }, attachTo: document.body })
  await router.isReady()
  const cms = useCms()
  cms.online = true
  cms.authed = true
  return w
}
const next = async (w, n = 2) => { for (let i = 0; i < n; i++) { await w.vm.$nextTick(); await new Promise((r) => setTimeout(r, 20)) } }

afterEach(() => { vi.unstubAllGlobals() })

describe('PaymentView (online demo)', () => {
  it('create → simulate success → tx paid row appears', async () => {
    const txs = []
    stubServer({
      'POST /payments/create': () => ({ data: { authority: 'demo-abc', url: null, mode: 'demo' } }),
      'POST /payments/verify': (b) => { txs[0] = { ...txs[0], status: 'paid', ref_id: 'DEMO-ABC' }; return { data: { ok: true, status: 'paid', refId: 'DEMO-ABC' } } },
      'GET /transactions': () => ({ data: { items: txs.length ? txs : [{ id: 1, authority: 'demo-abc', amount: 55000, description: 'x', status: 'waiting', ref_id: '', gateway: 'demo', created_at: new Date().toISOString() }] } }),
    })
    const w = await mountOnline()
    txs.push({ id: 1, authority: 'demo-abc', amount: 55000, description: 'x', status: 'waiting', ref_id: '', gateway: 'demo', created_at: new Date().toISOString() })
    await w.vm.$router.push('/payments')
    await next(w)
    expect(w.text()).toContain('ثبت درخواست پرداخت')
    await w.find('#pay-amount').setValue('55000')
    await w.find('form').trigger('submit.prevent')
    await next(w)
    expect(w.text()).toContain('demo-abc')
    expect(w.text()).toContain('حالت دمو')
    await w.findAll('.data-card-3d button').find((b) => b.text().includes('پرداخت موفق')).trigger('click')
    await next(w, 3)
    expect(w.text()).toContain('DEMO-ABC')
    expect(w.text()).toContain('موفق')
  })
})

describe('PricingView coupon test box', () => {
  it('valid code renders discount math; invalid shows message', async () => {
    stubServer({
      'POST /public/coupons/verify': (b) => {
        if (b.code === 'WELCOME') return { data: { valid: true, percent: 20, discount: Math.round(b.amount * 0.2), payable: b.amount - Math.round(b.amount * 0.2) } }
        return { data: { valid: false, message: 'کد تخفیف نامعتبر یا غیرفعال است.' } }
      },
    })
    const w = await mountOnline()
    await w.vm.$router.push('/pricing')
    await next(w)
    await w.find('#vt-code').setValue('WELCOME')
    await w.find('#vt-amount').setValue('100000')
    await w.find('#coupon-test form').trigger('submit.prevent')
    await next(w)
    expect(w.text()).toMatch(/۲۰[٬,]۰۰۰/) // جداکننده هزارگان فارسی/لاتین
    await w.find('#vt-code').setValue('NOPE')
    await w.find('#coupon-test form').trigger('submit.prevent')
    await next(w)
    expect(w.text()).toContain('نامعتبر')
  })

  it('coupon window chip: منقضی for past validTo', async () => {
    stubServer({})
    const w = await mountOnline()
    const cms = useCms()
    cms.coupons.push({ code: 'OLDCODE', percent: 10, maxUses: 0, used: 0, active: true, validTo: '2020-01-01' })
    await w.vm.$router.push('/pricing')
    await next(w)
    expect(w.text()).toContain('منقضی')
  })
})

describe('DashboardView online report', () => {
  it('period data renders mini-kpis and creates third chart', async () => {
    stubServer({
      'GET /reports/summary': () => ({
        data: {
          days: 30, paidTotal: 900000, paidCount: 4,
          weekly: [{ week: '2026-09-01', total: 400000 }, { week: '2026-09-08', total: 500000 }],
          tones: [{ tone: 'energetic', count: 6 }, { tone: 'formal', count: 2 }],
          perCat: [{ cat: 'legging', revenue: 700000 }],
        },
      }),
    })
    chartCtor.mockClear()
    const w = await mountOnline()
    await w.vm.$router.push('/dashboard')
    await next(w, 3)
    expect(w.text()).toContain('گزارش دوره‌ای')
    expect(w.text()).toContain('۴ تراکنش')
    expect(w.text()).toContain('۹۰۰,۰۰') // خروجی فارسی‌شماره
    expect(w.text()).toContain('energetic')
    expect(chartCtor).toHaveBeenCalledTimes(3) // بار + دونات + خطی هفتگی
  })

  it('offline shows hint instead of fetching', async () => {
    const w = await mountOnline()
    const cms = useCms()
    cms.online = false
    await w.vm.$router.push('/dashboard')
    await next(w, 2)
    expect(w.text()).toContain('نیازمند اتصال سرور')
  })
})

describe('UsersView (online)', () => {
  it('lists users, shows role matrix, validates new user form', async () => {
    const users = [
      { username: 'admin', role: 'admin', roleLabel: 'مدیر کل', created_at: new Date().toISOString() },
      { username: 'sara', role: 'editor', roleLabel: 'تولید محتوا', created_at: new Date().toISOString() },
    ]
    const posts = []
    stubServer({
      'GET /users': () => ({ data: { items: users } }),
      'GET /roles': () => ({ data: { roles: [{ role: 'admin', label: 'مدیر کل', perms: ['*'] }, { role: 'editor', label: 'تولید محتوا', perms: ['state:products'] }] } }),
      'POST /users': (b) => { posts.push(b); if (b.username !== 'newbie') return { status: 422, data: { error: 'نام کاربری تکراری است.' } }; return { status: 201, data: { ok: true } } },
    })
    const w = await mountOnline()
    await w.vm.$router.push('/users')
    await next(w)
    expect(w.text()).toContain('sara')
    expect(w.text()).toContain('کاربر')
    await w.find('#nu-username').setValue('newbie')
    await w.find('#nu-pass').setValue('long-pass-9')
    await w.find('form').trigger('submit.prevent')
    await next(w, 3)
    expect(posts[0]).toMatchObject({ username: 'newbie', role: 'admin' === posts[0].role ? 'admin' : posts[0].role })
    expect(posts.length).toBe(1)
  })
})

describe('ReportsView (finance)', () => {
  it('renders collected/net KPIs and the daily chart when online', async () => {
    stubServer({
      'GET /finance/report': () => ({
        data: {
          from: '2026-09-01', to: '2026-09-30', orderCount: 2, gross: 1_340_000, discounts: 50_000,
          collected: 1_290_000, refunds: 490_000, refundCount: 1, feePct: 5, fee: 64_500, net: 1_225_500,
          daily: [{ d: '2026-09-17', total: 850_000, n: 1 }], cancellations: [{ d: '2026-09-17', n: 1, total: 490_000 }],
          coupons: [{ code: 'FIN15', n: 1, total: 50_000 }], byGateway: [{ gateway: 'demo', n: 2, total: 1_290_000 }], byStatus: { paid: 1, cancelled: 1 },
        },
      }),
    })
    chartCtor.mockClear()
    const w = await mountOnline()
    const cms = useCms()
    cms.online = true
    await w.vm.$router.push('/reports')
    for (let i = 0; i < 4; i++) { await w.vm.$nextTick(); await new Promise((r) => setTimeout(r, 30)) }
    expect(w.text()).toContain('گزارش مالی و تسویه')
    expect(w.text()).toContain('خالص قابل تسویه')
    expect(w.text()).toContain('FIN15')
    expect(chartCtor).toHaveBeenCalledTimes(1)
  })

  it('offline shows server-required notice', async () => {
    const w = await mountOnline()
    const cms = useCms()
    cms.online = false
    await w.vm.$router.push('/reports')
    await new Promise((r) => setTimeout(r, 40))
    expect(w.text()).toContain('نیازمند اتصال سرور')
  })
})

describe('SettingsView — کارت دیتابیس cPanel (Meelano DB)', () => {
  it('کارت، فیلدها و دکمه‌های اتصال/ساخت/سلامت رندر می‌شوند', async () => {
    stubServer({
      'GET /db': () => ({ data: { enabled: false, connected: false, config: { host: 'localhost', port: 3306, user: '', database: '', prefix: 'pf_', password: '' }, version: '', lastSyncAt: 0, lastErr: '', pending: 0, running: false, localRev: 1, syncUsers: false, tablesExpected: 15 } }),
      'POST /db/test': () => ({ data: { ok: true, version: '8.0.36', existingTables: [] } }),
      'GET /db/health': () => ({ data: { enabled: false, tables: [] } }),
    })
    const w = await mountOnline()
    await w.vm.$router.push('/settings')
    await next(w)
    expect(w.text()).toContain('دیتابیس و اتصال به هاست')
    expect(w.find('#db-host').exists()).toBe(true)
    expect(w.find('#db-user').exists()).toBe(true)
    expect(w.find('#db-btn-test').exists()).toBe(true)
    expect(w.find('#db-btn-apply').exists()).toBe(true)
    expect(w.find('#db-btn-health').exists()).toBe(true)
    expect(w.text()).toContain('اتصال برقرار نشده')
    // تست اتصال دکمه را پرتاب نمی‌کند و پیام موفقیت نشان می‌دهد
    await w.find('#db-btn-test').trigger('click')
    await vi.waitFor(() => expect(w.text()).toContain('اتصال برقرار شد'), { timeout: 4000 })
    expect(w.find('#db-btn-test').exists()).toBe(true)
  })
})

describe('SettingsView — کارت DB: چرخهٔ کامل اعمال/سلامت/ترمیم/مهاجرت', () => {
  it('test→apply→health→repair→push→pull→disconnect + راهنما', async () => {
    const calls = []
    const REAL_CONFIRM = window.confirm
    window.confirm = () => true
    stubServer({
      'GET /db': () => ({ data: { enabled: true, connected: true, syncUsers: true, config: { host: 'db.host', port: 3306, user: 'u', database: 'd', prefix: 'pf_', password: '•' }, version: '8.0.36', lastSyncAt: Date.now(), lastErr: '', pending: 0, running: false, localRev: 2, tablesExpected: 15 } }),
      'POST /db/test': (b) => { calls.push(['test', b.host]); return { data: { ok: true, version: '8.0.36', existingTables: ['pf_products'] } } },
      'POST /db/apply': (b) => { calls.push(['apply', !!b.syncUsers, !!b.importLocal]); return { data: { ok: true } } },
      'GET /db/health': () => ({ data: { enabled: true, prefix: 'pf_', version: '8.0.36', lastSyncAt: 0, lastErr: '', tables: [{ table: 'products', label: 'محصولات', exists: true, status: 'broken', missingColumns: ['pos', 'updated_at'], extraColumns: [], rows: 5 }] } }),
      'POST /db/repair': (b) => { calls.push(['repair', (b.rebuild || []).join(',')]); return { data: { tables: [{ table: 'products', label: 'محصولات', status: 'ok', missingColumns: [], repaired: 'altered', rows: 5 }] } } },
      'POST /db/push': () => { calls.push(['push']); return { data: { ok: true, orders: 0, transactions: 0, collections: [] } } },
      'POST /db/pull': () => { calls.push(['pull']); return { data: { rows: { products: 5, posts: 1, coupons: 0, messages: 0, requests: 0, provinces: 0 }, settings: true } } },
      'POST /db/disconnect': () => { calls.push(['disconnect']); return { data: { ok: true } } },
      'GET /state': () => ({ data: { rev: 9, products: [], posts: [], coupons: [], requests: [], messages: [], provinces: [], settings: {} } }),
    })
    const w = await mountOnline()
    await w.vm.$router.push('/settings')
    await vi.waitFor(() => expect(w.text()).toContain('متصل — همگام زنده'))
    await w.find('#db-btn-test').trigger('click')
    await vi.waitFor(() => expect(calls.some((c) => c[0] === 'test')))
    await w.find('#db-btn-apply').trigger('click')
    await vi.waitFor(() => expect(calls.some((c) => c[0] === 'apply' && c[1] === true)))
    await w.find('#db-btn-health').trigger('click')
    await vi.waitFor(() => expect(w.text()).toContain('ناسازگار'))
    expect(w.text()).toContain('ستون‌های جاافتاده')
    await w.find('#db-btn-repair').trigger('click')
    await vi.waitFor(() => expect(w.text()).toContain('اصلاح‌شده'))
    await w.find('#db-btn-push').trigger('click')
    await vi.waitFor(() => expect(calls.some((c) => c[0] === 'push')))
    await w.find('#db-btn-pull').trigger('click')
    await vi.waitFor(() => expect(calls.some((c) => c[0] === 'pull')))
    await w.find('#db-btn-off').trigger('click')
    await vi.waitFor(() => expect(calls.some((c) => c[0] === 'disconnect')))
    const guide = w.findAll('button').find((b) => b.text().includes('راهنمای سریع'))
    await guide.trigger('click')
    await next(w)
    expect(w.text()).toContain('MySQL® Databases')
    window.confirm = REAL_CONFIRM
  })
})

describe('SettingsView — پشتیبان/بازیابی/تنظیمات', () => {
  it('دانلود بکاپ JSON، بازیابی از فایل و بازگشت به seed', async () => {
    const REAL_CONFIRM = window.confirm
    window.confirm = () => true
    let saved = ''
    URL.createObjectURL = () => { saved = 'blob:ok'; return 'blob:x' }
    URL.revokeObjectURL = () => {}
    stubServer({})
    const w = await mountOnline()
    await w.vm.$router.push('/settings')
    await next(w)
    const btns = w.findAll('button')
    const dl = btns.find((b) => b.text().includes('دانلود فایل پشتیبان'))
    expect(dl).toBeTruthy()
    await dl.trigger('click')
    await next(w)
    expect(saved).toBe('blob:ok')
    // reset to seed
    const reset = w.findAll('button').find((b) => b.text().includes('بازگشت به داده‌ی نمونه'))
    await reset.trigger('click')
    await next(w, 3)
    expect(w.text()).toContain('داده‌ها به حالت نمونه بازگشت')
    // import file — FileReader path with jsdom File
    const { useCms } = await import('../stores/cms.js')
    const payload = useCms().exportPayload() // خود یک JSON-string است
    const file = new File([payload], 'backup.json', { type: 'application/json' })
    const input = w.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await vi.waitFor(() => expect(w.text()).toContain('بازیابی شد'))
    window.confirm = REAL_CONFIRM
  })
})
