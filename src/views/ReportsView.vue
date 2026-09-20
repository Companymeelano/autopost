<script setup>
// فاز ۴ — گزارش مالی و تسویه: بازه تاریخ، خالص پس از کارمزد، روزشمار، کوپن‌ها، CSV
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)
import { apiFetch } from '../utils/api'
import { useCms } from '../stores/cms'
import { formatPrice, toFa } from '../utils/format'

const cms = useCms()
const from = ref('')
const to = ref('')
const rep = ref(null)
const err = ref('')
const busy = ref(false)
const canvas = ref(null)
let chart = null

const presets = { '۷ روز': 7, '۳۰ روز': 30, '۹۰ روز': 90 }
function preset(days) {
  const t = new Date(); const f = new Date(Date.now() - (days - 1) * 86400_000)
  from.value = f.toISOString().slice(0, 10)
  to.value = t.toISOString().slice(0, 10)
}
async function load() {
  if (!cms.online) { err.value = 'نیازمند اتصال سرور.'; rep.value = null; return }
  busy.value = true; err.value = ''
  try {
    const qs = new URLSearchParams()
    if (from.value) qs.set('from', from.value)
    if (to.value) qs.set('to', to.value)
    rep.value = await apiFetch('/finance/report?' + qs.toString())
    await nextTick() // کانواس داخل v-if="rep" است
    draw()
  } catch (e) { err.value = e.message || 'خطا' } finally { busy.value = false }
}
function draw() {
  if (!canvas.value) return
  chart?.destroy()
  const d = rep.value?.daily || []
  if (!d.length) { chart = null; return }
  chart = new Chart(canvas.value, {
    type: 'bar',
    data: {
      labels: d.map((x) => new Date(x.d).toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' })),
      datasets: [
        { label: 'درآمد روز (تومان)', data: d.map((x) => x.total), backgroundColor: '#00ffaa', borderRadius: 6 },
        { label: 'لغو/استردادی (تومان)', data: d.map((x) => -(rep.value.cancellations.find((c) => c.d === x.d)?.total || 0)), backgroundColor: '#ff5a7a', borderRadius: 6 },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#cfcfe4' } } }, scales: { x: { ticks: { color: '#8a8aa8' } }, y: { ticks: { color: '#8a8aa8' } } } },
  })
}
async function exportCsv() {
  const qs = new URLSearchParams()
  if (from.value) qs.set('from', from.value)
  if (to.value) qs.set('to', to.value)
  qs.set('format', 'csv')
  try {
    const r = await fetch('/api/finance/report?' + qs.toString(), { credentials: 'include' })
    const blob = await r.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `panahfit-finance-${from.value || 'all'}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    cms.toast('فایل CSV گزارش مالی دانلود شد.')
  } catch { cms.toast('خطا در دریافت فایل', true) }
}
onMounted(() => { preset(30); load() })
watch([from, to], () => { /* دستی apply می‌شود */ })
</script>

<template>
  <section class="fin">
    <div class="fin-head">
      <h2><i class="fas fa-chart-line"></i> گزارش مالی و تسویه</h2>
      <div class="fin-tools">
        <button v-for="(d, label) in presets" :key="label" class="chip" @click="preset(d); load()">{{ label }}</button>
        <input v-model="from" type="date" aria-label="از تاریخ" class="d-in" />
        <span>→</span>
        <input v-model="to" type="date" aria-label="تا تاریخ" class="d-in" />
        <button class="cms-btn cms-btn-secondary" style="width:auto;padding:6px 14px;font-size:.78rem;margin:0" :disabled="busy" @click="load()"><i class="fas" :class="busy ? 'fa-spinner fa-spin' : 'fa-rotate'"></i> اعمال</button>
        <button v-if="rep" class="cms-btn cms-btn-secondary" style="width:auto;padding:6px 14px;font-size:.78rem;margin:0" @click="exportCsv()"><i class="fas fa-file-csv"></i> CSV</button>
      </div>
    </div>

    <p v-if="err" class="fin-err">{{ err }}</p>
    <p v-else-if="!cms.online" class="fin-err">این گزارش سمت سرور تولید می‌شود؛ در حالت آفلاین در دسترس نیست.</p>

    <template v-if="rep">
      <div class="fin-kpis">
        <div class="k"><span>درآمد ناخالص ({{ toFa(rep.orderCount) }} سفارش)</span><b>{{ formatPrice(rep.gross) }}</b></div>
        <div class="k"><span>تخفیفات کوپن</span><b class="cut">− {{ formatPrice(rep.discounts) }}</b></div>
        <div class="k"><span>برداشتی درگاه</span><b>{{ formatPrice(rep.collected) }}</b></div>
        <div class="k" v-if="rep.feePct"><span>کارمزد درگاه ({{ toFa(rep.feePct) }}٪)</span><b class="neg">− {{ formatPrice(rep.fee) }}</b></div>
        <div class="k net"><span>خالص قابل تسویه</span><b>{{ formatPrice(rep.net) }} تومان</b></div>
        <div class="k" v-if="rep.refunds"><span>استرداد (لغو پس از پرداخت)</span><b class="neg">− {{ formatPrice(rep.refunds) }} ({{ toFa(rep.refundCount) }})</b></div>
      </div>

      <div class="fin-grid">
        <div class="card3d">
          <h3>روند روزانه (پرداخت − استرداد)</h3>
          <div class="chart-wrap"><canvas ref="canvas"></canvas></div>
          <p v-if="!rep.daily.length" class="fin-muted">در این بازه تراکنش موفقی نبود.</p>
        </div>
        <div class="card3d">
          <h3>کوپن‌های مصرفی</h3>
          <table v-if="rep.coupons.length" class="cms-table">
            <thead><tr><th>کد</th><th>تعداد</th><th>مجموع تخفیف</th></tr></thead>
            <tbody><tr v-for="c in rep.coupons" :key="c.code"><td class="mono">{{ c.code }}</td><td>{{ toFa(c.n) }}</td><td>{{ formatPrice(c.total) }}</td></tr></tbody>
          </table>
          <p v-else class="fin-muted">بدون کوپن در این بازه.</p>
          <h3 style="margin-top:16px">درگاه‌ها</h3>
          <p v-for="g in rep.byGateway" :key="g.gateway" class="fin-gw"><i class="fas fa-money-check"></i> {{ g.gateway }}: {{ toFa(g.n) }} تراکنش — {{ formatPrice(g.total) }}</p>
          <h3 style="margin-top:16px">وضعیت سفارش‌ها</h3>
          <p class="fin-muted"><span v-for="(n, st) in rep.byStatus" :key="st" class="st-pill">{{ st }}: {{ toFa(n) }}</span></p>
        </div>
      </div>
      <p class="fin-note">مبنا: وضعیت لحظه‌ای دیتابیس (orders + transactions با verified_at داخل بازه). فاکتور هر سفارش از صفحه «سفارش‌ها» قابل چاپ است.</p>
    </template>
  </section>
</template>

<style scoped>
.fin-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.fin-head h2 { margin: 0; font-size: 1.15rem; }
.fin-head h2 i { color: var(--primary, #00ffaa); margin-left: 8px; }
.fin-tools { display: flex; gap: 7px; align-items: center; flex-wrap: wrap; font-size: .78rem; }
.d-in { background: #12121f; border: 1px solid #2a2a44; color: #eaeaea; border-radius: 8px; padding: 5px 8px; font: inherit; font-size: .75rem; }
.chip { background: #12121f; color: #b9b9d0; border: 1px solid #2a2a44; border-radius: 999px; padding: 5px 12px; font: inherit; font-size: .74rem; cursor: pointer; }
.chip:hover { color: #00ffaa; border-color: rgba(0, 255, 170, 0.4); }
.fin-err { color: #ffd166; font-size: .84rem; }
.fin-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-bottom: 16px; }
.fin-kpis .k { background: #12121f; border: 1px solid #22223a; border-radius: 12px; padding: 10px 13px; display: grid; gap: 4px; }
.fin-kpis .k span { font-size: .68rem; color: #8a8aa8; }
.fin-kpis .k b { font-size: .95rem; }
.fin-kpis .cut { color: #7dffb0; } .fin-kpis .neg { color: #ff5a7a; }
.fin-kpis .net { border-color: rgba(0, 255, 170, 0.5); box-shadow: 0 0 16px rgba(0, 255, 170, 0.12); }
.fin-kpis .net b { color: #00ffaa; }
.fin-grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 14px; }
@media (max-width: 980px) { .fin-grid { grid-template-columns: 1fr; } }
.card3d { background: #12121f; border: 1px solid #22223a; border-radius: 14px; padding: 14px 16px; }
.card3d h3 { margin: 0 0 10px; font-size: .88rem; }
.chart-wrap { position: relative; height: 220px; }
.fin-muted { color: #8a8aa8; font-size: .78rem; }
.fin-gw { font-size: .78rem; color: #b9b9d0; margin: 6px 0; }
.fin-gw i { color: #00ffaa; margin-left: 6px; }
.st-pill { display: inline-block; background: #1a1a2c; border: 1px solid #2a2a44; border-radius: 8px; padding: 2px 9px; margin: 0 0 4px 4px; font-size: .72rem; }
.mono { font-family: ui-monospace, monospace; }
.fin-note { color: #66667f; font-size: .7rem; margin-top: 10px; }
</style>
