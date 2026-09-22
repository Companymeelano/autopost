<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useCms } from '../stores/cms'
import { apiFetch } from '../utils/api'
import { filterRows, paginate } from '../utils/tablekit'
import { toFa } from '../utils/format'

const cms = useCms()
const query = ref('')
// ——— صف انتشار خودکار (Autopost) ———
const queue = ref([])
const queueBusy = ref(false)
const queueOpen = ref(false)
async function loadQueue() {
  if (!cms.online) return
  try { queue.value = (await apiFetch('/queue')).items || [] } catch { queue.value = [] }
}
async function runQueueNow() {
  queueBusy.value = true
  try {
    const r = await apiFetch('/queue/run', { method: 'POST', body: {} })
    cms.toast(r.processed ? `${toFa(r.processed)} پست در صف پردازش شد.` : 'چیزی برای انتشار نبود.')
    await cms.pullState()
    await loadQueue()
  } catch (e) { cms.toast(e.message, true) } finally { queueBusy.value = false }
}
const page = ref(1)
const PAGE_SIZE = 8

const filtered = computed(() =>
  filterRows(cms.posts, query.value, ['title', 'author', 'body']))
watch([query, () => cms.posts.length], () => { page.value = 1 })
const pager = computed(() => paginate(filtered.value, page.value, PAGE_SIZE))

onMounted(loadQueue)
function editPost(id) { cms.openModal('ویرایش پست', 'post', { postId: id }) }
function newPost() { cms.openModal('افزودن پست جدید', 'post', { postId: null }) }

function copy(id) {
  if (cms.copyPost(id)) cms.toast('کپی پست ساخته شد.')
}
function removePost(id) {
  const p = cms.posts.find((x) => x.id === id)
  if (!p) return
  if (!window.confirm(`آیا از حذف «${p.title}» مطمئن هستید؟`)) return
  const res = cms.removePost(id)
  cms.toast(`پست «${p.title}» حذف شد`, false, { label: '↩ بازگردانی', onAction: () => { cms.restorePost(res.removed, res.idx); cms.toast('بازگردانی شد.') } })
}
</script>

<template>
  <section>
    <h2 class="section-title"><i class="fas fa-newspaper"></i> مدیریت محتوا و پست‌ها</h2>
    <div class="data-card-3d">
      <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 15px;">پست‌های بلاگ، اخبار و مقالات سایت اصلی را اینجا مدیریت کنید.</p>
      <div class="action-bar">
        <button class="cms-btn" style="width: auto;" @click="newPost">
          <i class="fas fa-plus"></i> افزودن پست جدید
        </button>
        <div class="search-bar-3d" style="width: 250px; margin-top: 0;">
          <i class="fas fa-search" style="color: #555; font-size: 0.9rem;"></i>
          <input v-model="query" type="text" class="cms-input" placeholder="جستجوی پست..." aria-label="جستجوی پست" />
        </div>
      </div>
      <div v-if="cms.online" class="queue-bar">
        <button class="linkish" @click="queueOpen = !queueOpen" :aria-expanded="String(queueOpen)">
          <i class="fas fa-satellite-dish"></i> صف انتشار خودکار ({{ toFa(queue.length) }} مورد)
        </button>
        <button class="cms-btn" style="width:auto;padding:5px 12px;margin:0;font-size:.75rem;background:#333;color:#fff;box-shadow:none;" :disabled="queueBusy" @click="runQueueNow">
          <i class="fas" :class="queueBusy ? 'fa-spinner fa-spin' : 'fa-play'"></i> اجرای صف
        </button>
        <ul v-if="queueOpen" class="queue-list">
          <li v-for="q in queue" :key="q.id">
            <strong>{{ q.title }}</strong> —
            <template v-if="q.status === 'failed'"><span style="color:#f87171;">ناموفق ({{ toFa(q.attempts) }} تلاش): {{ q.lastError }}</span></template>
            <template v-else>{{ q.dueNow ? 'آماده‌ی انتشار الان' : 'انتظار تا ' + new Date(q.publishAt).toLocaleString('fa-IR') }}</template>
          </li>
          <li v-if="!queue.length" style="color:var(--text-muted);">صف خالی است.</li>
        </ul>
      </div>
      <div class="table-scroll-wrap">
        <table class="data-table-3d">
          <thead>
            <tr><th scope="col">#</th><th scope="col">عنوان پست</th><th scope="col">نویسنده</th><th scope="col">تاریخ انتشار</th><th scope="col">عملیات</th></tr>
          </thead>
          <tbody>
            <tr v-for="p in pager.pageRows" :key="p.id">
              <td>{{ toFa(p.id) }}</td>
              <td>
                {{ p.title }}
                <span v-if="p.status === 'draft'" class="status-chip chip-orange">پیش‌نویس</span>
                <span v-else-if="p.status === 'scheduled'" class="status-chip chip-blue" :title="p.publishAt ? new Date(p.publishAt).toLocaleString('fa-IR') : ''">
                  <i class="fas fa-clock"></i> زمان‌بندی {{ p.publishAt ? new Date(p.publishAt).toLocaleString('fa-IR') : '—' }}
                </span>
                <span v-else-if="p.status === 'failed'" class="status-chip chip-red" :title="p.publishError || ''">
                  <i class="fas fa-exclamation-circle"></i> انتشار ناموفق ({{ toFa(p.attempts || 0) }} تلاش)
                </span>
                <span v-else class="status-chip chip-green">
                  منتشر شده<i v-if="p.publishedAt" class="fas fa-bolt" :title="'انتشار خودکار' + (p.publishChannel ? ' (' + p.publishChannel + ')' : '')"></i>
                </span>
              </td>
              <td>{{ p.author || 'مدیر' }}</td>
              <td>{{ p.date }}</td>
              <td style="white-space: nowrap;">
                <button class="cms-btn" style="padding:5px 8px;margin:0;width:auto;background:var(--accent-new);" @click="editPost(p.id)">ویرایش</button>
                <button class="cms-btn" style="padding:5px 8px;margin:0;width:auto;background:#333;color:#fff;margin-right:5px;" @click="copy(p.id)">کپی</button>
                <button class="cms-btn" style="padding:5px 8px;margin:0;width:auto;background:var(--accent-hot-red);margin-right:5px;" @click="removePost(p.id)">حذف</button>
              </td>
            </tr>
            <tr v-if="!pager.pageRows.length"><td colspan="5" style="text-align:center;color:var(--text-muted);">پستی یافت نشد.</td></tr>
          </tbody>
        </table>
      </div>
      <div class="pager" v-if="pager.pageCount > 1">
        <button type="button" :disabled="pager.page <= 1" @click="page = pager.page - 1"><i class="fas fa-chevron-right"></i> قبلی</button>
        <span>صفحه {{ toFa(pager.page) }} از {{ toFa(pager.pageCount) }}</span>
        <button type="button" :disabled="pager.page >= pager.pageCount" @click="page = pager.page + 1">بعدی <i class="fas fa-chevron-left"></i></button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.queue-bar { display: flex; gap: 12px; align-items: center; margin-bottom: 10px; }
.linkish { background: none; border: none; color: var(--primary); cursor: pointer; font: inherit; font-size: .8rem; padding: 0; }
.queue-list { list-style: none; margin: 0; padding: 0; flex: 1; font-size: .75rem; color: var(--text-muted); }
.queue-list li { padding: 3px 0; border-bottom: 1px dashed rgba(255,255,255,.06); }
</style>
<style scoped>
.chip-green { color: var(--success); background: rgba(0, 255, 200, 0.12); border: 1px solid var(--success); }
.chip-orange { color: var(--accent-new); background: rgba(255, 153, 0, 0.14); border: 1px solid var(--accent-new); }
.chip-blue { color: #7cc4ff; background: rgba(80, 160, 255, 0.12); border: 1px solid rgba(80, 160, 255, 0.55); }
.chip-red { color: #ff8a8a; background: rgba(255, 90, 90, 0.12); border: 1px solid rgba(255, 90, 90, 0.55); }
</style>
