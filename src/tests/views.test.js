import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

// Chart.js در jsdom بدون node-canvas کار نمی‌کند → mock می‌کنیم (تست رفتار، نه نمودار)
const { chartCtor } = vi.hoisted(() => ({ chartCtor: vi.fn(() => ({ data: {}, update: vi.fn(), destroy: vi.fn() })) }))
chartCtor.register = vi.fn()
vi.mock('chart.js', () => ({ Chart: chartCtor, registerables: [] }))

import App from '../App.vue'
import { makeRouter } from '../router.js'
import { useCms } from '../stores/cms.js'

let currentW = null
async function mountApp(initialRoute = '/login') {
  currentW?.unmount()
  document.body.innerHTML = ''
  window.scrollTo = () => {} // jsdom stub
  localStorage.clear()
  setActivePinia(createPinia())
  const router = makeRouter()
  const w = (currentW = mount(App, { global: { plugins: [router] }, attachTo: document.body }))
  await router.isReady()
  if (router.currentRoute.value.fullPath !== initialRoute) {
    await router.push(initialRoute)
  }
  await w.vm.$nextTick()
  return w
}

describe('views (jsdom)', () => {
  afterEach(() => { currentW?.unmount(); currentW = null; document.body.innerHTML = '' })
  it('guest is redirected from protected route to /login', async () => {
    const w = await mountApp('/products')
    expect(w.text()).toContain('ورود به پنل')
    expect(w.text()).toContain('نام کاربری')
    // بازگشت با ?to=
    expect(w.vm.$router.currentRoute.value.query.to).toBe('/products')
  })

  it('login form rejects wrong creds, accepts demo creds, unlocks shell', async () => {
    const w = await mountApp()
    const inputs = w.findAll('input')
    await inputs[0].setValue('admin')
    await inputs[1].setValue('WRONG')
    await w.find('form').trigger('submit.prevent')
    await new Promise((r) => setTimeout(r, 600))
    expect(w.text()).toContain('نام کاربری یا رمز عبور اشتباه است')

    await inputs[1].setValue('12345')
    await w.find('form').trigger('submit.prevent')
    await new Promise((r) => setTimeout(r, 600))
    await w.vm.$nextTick()
    expect(w.text()).toContain('PanahFit CMS') // header shell
    expect(w.find('#sidebar').exists()).toBe(true)
  })

  it('products table renders, sorts and paginates', async () => {
    const w = await mountApp('/dashboard')
    const cms = useCms()
    cms.authed = true
    // ۳ محصول seed؛ ۹ تا اضافه می‌کنیم تا صفحه‌بندی فعال شود
    for (let i = 0; i < 9; i++) cms.products.push({ id: 100 + i, title: 'تست ' + i, cat: 'set', price: 1000 + i, stock: 5 })
    await w.vm.$router.push('/products')
    await w.vm.$nextTick()
    expect(w.findAll('tbody tr')).toHaveLength(8) // PAGE_SIZE
    const pager = w.find('.pager')
    expect(pager.exists()).toBe(true)
    expect(pager.text()).toContain('از ۲')
    // مرتب‌سازی desc روی قیمت
    const priceTh = w.findAll('th').find((t) => t.text().includes('قیمت'))
    await priceTh.trigger('click')
    await priceTh.trigger('click')
    const firstCell = w.findAll('tbody tr')[0].findAll('td')[4].text()
    expect(firstCell).toContain('۸۵۰,۰۰۰') // بالاترین قیمت seed
  })

  it('bulk select + delete with undo', async () => {
    const w = await mountApp()
    const cms = useCms()
    cms.authed = true
    await w.vm.$router.push('/products')
    await w.vm.$nextTick()
    const boxes = w.findAll('tbody input[type=checkbox]')
    await boxes[0].setValue(true)
    await boxes[1].setValue(true)
    expect(w.find('.bulk-bar').exists()).toBe(true)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await w.find('.bulk-bar button').trigger('click')
    expect(cms.products).toHaveLength(1)
    const undoBtn = w.find('#toast-stack .toast-item button')
    expect(undoBtn.exists()).toBe(true)
    await undoBtn.trigger('click')
    expect(cms.products).toHaveLength(3)
    window.confirm.mockRestore()
  })

  it('dashboard mounts Chart.js canvases and shows KPIs', async () => {
    chartCtor.mockClear()
    const w = await mountApp()
    const cms = useCms()
    cms.authed = true
    await w.vm.$router.push('/dashboard')
    await w.vm.$nextTick()
    expect(chartCtor).toHaveBeenCalledTimes(2)
    expect(w.text()).toContain('درآمد کل')
    expect(w.text()).toContain('درخواست‌های باز')
  })

  it('post modal: validation + create', async () => {
    const w = await mountApp()
    const cms = useCms()
    cms.authed = true
    await w.vm.$router.push('/posts')
    await w.vm.$nextTick()
    await w.find('button.cms-btn').trigger('click')
    // محتوای Teleport در body بیرون wrapper است → بررسی DOM مستقیم
    await w.vm.$nextTick()
    expect(document.querySelector('.modal-card')).toBeTruthy()
    document.querySelector('.modal-card form button[type=submit]').click()
    await w.vm.$nextTick()
    const errEl = document.querySelector('.modal-card .field-error')
    expect(errEl && errEl.textContent).toContain('الزامی')
    const titleInput = document.getElementById('f-post-title')
    titleInput.value = 'پست تست ویو'
    titleInput.dispatchEvent(new Event('input', { bubbles: true }))
    await w.vm.$nextTick()
    document.querySelector('.modal-card form button[type=submit]').click()
    await w.vm.$nextTick()
    expect(cms.posts).toHaveLength(3)
    expect(document.querySelector('.modal-card')).toBeFalsy()
  })

  it('coupon create + settings persist through store watcher', async () => {
    const w = await mountApp()
    const cms = useCms()
    cms.authed = true
    await w.vm.$router.push('/pricing')
    await w.vm.$nextTick()
    await w.find('#coupon-code').setValue('TEST20')
    await w.find('#coupon-percent').setValue('20')
    await w.find('form').trigger('submit.prevent')
    expect(cms.coupons).toHaveLength(1)
    expect(cms.coupons[0].code).toBe('TEST20')
  })

  it('command palette: ctrl+K opens, searches, Enter navigates', async () => {
    const w = await mountApp()
    const cms = useCms()
    cms.authed = true
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
    await w.vm.$nextTick()
    const input = document.querySelector('.k-input')
    expect(input).toBeTruthy()
    input.value = 'لگ زنانه'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await w.vm.$nextTick()
    const opts = document.querySelectorAll('.k-list li')
    expect(opts.length).toBeGreaterThanOrEqual(1)
    expect(document.querySelector('.k-list li .k-label').textContent).toContain('لگ زنانه')
    document.querySelector('.k-list li').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    expect(w.vm.$router.currentRoute.value.path).toBe('/products/2/edit')
  })

  it('post modal: scheduled status requires future publishAt', async () => {
    const w = await mountApp()
    const cms = useCms()
    cms.authed = true
    await w.vm.$router.push('/posts')
    await w.vm.$nextTick()
    await w.find('.action-bar button').trigger('click')
    await w.vm.$nextTick()
    document.getElementById('f-post-title').value = 'پست زمان‌بندی تست'
    document.getElementById('f-post-title').dispatchEvent(new Event('input', { bubbles: true }))
    const sel = document.getElementById('f-post-status')
    sel.value = 'scheduled'
    sel.dispatchEvent(new Event('change', { bubbles: true }))
    await w.vm.$nextTick()
    expect(document.getElementById('f-post-publishAt')).toBeTruthy()
    document.querySelector('.modal-card form button[type=submit]').click()
    await w.vm.$nextTick()
    const pubErr = document.getElementById('f-post-publishAt').closest('.form-group-3d').querySelector('.field-error')
    expect(pubErr.textContent).toContain('تاریخ و ساعت')
    const d = document.getElementById('f-post-publishAt')
    d.value = '2099-01-01T10:00'
    d.dispatchEvent(new Event('input', { bubbles: true }))
    await w.vm.$nextTick()
    document.querySelector('.modal-card form button[type=submit]').click()
    await w.vm.$nextTick()
    const saved = cms.posts[cms.posts.length - 1]
    expect(saved.status).toBe('scheduled')
    expect(saved.publishAt).toContain('2099')
  })

  it('audit & users views show offline note without server', async () => {
    const w = await mountApp()
    const cms = useCms()
    cms.authed = true
    await w.vm.$router.push('/audit')
    await w.vm.$nextTick()
    expect(w.text()).toContain('گزارش ممیزی')
    expect(w.text()).toContain('سمت سرور')
    await w.vm.$router.push('/users')
    await w.vm.$nextTick()
    expect(w.text()).toContain('کاربران و نقش‌ها')
  })

  it('products CSV: button opens modal, export builds content', async () => {
    const w = await mountApp()
    const cms = useCms()
    cms.authed = true
    await w.vm.$router.push('/products')
    await w.vm.$nextTick()
    await w.find('#csv-import').trigger('click')
    await w.vm.$nextTick()
    expect(document.querySelector('.modal-card')).toBeTruthy()
    expect(document.querySelector('.modal-card').textContent).toContain('ورود از CSV')
  })
})
