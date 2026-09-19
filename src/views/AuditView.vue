<script setup>
import { ref, onMounted, computed } from 'vue'
import { useCms } from '../stores/cms'
import { apiFetch } from '../utils/api'
import { normFa, toFa } from '../utils/format'

const cms = useCms()
const tab = ref('audit')
const items = ref([])
const total = ref(0)
const offset = ref(0)
const LIMIT = 50
const q = ref('')
const busy = ref(false)
const logins = ref([])
const error = ref('')

const ACTION_LABELS = {
  'login': 'ورود موفق', 'login.fail': 'ورود ناموفق', 'logout': 'خروج',
  'state.push': 'همگام‌سازی وضعیت', 'state.reset': 'بازگشت به نمونه',
  'backup.import': 'بازیابی بکاپ', 'media.upload': 'آپلود تصویر',
  'payment.create': 'ایجاد پرداخت', 'payment.verify': 'تأیید پرداخت',
  'ai.caption': 'تولید AI', 'post.publish': 'انتشار خودکار پست', 'post.publish.fail': 'خطای انتشار پست',
  'user.create': 'ساخت کاربر', 'user.delete': 'حذف کاربر', 'user.role': 'تغییر نقش', 'user.password': 'بازنشانی رمز',
  'password.change': 'تغییر رمز', 'request.create': 'درخواست سایت',
}
const ACTION_COLORS = {
  'login': '#6ee7b7', 'login.fail': '#fbbf24', 'state.reset': '#f87171', 'backup.import': '#f87171',
  'post.publish': '#7cc4ff', 'post.publish.fail': '#f87171', 'user.delete': '#f87171', 'payment.verify': '#6ee7b7',
}

const filtered = computed(() => {
  const needle = normFa(q.value)
  if (!needle) return items.value
  return items.value.filter((a) => (normFa(`${a.username} ${a.action} ${a.entity} ${a.detail}`)).includes(needle))
})

async function load(reset = false) {
  if (!cms.online) { error.value = 'این بخش به اتصال سرور نیاز دارد.'; return }
  busy.value = true
  error.value = ''
  try {
    if (reset) offset.value = 0
    const r = await apiFetch(`/audit?limit=${LIMIT}&offset=${offset.value}`)
    items.value = reset ? r.items : [...items.value, ...r.items]
    total.value = r.total
    if (tab.value === 'logins' && !logins.value.length) {
      logins.value = (await apiFetch('/audit/logins')).items
    }
  } catch (e) { error.value = e.message } finally { busy.value = false }
}
function more() { offset.value += LIMIT; load(false) }
function switchTab(t) { tab.value = t; if (t === 'logins' && cms.online) load(false) }
onMounted(() => load(true))
</script>

<template>
  <section>
    <h2 class="section-title"><i class="fas fa-user-shield"></i> گزارش ممیزی و دسترسی‌ها</h2>
    <div v-if="!cms.online" class="offline-note"><i class="fas fa-plug"></i> برای دیدن تاریخچه‌ی واقعی (سمت سرور) باید متصل باشید؛ در حالت محلی لاگ نگه‌داشته نمی‌شود.</div>
    <template v-else>
      <div class="audit-toolbar">
        <div class="tabs-mini" role="tablist">
          <button role="tab" :class="{ active: tab === 'audit' }" :aria-selected="tab === 'audit'" @click="switchTab('audit')">رویدادها ({{ toFa(total) }})</button>
          <button role="tab" :class="{ active: tab === 'logins' }" :aria-selected="tab === 'logins'" @click="switchTab('logins')">تلاش‌های ورود</button>
        </div>
        <div v-if="tab === 'audit'" class="search-bar-3d" style="width: 260px; margin-top: 0;">
          <i class="fas fa-search" style="color:#555;font-size:.9rem;"></i>
          <input v-model="q" class="cms-input" placeholder="جستجوی کاربر/رویداد…" aria-label="جستجو در ممیزی" />
        </div>
        <button class="cms-btn" style="width:auto;padding:7px 14px;margin:0;background:#333;color:#fff;box-shadow:none;" :disabled="busy" @click="load(true)">
          <i class="fas" :class="busy ? 'fa-spinner fa-spin' : 'fa-sync-alt'"></i> تازه‌سازی
        </button>
      </div>
      <p v-if="error" class="field-error" role="alert">{{ error }}</p>

      <div v-if="tab === 'audit'" class="data-card-3d">
        <p v-if="!filtered.length && !busy" style="color:var(--text-muted);font-size:.85rem;">رویدادی ثبت نشده است.</p>
        <table v-else class="data-table-3d" style="font-size:.78rem;">
          <thead><tr><th>زمان</th><th>کاربر</th><th>رویداد</th><th>هدف</th><th>جزئیات</th></tr></thead>
          <tbody>
            <tr v-for="a in filtered" :key="a.id">
              <td style="white-space:nowrap;">{{ new Date(a.at).toLocaleString('fa-IR') }}</td>
              <td>{{ a.username }}</td>
              <td>
                <span :style="{ color: ACTION_COLORS[a.action] || 'var(--text-muted)' }">
                  <i class="fas fa-circle" style="font-size:.4rem;vertical-align:middle;margin-inline-end:5px;"></i>
                  {{ ACTION_LABELS[a.action] || a.action }}
                </span>
              </td>
              <td style="direction:ltr;text-align:left;">{{ a.entity || '—' }}</td>
              <td style="color:var(--text-muted);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" :title="a.detail">{{ a.detail || '—' }}</td>
            </tr>
          </tbody>
        </table>
        <button v-if="items.length < total" class="cms-btn" style="width:auto;padding:7px 14px;margin-top:10px;background:#333;color:#fff;box-shadow:none;" @click="more">
          مورد بیشتر ({{ toFa(items.length) }} از {{ toFa(total) }})
        </button>
      </div>

      <div v-else class="data-card-3d">
        <p v-if="!logins.length" style="color:var(--text-muted);font-size:.85rem;">سابقه‌ی ورودی ثبت نشده.</p>
        <table v-else class="data-table-3d" style="font-size:.78rem;">
          <thead><tr><th>زمان</th><th>نام کاربری</th><th>نتیجه</th><th>IP</th></tr></thead>
          <tbody>
            <tr v-for="l in logins" :key="l.id">
              <td>{{ new Date(l.at).toLocaleString('fa-IR') }}</td>
              <td>{{ l.username }}</td>
              <td>
                <span v-if="l.ok" class="status-chip chip-green">موفق</span>
                <span v-else class="status-chip" style="background:rgba(248,113,113,.12);color:#f87171;">ناموفق</span>
              </td>
              <td style="direction:ltr;text-align:left;color:var(--text-muted);">{{ l.ip || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

<style scoped>
.audit-toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
.tabs-mini { display: flex; gap: 6px; }
.tabs-mini button { background: none; border: 1px solid rgba(255,255,255,.15); color: var(--text-muted); border-radius: 8px; padding: 6px 14px; cursor: pointer; font: inherit; }
.tabs-mini button.active { border-color: var(--primary); color: var(--primary); }
</style>
