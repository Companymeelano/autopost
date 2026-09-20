// فاز ۳ — استور سبد خرید
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const KEY = 'panahfit.cart.v1'

beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); vi.resetModules() })
afterEach(() => { vi.unstubAllGlobals() })

async function cart() {
  const { useCart } = await import('../stores/cart.js')
  return useCart()
}

const P = (over = {}) => ({ id: 1, title: 'لگ', price: 500000, stock: 5, cat: 'legging', image: '', ...over })

describe('cart store', () => {
  it('add accumulates and totals', async () => {
    const c = await cart()
    expect(c.add(P(), 2).ok).toBe(true)
    expect(c.add(P({ id: 2, price: 100000 }), 1).ok).toBe(true)
    expect(c.count).toBe(3)
    expect(c.subtotal).toBe(500000 * 2 + 100000)
  })

  it('clamps quantity to stock', async () => {
    const c = await cart()
    expect(c.add(P({ stock: 3 }), 5).ok).toBe(false)
    expect(c.items).toHaveLength(0) // ناموفق → چیزی اضافه نشود
    c.add(P({ stock: 3 }), 2)
    expect(c.add(P({ stock: 3 }), 2).ok).toBe(false)
    expect(c.items[0].qty).toBe(3) // clamp به سقف موجودی
  })

  it('setQty / remove / clear', async () => {
    const c = await cart()
    c.add(P(), 2)
    c.setQty(1, 4)
    expect(c.items[0].qty).toBe(4)
    c.setQty(1, 99) // clamp به stock=5
    expect(c.items[0].qty).toBe(5)
    c.setQty(1, 0)
    expect(c.items[0].qty).toBe(1)
    c.remove(1)
    expect(c.items).toHaveLength(0)
    c.add(P(), 1); c.clear()
    expect(c.items).toHaveLength(0)
  })

  it('persists to localStorage and restores fresh', async () => {
    const c = await cart()
    c.add(P({ title: 'پایدار' }), 3)
    await new Promise((r) => setTimeout(r, 0)) // watcher debounce میکروتاسک
    const { useCart } = await import('../stores/cart.js')
    setActivePinia(createPinia())
    const c2 = useCart()
    expect(c2.items[0]?.title).toBe('پایدار')
    expect(c2.items[0]?.qty).toBe(3)
  })

  it('coupon verify via public API applies discount to payable', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ valid: true, percent: 20, discount: 120000, payable: 480000 }) }))
    vi.stubGlobal('fetch', fetchSpy)
    const c = await cart()
    c.add(P({ price: 300000 }), 2) // subtotal 600000
    c.coupon.code = 'OFF20'
    await c.verifyCoupon()
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/public/coupons/verify')
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({ code: 'OFF20', amount: 600000 })
    expect(c.coupon.valid).toBe(true)
    expect(c.discount).toBe(120000)
    expect(c.payable).toBe(480000)
  })

  it('invalid coupon message surfaces and discount stays 0', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ valid: false, message: 'کد منقضی شده است.' }) })))
    const c = await cart()
    c.add(P({ price: 250000 }), 2)
    c.coupon.code = 'OLD'
    await c.verifyCoupon()
    expect(c.coupon.valid).toBe(false)
    expect(c.coupon.message).toContain('منقضی')
    expect(c.payable).toBe(500000)
  })

  it('reconcile removes vanished products and clamps to real stock', async () => {
    const c = await cart()
    c.add(P({ id: 7, stock: 9 }), 5)
    c.add(P({ id: 8, stock: 9, title: 'حذفی' }), 2)
    c.reconcile([{ id: 7, title: 'لگ تازه', price: 520000, stock: 3 }])
    await import('vue').then(({ nextTick }) => nextTick())
    expect(c.items).toHaveLength(1)
    expect(c.items[0].qty).toBe(3) // clamp
    expect(c.items[0].price).toBe(520000) // قیمت به‌روز از سرور
    expect(localStorage.getItem(KEY)).toBeTruthy()
  })
})
