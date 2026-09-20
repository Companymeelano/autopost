<script setup>
import { ref, computed, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useCms } from '../stores/cms'
import { filterRows, sortRows, paginate } from '../utils/tablekit'
import { normFa, formatPrice, toFa, CATEGORY_LABELS } from '../utils/format'

const cms = useCms()
const router = useRouter()

const query = ref('')
const sortKey = ref('id')
const sortDir = ref('asc')
const page = ref(1)
const PAGE_SIZE = 8
const selected = reactive(new Set())

const filtered = computed(() => {
  const rows = filterRows(cms.products, query.value, ['title'], [
    (row, q) => normFa(CATEGORY_LABELS[row.cat] || '').includes(q),
    (row, q) => normFa(String(row.price)).includes(q) || normFa(String(row.stock)).includes(q),
  ])
  return sortRows(rows, sortKey.value, sortDir.value)
})

const pager = computed(() => {
  const p = paginate(filtered.value, page.value, PAGE_SIZE)
  if (p.outOfRange) page.value = p.page
  return p
})

watch(query, () => { page.value = 1 })

const COLUMNS = [
  { key: null, label: '', sortable: false, width: '36px' },
  { key: 'id', label: '#', sortable: true, width: '46px' },
  { key: 'title', label: 'نام محصول', sortable: true },
  { key: 'cat', label: 'دسته‌بندی', sortable: true },
  { key: 'price', label: 'قیمت (تومان)', sortable: true },
  { key: 'stock', label: 'موجودی', sortable: true },
  { key: null, label: 'عملیات', sortable: false },
]

function setSort(key) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else { sortKey.value = key; sortDir.value = 'asc' }
  page.value = 1
}

const allOnPageSelected = computed(() =>
  pager.value.pageRows.length > 0 && pager.value.pageRows.every((p) => selected.has(p.id)))
function toggleAllOnPage() {
  const ids = pager.value.pageRows.map((p) => p.id)
  if (allOnPageSelected.value) ids.forEach((i) => selected.delete(i))
  else ids.forEach((i) => selected.add(i))
}
function toggleRow(id) {
  if (selected.has(id)) selected.delete(id)
  else selected.add(id)
}

function removeWithUndo(id) {
  const p = cms.products.find((x) => x.id === id)
  if (!p) return
  if (!window.confirm(`آیا از حذف «${p.title}» مطمئن هستید؟`)) return
  const res = cms.removeProduct(id)
  selected.delete(id)
  cms.toast(`محصول «${p.title}» حذف شد`, false, { label: '↩ بازگردانی', onAction: () => { cms.restoreProduct(res.removed, res.idx); cms.toast('بازگردانی شد.') } })
}
function bulkDelete() {
  const ids = [...selected]
  if (!ids.length) return
  if (!window.confirm(`${toFa(ids.length)} محصول انتخابی حذف شود؟`)) return
  const removed = []
  for (const id of ids) { const r = cms.removeProduct(id); if (r) removed.push(r) }
  selected.clear()
  cms.toast(`${toFa(removed.length)} محصول حذف شد`, false, { label: '↩ بازگردانی', onAction: () => { for (const r of removed) cms.restoreProduct(r.removed, r.idx); cms.toast('بازگردانی شد.') } })
}
function duplicate(id) {
  const clone = cms.copyProduct(id)
  if (clone) cms.toast('کپی ساخته شد.')
}
</script>

<template>
  <section>
    <h2 class="section-title"><i class="fas fa-box-open"></i> مدیریت محصولات</h2>

    <div class="action-bar">
      <button v-if="cms.canEdit('products')" class="cms-btn" style="width: auto;" @click="router.push('/products/new')">
        <i class="fas fa-plus"></i> افزودن محصول جدید
      </button>
      <button v-if="cms.canEdit('products')" id="csv-import" class="cms-btn" style="width:auto;padding:9px 14px;background:#333;color:#fff;box-shadow:none;margin-top:0;" @click="cms.openModal('ورود / خروجی CSV محصولات', 'csv')">
        <i class="fas fa-file-csv"></i> CSV
      </button>
      <span v-else class="role-note" title="نقش شما اجازه ویرایش محصولات را ندارد"><i class="fas fa-eye"></i> فقط‌خواندنی</span>
      <div class="search-bar-3d" style="width: 250px; margin-top: 0;">
        <i class="fas fa-search" style="color: #555; font-size: 0.9rem;"></i>
        <input v-model="query" type="text" class="cms-input" placeholder="جستجوی محصول..." aria-label="جستجوی محصول" />
      </div>
    </div>

    <div v-if="selected.size" class="bulk-bar">
      <strong>{{ toFa(selected.size) }} محصول انتخاب شده</strong>
      <button class="cms-btn" style="width:auto;padding:6px 14px;margin:0;background:var(--accent-hot-red);" @click="bulkDelete">
        <i class="fas fa-trash"></i> حذف انتخاب‌شده‌ها
      </button>
      <button class="cms-btn" style="width:auto;padding:6px 14px;margin:0;background:#333;color:#fff;box-shadow:none;" @click="selected.clear()">لغو انتخاب</button>
    </div>

    <div class="table-scroll-wrap">
      <table class="data-table-3d">
        <thead>
          <tr>
            <th scope="col" style="width: 36px;">
              <input type="checkbox" :checked="allOnPageSelected" aria-label="انتخاب همه" @change="toggleAllOnPage()" />
            </th>
            <th v-for="c in COLUMNS.slice(1)" :key="c.label" scope="col"
                :class="{ sortable: c.sortable }" :style="c.width ? `width:${c.width}` : ''"
                :aria-sort="c.sortable && sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined"
                @click="c.sortable && setSort(c.key)">
              {{ c.label }}
              <span v-if="c.sortable && sortKey === c.key" class="sort-ind">
                <i class="fas" :class="sortDir === 'asc' ? 'fa-caret-up' : 'fa-caret-down'"></i>
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in pager.pageRows" :key="p.id">
            <td><input type="checkbox" :checked="selected.has(p.id)" :aria-label="'انتخاب ' + p.title" @change="toggleRow(p.id)" /></td>
            <td>{{ toFa(p.id) }}</td>
            <td>
              <img v-if="p.image" :src="p.image" alt="" style="width:30px;height:30px;object-fit:cover;border-radius:6px;vertical-align:middle;margin-left:8px;" />
              {{ p.title }}
            </td>
            <td>{{ CATEGORY_LABELS[p.cat] || '—' }}</td>
            <td>{{ formatPrice(p.price) }}</td>
            <td>{{ toFa(p.stock) }}</td>
            <td style="white-space: nowrap;">
              <template v-if="cms.canEdit('products')">
                <button class="cms-btn" style="padding:5px 8px;margin:0;width:auto;background:var(--accent-new);" @click="router.push(`/products/${p.id}/edit`)">ویرایش</button>
                <button class="cms-btn" style="padding:5px 8px;margin:0;width:auto;background:#333;color:#fff;margin-right:5px;" @click="duplicate(p.id)">کپی</button>
              </template>
              <button class="cms-btn" style="padding:5px 8px;margin:0;width:auto;background:var(--accent-hot-red);margin-right:5px;" @click="removeWithUndo(p.id)">حذف</button>
            </td>
          </tr>
          <tr v-if="!pager.pageRows.length"><td colspan="7" style="text-align:center;color:var(--text-muted);">محصولی یافت نشد.</td></tr>
        </tbody>
      </table>
    </div>

    <div class="pager" v-if="pager.total > PAGE_SIZE || pager.pageCount > 1">
      <button type="button" :disabled="pager.page <= 1" @click="page = pager.page - 1"><i class="fas fa-chevron-right"></i> قبلی</button>
      <span>صفحه {{ toFa(pager.page) }} از {{ toFa(pager.pageCount) }} — نمایش {{ toFa(pager.from) }} تا {{ toFa(pager.to) }} از {{ toFa(pager.total) }} محصول</span>
      <button type="button" :disabled="pager.page >= pager.pageCount" @click="page = pager.page + 1">بعدی <i class="fas fa-chevron-left"></i></button>
    </div>
  </section>
</template>

<style scoped>
th.sortable { color: var(--primary); }
td input[type='checkbox'], th input[type='checkbox'] { accent-color: var(--primary); width: 15px; height: 15px; cursor: pointer; }
</style>
