<script setup>
// Ctrl/⌘+K — جست‌وجوی سریع بین صفحات، محصولات، پست‌ها و کوپن‌ها
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useCms } from '../stores/cms'
import { normFa, toFa, formatPrice } from '../utils/format'

const cms = useCms()
const router = useRouter()
const open = ref(false)
const q = ref('')
const active = ref(0)
const inputEl = ref(null)

const PAGES = [
  { label: 'داشبورد', page: 'dashboard', icon: 'fa-tachometer-alt' },
  { label: 'محصولات', page: 'products', icon: 'fa-box-open' },
  { label: 'پست‌ها', page: 'posts', icon: 'fa-newspaper' },
  { label: 'قیمت‌گذاری', page: 'pricing', icon: 'fa-tags' },
  { label: 'پیام‌ها', page: 'messages', icon: 'fa-inbox' },
  { label: 'هوش مصنوعی', page: 'ai', icon: 'fa-brain' },
  { label: 'پرداخت‌ها', page: 'payments', icon: 'fa-credit-card' },
  { label: 'سفارش‌های فروشگاه', page: 'orders', icon: 'fa-receipt' },
  { label: 'مشاهده سایت', page: '', icon: 'fa-globe', external: true },
  { label: 'تنظیمات', page: 'settings', icon: 'fa-cog' },
]

const results = computed(() => {
  const needle = normFa(q.value)
  const out = []
  for (const pg of PAGES) {
    if (!needle || normFa(pg.label).includes(needle)) out.push({ type: 'صفحه', label: pg.label, icon: pg.icon, run: () => (pg.external ? router.push('/') : router.push('/' + pg.page)) })
  }
  if (needle) {
    for (const p of cms.products) if (normFa(p.title).includes(needle))
      out.push({ type: 'محصول', label: p.title, sub: formatPrice(p.price) + ' تومان · موجودی ' + toFa(p.stock), icon: 'fa-box-open', run: () => router.push(`/products/${p.id}/edit`) })
    for (const p of cms.posts) if (normFa(p.title).includes(needle))
      out.push({ type: 'پست', label: p.title, sub: p.status === 'scheduled' ? 'زمان‌بندی‌شده' : p.status, icon: 'fa-newspaper', run: () => { router.push('/posts'); cms.openModal('ویرایش پست', 'post', { postId: p.id }) } })
    for (const c of cms.coupons) if (normFa(c.code).includes(needle))
      out.push({ type: 'کوپن', label: c.code, sub: toFa(c.percent) + '٪ تخفیف', icon: 'fa-gift', run: () => router.push('/pricing') })
  }
  return out.slice(0, 12)
})

watch(results, () => { active.value = 0 })

function onKey(ev) {
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
    ev.preventDefault()
    open.value = !open.value
    if (open.value) nextTick(() => inputEl.value?.focus())
    return
  }
  if (!open.value) return
  if (ev.key === 'Escape') { open.value = false; return }
  if (ev.key === 'ArrowDown') { ev.preventDefault(); active.value = Math.min(active.value + 1, results.value.length - 1); return }
  if (ev.key === 'ArrowUp') { ev.preventDefault(); active.value = Math.max(active.value - 1, 0); return }
  if (ev.key === 'Enter') { ev.preventDefault(); choose(results.value[active.value]) }
}
function choose(r) {
  if (!r) return
  open.value = false
  q.value = ''
  r.run()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="k-overlay" @click.self="open = false">
      <div class="k-panel" role="dialog" aria-modal="true" aria-label="جستجوی سریع">
        <input ref="inputEl" v-model="q" class="k-input" type="text" placeholder="برو به… (محصول، پست، صفحه)" aria-label="جستجوی سریع" />
        <ul class="k-list" role="listbox">
          <li v-if="!results.length" class="k-empty">موردی یافت نشد.</li>
          <li v-for="(r, i) in results" :key="r.type + r.label" :class="{ active: i === active }" role="option"
              :aria-selected="i === active" @click="choose(r)" @mousemove="active = i">
            <i class="fas" :class="r.icon"></i>
            <span class="k-label">{{ r.label }}</span>
            <span v-if="r.sub" class="k-sub">{{ r.sub }}</span>
            <span class="k-type">{{ r.type }}</span>
          </li>
        </ul>
        <div class="k-foot"><kbd>↑↓</kbd> انتخاب <kbd>Enter</kbd> اجرا <kbd>Esc</kbd> بستن</div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.k-overlay { position: fixed; inset: 0; background: rgba(3, 8, 12, .72); backdrop-filter: blur(3px); z-index: 1000; display: flex; justify-content: center; padding-top: 12vh; }
.k-panel { width: min(560px, 92vw); background: var(--card-bg, #0c1712); border: 1px solid rgba(0,255,170,.25); border-radius: 14px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,.6); }
.k-input { width: 100%; background: transparent; border: none; border-bottom: 1px solid rgba(255,255,255,.08); color: #eafff6; padding: 14px 16px; font: inherit; outline: none; }
.k-list { list-style: none; margin: 0; padding: 6px; max-height: 46vh; overflow: auto; }
.k-list li { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 9px; cursor: pointer; font-size: .88rem; }
.k-list li.active { background: rgba(0,255,170,.08); }
.k-list li i { color: var(--primary); width: 18px; text-align: center; }
.k-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.k-sub { color: var(--text-muted); font-size: .74rem; }
.k-type { font-size: .66rem; color: var(--primary); border: 1px solid rgba(0,255,170,.3); padding: 1px 8px; border-radius: 99px; }
.k-empty { color: var(--text-muted); justify-content: center; cursor: default; }
.k-foot { border-top: 1px solid rgba(255,255,255,.06); padding: 8px 14px; font-size: .7rem; color: var(--text-muted); display: flex; gap: 14px; }
.k-foot kbd { background: rgba(255,255,255,.08); border-radius: 4px; padding: 1px 6px; font-size: .68rem; }
</style>
