// فاز ۴ — دوزبانه‌سازی سایت + دامنه جهت RTL/LTR
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import App from '../App.vue'
import { makeRouter } from '../router.js'
import { beforeEach } from 'vitest'
import { useI18n } from '../i18n'

function stubSite() {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({
      products: [{ id: 1, title: 'لگ یوگا', cat: 'legging', price: 490000, oldPrice: 0, stock: 9, sold: 1, desc: 'لگ راحت', image: '', meta: {} }],
      posts: [], settings: { siteName: 'پناه‌فیت', newDiscount: false },
    }),
  })))
}

async function mountAt(path) {
  window.scrollTo = () => {}
  localStorage.clear()
  setActivePinia(createPinia())
  const router = makeRouter()
  const w = mount(App, { global: { plugins: [router] }, attachTo: document.body })
  await router.push(path)
  await router.isReady()
  for (let i = 0; i < 3; i++) { await w.vm.$nextTick(); await new Promise((r) => setTimeout(r, 20)) }
  return w
}

beforeEach(() => {
  const { lang, toggle } = useI18n()
  if (lang.value === 'en') toggle() // حالت ماژول تک‌نمونه است → ریست قطعی به fa
})
afterEach(() => { vi.unstubAllGlobals(); document.documentElement.dir = 'rtl' })

describe('i18n scope', () => {
  it('defaults to Persian on the site', async () => {
    stubSite()
    const w = await mountAt('/')
    expect(document.documentElement.dir).toBe('rtl')
    expect(w.text()).toContain('خانه و فروشگاه')
    expect(w.text()).not.toContain('Add to cart')
  })

  it('language switch flips to English + LTR and persists', async () => {
    stubSite()
    const w = await mountAt('/')
    await w.find('.site-lang').trigger('click')
    expect(document.documentElement.dir).toBe('ltr')
    expect(document.documentElement.lang).toBe('en')
    expect(w.text()).toContain('Shop')
    expect(localStorage.getItem('panahfit.lang.v1')).toBe('en')

    // صفحه محصول هم انگلیسی
    await w.vm.$router.push('/product/1')
    for (let i = 0; i < 3; i++) { await w.vm.$nextTick(); await new Promise((r) => setTimeout(r, 30)) }
    expect(w.text()).toContain('Add to cart')
    expect(w.text()).toContain('left in stock')
  })

  it('admin panel stays RTL even with lang=en', async () => {
    stubSite()
    localStorage.setItem('panahfit.lang.v1', 'en')
    const w = await mountAt('/login')
    expect(document.documentElement.dir).toBe('rtl')
    expect(w.text()).toContain('PanahFit') // فرم ورود فارسی‌پوسته است
  })

  it('checkout summary labels are translated', async () => {
    stubSite()
    const w = await mountAt('/')
    await w.find('.site-lang').trigger('click')
    const { useCart } = await import('../stores/cart.js')
    useCart().add({ id: 1, title: 'لگ یوگا', price: 490000, stock: 9 }, 2)
    await w.vm.$router.push('/checkout')
    await new Promise((r) => setTimeout(r, 60))
    expect(w.text()).toContain('Full name')
    expect(w.text()).toContain('Payable')
    expect(w.text()).toContain('Confirm & pay online')
  })
})
