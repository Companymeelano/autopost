<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCms } from '../stores/cms'
import { apiFetch } from '../utils/api'
import { formatPrice } from '../utils/format'

const cms = useCms()
const route = useRoute()
const form = reactive({ amount: '', description: 'سفارش پنل PanahFit' })
const errors = ref({})
const busy = ref(false)
const txBusy = ref('')
const txs = ref([])
const result = ref(null)

const TX_STATUS = {
  waiting: ['در انتظار پرداخت', 'background:rgba(251,191,36,.15);color:#fbbf24'],
  paid: ['موفق', 'background:rgba(0,255,170,.12);color:#6ee7b7'],
  failed: ['ناموفق/لغوشده', 'background:rgba(248,113,113,.12);color:#f87171'],
}

async function refresh() {
  if (!cms.online) return
  try { txs.value = (await apiFetch('/transactions')).items || [] } catch { /* خطا به‌صورت toast */ }
}

async function create() {
  errors.value = {}
  const amount = Number(form.amount)
  if (!Number.isFinite(amount) || amount < 1000) { errors.value.amount = 'مبلغ باید حداقل ۱٬۰۰۰ تومان باشد.'; return }
  busy.value = true
  result.value = null
  try {
    const p = await apiFetch('/payments/create', { method: 'POST', body: { amount, description: form.description } })
    result.value = { ...p, amount, verified: null }
    cms.toast('تراکنش ثبت شد؛ در حال هدایت به درگاه…')
    if (p.url) window.open(p.url, '_blank', 'noopener') // حالت واقعی: کاربر به درگاه می‌رود
  } catch (e) {
    errors.value.form = e.message
  } finally { busy.value = false; refresh() }
}

async function simulate(ok = true) {
  if (!result.value?.authority || result.value.verified !== null) return
  txBusy.value = ok ? 'ok' : 'fail'
  try {
    const authority = ok ? result.value.authority : `fail-${result.value.authority}`
    const r = await apiFetch('/payments/verify', { method: 'POST', body: { authority, refId: ok ? undefined : '' } })
    result.value.verified = r.ok
    result.value.refId = r.refId
    cms.toast(r.ok ? `پرداخت با موفقیت تأیید شد — کد پیگیری: ${r.refId}` : 'تراکنش ناموفق ثبت شد (شبیه‌سازی لغو).', !r.ok)
  } catch (e) {
    result.value.verified = false
    cms.toast(`تأیید ناموفق: ${e.message}`, true)
  } finally { txBusy.value = ''; refresh() }
}

onMounted(async () => {
  if (route.query.result === 'done') cms.toast('بازگشت از درگاه — پرداخت تأیید شد.')
  if (route.query.result === 'fail') cms.toast('بازگشت از درگاه — پرداخت تکمیل نشد.', true)
  if (cms.online) {
    // نشست در حالت دمو: ابتدا صبر کن تا initRemote تمام شود
    setTimeout(refresh, 600)
  }
})
</script>

<template>
  <section>
    <h2 class="section-title"><i class="fas fa-credit-card"></i> پرداخت و تراکنش‌ها</h2>

    <div v-if="!cms.online" class="offline-note">
      <i class="fas fa-plug"></i>
      این بخش نیازمند اتصال سرور است (درگاه پرداخت و ثبت تراکنش فقط سمت سرور انجام می‌شود).
      سرور با <code style="direction:ltr;display:inline-block;">npm run server</code> اجرا و در Vite proxy تنظیم شده است.
    </div>

    <template v-else>
      <div class="data-card-3d" style="margin-bottom: 20px;">
        <h3 style="margin-bottom: 14px;"><i class="fas fa-money-bill-wave"></i> ثبت درخواست پرداخت</h3>
        <form class="field-row-2" @submit.prevent="create">
          <div class="form-group-3d">
            <label for="pay-amount">مبلغ (تومان)</label>
            <input id="pay-amount" v-model="form.amount" type="number" min="1000" class="cms-input"
                   :class="{ invalid: errors.amount }" placeholder="مثلاً 250000" />
            <span v-if="errors.amount" class="field-error">{{ errors.amount }}</span>
          </div>
          <div class="form-group-3d">
            <label for="pay-desc">شرح تراکنش</label>
            <input id="pay-desc" v-model="form.description" class="cms-input" maxlength="100" />
          </div>
          <div class="form-group-3d" style="display:flex;align-items:flex-end;">
            <button class="cms-btn" type="submit" style="width:100%;" :disabled="busy">
              <i class="fas" :class="busy ? 'fa-spinner fa-spin' : 'fa-credit-card'"></i>
              {{ busy ? 'در حال ثبت…' : 'ایجاد لینک پرداخت' }}
            </button>
          </div>
        </form>
        <p v-if="errors.form" class="field-error" role="alert">{{ errors.form }}</p>

        <div v-if="result" style="margin-top: 16px; border-top: 1px solid rgba(255,255,255,.07); padding-top: 14px;">
          <p style="font-size: .85rem; color: var(--text-muted);">
            <span v-if="result.mode === 'demo'" class="status-chip" style="background:rgba(251,191,36,.15);color:#fbbf24;">حالت دمو — تأیید شبیه‌سازی‌شده</span>
            <span v-else class="status-chip chip-green">درگاه واقعی زرین‌پال</span>
            مبلغ: <strong>{{ formatPrice(result.amount) }}</strong> تومان
          </p>
          <p style="font-size:.75rem;color:var(--text-muted);margin:6px 0 4px;">Authority:</p>
          <div class="authority-box">{{ result.authority }}</div>

          <template v-if="result.mode === 'demo' && result.verified === null">
            <p style="font-size:.8rem;color:var(--text-muted);margin-top:10px;">شبیه‌سازی بازگشت کاربر از بانک:</p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;">
              <button class="cms-btn" style="width:auto;padding:8px 14px;background:var(--accent-new);margin-top:0;" :disabled="!!txBusy" @click="simulate(true)">
                <i class="fas fa-check"></i> پرداخت موفق
              </button>
              <button class="cms-btn" style="width:auto;padding:8px 14px;background:var(--accent-hot-red);margin-top:0;" :disabled="!!txBusy" @click="simulate(false)">
                <i class="fas fa-times"></i> لغو/ناموفق
              </button>
            </div>
          </template>
          <p v-else-if="result.verified === true" style="margin-top:10px;color:#6ee7b7;font-size:.85rem;">
            <i class="fas fa-check-circle"></i> تأیید شد — کد پیگیری: <span class="authority-box" style="display:inline;padding:2px 8px;">{{ result.refId }}</span>
          </p>
          <p v-else-if="result.verified === false" style="margin-top:10px;color:#f87171;font-size:.85rem;">
            <i class="fas fa-times-circle"></i> این تراکنش در وضعیت ناموفق/لغوشده ثبت شد.
          </p>
        </div>
      </div>

      <div class="data-card-3d">
        <h3 style="margin-bottom: 12px; display:flex; align-items:center; gap:10px;">
          <i class="fas fa-receipt"></i> آخرین تراکنش‌ها
          <button class="cms-btn" style="width:auto;padding:5px 12px;background:#333;color:#fff;box-shadow:none;margin:0;font-size:.75rem;" @click="refresh">
            <i class="fas fa-sync-alt"></i> تازه‌سازی
          </button>
        </h3>
        <p v-if="!txs.length" style="color:var(--text-muted);font-size:.85rem;">تراکنشی ثبت نشده است.</p>
        <div v-else class="table-scroll-wrap">
          <table class="cms-table">
            <thead>
              <tr><th scope="col">#</th><th scope="col">مبلغ</th><th scope="col">شرح</th><th scope="col">وضعیت</th><th scope="col">کد پیگیری</th><th scope="col">زمان</th></tr>
            </thead>
            <tbody>
              <tr v-for="t in txs" :key="t.id">
                <td>{{ t.id }}</td>
                <td>{{ formatPrice(t.amount) }}</td>
                <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ t.description || '—' }}</td>
                <td>
                  <span class="status-chip" :style="TX_STATUS[t.status]?.[1] || ''">{{ TX_STATUS[t.status]?.[0] || t.status }}</span>
                </td>
                <td style="direction:ltr;text-align:left;font-size:.72rem;">{{ t.ref_id || '—' }}</td>
                <td style="font-size:.75rem;color:var(--text-muted);">{{ new Date(t.created_at).toLocaleString('fa-IR') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </section>
</template>
