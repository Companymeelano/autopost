<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { Chart, registerables } from 'chart.js'
import { useCms } from '../stores/cms'
import { apiFetch } from '../utils/api'
import { formatPrice, toFa, CATEGORY_LABELS } from '../utils/format'

Chart.register(...registerables)

const cms = useCms()
const kpi = computed(() => cms.kpis())

const topCanvas = ref(null)
const stockCanvas = ref(null)
let topChart = null
let stockChart = null
let weeklyChart = null

// ——— فاز ۲.۵: گزارش دوره‌ای از سرور (پرداخت‌های واقعی + لحن‌های AI) ———
const days = ref(30)
const report = ref(null)
const reportErr = ref('')
const reportBusy = ref(false)
const weeklyCanvas = ref(null)
async function loadReport() {
  if (!cms.online) { report.value = null; return }
  reportBusy.value = true
  reportErr.value = ''
  try {
    report.value = await apiFetch(`/reports/summary?days=${days.value}`)
    await nextTick()
    renderWeekly()
  } catch (e) {
    reportErr.value = e.message
  } finally { reportBusy.value = false }
}
function renderWeekly() {
  if (!weeklyCanvas.value || !report.value?.weekly?.length) return
  weeklyChart?.destroy()
  weeklyChart = new Chart(weeklyCanvas.value, {
    type: 'line',
    data: {
      labels: report.value.weekly.map((w) => w.week.slice(5)),
      datasets: [{ label: 'درآمد هفتگی (تومان)', data: report.value.weekly.map((w) => w.total), borderColor: '#00ffaa', backgroundColor: 'rgba(0,255,170,.12)', fill: true, tension: .35 }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
  })
}
watch(days, loadReport)
watch(() => cms.sync.lastOk, () => { if (cms.online) loadReport() })

const PRIMARY = '#ccff00'
const PALETTE = [PRIMARY, '#ff2e63', '#ff9900', '#00ffc8', '#7c4dff', '#00b0ff', '#f5f5f5']

function topData() {
  const rows = [...cms.products].sort((a, b) => (b.sold || 0) - (a.sold || 0)).slice(0, 10)
  return {
    labels: rows.map((p) => p.title),
    datasets: [{ label: 'تعداد فروش', data: rows.map((p) => p.sold || 0), backgroundColor: PRIMARY, borderRadius: 6 }],
  }
}
function stockData() {
  const byCat = {}
  for (const p of cms.products) byCat[p.cat] = (byCat[p.cat] || 0) + (p.stock || 0)
  const cats = Object.keys(byCat)
  return {
    labels: cats.map((c) => CATEGORY_LABELS[c] || c),
    datasets: [{ data: cats.map((c) => byCat[c]), backgroundColor: PALETTE.slice(0, Math.max(1, cats.length)), borderWidth: 0 }],
  }
}

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
  },
  scales: {
    x: { ticks: { color: '#999', font: { family: 'Vazirmatn' } }, grid: { color: '#222' } },
    y: { ticks: { color: '#999', font: { family: 'Vazirmatn' } }, grid: { color: '#222' } },
  },
}

onMounted(() => {
  loadReport()
  if (topCanvas.value) {
    topChart = new Chart(topCanvas.value, { type: 'bar', data: topData(), options: baseOptions })
  }
  if (stockCanvas.value) {
    stockChart = new Chart(stockCanvas.value, {
      type: 'doughnut',
      data: stockData(),
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', rtl: true, labels: { color: '#eee', font: { family: 'Vazirmatn' } } } } },
    })
  }
})

watch(() => [cms.products.length, ...cms.products.map((p) => p.sold + ':' + p.stock + ':' + p.cat + ':' + p.title)], () => {
  if (topChart) { topChart.data = topData(); topChart.update() }
  if (stockChart) { stockChart.data = stockData(); stockChart.update() }
})

onBeforeUnmount(() => { topChart?.destroy(); stockChart?.destroy(); weeklyChart?.destroy() })

const lowStockCount = computed(() => cms.products.filter((p) => (p.stock || 0) < 10).length)
</script>

<template>
  <section>
    <h2 class="section-title"><i class="fas fa-tachometer-alt"></i> داشبورد و گزارش‌گیری</h2>

    <h3 style="color: var(--success); margin-bottom: 15px;"><i class="fas fa-chart-line"></i> خلاصه عملکرد کلی</h3>
    <div class="dashboard-grid">
      <div class="data-card-3d">
        <div class="card-title"><i class="fas fa-wallet"></i> درآمد کل (بر پایه فروش محصولات)</div>
        <div class="card-value">{{ formatPrice(kpi.revenue) }} تومان</div>
        <div class="card-trend"><i class="fas fa-caret-up"></i> محاسبه‌شده از داده‌های پنل</div>
      </div>
      <div class="data-card-3d">
        <div class="card-title"><i class="fas fa-truck-loading"></i> تعداد کل فروش</div>
        <div class="card-value">{{ toFa(kpi.orders) }} مورد</div>
      </div>
      <div class="data-card-3d">
        <div class="card-title" style="color: var(--accent-hot-red);"><i class="fas fa-sync-alt"></i> درخواست‌های باز</div>
        <div class="card-value" style="color: var(--accent-hot-red); text-shadow: 0 0 10px rgba(255, 0, 85, 0.4);">{{ toFa(kpi.pending) }} مورد</div>
        <div class="card-trend" style="color: var(--text-muted);">نیاز به اقدام</div>
      </div>
      <div class="data-card-3d">
        <div class="card-title"><i class="fas fa-boxes"></i> محصولات</div>
        <div class="card-value">{{ toFa(kpi.productsCount) }} محصول</div>
        <div class="card-trend" :style="lowStockCount ? 'color: var(--accent-new);' : ''">
          <i class="fas fa-exclamation-triangle"></i> {{ toFa(lowStockCount) }} محصول با موجودی کمتر از ۱۰
        </div>
      </div>
    </div>

    <h3 style="color: var(--primary); margin-bottom: 15px;"><i class="fas fa-chart-bar"></i> آنالیز محصولات و موجودی</h3>
    <div class="dashboard-grid" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));">
      <div class="data-card-3d">
        <div class="card-title"><i class="fas fa-fire"></i> محصولات پرفروش (بر اساس تعداد)</div>
        <div class="chart-box"><canvas ref="topCanvas" aria-label="نمودار میله‌ای محصولات پرفروش"></canvas></div>
      </div>
      <div class="data-card-3d">
        <div class="card-title"><i class="fas fa-box-open"></i> موجودی انبار بر اساس دسته‌بندی</div>
        <div class="chart-box"><canvas ref="stockCanvas" aria-label="نمودار دونات موجودی دسته‌بندی‌ها"></canvas></div>
      </div>
    </div>

    <div class="data-card-3d" style="margin-top: 20px;">
      <div class="card-title"><i class="fas fa-headset"></i> درخواست‌های ثبت شده جدید</div>
      <div class="table-scroll-wrap">
        <table class="data-table-3d" style="font-size: 0.8rem; margin-top: 10px;">
          <thead>
            <tr>
              <th scope="col">نوع</th><th scope="col">موضوع</th><th scope="col">نام کاربر</th>
              <th scope="col">تاریخ</th><th scope="col">عملیات</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in cms.requests" :key="r.id">
              <td>{{ r.type }}</td>
              <td>
                {{ r.subject }}
                <span v-if="r.status === 'new'" class="status-chip chip-red">باز</span>
                <span v-else class="status-chip chip-green">رسیدگی شد</span>
              </td>
              <td>{{ r.user }}</td>
              <td>{{ r.date }}</td>
              <td>
                <button class="cms-btn" style="width:auto;padding:5px 8px;margin:0;font-size:0.75rem;background:var(--accent-new);"
                        @click="cms.openModal('جزئیات درخواست', 'request', { requestId: r.id })">مشاهده</button>
              </td>
            </tr>
            <tr v-if="!cms.requests.length"><td colspan="5" style="text-align:center;color:var(--text-muted);">درخواستی ثبت نشده است.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
      <div class="data-card-3d" style="margin-top: 20px;">
      <h3 style="color: var(--accent-new); margin-bottom: 12px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
        <i class="fas fa-calendar-week"></i> گزارش دوره‌ای (پرداخت‌های واقعی سمت سرور)
        <span v-if="!cms.online" class="status-chip" style="background:rgba(255,255,255,.06);color:var(--text-muted);">نیازمند اتصال سرور</span>
        <template v-else>
          <label class="range-pick">
            <select v-model.number="days" class="cms-input cms-select" style="width:auto;padding:4px 10px;font-size:.75rem;" aria-label="بازه زمانی گزارش">
              <option :value="7">۷ روز اخیر</option>
              <option :value="30">۳۰ روز اخیر</option>
              <option :value="90">۹۰ روز اخیر</option>
            </select>
          </label>
          <button class="cms-btn" style="width:auto;padding:5px 12px;margin:0;font-size:.75rem;background:#333;color:#fff;box-shadow:none;" :disabled="reportBusy" @click="loadReport">
            <i class="fas" :class="reportBusy ? 'fa-spinner fa-spin' : 'fa-sync-alt'"></i>
          </button>
        </template>
      </h3>
      <p v-if="reportErr" class="field-error" role="alert">{{ reportErr }}</p>
      <template v-if="report && cms.online">
        <div class="grid-kpi-4" style="margin-bottom:12px;">
          <div class="mini-kpi"><span>پرداخت موفق (دوره)</span><strong>{{ toFa(report.paidCount) }} تراکنش</strong></div>
          <div class="mini-kpi"><span>گردش مالی</span><strong style="color:var(--success);">{{ formatPrice(report.paidTotal) }} تومان</strong></div>
          <div class="mini-kpi"><span>مؤثرترین لحن AI</span><strong>{{ report.tones[0]?.tone || '—' }}</strong></div>
          <div class="mini-kpi"><span>پرفروش‌ترین دسته</span><strong>{{ report.perCat[0]?.cat || '—' }}</strong></div>
        </div>
        <div class="chart-box" style="height: 180px;"><canvas ref="weeklyCanvas" aria-label="نمودار درآمد هفتگی"></canvas></div>
        <div v-if="report.tones.length" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
          <span v-for="t in report.tones" :key="t.tone" class="status-chip chip-cyan">{{ t.tone }}: {{ toFa(t.count) }} درخواست</span>
        </div>
      </template>
      <p v-else-if="!cms.online" style="color:var(--text-muted);font-size:.85rem;">آمار پرداخت‌های واقعی فقط وقتی سرور در دسترس است قابل دریافت است؛ KPIهای بالا از داده‌های محلی محاسبه می‌شوند.</p>
    </div>

</section>
</template>

<style scoped>
.chip-red { color: var(--accent-hot-red); background: rgba(255, 0, 85, 0.12); border: 1px solid var(--accent-hot-red); }
.chip-green { color: var(--success); background: rgba(0, 255, 200, 0.12); border: 1px solid var(--success); }
</style>
