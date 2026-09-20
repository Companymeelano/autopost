<script setup>
// وضعیت سفارش — /#/order/PF-xxx (بعد از بازگشت از درگاه)
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useCart } from '../../stores/cart'
import { formatPrice, toFa } from '../../utils/format'
import { useI18n } from '../../i18n'

const route = useRoute()
const cart = useCart()
const order = ref(null)
const err = ref('')
const loading = ref(true)

const { t } = useI18n()
const fd = (s) => { try { const d = new Date(s); return d.toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' }) } catch { return s } }
const LABEL = {
  waiting: ['fa-hourglass-half', '#ffd166'],
  paid: ['fa-circle-check', '#7dffb0'],
  shipped: ['fa-truck-fast', '#7dffb0'],
  cancelled: ['fa-ban', '#ff5a7a'],
  failed: ['fa-circle-xmark', '#ff5a7a'],
}

onMounted(async () => {
  try {
    const r = await fetch('/api/public/orders/' + encodeURIComponent(route.params.ref))
    if (!r.ok) throw new Error(String((await r.json().catch(() => ({}))).error || 'سفارش یافت نشد.'))
    order.value = await r.json()
    if (['paid', 'shipped'].includes(order.value.status) && sessionStorage.getItem('pf.pending-order') === order.value.ref) {
      cart.clear()
      sessionStorage.removeItem('pf.pending-order')
    }
  } catch (e) { err.value = e.message || 'خطا' } finally { loading.value = false }
})
</script>

<template>
  <section class="od">
    <p v-if="loading">{{ t('ord.checking') }}</p>
    <div v-else-if="err" class="od-box bad"><i class="fas fa-triangle-exclamation"></i> {{ err }}</div>
    <div v-else class="od-box">
      <i class="fas od-ico" :class="LABEL[order.status]?.[0]" :style="{ color: LABEL[order.status]?.[1] || '#9a9ab5' }"></i>
      <h1>{{ order.ref }}</h1>
      <p class="od-status" :style="{ color: LABEL[order.status]?.[1] }">{{ t('ord.' + order.status) }}</p>

      <table class="od-tbl">
        <thead><tr><th>#</th><th></th><th></th></tr></thead>
        <tbody>
          <tr v-for="it in order.items" :key="it.id"><td>{{ it.title }}</td><td>{{ toFa(it.qty) }}</td><td>{{ formatPrice(it.price * it.qty) }}</td></tr>
        </tbody>
      </table>

      <p><span>{{ t('ck.total') }}</span><b>{{ formatPrice(order.total) }} تومان</b></p>
      <p v-if="order.discount"><span>تخفیف {{ order.coupon }}</span><b class="cut">− {{ formatPrice(order.discount) }}</b></p>
      <p class="od-pay"><span>{{ t('ck.pay') }}</span><b>{{ formatPrice(order.payable) }} تومان</b></p>
      <p v-if="order.refId" class="od-tr"><i class="fas fa-fingerprint"></i> {{ t('ord.track') }} {{ order.refId }}</p>

      <section v-if="order.carrier || order.tracking" class="od-ship">
        <h3><i class="fas fa-truck-fast"></i> {{ t('ord.shipCard') }}</h3>
        <p v-if="order.carrier"><span>{{ t('ord.carrier') }}:</span> <b>{{ order.carrier }}</b></p>
        <p v-if="order.tracking"><span>{{ t('ord.tracking') }}:</span> <b dir="ltr" class="mono">{{ order.tracking }}</b></p>
      </section>
      <section v-if="(order.timeline || []).length" class="od-tl">
        <h3>{{ t('ord.timeline') }}</h3>
        <ol>
          <li v-for="(x, i) in order.timeline" :key="i">
            <span class="tl-l">{{ t('ord.tl_' + x.label) || x.label }}</span>
            <time dir="ltr">{{ fd(x.at) }}</time>
          </li>
        </ol>
      </section>

      <div class="od-actions">
        <a v-if="order.status === 'waiting'" class="od-btn" :href="'/gateway?ref=' + encodeURIComponent(order.ref)">{{ t('ord.continue') }}</a>
        <RouterLink v-if="['failed', 'cancelled'].includes(order.status)" class="od-btn" to="/checkout">{{ t('ord.retry') }}</RouterLink>
        <RouterLink class="od-btn ghost" to="/">{{ t('ord.keep') }}</RouterLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.od { display: grid; place-items: center; padding: 30px 0; color: #8a8aa8; }
.od-box { width: min(560px, 100%); background: #12121f; border: 1px solid #22223a; border-radius: 18px; padding: 26px; text-align: center; color: #eaeaea; }
.od-box.bad { border-color: #ff005566; color: #ff8aa0; font-size: .9rem; }
.od-ico { font-size: 2.2rem; margin-bottom: 8px; }
.od-box h1 { font-size: 1.05rem; margin: 4px 0 2px; letter-spacing: .5px; color: #9ad7ff; }
.od-status { font-weight: 800; margin: 0 0 14px; }
.od-tbl { width: 100%; border-collapse: collapse; font-size: .8rem; margin-bottom: 12px; }
.od-tbl th { color: #66667f; font-weight: 600; text-align: right; padding: 6px; border-bottom: 1px solid #2a2a44; }
.od-tbl td { padding: 7px 6px; border-bottom: 1px dashed #22223a; }
.od-box > p { display: flex; justify-content: space-between; font-size: .84rem; color: #b9b9d0; margin: 6px 0; }
.od-box > p b { color: #eaeaea; }
.od-box .cut, .od-box .cut b { color: #7dffb0; }
.od-pay b { color: #00ffaa !important; }
.od-tr { justify-content: center; color: #8a8aa8; font-size: .76rem; }
.od-tr i { margin-left: 5px; color: #00ffaa; }
.od-actions { display: flex; gap: 10px; justify-content: center; margin-top: 14px; flex-wrap: wrap; }
.od-btn { background: #00ffaa; color: #04110b; font-weight: 800; text-decoration: none; padding: 10px 18px; border-radius: 10px; font-size: .84rem; }
.od-btn.ghost { background: transparent; color: #b9b9d0; border: 1px solid #2a2a44; }
</style>

<style scoped>
.od-ship { text-align: start; background: #0c0c18; border: 1px solid #1f3a33; border-radius: 12px; padding: 12px 14px; margin: 14px 0 4px; }
.od-ship h3 { margin: 0 0 8px; font-size: .85rem; color: #7dffb0; }
.od-ship p { margin: 4px 0; font-size: .82rem; display: flex; gap: 8px; align-items: center; }
.od-ship .mono { background: #101024; padding: 2px 8px; border-radius: 6px; letter-spacing: 1px; }
.od-tl { text-align: start; margin: 10px 0 4px; }
.od-tl h3 { margin: 0 0 6px; font-size: .8rem; color: #9ad7ff; }
.od-tl ol { margin: 0; padding: 0 18px 0 0; list-style: none; }
.od-tl li { display: flex; justify-content: space-between; gap: 10px; font-size: .78rem; border-inline-start: 2px solid #22223a; padding: 4px 10px; margin: 0; }
.od-tl .tl-l { color: #c8c8e0; }
.od-tl time { color: #8a8aa8; font-size: .72rem; }
</style>
