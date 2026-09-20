// ============================================================================
// سبد خرید مشتری (فاز ۳) — پایدار در localStorage؛ قیمت‌گذاری نهایی همیشه سمت سرور قطعی است
// ============================================================================
import { defineStore } from 'pinia'
import { ref, reactive, computed, watch } from 'vue'

const CART_KEY = 'panahfit.cart.v1'

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY)
    if (!raw) return []
    const p = JSON.parse(raw)
    return Array.isArray(p) ? p.filter((x) => x && x.id != null && x.qty > 0) : []
  } catch { return [] }
}

export const useCart = defineStore('cart', () => {
  const items = reactive(loadCart())
  const coupon = reactive({ code: '', checking: false, valid: null, percent: 0, discount: 0, payable: 0, message: '' })

  watch(items, () => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)) } catch { /* فضا پر است */ }
  }, { deep: true })

  const count = computed(() => items.reduce((s, x) => s + x.qty, 0))
  const subtotal = computed(() => items.reduce((s, x) => s + (Number(x.price) || 0) * x.qty, 0))
  const discount = computed(() => (coupon.valid ? coupon.discount : 0))
  const payable = computed(() => Math.max(0, subtotal.value - discount.value))

  function add(product, qty = 1) {
    const stock = Number(product.stock) || 0
    const found = items.find((x) => x.id === product.id)
    const target = (found ? found.qty : 0) + qty
    if (target > stock) { if (!found) return { ok: false, error: 'stock' }; items[items.indexOf(found)].qty = stock; return { ok: false, error: 'stock' } }
    if (found) found.qty = target
    else items.push({ id: product.id, title: product.title, price: Number(product.price) || 0, qty, image: product.image || '', cat: product.cat || '', stock })
    return { ok: true }
  }
  function setQty(id, qty) {
    const x = items.find((i) => i.id === id)
    if (!x) return
    const q = Math.max(1, Math.min(Number(qty) || 1, x.stock || 999))
    x.qty = q
  }
  function remove(id) {
    const i = items.findIndex((x) => x.id === id)
    if (i !== -1) items.splice(i, 1)
  }
  function clear() {
    items.splice(0, items.length)
    resetCoupon()
  }
  function resetCoupon() {
    Object.assign(coupon, { code: '', checking: false, valid: null, percent: 0, discount: 0, payable: 0, message: '' })
  }

  /** اعتبارسنجی کد تخفیف با API عمومی سرور (بدون احراز هویت) */
  async function verifyCoupon() {
    const code = String(coupon.code || '').trim()
    if (!code || subtotal.value <= 0) return
    coupon.checking = true
    try {
      const r = await fetch('/api/public/coupons/verify', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, amount: subtotal.value }),
      })
      const d = await r.json()
      Object.assign(coupon, { valid: !!d.valid, percent: d.percent || 0, discount: d.discount || 0, payable: d.payable ?? 0, message: d.message || (d.valid ? 'کد تخفیف اعمال شد.' : '') })
    } catch {
      Object.assign(coupon, { valid: false, message: 'بررسی کد تخفیف نیازمند اتصال به سرور است.' })
    } finally { coupon.checking = false }
  }

  /** همسان‌سازی سبد با موجودی واقعی سایت (بعد از load/refresh) */
  function reconcile(products) {
    const map = new Map(products.map((p) => [Number(p.id), p]))
    for (let i = items.length - 1; i >= 0; i--) {
      const p = map.get(Number(items[i].id))
      if (!p) { items.splice(i, 1); continue }
      items[i].price = p.price
      items[i].stock = p.stock ?? 0
      items[i].title = p.title
      if (items[i].qty > items[i].stock) { if (items[i].stock <= 0) items.splice(i, 1); else items[i].qty = items[i].stock }
    }
  }

  return { items, coupon, count, subtotal, discount, payable, add, setQty, remove, clear, resetCoupon, verifyCoupon, reconcile }
})
