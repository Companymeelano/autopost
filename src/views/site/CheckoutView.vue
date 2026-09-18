<script setup>
// checkout (فاز ۳) — سبد + کوپن + آدرس → ثبت سفارش سمت سرور → هدایت به درگاه
import { computed, onMounted, reactive, ref } from 'vue'
import { useSite } from '../../stores/site'
import { useCart } from '../../stores/cart'
import { formatPrice, toFa } from '../../utils/format'
import { useI18n } from '../../i18n'

const site = useSite()
const cart = useCart()
const form = reactive({ buyer: '', phone: '', address: '', note: '' })
const errors = reactive({})
const busy = ref(false)
const serverMsg = ref('')
const created = ref(null)
const { t } = useI18n()

onMounted(async () => { await site.load(); if (site.products.length) cart.reconcile(site.products) })

const summary = computed(() => ({
  total: cart.subtotal,
  discount: cart.discount,
  payable: cart.payable,
}))

async function submit() {
  serverMsg.value = ''
  for (const k of Object.keys(errors)) delete errors[k]
  if (!cart.items.length) { errors.items = t('ck.e.items'); return }
  if (form.buyer.trim().length < 3) errors.buyer = t('ck.e.buyer')
  if (!/^09\d{9}$/.test(form.phone.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).trim())) errors.phone = t('ck.e.phone')
  if (form.address.trim().length < 10) errors.address = t('ck.e.address')
  if (Object.keys(errors).length) return
  if (!site.canBuy) { serverMsg.value = 'برای ثبت سفارش آنلاین، سرور باید در دسترس باشد (حالت آفلاین فقط مرور است).'; return }
  busy.value = true
  try {
    const r = await fetch('/api/public/orders', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        buyer: form.buyer.trim(), phone: form.phone.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).trim(),
        address: form.address.trim(), note: form.note.trim(),
        couponCode: cart.coupon.valid ? cart.coupon.code.trim() : undefined,
        items: cart.items.map((x) => ({ id: x.id, qty: x.qty })),
      }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) {
      Object.assign(errors, d.fields || {})
      serverMsg.value = d.error || 'ثبت سفارش ناموفق بود.'
      return
    }
    created.value = d
    sessionStorage.setItem('pf.pending-order', d.ref)
    if (d.payUrl) (window.__PF_NAV_TEST || ((u) => window.location.assign(u)))(d.payUrl)
  } catch {
    serverMsg.value = 'ارتباط با سرور برقرار نشد.'
  } finally { busy.value = false }
}
</script>

<template>
  <section class="ck">
    <h1><i class="fas fa-receipt"></i> {{ t('ck.title') }}</h1>

    <div v-if="created" class="ck-created">
      <b>سفارش {{ created.ref }} ثبت شد.</b>
      <p v-if="!created.payUrl || created.mode === 'demo'">در حال انتقال به درگاه پرداخت… <RouterLink :to="'/order/' + created.ref">مشاهده وضعیت</RouterLink></p>
      <p v-else>آماده پرداخت در درگاه: <a :href="created.payUrl">ادامه پرداخت</a></p>
    </div>

    <p v-if="errors.items" class="ck-err">{{ errors.items }}</p>
    <p v-if="!cart.items.length && !created" class="ck-empty">
      {{ t('ck.empty') }} <RouterLink to="/">{{ t('ck.gotoShop') }}</RouterLink>
    </p>

    <div v-else class="ck-grid">
      <div class="ck-left">
        <div class="ck-card">
          <h2>{{ t('ck.items') }} ({{ toFa(cart.count) }})</h2>
          <ul class="ck-list">
            <li v-for="x in cart.items" :key="x.id">
              <div class="ck-t">
                <RouterLink :to="'/product/' + x.id">{{ x.title }}</RouterLink>
                <small>{{ formatPrice(x.price) }} تومان</small>
              </div>
              <div class="qty-box" role="group">
                <button type="button" :disabled="x.qty <= 1" @click="cart.setQty(x.id, x.qty - 1)" aria-label="کاهش">−</button>
                <span>{{ toFa(x.qty) }}</span>
                <button type="button" :disabled="x.qty >= (x.stock || 99)" @click="cart.setQty(x.id, x.qty + 1)" aria-label="افزایش">+</button>
              </div>
              <button class="ck-del" type="button" @click="cart.remove(x.id)" :aria-label="'حذف ' + x.title"><i class="fas fa-trash"></i></button>
            </li>
          </ul>
          <div v-if="Object.keys(errors).some((k) => k.startsWith('item_'))" class="ck-err" style="margin:8px 0 0">
            <p v-for="(msg, k) in errors" :key="k" style="margin:2px 0">{{ String(errors[k]) }}</p>
          </div>
        </div>

        <form class="ck-card" @submit.prevent="cart.verifyCoupon()">
          <h2>{{ t('ck.coupon') }}</h2>
          <div class="ck-coupon">
            <input v-model="cart.coupon.code" id="ck-code" class="ck-in" placeholder="مثلاً WELCOME" aria-label="کد تخفیف" />
            <button class="ck-apply" :disabled="cart.coupon.checking || !cart.coupon.code.trim()">{{ t('ck.apply') }}</button>
          </div>
          <p v-if="cart.coupon.message" class="ck-coupon-msg" :class="{ ok: cart.coupon.valid }">{{ cart.coupon.message }}</p>
        </form>

        <form class="ck-card" @submit.prevent="submit">
          <h2>{{ t('ck.sum') }}</h2>
          <label>{{ t('ck.buyer') }} <span class="req">*</span>
            <input v-model="form.buyer" id="ck-buyer" class="ck-in" :class="{ bad: errors.buyer }" autocomplete="name" />
          </label>
          <p v-if="errors.buyer" class="ck-field-err">{{ errors.buyer }}</p>
          <label>{{ t('ck.phone') }} <span class="req">*</span>
            <input v-model="form.phone" id="ck-phone" class="ck-in" placeholder="09xxxxxxxxx" :class="{ bad: errors.phone }" inputmode="tel" />
          </label>
          <p v-if="errors.phone" class="ck-field-err">{{ errors.phone }}</p>
          <label>{{ t('ck.address') }} <span class="req">*</span>
            <textarea v-model="form.address" id="ck-address" class="ck-in ck-ta" rows="3" :class="{ bad: errors.address }"></textarea>
          </label>
          <p v-if="errors.address" class="ck-field-err">{{ errors.address }}</p>
          <label>{{ t('ck.note') }}
            <textarea v-model="form.note" class="ck-in ck-ta" rows="2"></textarea>
          </label>
          <p v-if="errors.note || errors.couponCode" class="ck-field-err">{{ errors.note || errors.couponCode }}</p>
          <p v-if="serverMsg" class="ck-err">{{ serverMsg }}</p>
          <button class="ck-pay" type="submit" :disabled="busy || !cart.items.length">
            <i class="fas fa-lock"></i> {{ busy ? '…' : t('ck.submit') }}
          </button>
        </form>
      </div>

      <aside class="ck-sum" aria-label="خلاصه مبلغ">
        <h2>{{ t('ck.sum') }}</h2>
        <p><span>{{ t('ck.total') }}</span><b>{{ formatPrice(summary.total) }}</b></p>
        <p v-if="summary.discount"><span>{{ t('ck.discount') }} <small v-if="cart.coupon.valid">({{ toFa(cart.coupon.percent) }}٪)</small></span><b class="cut">− {{ formatPrice(summary.discount) }}</b></p>
        <hr />
        <p class="ck-final"><span>{{ t('ck.pay') }}</span><b>{{ formatPrice(summary.payable) }} تومان</b></p>
        <p class="ck-note">{{ t('ck.priceNote') }}</p>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.ck h1 { margin: 0 0 16px; font-size: 1.25rem; }
.ck h1 i { color: #00ffaa; margin-left: 8px; }
.ck-empty { color: #8a8aa8; } .ck-empty a { color: #00ffaa; }
.ck-created { background: rgba(0, 255, 170, 0.08); border: 1px solid rgba(0, 255, 170, 0.4); border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; font-size: .88rem; }
.ck-created a, .ck-created .cut { color: #7dffb0; }
.ck-grid { display: grid; grid-template-columns: 1fr 300px; gap: 18px; align-items: start; }
@media (max-width: 900px) { .ck-grid { grid-template-columns: 1fr; } }
.ck-left { display: grid; gap: 16px; }
.ck-card { background: #12121f; border: 1px solid #22223a; border-radius: 16px; padding: 16px 18px; }
.ck-card h2, .ck-sum h2 { font-size: .95rem; margin: 0 0 12px; color: #eaeaea; }
.ck-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.ck-list li { display: flex; align-items: center; gap: 10px; border-bottom: 1px dashed #22223a; padding-bottom: 10px; }
.ck-t { flex: 1; display: grid; gap: 2px; }
.ck-t a { color: #eaeaea; text-decoration: none; font-size: .88rem; }
.ck-t a:hover { color: #00ffaa; }
.ck-t small { color: #8a8aa8; font-size: .74rem; }
.qty-box { display: flex; align-items: center; border: 1px solid #2a2a44; border-radius: 8px; overflow: hidden; }
.qty-box button { width: 28px; height: 28px; background: transparent; border: 0; color: #00ffaa; cursor: pointer; }
.qty-box button:disabled { color: #44445e; }
.qty-box span { min-width: 30px; text-align: center; font-size: .82rem; }
.ck-del { background: transparent; border: 0; color: #ff5a7a; cursor: pointer; }
.ck-coupon { display: flex; gap: 8px; }
.ck-apply { background: #12121f; border: 1px solid rgba(0, 255, 170, 0.4); color: #00ffaa; border-radius: 9px; padding: 0 16px; font: inherit; cursor: pointer; }
.ck-apply:disabled { opacity: .4; }
.ck-coupon-msg { font-size: .78rem; color: #ff5a7a; margin: 8px 0 0; }
.ck-coupon-msg.ok { color: #7dffb0; }
.ck-card label { display: grid; gap: 5px; font-size: .8rem; color: #b9b9d0; margin-bottom: 10px; }
.req { color: #ff5a7a; }
.ck-in { background: #0d0d18; border: 1px solid #2a2a44; color: #eaeaea; border-radius: 9px; padding: 10px 12px; font: inherit; font-size: .85rem; width: 100%; box-sizing: border-box; }
.ck-in:focus { outline: none; border-color: #00ffaa; }
.ck-in.bad { border-color: #ff0055; }
.ck-ta { resize: vertical; }
.ck-field-err { color: #ff5a7a; font-size: .72rem; margin: -6px 0 8px; }
.ck-err { background: #241019; border: 1px solid #ff005566; color: #ff8aa0; padding: 10px 12px; border-radius: 10px; font-size: .8rem; }
.ck-pay { width: 100%; margin-top: 6px; background: #00ffaa; color: #04110b; border: 0; border-radius: 11px; padding: 12px; font: inherit; font-weight: 800; cursor: pointer; box-shadow: 0 0 20px rgba(0, 255, 170, 0.3); }
.ck-pay:disabled { opacity: .5; cursor: wait; }
.ck-pay i { margin-left: 6px; }
.ck-sum { background: #12121f; border: 1px solid rgba(0, 255, 170, 0.3); border-radius: 16px; padding: 16px 18px; position: sticky; top: 84px; }
.ck-sum p { display: flex; justify-content: space-between; font-size: .84rem; color: #b9b9d0; margin: 8px 0; }
.ck-sum p b { color: #eaeaea; }
.ck-sum .cut, .ck-sum .cut b { color: #7dffb0; }
.ck-sum hr { border: 0; border-top: 1px dashed #2a2a44; margin: 10px 0; }
.ck-final b { color: #00ffaa !important; text-shadow: 0 0 12px rgba(0, 255, 170, 0.4); }
.ck-note { font-size: .68rem !important; color: #66667f !important; line-height: 1.7; }
</style>
