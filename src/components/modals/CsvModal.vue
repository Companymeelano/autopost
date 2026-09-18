<script setup>
// ورود/خروجی CSV محصولات — dry-run preview با همان اعتبارسنجی فارسی فرم‌ها
import { ref, computed } from 'vue'
import { useCms } from '../../stores/cms'
import { productsToCsv, parseCsv, mapCsvRows, applyCsvItems } from '../../utils/csv'
import { toFa } from '../../utils/format'

const cms = useCms()
const emit = defineEmits(['done'])

const tab = ref('import')
const items = ref(null)
const fileError = ref('')
const applying = ref(false)
const textarea = ref('')

const validItems = computed(() => (items.value || []).filter((x) => !Object.keys(x.errors).length))
const invalidCount = computed(() => (items.value || []).length - validItems.value.length)

const SAMPLE = 'عنوان,دسته,قیمت,موجودی\nلگ یوگا بنفش,لگینگ,390000,25'

async function onFile(ev) {
  const file = ev.target.files?.[0]
  ev.target.value = ''
  fileError.value = ''
  if (!file) return
  if (file.size > 4 * 1024 * 1024) { fileError.value = 'حجم فایل CSV نباید بیشتر از ۴ مگابایت باشد.'; return }
  const text = await file.text()
  textarea.value = text
  parseText(text)
}
function parseText(text) {
  fileError.value = ''
  const r = mapCsvRows(parseCsv(text || ''), cms.products.map((p) => p.id))
  if (r.error) { fileError.value = r.error; items.value = null; return }
  items.value = r.items
}

function doExport() {
  try {
    const blob = new Blob([productsToCsv(cms.products)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `panahfit-products-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    cms.toast('فایل CSV ساخته شد.')
  } catch {
    cms.toast('ساخت CSV ناموفق بود.', true)
  }
}

function apply() {
  if (!validItems.value.length || applying.value) return
  applying.value = true
  const summary = applyCsvItems(cms, validItems.value)
  applying.value = false
  emit('done')
  cms.toast(`CSV اعمال شد: ${toFa(summary.created)} افزودن، ${toFa(summary.updated)} به‌روزرسانی${invalidCount.value ? ` — ${toFa(invalidCount.value)} ردیف نامعتبر رد شد` : ''}.`)
}
</script>

<template>
  <div>
    <div class="tabs-mini" role="tablist" aria-label="حالت CSV">
      <button role="tab" :aria-selected="tab === 'import'" :class="{ active: tab === 'import' }" @click="tab = 'import'">ورود از CSV</button>
      <button role="tab" :aria-selected="tab === 'export'" :class="{ active: tab === 'export' }" @click="tab = 'export'">خروجی CSV</button>
    </div>

    <template v-if="tab === 'export'">
      <p class="csv-hint">
        خروجی شامل {{ toFa(cms.products.length) }} محصول با ستون‌های شناسه، عنوان، دسته، قیمت، موجودی، فروش و توضیحات است
        (BOM برای باز شدن صحیح فارسی در Excel).
      </p>
      <button class="cms-btn" @click="doExport"><i class="fas fa-file-csv"></i> دانلود فایل CSV</button>
    </template>

    <template v-else>
      <p class="csv-hint">
        فایل CSV با هدرِ ستون‌های فارسی یا انگلیسی انتخاب کنید — یا متن را مستقیم بچسبانید.
        هیچ داده‌ای تا تأیید پیش‌نمایش اعمال نمی‌شود. نمونه هدر:
        <code dir="ltr" class="csv-sample">{{ SAMPLE.split('\n')[0] }}</code>
      </p>
      <label class="cms-btn" style="width:auto;display:inline-block;cursor:pointer;">
        <i class="fas fa-upload"></i> انتخاب فایل CSV
        <input type="file" accept=".csv,text/csv" style="display:none;" @change="onFile" />
      </label>
      <textarea v-model="textarea" class="cms-input csv-ta" dir="ltr" rows="5"
                placeholder="عنوان,دسته,قیمت,موجودی&#10;..." @change="parseText(textarea)" @input="items = null"></textarea>
      <button v-if="textarea" class="cms-btn" style="width:auto;padding:7px 12px;margin-top:6px;" @click="parseText(textarea)">
        <i class="fas fa-magic"></i> پیش‌نمایش
      </button>
      <p v-if="fileError" class="field-error" role="alert">{{ fileError }}</p>

      <div v-if="items" class="csv-preview">
        <p style="font-size:.85rem;margin:0;">
          <span class="status-chip chip-green">{{ toFa(validItems.length) }} ردیف معتبر</span>
          <span v-if="invalidCount" class="status-chip" style="background:rgba(248,113,113,.15);color:#f87171;">{{ toFa(invalidCount) }} نامعتبر</span>
        </p>
        <div class="table-scroll-wrap" style="max-height:260px;overflow:auto;">
          <table class="cms-table">
            <thead><tr><th>خط</th><th>عنوان</th><th>دسته</th><th>قیمت</th><th>وضعیت</th></tr></thead>
            <tbody>
              <tr v-for="it in items" :key="it.line" :style="Object.keys(it.errors).length ? 'color:#f87171;' : ''">
                <td>{{ toFa(it.line) }}</td>
                <td>{{ it.product.title }}</td>
                <td>{{ it.product.cat || '—' }}</td>
                <td>{{ it.product.price != null && it.product.price !== '' ? toFa(it.product.price) : '—' }}</td>
                <td>
                  <span v-if="!Object.keys(it.errors).length" style="color:#6ee7b7;"><i class="fas fa-check"></i> آماده</span>
                  <span v-else>{{ Object.values(it.errors).join(' ') }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <button class="cms-btn" style="width:auto;margin-top:10px;" :disabled="!validItems.length || applying" @click="apply">
          <i class="fas" :class="applying ? 'fa-spinner fa-spin' : 'fa-plus-circle'"></i>
          افزودن/به‌روزرسانی {{ toFa(validItems.length) }} ردیف
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.csv-hint { color: var(--text-muted); font-size: .82rem; margin: 10px 0; }
.csv-sample { background: rgba(0,0,0,.3); padding: 2px 8px; border-radius: 6px; font-size: .75rem; display: inline-block; }
.csv-ta { font-family: monospace; font-size: .8rem; margin-top: 8px; }
.csv-preview { margin-top: 12px; border-top: 1px solid rgba(255,255,255,.08); padding-top: 10px; }
.tabs-mini { display: flex; gap: 6px; }
.tabs-mini button { background: none; border: 1px solid rgba(255,255,255,.15); color: var(--text-muted); border-radius: 8px; padding: 6px 14px; cursor: pointer; font: inherit; }
.tabs-mini button.active { border-color: var(--primary); color: var(--primary); }
</style>
