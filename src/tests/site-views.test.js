// فاز ۳ — ویوهای عمومی سایت با fetch استاب‌شده
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import App from '../App.vue'
import { makeRouter } from '../router.js'
import { useSite } from '../stores/site.js'
import { useCart } from '../stores/cart.js'

const SITE_DATA = () => ({
  products: [
    { id: 1, title: 'ست ورزشی نایک پرایم', cat: 'set', price: 850000, oldPrice: 1050000, stock: 46, sold: 140, desc: 'ست کامل', image: '', meta: { hashtags: '#fit' } },
    { id: 2, title: 'لگ یوگا', cat: 'legging', price: 490000, oldPrice: 0, stock: 2, sold: 210, desc: 'لگ راحت', image: '', meta: {} },
    { id: 3, title: 'برسینه ساپورت', cat: 'bra', price: 320000, oldPrice: 0, stock: 0, sold: 60, desc: '', image: '', meta: {} },
  ],
  posts: [{ id: 5, title: 'خبر کالکشن', body: 'متن خبر کالکشن پاییزه', date: '۱۴۰۵', author: 'مدیر', publishedAt: '2026-09-11T00:00:00.000Z' }],
  settings: { siteName: 'پناه‌فیت', newDiscount: true, phone: '021-1', address: 'تهران', telegramChannel: '@x' },
})

let routes
function stub(routes2) {
  routes = routes2
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    const key = String(url).replace('/api', '') + ' ' + (opts.method || 'GET')
    const h = routes[key] || routes['*' + String(url)]
    if (!h) return { ok: false, status: 404, json: async () => ({ error: 'unstubbed ' + key }) }
    const out = await h(opts.body ? JSON.parse(opts.body) : null)
    return { ok: (out.status || 200) < 400, status: out.status || 200, json: async () => out.data ?? {}, text: async () => JSON.stringify(out.data ?? {}) }
  }))
}

async function mountAt(path, cartSeed = null, pending = null) {
  window.scrollTo = () => {}
  localStorage.clear()
  if (cartSeed) localStorage.setItem('panahfit.cart.v1', JSON.stringify(cartSeed))
  sessionStorage.clear()
  if (pending) sessionStorage.setItem('pf.pending-order', pending)
  setActivePinia(createPinia())
  const router = makeRouter()
  const w = mount(App, { global: { plugins: [router] }, attachTo: document.body })
  await router.push(path)
  await router.isReady()
  for (let i = 0; i < 4; i++) { await w.vm.$nextTick(); await new Promise((r) => setTimeout(r, 25)) }
  return w
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete window.__PF_NAV_TEST
  document.body.innerHTML = ''
})

describe('ShopView', () => {
  it('renders products, filter chips and out-of-stock state', async () => {
    stub({ '/public/site GET': () => ({ data: SITE_DATA() }) })
    const w = await mountAt('/')
    expect(w.text()).toContain('ست ورزشی نایک پرایم')
    expect(w.text()).toContain('لگ یوگا')
    expect(w.findAll('.prod-card')).toHaveLength(3)
    expect(w.text()).toContain('ناموجود')
    // فیلتر دسته
    const legChip = w.findAll('.chip').find((c) => c.text().includes('لگ'))
    await legChip.trigger('click')
    expect(w.findAll('.prod-card')).toHaveLength(1)
  })

  it('quick add fills cart badge in header', async () => {
    stub({ '/public/site GET': () => ({ data: SITE_DATA() }) })
    const w = await mountAt('/')
    await w.findAll('.add-btn')[0].trigger('click')
    expect(w.find('.cart-badge').exists()).toBe(true)
    expect(w.find('.cart-badge').text()).toBe('۱')
    const cart = useCart()
    expect(cart.count).toBe(1)
  })
})

describe('ProductView', () => {
  it('shows detail with stock warning and add-to-cart respects qty clamp', async () => {
    stub({ '/public/site GET': () => ({ data: SITE_DATA() }) })
    const w = await mountAt('/product/2')
    expect(w.text()).toContain('لگ یوگا')
    expect(w.text()).toContain('۲ باقی مانده!')
    expect(document.title).toContain('لگ یوگا')
    const plus = w.findAll('.qty-box button')[1]
    await plus.trigger('click') // 1→2
    expect(plus.attributes('disabled') !== undefined).toBe(true) // سقف ۲
    await w.find('.pd-add').trigger('click')
    expect(useCart().count).toBe(2)
  })

  it('missing product → not-found state', async () => {
    stub({ '/public/site GET': () => ({ data: SITE_DATA() }) })
    const w = await mountAt('/product/999')
    expect(w.text()).toContain('یافت نشد')
  })
})

describe('CheckoutView full flow', () => {
  it('validates form, posts server order and navigates to gateway', async () => {
    const orders = []
    stub({
      '/public/site GET': () => ({ data: SITE_DATA() }),
      '/public/coupons/verify POST': (b) => ({ data: b.code === 'OK' ? { valid: true, percent: 10, discount: 85000, payable: 765000 } : { valid: false, message: 'نامعتبر' } }),
      '/public/orders POST': (b) => { orders.push(b); return { status: 201, data: { ref: 'PF-TEST-ABC', total: 850000, discount: 85000, payable: 765000, payUrl: '/gateway?ref=PF-TEST-ABC', mode: 'demo' } } },
    })
    const nav = vi.fn()
    window.__PF_NAV_TEST = nav
    const w = await mountAt('/checkout')
    useCart().add(SITE_DATA().products[0], 1)
    for (let i = 0; i < 3; i++) { await w.vm.$nextTick(); await new Promise((r) => setTimeout(r, 15)) }

    // ارسال خالی → خطاهای فیلد
    await w.findAll('form')[1].trigger('submit.prevent')
    await w.vm.$nextTick()
    expect(w.text()).toContain('نام را کامل وارد کنید')

    await w.find('#ck-buyer').setValue('سارا مرادی')
    await w.find('#ck-phone').setValue('09121234567')
    await w.find('#ck-address').setValue('تهران، ولیعصر، کوچه بهار، پلاک ۵ کامل')
    await w.find('#ck-code').setValue('NOPE')
    await w.find('.ck-apply').trigger('click')
    await new Promise((r) => setTimeout(r, 30))
    expect(w.text()).toContain('نامعتبر')

    // کوپن درست
    await w.find('#ck-code').setValue('OK')
    await w.find('.ck-apply').trigger('click')
    await new Promise((r) => setTimeout(r, 30))
    expect(w.text()).toContain('اعمال شد')

    await w.findAll('form')[1].trigger('submit.prevent')
    await new Promise((r) => setTimeout(r, 40))
    expect(orders).toHaveLength(1)
    expect(orders[0]).toMatchObject({ buyer: 'سارا مرادی', phone: '09121234567', couponCode: 'OK', items: [{ id: 1, qty: 1 }] })
    expect(nav).toHaveBeenCalledWith('/gateway?ref=PF-TEST-ABC')
    expect(sessionStorage.getItem('pf.pending-order')).toBe('PF-TEST-ABC')
  })
})

describe('OrderView', () => {
  it('shows paid order and clears cart when ref matches pending', async () => {
    stub({
      '/public/site GET': () => ({ data: SITE_DATA() }),
      '/public/orders/PF-ONE-2 GET': () => ({ data: { ref: 'PF-ONE-2', status: 'paid', refId: 'DEMO-99', buyer: 'سارا', total: 850000, discount: 0, payable: 850000, coupon: null, items: [{ id: 1, title: 'ست', qty: 1, price: 850000 }], created_at: new Date().toISOString(), verified_at: '' } }),
    })
    const w = await mountAt('/order/PF-ONE-2', [{ id: 1, title: 'ست', price: 850000, qty: 1, stock: 46 }], 'PF-ONE-2')
    await new Promise((r) => setTimeout(r, 40))
    expect(w.text()).toContain('پرداخت موفق')
    expect(w.text()).toContain('DEMO-99')
    expect(useCart().count).toBe(0) // پاک‌سازی پس از موفقیت
  })

  it('waiting order offers continuing payment', async () => {
    stub({
      '/public/site GET': () => ({ data: SITE_DATA() }),
      '/public/orders/PF-TWO-3 GET': () => ({ data: { ref: 'PF-TWO-3', status: 'waiting', refId: '', total: 100, discount: 0, payable: 100, items: [], created_at: new Date().toISOString(), verified_at: null } }),
    })
    const w = await mountAt('/order/PF-TWO-3')
    await new Promise((r) => setTimeout(r, 30))
    expect(w.text()).toContain('در انتظار پرداخت')
    expect(w.find('.od-btn').attributes('href')).toContain('/gateway?ref=PF-TWO-3')
  })
})

describe('BlogView & Contact', () => {
  it('blog lists only published posts with fa date', async () => {
    stub({ '/public/site GET': () => ({ data: SITE_DATA() }) })
    const w = await mountAt('/blog')
    expect(w.text()).toContain('خبر کالکشن')
    await w.find('.bl-card').trigger('click')
    await new Promise((r) => setTimeout(r, 40))
    expect(w.text()).toContain('متن خبر کالکشن') // صفحهٔ نوشته
  })

  it('contact form posts request and shows success with id', async () => {
    let posted = null
    stub({
      '/public/site GET': () => ({ data: SITE_DATA() }),
      '/public/requests POST': (b) => { posted = b; return { status: 201, data: { ok: true, id: 9010 } } },
    })
    const w = await mountAt('/contact')
    await w.find('#ct-user').setValue('مهمان تست')
    await w.find('#ct-subject').setValue('سوال سایز')
    await w.find('#ct-body').setValue('لگ یوگا سایز large موجود می‌شود؟')
    await w.find('.ct-card form, form').trigger('submit.prevent')
    await new Promise((r) => setTimeout(r, 30))
    expect(posted).toMatchObject({ subject: 'سوال سایز' })
    expect(w.text()).toContain('ثبت شد')
    expect(w.text()).toContain('#9010')
  })
})

describe('SiteShell actions (Meelano)', () => {
  it('سوئیچ زبان + چیپ منبع داده + پوش', async () => {
    stub({})
    const w = await mountAt('/')
    expect(w.find('.src-chip').exists()).toBe(true)
    expect(w.text()).toMatch(/دمو|سرور|MySQL/)
    await w.find('.site-lang').trigger('click')
    for (let i = 0; i < 3; i++) await w.vm.$nextTick()
    expect(document.documentElement.dir).toBe('ltr')
    await w.find('.site-lang').trigger('click')
    await w.find('.site-bell').trigger('click')
    for (let i = 0; i < 3; i++) await w.vm.$nextTick()
    expect(document.documentElement.dir).toBe('rtl')
  })
})
