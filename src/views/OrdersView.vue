<script setup>
// مدیریت سفارش‌ها (فاز ۳) — لیست سمت سرور، ارسال/لغو با بازگشت موجودی
import { ref, computed, onMounted, reactive } from 'vue'
import { apiFetch } from '../utils/api'
import { useCms } from '../stores/cms'
import { formatPrice, toFa } from '../utils/format'

const TL = { created: 'ثبت', paid: 'پرداخت', shipped: 'ارسال', cancelled: 'لغو/استرداد' }
const CARRIERS = ['تیپاکس', 'پست پیشتاز', 'پیک موتوری', 'البرز اکسپرس', 'بارچین', 'آسیا پرواز']
const shipFor = ref(null)
const shipForm = reactive({ carrier: '', tracking: '' })

const cms = useCms()
const orders = ref([])
const loading = ref(false)
const err = ref('')
const openId = ref(null)
const busy = ref('')
const filter = ref('all')

const STATUS = {
  waiting: ['در انتظار پرداخت', '#ffd166'],
  paid: ['پرداخت‌شده', '#7dffb0'],
  shipped: ['ارسال‌شده', '#00ffaa'],
  cancelled: ['لغو‌شده', '#ff5a7a'],
  failed: ['ناموفق', '#ff5a7a'],
}
const shown = computed(() => (filter.value === 'all' ? orders.value : orders.value.filter((o) => o.status === filter.value)))

async function refresh() {
  if (!cms.online) { err.value = 'این بخش نیازمند اتصال به سرور است.'; orders.value = []; return }
  loading.value = true
  err.value = ''
  try {
    const d = await apiFetch('/orders')
    orders.value = d.items || []
  } catch (e) { err.value = e.message || 'خطا' } finally { loading.value = false }
}
async function act(o, op, body = null) {
  if (op === 'cancel' && !window.confirm(`لغو سفارش ${o.ref}؟ (موجودی بازگردانده می‌شود)`)) return
  busy.value = o.ref + op
  try {
    await apiFetch(`/orders/${encodeURIComponent(o.ref)}/${op}`, { method: 'POST', body: body ?? undefined })
    cms.toast(op === 'ship' ? 'سفارش ارسال‌شده علامت‌گذاری شد.' : 'سفارش لغو شد؛ موجودی بازگردانده شد.')
    await refresh()
    await cms.pullState() // استوک/sold عوض شده → state پنل تازه شود
  } catch (e) { cms.toast(e.message || 'عملیات ناموفق بود.', true) } finally { busy.value = '' }
}
function openShip(o) { shipFor.value = o; shipForm.carrier = ''; shipForm.tracking = '' }
function submitShip() {
  const o = shipFor.value
  if (!o) return
  shipFor.value = null
  act(o, 'ship', { carrier: shipForm.carrier.trim(), tracking: shipForm.tracking.trim() })
}
const tlFa = (s) => { try { return new Date(s).toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' }) } catch { return s } }
onMounted(refresh)
</script>

<template>
  <section class="orders-page">
    <div class="cms-page-head" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <h2 style="margin:0">سفارش‌های فروشگاه</h2>
      <span class="chip-filter" :class="{ on: filter === 'all' }" @click="filter = 'all'">همه ({{ toFa(orders.length) }})</span>
      <span v-for="(label, key) in STATUS" :key="key" class="chip-filter" :class="{ on: filter === key }" @click="filter = key">
        {{ label[0] }} ({{ toFa(orders.filter((o) => o.status === key).length) }})
      </span>
      <button class="cms-btn cms-btn-secondary" style="margin-inline-start:auto;width:auto;padding:6px 14px;font-size:.78rem" :disabled="loading" @click="refresh">
        <i class="fas" :class="loading ? 'fa-spinner fa-spin' : 'fa-rotate'"></i> تازه‌سازی
      </button>
    </div>

    <p v-if="err" class="orders-notice">{{ err }}</p>

    <div v-else-if="!shown.length" class="cms-empty-state">
      <i class="fas fa-boxes"></i>
      <p>سفارشی ثبت نشده است. سفارش‌ها از فروشگاه عمومی ساخته می‌شوند.</p>
    </div>

    <div v-else class="data-card-3d" style="overflow-x:auto">
      <table class="cms-table">
        <thead>
          <tr><th>کد</th><th>مشتری</th><th>موبایل</th><th>مبلغ</th><th>وضعیت</th><th>تاریخ</th><th>عملیات</th></tr>
        </thead>
        <tbody>
          <template v-for="o in shown" :key="o.ref">
            <tr :class="{ 'row-open': openId === o.ref }" @click="openId = openId === o.ref ? null : o.ref">
              <td class="mono">#{{ o.ref }}</td>
              <td>{{ o.buyer }}<small v-if="o.note" style="color:var(--text-muted)"> + یادداشت</small></td>
              <td class="mono" style="direction:ltr">{{ o.phone }}</td>
              <td>{{ formatPrice(o.payable) }}
                <small v-if="o.discount" style="color:#7dffb0"> (−{{ toFa(Math.round((o.discount / o.total) * 100)) }}٪)</small>
              </td>
              <td><span class="st-chip" :style="{ color: (STATUS[o.status] || ['', '#9a9ab5'])[1] }"><i class="fas fa-circle" style="font-size:.4rem"></i> {{ (STATUS[o.status] || [o.status])[0] }}</span></td>
              <td>{{ new Date(o.created_at).toLocaleString('fa-IR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</td>
              <td @click.stop>
                <a class="cms-btn-mini" :href="'/invoice/' + o.ref" target="_blank" title="فاکتور (چاپ/PDF)" @click.stop><i class="fas fa-file-invoice"></i></a>
                <button v-if="o.status === 'paid'" class="cms-btn-mini" :disabled="busy === o.ref + 'ship'" title="علامت‌گذاری ارسال" @click.stop="openShip(o)"><i class="fas fa-truck-fast"></i></button>
                <button v-if="['waiting', 'paid'].includes(o.status)" class="cms-btn-mini danger" :disabled="busy === o.ref + 'cancel'" title="لغو و بازگشت موجودی" @click="act(o, 'cancel')"><i class="fas fa-ban"></i></button>
                <span v-if="busy === o.ref + 'ship' || busy === o.ref + 'cancel'"><i class="fas fa-spinner fa-spin"></i></span>
              </td>
            </tr>
            <tr v-if="openId === o.ref" class="detail-row">
              <td colspan="7">
                <div class="detail-grid">
                  <div><b>اقلام:</b>
                    <ul class="ord-items">
                      <li v-for="it in o.items" :key="it.id">{{ it.title }} × {{ toFa(it.qty) }} — {{ formatPrice(it.price * it.qty) }}</li>
                    </ul>
                  </div>
                  <div><b>آدرس:</b><br />{{ o.address }}</div>
                  <div v-if="o.note"><b>یادداشت:</b><br />{{ o.note }}</div>
                  <div><b>کد رهگیری:</b> {{ o.ref_id || '—' }} <br /><b>کوپن:</b> {{ o.coupon || '—' }}
                    <template v-if="o.carrier || o.tracking"><br /><b>مرسوله:</b> {{ o.carrier || '—' }} <span dir="ltr">{{ o.tracking || '' }}</span></template>
                  </div>
                  <div v-if="(o.timeline || []).length" class="ord-tl">
                    <b>گاه‌شمار:</b>
                    <ul><li v-for="(x, i) in o.timeline" :key="i"><span>{{ TL[x.label] || x.label }}</span><time>{{ tlFa(x.at) }}</time></li></ul>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <div v-if="shipFor" class="ship-overlay" @click.self="shipFor = null">
      <div class="ship-modal" role="dialog" aria-modal="true">
        <h3><i class="fas fa-truck-fast"></i> ثبت ارسال — {{ shipFor.ref }}</h3>
        <label class="ship-f"><span>شرکت باربری</span>
          <input v-model="shipForm.carrier" list="pf-carriers" placeholder="مثلاً تیپاکس" maxlength="40" />
          <datalist id="pf-carriers"><option v-for="c in CARRIERS" :key="c" :value="c" /></datalist>
        </label>
        <label class="ship-f"><span>کد رهگیری (اختیاری)</span>
          <input v-model="shipForm.tracking" dir="ltr" placeholder="Tracking code" maxlength="60" />
        </label>
        <p class="ship-hint">با ثبت، گام «ارسال شد» به گاه‌شمار سفارش اضافه و برای مشتری پیامک رهگیری (در صورت فعال‌بودن سرویس) ارسال می‌شود.</p>
        <div class="ship-btns">
          <button class="cms-btn-mini primary" @click="submitShip"><i class="fas fa-check"></i> ثبت و علامت‌گذاری ارسال</button>
          <button class="cms-btn-mini" @click="shipFor = null">انصراف</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.orders-page .mono { font-family: ui-monospace, monospace; font-size: .78rem; }
.cms-table tr { cursor: pointer; }
.row-open { background: rgba(0, 255, 170, 0.05) !important; }
.st-chip { display: inline-flex; align-items: center; gap: 6px; font-size: .76rem; font-weight: 700; }
.chip-filter { font-size: .74rem; padding: 4px 11px; border-radius: 999px; border: 1px solid #2a2a44; color: #9a9ab5; cursor: pointer; background: transparent; }
.chip-filter.on { color: #00ffaa; border-color: rgba(0, 255, 170, 0.5); box-shadow: 0 0 10px rgba(0, 255, 170, 0.15); }
.orders-notice { color: #ffd166; font-size: .84rem; }
.cms-btn-mini { background: transparent; border: 1px solid #2a2a44; color: #b9b9d0; border-radius: 8px; width: 30px; height: 30px; cursor: pointer; margin-inline-start: 4px; }
.cms-btn-mini:hover { color: #00ffaa; border-color: #00ffaa; }
.cms-table .cms-btn-mini { display: inline-grid; place-items: center; text-decoration: none; }
.cms-table td { white-space: nowrap; }
.cms-btn-mini.danger:hover { color: #ff5a7a; border-color: #ff5a7a; }
.detail-row td { background: #0d0d18; cursor: default; }
.detail-grid { display: grid; grid-template-columns: 1.2fr 1.4fr 1fr 1fr; gap: 14px; font-size: .78rem; color: #b9b9d0; padding: 6px 4px; }
@media (max-width: 900px) { .detail-grid { grid-template-columns: 1fr 1fr; } }
.detail-grid b { color: #eaeaea; }
.ord-items { margin: 4px 0 0; padding-inline-start: 18px; }
.ord-tl ul { margin: 4px 0 0; padding: 0; list-style: none; }
.ord-tl li { display: flex; justify-content: space-between; gap: 8px; }
.ord-tl time { color: #8a8aa8; font-size: .72rem; }
.ship-overlay { position: fixed; inset: 0; background: rgba(5,5,12,.72); display: grid; place-items: center; z-index: 60; }
.ship-modal { width: min(420px, 92vw); background: #12121f; border: 1px solid #2a2a45; border-radius: 16px; padding: 18px 20px; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
.ship-modal h3 { margin: 0 0 12px; font-size: .95rem; color: #7dffb0; }
.ship-f { display: block; margin: 10px 0; font-size: .78rem; color: #b9b9d0; }
.ship-f input { display: block; width: 100%; margin-top: 4px; background: #0d0d18; border: 1px solid #2a2a45; border-radius: 9px; padding: 8px 10px; color: #eaeaea; }
.ship-hint { font-size: .72rem; color: #8a8aa8; line-height: 1.7; }
.ship-btns { display: flex; gap: 8px; margin-top: 8px; }
</style>
