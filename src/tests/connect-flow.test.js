// فاز ۷.۵ — تست ویزارد اتصال (ConnectView) و ورود خودکار دمو (LoginView)
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const { chartCtor } = vi.hoisted(() => ({ chartCtor: vi.fn(() => ({ data: {}, update: vi.fn(), destroy: vi.fn() })) }))
chartCtor.register = vi.fn()
vi.mock('chart.js', () => { return { Chart: chartCtor, registerables: [] } })

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
async function mountGo(path, extra = {}) {
  window.scrollTo = () => {}
  localStorage.clear()
  sessionStorage.clear()
  setActivePinia(createPinia())
  const router = makeRouter()
  const w = mount(App, { global: { plugins: [router] }, attachTo: document.body })
  await router.isReady()
  const cms = useCms()
  cms.online = true
  if (extra.authed) { cms.authed = true; cms.perms = ['state:settings', 'state:products'] }
  await router.push(path)
  for (let i = 0; i < 3; i++) { await w.vm.$nextTick(); await new Promise((r) => setTimeout(r, 25)) }
  return w
}
const settle = async (w, n = 3) => { for (let i = 0; i < n; i++) { await w.vm.$nextTick(); await new Promise((r) => setTimeout(r, 20)) } }
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })

const HEALTH = () => ({ data: { ok: true, version: '1', app: 'meelano', db: { engine: 'sqlite-local' } } })

describe('ConnectView — ویزارد اتصال به هاست', () => {
  it('سلامت سرور → مرحله ۱ «برقرار» و چیپ نسخه', async () => {
    stub({ 'GET /health': HEALTH })
    const w = await mountGo('/connect')
    await settle(w)
    expect(w.text()).toContain('برقرار')
    expect(w.text()).toContain('API v1')
    expect(w.text()).toContain('موتور محلی')
    w.unmount()
  })

  it('تست اتصال دیتابیس → پیام موفقیت', async () => {
    stub({ 'GET /health': HEALTH, 'POST /db/test': () => ({ data: { ok: true, version: '8.0.36', existingTables: ['pf_products'] } }) })
    const w = await mountGo('/connect')
    await settle(w)
    const btn = w.findAll('button').find((b) => b.text().includes('تست اتصال'))
    expect(btn).toBeTruthy()
    await btn.trigger('click')
    await settle(w, 4)
    expect(w.text()).toContain('متصل — MySQL 8.0.36')
    expect(w.text()).toContain('جدول میلانو از قبل موجود است')
    w.unmount()
  })

  it('ساخت و جایگذاری جداول → گزارش سلامت ۱۵ میز (authed)', async () => {
    const tbl = (label) => ({ table: 'pf_x', label, exists: true, status: 'ok', missingColumns: [], extraColumns: [], rows: 3, repaired: false })
    stub({
      'GET /health': HEALTH,
      'POST /db/apply': () => ({ data: { ok: true, created: [], adapted: [] } }),
      'GET /db/health': () => ({ data: { ok: true, engine: 'mysql', tables: Array.from({ length: 15 }, (_, i) => tbl('میز' + i)) } }),
    })
    const w = await mountGo('/connect', { authed: true })
    await settle(w)
    const btn = w.findAll('button').find((b) => b.text().includes('ساخت و جایگذاری'))
    await btn.trigger('click')
    await settle(w, 5)
    expect(w.text()).toContain('۱۵ جدول ساخته/تطبیق شد')
    expect(w.findAll('.connect-tables .chip.good').length).toBe(15)
    w.unmount()
  })

  it('رد کردن مرحله دیتابیس یادداشت می‌گذارد؛ ورود → pf.connect.done و رفتن به فروشگاه', async () => {
    stub({ 'GET /health': HEALTH })
    const w = await mountGo('/connect')
    await settle(w)
    const dbSec = w.findAll('section.lux-step').find((sec) => sec.text().includes('MySQL'))
    const skip = dbSec.findAll('button').find((b) => b.text().trim() === 'رد کردن')
    expect(skip).toBeTruthy()
    await skip.trigger('click')
    await settle(w)
    expect(w.text()).toContain('هر زمان قابل برقراری است')
    const fin = w.findAll('button').find((b) => b.text().includes('ورود به'))
    await fin.trigger('click')
    await settle(w)
    expect(localStorage.getItem('pf.connect.done')).toBe('1')
    expect(w.vm.$router.currentRoute.value.path).toBe('/') // به فروشگاه رسید
    w.unmount()
  })
})

describe('LoginView — ورود خودکار در حالت دمو', () => {
  it('pf.demo + autologin → بدون تایپ، ورود به داشبورد', async () => {
    localStorage.setItem('pf.demo', '1')
    sessionStorage.setItem('pf.demo.autologin', '1')
    setActivePinia(createPinia())
    const router = makeRouter()
    const w = mount(App, { global: { plugins: [router] }, attachTo: document.body })
    await router.isReady()
    const cms = useCms()
    cms.online = false // آفلاین/دمو → شبیه‌سازی محلی
    await router.push('/login')
    await vi.waitFor(() => expect(cms.authed).toBe(true), { timeout: 2500, interval: 40 }) // شبیه‌سازی شبکه ۴۵۰ms
    expect(cms.authed).toBe(true)
    expect(router.currentRoute.value.path).toBe('/dashboard')
    expect(sessionStorage.getItem('pf.demo.autologin')).toBeNull() // یک‌بارمصرف
    w.unmount()
  })

  it('دکمه «مشاهده دمو» → pf.demo + درخواست ورود خودکار', async () => {
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
    const router = makeRouter()
    const w = mount(App, { global: { plugins: [router] }, attachTo: document.body })
    await router.isReady()
    const cms = useCms()
    cms.online = false
    await router.push('/login')
    await w.vm.$nextTick()
    const btn = w.find('#login-demo')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    expect(localStorage.getItem('pf.demo')).toBe('1')
    expect(sessionStorage.getItem('pf.demo.autologin')).toBe('1')
    w.unmount()
  })
})
