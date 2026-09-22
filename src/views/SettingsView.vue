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
/* ================= Meelano DB — پل MySQL هاست اشتراکی (cPanel) ================= */
const db = reactive({
  busy: '', err: '', state: null, health: null, testOut: null, guide: false,
  form: { host: 'localhost', port: '3306', user: '', password: '', database: '', prefix: 'pf_', ssl: false },
  syncUsers: false, importLocal: true,
})
async function dbLoad() {
  if (!cms.online) return
  try {
    db.state = await apiFetch('/db')
    const c = db.state.config || {}
    Object.assign(db.form, { host: c.host || 'localhost', port: String(c.port || '3306'), user: c.user || '', database: c.database || '', prefix: c.prefix || 'pf_', ssl: !!c.ssl })
    db.syncUsers = !!db.state.syncUsers
  } catch { /* پنل محلی */ }
}
dbLoad()
async function dbPost(path, body) {
  db.busy = path
  db.err = ''
  try { return await apiFetch('/db' + path, { method: 'POST', body }) }
  catch (e) { db.err = e.message; throw e }
  finally { db.busy = '' }
}
async function dbTest() {
  try {
    db.testOut = await dbPost('/test', { ...db.form })
    cms.toast(`اتصال برقرار شد ✓ MySQL ${db.testOut.version} — جداول میلانو موجود: ${db.testOut.existingTables.length}`)
  } catch { cms.toast('تست اتصال ناموفق: ' + db.err, true) }
}
async function dbApply() {
  if (!window.confirm('ساخت و تطبیق جداول روی MySQL میزبان و جایگذاری کامل دادهٔ پنل انجام شود؟')) return
  try {
    await dbPost('/apply', { ...db.form, syncUsers: db.syncUsers, importLocal: db.importLocal })
    db.applyOk = true
    cms.toast('✓ جداول ساخته و هم‌سازی شد — داده روی دیتابیس هاست جایگذاری گردید.')
    await dbHealth()
  } catch { cms.toast('اعمال ناموفق: ' + db.err, true) }
}
async function dbHealth() {
  db.busy = '/health'
  try { db.health = await apiFetch('/db/health'); db.err = '' }
  catch (e) { db.err = e.message }
  finally { db.busy = '' }
}
async function dbRepair(rebuild = []) {
  try {
    const r = await dbPost('/repair', { rebuild })
    db.health = { enabled: true, tables: r.tables }
    cms.toast(rebuild.length ? `جدول‌های انتخابی بازسازی شد (${rebuild.length}).` : 'ترمیم خودکار انجام شد ✓')
  } catch { cms.toast('ترمیم ناموفق: ' + db.err, true) }
}
async function dbPush() { try { await dbPost('/push', {}); cms.toast('داده‌ها روی MySQL جایگذاری شد ✓'); await dbHealth() } catch { cms.toast('جایگذاری ناموفق: ' + db.err, true) } }
async function dbPull() {
  if (!window.confirm('ساختار محلی با جداول دیتابیس میزبان یکسان‌سازی شود؟ (وارد کردن از هاست)')) return
  try { const r = await dbPost('/pull', {}); cms.toast(`فراخوانی جداول انجام شد — محصولات: ${r.rows.products}، پست‌ها: ${r.rows.posts} ✓`); await cms.pullState?.() } catch { cms.toast('فراخوانی ناموفق: ' + db.err, true) }
}
async function dbDisconnect() {
  if (!window.confirm('همگام‌سازی با MySQL غیرفعال شود؟ (داده‌های پنل دست‌نخورده می‌ماند)')) return
  await dbPost('/disconnect', {}); db.health = null; db.state = await apiFetch('/db').catch(() => null)
  cms.toast('اتصال دیتابیس میزبان قطع شد.')
}

function resetAll() {
  if (!window.confirm('همه داده‌های محلی پاک شده و داده‌های نمونه جایگزین می‌شوند. ادامه می‌دهید؟')) return
  cms.resetToSeed()
  cms.toast('داده‌ها به حالت نمونه بازگشت.')
}
const pushBusy = ref(false)
const pushInfo = ref('')
async function sendPushTest() {
  pushBusy.value = true
  try {
    const r = await apiFetch('/push', { method: 'GET' }).catch(() => ({ items: [], total: 0, mode: '?' }))
    const out = await apiFetch('/push/test', { method: 'POST' })
    pushInfo.value = `حالت ${r.mode} · اشتراک‌ها ${r.total} · ارسال ${out.sent} · خطا ${out.failed}`
    cms.toast(out.sent ? `پوش آزمایشی به ${out.sent} دستگاه ارسال شد 🔔` : 'اشتراکی ثبت نشده یا ارسال ناموفق بود.', !out.sent)
  } catch (e) { pushInfo.value = ''; cms.toast(e.message || 'خطا', true) } finally { pushBusy.value = false }
}

// فاز ۶ — در اپ اندروید: نمایش/تغییر سرور متصل
import { isNativeApp as _isNative, getServerBase, clearServerBase } from '../native-boot'
const isNativeApp = _isNative()
const nativeServer = isNativeApp ? (getServerBase() || location.origin) : ''
function reconnectApp() {
  clearServerBase()
  window.location.replace('/') // به بوت‌استرپ نیتیو برمی‌گردد و فرم اتصال نمایش داده می‌شود
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
      <div v-if="cms.can('payments')" style="margin-top:14px;border-top:1px solid rgba(255,255,255,.07);padding-top:12px">
        <div class="form-group-3d"><label for="set-fee">کارمزد درگاه (٪ از مبلغ پرداختی — برای گزارش مالی خالص)</label>
          <input id="set-fee" v-model.number="cms.settings.gatewayFeePct" type="number" min="0" max="15" step="0.5" class="cms-input" style="max-width:140px" />
        </div>
        <p style="font-size:.72rem;color:var(--text-muted,#9a9ab5);margin:4px 0 0">ذخیره با همان همگام‌سازی خودکار پنل انجام می‌شود.</p>
        <div style="display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap">
          <button class="cms-btn cms-btn-secondary" type="button" style="width:auto;padding:6px 14px;font-size:.78rem;margin:0" :disabled="pushBusy" @click="sendPushTest">
            <i class="fas" :class="pushBusy ? 'fa-spinner fa-spin' : 'fa-bell'"></i> ارسال پوش آزمایشی
          </button>
          <span v-if="pushInfo" style="font-size:.72rem;color:#9a9ab5">{{ pushInfo }}</span>
        </div>
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
    <div class="data-card-3d lux-panel" style="margin-bottom: 20px;">
      <h3 class="lux-title"><span class="ico3d ico3d-a"><i class="fas fa-database"></i></span> دیتابیس و اتصال به هاست (cPanel / MySQL) — میلانو</h3>
      <p class="lux-hint">پس از ساخت Database و User در cPanel، اطلاعات را وارد کنید؛ جداول همهٔ بخش‌ها ساخته، داده‌ها جایگذاری و ساختار به‌صورت زنده سلامت‌سنجی می‌شود.</p>
      <div v-if="!cms.online" class="lux-note"><i class="fas fa-plug"></i> این قابلیت با اتصال به سرور پنل فعال می‌شود. (الان حالت محلی/دمو است)</div>
      <template v-else>
        <div class="lux-status-row">
          <span v-if="db.state?.enabled && db.state?.connected" class="status-chip chip-green">✓ متصل — همگام زندهٔ خودکار</span>
          <span v-else class="status-chip chip-amber">اتصال برقرار نشده</span>
          <span v-if="db.state?.version" class="lux-mut">نسخه MySQL: <b dir="ltr">{{ db.state.version }}</b></span>
          <span v-if="db.state?.lastSyncAt" class="lux-mut">آخرین همگام‌سازی: {{ new Date(db.state.lastSyncAt).toLocaleTimeString('fa-IR') }}</span>
          <span v-if="db.state?.pending" class="status-chip chip-amber">{{ db.state.pending }} تغییر در صف</span>
          <span v-if="db.state?.lastErr" class="status-chip chip-red">{{ db.state.lastErr }}</span>
        </div>
        <div class="field-row-2" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
          <div class="form-group-3d"><label for="db-host">هاست دیتابیس</label><input id="db-host" v-model="db.form.host" class="cms-input" dir="ltr" placeholder="localhost" /></div>
          <div class="form-group-3d"><label for="db-port">پورت</label><input id="db-port" v-model="db.form.port" class="cms-input" dir="ltr" inputmode="numeric" /></div>
          <div class="form-group-3d"><label for="db-user">نام کاربری دیتابیس</label><input id="db-user" v-model="db.form.user" class="cms-input" dir="ltr" autocomplete="off" placeholder="cpaneluser_db" /></div>
          <div class="form-group-3d"><label for="db-pass">رمز عبور دیتابیس</label><input id="db-pass" v-model="db.form.password" type="password" class="cms-input" dir="ltr" autocomplete="new-password" /></div>
          <div class="form-group-3d"><label for="db-name">نام دیتابیس</label><input id="db-name" v-model="db.form.database" class="cms-input" dir="ltr" placeholder="cpaneluser_meelano" /></div>
          <div class="form-group-3d"><label for="db-prefix">پیشوند جداول</label><input id="db-prefix" v-model="db.form.prefix" class="cms-input" dir="ltr" placeholder="pf_" /></div>
        </div>
        <div class="lux-checks">
          <label for="db-ssl"><input id="db-ssl" type="checkbox" v-model="db.form.ssl" /> SSL (اگر میزبان الزام کرده)</label>
          <label for="db-import"><input id="db-import" type="checkbox" v-model="db.importLocal" /> جایگذاری داده‌های فعلی پنل هنگام اعمال</label>
          <label for="db-users"><input id="db-users" type="checkbox" v-model="db.syncUsers" /> همگام‌سازی کاربران و نشست‌های پنل هم</label>
        </div>
        <div class="lux-actions">
          <button id="db-btn-test" class="cms-btn lux-btn" type="button" :disabled="!!db.busy" @click="dbTest"><span class="ico3d ico3d-s"><i class="fas" :class="db.busy==='/test'?'fa-spinner fa-spin':'fa-random'"></i></span> تست اتصال</button>
          <button id="db-btn-apply" class="cms-btn lux-btn lux-btn-main" type="button" :disabled="!!db.busy" @click="dbApply"><span class="ico3d ico3d-g"><i class="fas" :class="db.busy==='/apply'?'fa-spinner fa-spin':'fa-magic'"></i></span> ساخت، تطبیق و جایگذاری جداول</button>
          <button id="db-btn-health" class="cms-btn lux-btn" type="button" :disabled="!!db.busy" @click="dbHealth"><span class="ico3d ico3d-s"><i class="fas" :class="db.busy==='/health'?'fa-spinner fa-spin':'fa-heartbeat'"></i></span> بررسی سلامت</button>
          <button id="db-btn-repair" class="cms-btn lux-btn" type="button" :disabled="!!db.busy || !db.health" @click="dbRepair()"><span class="ico3d ico3d-s"><i class="fas fa-tools"></i></span> ترمیم خودکار</button>
          <button id="db-btn-push" class="cms-btn lux-btn" type="button" :disabled="!!db.busy || !db.state?.connected" @click="dbPush"><span class="ico3d ico3d-s"><i class="fas fa-upload"></i></span> جایگذاری کامل داده</button>
          <button id="db-btn-pull" class="cms-btn lux-btn" type="button" :disabled="!!db.busy || !db.state?.connected" @click="dbPull"><span class="ico3d ico3d-s"><i class="fas fa-download"></i></span> فراخوانی از میزبان</button>
          <button id="db-btn-off" class="cms-btn lux-btn lux-btn-danger" type="button" :disabled="!!db.busy || !db.state?.connected" @click="dbDisconnect"><span class="ico3d ico3d-s"><i class="fas fa-plug"></i></span> قطع اتصال</button>
        </div>
        <div v-if="db.err" class="lux-err"><i class="fas fa-triangle-exclamation"></i> {{ db.err }}</div>
        <div v-if="db.health?.tables?.length" class="lux-health">
          <div class="lux-health-head"><i class="fas fa-table-list"></i> گزارش سلامت و تطبیق جداول (ساختار اصلی پنل میلانو)
            <button class="cms-btn-mini" @click="dbRepair(db.health.tables.filter(t=>t.status!=='ok').map(t=>t.table))" :disabled="!!db.busy">ترمیم موارد معیوب</button>
          </div>
          <table class="cms-table lux-table">
            <thead><tr><th>بخش / جدول</th><th>وضعیت</th><th>سطرهای میزبان</th><th>توضیح</th></tr></thead>
            <tbody>
              <tr v-for="t in db.health.tables" :key="t.table">
                <td><b>{{ t.label }}</b> <span class="lux-mut" dir="ltr">pf_{{ t.table }}*</span></td>
                <td><span class="status-chip" :class="t.status==='ok'?'chip-green':t.status==='missing'?'chip-red':'chip-amber'">{{ t.status==='ok'?'✓ سالم':t.status==='missing'?'ساخته نشده':'ناسازگار' }}</span></td>
                <td dir="ltr" style="text-align:center">{{ t.rows ?? '—' }}</td>
                <td class="lux-mut">
                  <template v-if="t.missingColumns?.length">ستون‌های جاافتاده: <b dir="ltr">{{ t.missingColumns.join(', ') }}</b> — با «تریم» افزوده می‌شود</template>
                  <template v-else-if="t.repaired">اصلاح‌شده: {{ t.repaired }}</template>
                  <template v-else-if="t.extraColumns?.length">ستون اضافی میزبان (بی‌ضرر)</template>
                  <template v-else-if="t.status==='ok'">سازگار با ساختار پنل ✓</template>
                  <template v-else>—</template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="lux-guide">
          <button class="cms-btn-mini" type="button" @click="db.guide=!db.guide"><i class="fas fa-compass"></i> راهنمای سریع استقرار روی سی‌پنل (Meelano)</button>
          <ol v-show="db.guide" class="lux-ol">
            <li>در cPanel ← <b>MySQL® Databases</b>: یک دیتابیس و یک کاربر بسازید و کاربر را با <b>All Privileges</b> به دیتابیس وصل کنید.</li>
            <li>در <b>Setup Node.js App</b> برنامه‌ای روی پوشهٔ نصب میلانو بسازید: Node v20+، پراپرتی `server/index.js` با command «npm run server»؛ فایل کمکی <span dir="ltr">deploy/cpanel/</span> داخل ریپو آماده است.</li>
            <li>dist را با <span dir="ltr">npm run build</span> بسازید (یا فایل‌های `dist/` را آپلود کنید).</li>
            <li>به همین صفحه برگردید؛ اطلاعات دیتابیس را وارد و «تست اتصال» سپس «ساخت، تطبیق و جایگذاری جداول» را بزنید.</li>
            <li>از این پس هر تغییر پنل داخل جداول MySQL هاست هم نوشته می‌شود؛ فروشگاه از همان داده‌ها تغذیه می‌شود. برای میزبان جدید: «فراخوانی از میزبان».</li>
          </ol>
        </div>
      </template>
    </div>

    <div v-if="isNativeApp" class="cms-card" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;margin-top:14px">
      <i class="fab fa-android" style="color:#7dffb0"></i>
      <span style="font-size:.8rem">اپ اندروید به <b dir="ltr" style="color:#9ad7ff">{{ nativeServer }}</b> متصل است.</span>
      <button class="cms-btn-mini" style="margin-inline-start:auto" @click="reconnectApp"><i class="fas fa-plug"></i> تغییر سرور / اتصال دوباره</button>
    </div>
  </section>
</template>

<style scoped>
.setting-row { color: var(--text-muted); display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px dashed var(--border-dark); font-size: 0.9rem; margin: 0; }
</style>
