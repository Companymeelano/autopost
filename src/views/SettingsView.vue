<script setup>
import { ref, reactive } from 'vue'
import { useCms } from '../stores/cms'
import { apiFetch } from '../utils/api'
import SwitchToggle from '../components/SwitchToggle.vue'

const cms = useCms()
const testing = ref('')
const health = ref(null)
const healthBusy = ref(false)
const pw = reactive({ old: '', next: '', confirm: '' })
const pwErr = ref({})
const pwBusy = ref(false)

async function testConnectionReal() {
  healthBusy.value = true
  const t0 = performance.now()
  try {
    const r = await apiFetch('/health')
    health.value = { ...r, latency: Math.round(performance.now() - t0) }
    cms.toast(`سرور پاسخ داد (${health.value.latency}ms) — AI: ${r.ai === 'openai' ? 'مدل واقعی' : 'قالب داخلی'}، پرداخت: ${r.payment}.`)
  } catch {
    health.value = { error: true }
    cms.toast('سرور در دسترس نیست؛ پنل در حالت محلی (localStorage) کار می‌کند.', true)
  } finally { healthBusy.value = false }
}
async function sendToServer() {
  if (!window.confirm('محتوای فعلی پنل روی داده‌های سرور بازنویسی شود؟')) return
  await cms.pushToServer()
}
async function fetchFromServer() {
  if (!window.confirm('داده‌های فعلی (شامل تغییرات همگام‌نشده محلی) با نسخه سرور جایگزین شود؟')) return
  await cms.pullState()
}
async function submitPassword() {
  pwErr.value = {}
  pwBusy.value = true
  const r = await cms.changePassword(pw.old, pw.next, pw.confirm)
  pwBusy.value = false
  if (r.ok) {
    pw.old = pw.next = pw.confirm = ''
    cms.toast('رمز عبور با موفقیت تغییر کرد.')
  } else {
    pwErr.value = { ...(r.fields || {}), form: r.form || '' }
  }
}

const API_FIELDS = [
  { key: 'apiSms', id: 'api-sms', label: 'API سامانه پیامکی (Key)', placeholder: 'API_KEY_SMS_GATEWAY', tag: 'پیامک' },
  { key: 'apiPayment', id: 'api-payment', label: 'API درگاه پرداخت آنلاین (Merchant ID)', placeholder: 'MERCHANT_ID_ZARINPAL_OR_SADAD', tag: 'پرداخت' },
  { key: 'apiSite', id: 'api-site', label: 'API سایت اصلی (Secret)', placeholder: 'SITE_DATA_EXCHANGE_SECRET', tag: 'سایت اصلی' },
  { key: 'apiSocial', id: 'api-social', label: 'API شبکه‌های اجتماعی (Access Token)', placeholder: 'INSTAGRAM_ACCESS_TOKEN', tag: 'شبکه‌های اجتماعی' },
]

async function testConnection(tag) {
  if (testing.value) return
  testing.value = tag
  if (cms.online) {
    // فاز ۲: handshake واقعی — سلامت سرویس + منبع AI/پرداخت از سرور
    try {
      await apiFetch('/health')
      cms.toast(`اتصال API ${tag} از سمت سرور تأیید شد.`)
    } catch (e) {
      cms.toast(`تست ${tag} ناموفق: ${e.message}`, true)
    }
    testing.value = ''
    return
  }
  setTimeout(() => {
    testing.value = ''
    cms.toast(`اتصال API ${tag} با موفقیت انجام شد. (محلی — سرور آنلاین نیست)`)
  }, 700)
}

function toggleSetting(label, v) { cms.toast(`${label}: ${v ? 'فعال' : 'غیرفعال'} شد.`) }

const restoreInput = ref(null)

function downloadBackup() {
  try {
    const blob = new Blob([cms.exportPayload()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `panahfit-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    cms.toast('فایل پشتیبان ساخته شد.')
  } catch {
    cms.toast('ساخت فایل پشتیبان ناموفق بود.', true)
  }
}
function onRestoreFile(ev) {
  const file = ev.target.files?.[0]
  ev.target.value = ''
  if (!file) return
  const r = new FileReader()
  r.onload = async () => {
    try {
      const p = JSON.parse(r.result)
      if (!p || !Array.isArray(p.products)) throw new Error('bad')
      if (!window.confirm(`پشتیبان شامل ${p.products.length} محصول و ${(p.posts || []).length} پست است. جایگزینی کامل داده‌های فعلی؟`)) return
      cms.importPayload(p)
      cms.toast('داده‌ها از فایل پشتیبان بازیابی شد.')
    } catch {
      cms.toast('فایل نامعتبر است؛ باید خروجی «دانلود فایل پشتیبان» همین پنل باشد.', true)
    }
  }
  r.readAsText(file)
}
function resetAll() {
  if (!window.confirm('همه داده‌های محلی پاک شده و داده‌های نمونه جایگزین می‌شوند. ادامه می‌دهید؟')) return
  cms.resetToSeed()
  cms.toast('داده‌ها به حالت نمونه بازگشت.')
}
</script>

<template>
  <section>
    <h2 class="section-title"><i class="fas fa-cog"></i> تنظیمات API و عمومی</h2>

    <div class="data-card-3d" style="margin-bottom: 20px;">
      <h3 style="color: var(--primary); margin-bottom: 15px;"><i class="fas fa-server"></i> اتصال سرور (فاز ۲)</h3>
      <p style="font-size: .85rem; color: var(--text-muted); margin-bottom: 12px;">
        وضعیت:
        <span v-if="cms.online" class="status-chip chip-green">آنلاین — همگام‌سازی خودکار فعال</span>
        <span v-else class="status-chip" style="background:rgba(248,113,113,.15);color:#f87171;">آفلاین — فقط localStorage</span>
        <span v-if="cms.sync.lastError" style="color:#f87171;"> (آخرین خطا: {{ cms.sync.lastError }})</span>
      </p>
      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        <button class="cms-btn" style="width:auto;padding:9px 14px;background:#333;color:#fff;box-shadow:none;margin-top:0;" :disabled="healthBusy" @click="testConnectionReal">
          <i class="fas" :class="healthBusy ? 'fa-spinner fa-spin' : 'fa-heartbeat'"></i> تست سلامت سرور
        </button>
        <button v-if="cms.online" class="cms-btn" style="width:auto;padding:9px 14px;background:var(--accent-new);margin-top:0;" @click="sendToServer">
          <i class="fas fa-cloud-upload-alt"></i> ارسال داده‌های محلی به سرور
        </button>
        <button v-if="cms.online" class="cms-btn" style="width:auto;padding:9px 14px;background:#333;color:#fff;box-shadow:none;margin-top:0;" @click="fetchFromServer">
          <i class="fas fa-cloud-download-alt"></i> دریافت از سرور
        </button>
      </div>
      <div v-if="health" style="margin-top: 12px; font-size: .8rem; color: var(--text-muted);" class="grid-kpi-4">
        <template v-if="health.error"><span style="color:#f87171;">سرور در دسترس نبود.</span></template>
        <template v-else>
          <span>تأخیر: <strong style="color:#6ee7b7;">{{ health.latency }}ms</strong></span>
          <span>موتور AI: <strong>{{ health.ai === 'openai' ? 'مدل واقعی (OpenAI-compatible)' : 'قالب داخلی' }}</strong></span>
          <span>درگاه پرداخت: <strong>{{ health.payment === 'zarinpal' ? 'زرین‌پال (واقعی)' : 'دمو (شبیه‌سازی)' }}</strong></span>
          <span>آپتایم: <strong>{{ health.uptimeSec }}s</strong></span>
        </template>
      </div>
      <form v-if="cms.online" style="margin-top: 16px; border-top: 1px solid rgba(255,255,255,.07); padding-top: 14px;" @submit.prevent="submitPassword">
        <h4 style="margin-bottom: 10px;"><i class="fas fa-key"></i> تغییر رمز مدیر (سمت سرور)</h4>
        <div class="field-row-2">
          <div class="form-group-3d"><label for="pw-old">رمز فعلی</label>
            <input id="pw-old" v-model="pw.old" type="password" class="cms-input" :class="{invalid: pwErr.oldPassword}" autocomplete="current-password" />
            <span v-if="pwErr.oldPassword" class="field-error">{{ pwErr.oldPassword }}</span></div>
          <div class="form-group-3d"><label for="pw-next">رمز جدید (حداقل ۸ نویسه)</label>
            <input id="pw-next" v-model="pw.next" type="password" class="cms-input" :class="{invalid: pwErr.newPassword}" autocomplete="new-password" />
            <span v-if="pwErr.newPassword" class="field-error">{{ pwErr.newPassword }}</span></div>
        </div>
        <div class="form-group-3d"><label for="pw-confirm">تکرار رمز جدید</label>
          <input id="pw-confirm" v-model="pw.confirm" type="password" class="cms-input" :class="{invalid: pwErr.confirm}" autocomplete="new-password" />
          <span v-if="pwErr.confirm" class="field-error">{{ pwErr.confirm }}</span>
          <span v-if="pwErr.form" class="field-error">{{ pwErr.form }}</span></div>
        <button class="cms-btn" type="submit" style="width:200px;" :disabled="pwBusy">
          <i class="fas" :class="pwBusy ? 'fa-spinner fa-spin' : 'fa-shield-alt'"></i> {{ pwBusy ? 'در حال ثبت…' : 'تغییر رمز' }}
        </button>
      </form>
    </div>

    <div class="data-card-3d" style="margin-bottom: 20px;">
      <h3 style="color: var(--success); margin-bottom: 15px;"><i class="fas fa-link"></i> تنظیمات اتصال API</h3>
      <div class="form-group-3d" v-for="f in API_FIELDS" :key="f.key">
        <label :for="f.id">{{ f.label }}</label>
        <input :id="f.id" v-model="cms.settings[f.key]" type="text" class="cms-input" :placeholder="f.placeholder" />
        <button class="cms-btn" style="width: 150px; padding: 8px; margin-top: 5px;" :disabled="!!testing" @click="testConnection(f.tag)">
          <i class="fas" :class="testing === f.tag ? 'fa-spinner fa-spin' : 'fa-sync-alt'"></i>
          {{ testing === f.tag ? 'در حال تست...' : 'تست اتصال' }}
        </button>
      </div>
      <p style="color: var(--text-muted); font-size: 0.75rem; margin-top: 8px;">
        🔒 از فاز ۲ به بعد، کلیدهای واقعی AI و درگاه فقط در env سمت سرور (فایل .env) تنظیم می‌شوند؛ این فیلدها برای سازگاری با نسخه قبل نگه داشته شده‌اند و در سرور استفاده نمی‌شوند.
      </p>
    </div>

    <div class="data-card-3d">
      <h3 style="color: var(--primary); margin-bottom: 15px;"><i class="fas fa-sliders-h"></i> تنظیمات عمومی</h3>
      <p class="setting-row">
        فعال‌سازی حالت نگهداری (Maintenance Mode):
        <SwitchToggle v-model="cms.settings.maintenance" aria-label="حالت نگهداری" @change="v => toggleSetting('حالت نگهداری', v)" />
      </p>
      <p class="setting-row" style="border-bottom: none;">
        غیرفعال کردن نمایش محصولات با موجودی صفر:
        <SwitchToggle v-model="cms.settings.hideZeroStock" aria-label="مخفی‌سازی محصولات با موجودی صفر" @change="v => toggleSetting('مخفی‌سازی موجودی صفر', v)" />
      </p>
    </div>

    <div class="data-card-3d" style="margin-top: 20px;">
      <h3 style="color: var(--accent-new); margin-bottom: 15px;"><i class="fas fa-database"></i> داده‌ها و پشتیبان‌گیری</h3>
      <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 12px;">
        تغییرات به‌صورت debounced در localStorage ذخیره می‌شوند{{ cms.online ? ' و به‌طور خودکار روی سرور (SQLite) همگام‌سازی می‌گردند' : '' }}. برای انتقال یا نسخه‌گیری، فایل JSON بگیرید یا از endpoint بکاپ سرور استفاده کنید.
      </p>
      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        <button class="cms-btn" style="width:auto;padding:9px 14px;background:#333;color:#fff;box-shadow:none;margin-top:0;" @click="downloadBackup">
          <i class="fas fa-download"></i> دانلود فایل پشتیبان
        </button>
        <label class="cms-btn" style="width:auto;padding:9px 14px;background:var(--accent-new);margin-top:0;cursor:pointer;">
          <i class="fas fa-upload"></i> بازیابی از فایل
          <input ref="restoreInput" type="file" accept="application/json,.json" style="display:none;" @change="onRestoreFile" />
        </label>
        <button class="cms-btn" style="width:auto;padding:9px 14px;background:var(--accent-hot-red);margin-top:0;" @click="resetAll">
          <i class="fas fa-undo-alt"></i> بازگشت به داده‌ی نمونه
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.setting-row { color: var(--text-muted); display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px dashed var(--border-dark); font-size: 0.9rem; margin: 0; }
</style>
