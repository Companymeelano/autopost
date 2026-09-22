<script setup>
// فروشگاه عمومی — فیلتر دسته، جست‌وجو، مرتب‌سازی؛ کلیک → صفحه محصول
// فاز ۶.۵ — گرید هم‌ارتفاع با اسکلتون بارگذاری و نشان‌های فروش/موجودی (بدون جابه‌جایی چیدمان)
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSite } from '../../stores/site'
import { useCart } from '../../stores/cart'
import { useCms } from '../../stores/cms'
import { formatPrice, toFa, CATEGORY_LABELS } from '../../utils/format'
import { useI18n } from '../../i18n'
import { isDemoMode, setDemoMode } from '../../app-mode'
if (isDemoMode()) setDemoMode(true) // باز کردن /?demo=1 روی فروشگاه = فعال‌سازی حالت دمو

const site = useSite()
const cart = useCart()
const cms = useCms()
const router = useRouter()
const q = ref('')
const cat = ref('')
const sort = ref('popular')
const { t } = useI18n()

onMounted(() => site.load())

const list = computed(() => {
  let l = [...site.products]
  if (cat.value) l = l.filter((p) => p.cat === cat.value)
  const s = String(q.value).trim().toLowerCase()
  if (s) l = l.filter((p) => (p.title + ' ' + (p.desc || '')).toLowerCase().includes(s))
  const by = { cheap: (a, b) => a.price - b.price, expensive: (a, b) => b.price - a.price, fresh: (a, b) => b.id - a.id, popular: (a, b) => (b.sold || 0) - (a.sold || 0) }
  return l.sort(by[sort.value] || by.popular)
})
const cats = computed(() => site.cats.map((c) => ({ key: c, label: CATEGORY_LABELS[c] || c })))
const filtered = computed(() => !!(cat.value || String(q.value).trim()))
function clearFilters() { q.value = ''; cat.value = '' }
function open(p) { router.push('/product/' + p.id) }
function quickAdd(p, ev) {
  ev.stopPropagation()
  if ((p.stock ?? 0) <= 0) return
  const r = cart.add(p, 1)
  cms.toast(r.ok ? `«${p.title}» ` + t('toast.added') : t('toast.oos'), !r.ok)
}
const lowTxt = (n) => String(t('shop.low')).replace('{n}', toFa(n))
</script>

<template>
  <section class="shop">
    <div v-if="site.settings.newDiscount" class="shop-hero">
      <div>
        <h1>{{ t('hero.title1') }} <span class="glow">{{ t('hero.title2') }}</span></h1>
        <p>{{ t('hero.sub') }} <b>{{ t('hero.sub2') }}</b> {{ t('hero.sub3') }}</p>
        <div class="hero-tags">
          <span><i class="fas fa-bolt"></i> {{ t('shop.fast') }}</span>
          <span><i class="fas fa-shield-heart"></i> {{ t('shop.guarantee') }}</span>
          <span><i class="fas fa-lock"></i> {{ t('shop.secure') }}</span>
        </div>
      </div>
      <RouterLink class="hero-btn" to="/blog">{{ t('hero.blog') }} <i class="fas fa-arrow-left"></i></RouterLink>
    </div>

    <div class="shop-bar">
      <input v-model="q" class="shop-q" type="search" :placeholder="t('search')" :aria-label="t('search')" />
      <div class="chip-row" role="group" aria-label="دسته‌بندی">
        <button class="chip" :class="{ on: cat === '' }" @click="cat = ''">{{ t('all') }}</button>
        <button v-for="c in cats" :key="c.key" class="chip" :class="{ on: cat === c.key }" @click="cat = c.key">{{ c.label }}</button>
      </div>
      <select v-model="sort" class="shop-sort" aria-label="مرتب‌سازی">
        <option value="popular">{{ t('sort.popular') }}</option>
        <option value="fresh">{{ t('sort.fresh') }}</option>
        <option value="cheap">{{ t('sort.cheap') }}</option>
        <option value="expensive">{{ t('sort.expensive') }}</option>
      </select>
    </div>

    <!-- فاز ۶.۵ — اسکلتون بارگذاری: همان ابعاد کارت واقعی، بدون پرش چیدمان -->
    <div v-if="site.loading" class="prod-grid" aria-hidden="true">
      <div v-for="n in 8" :key="'sk' + n" class="prod-card sk-card">
        <div class="prod-img sk-img"></div>
        <div class="prod-body"><div class="sk-line w80"></div><div class="sk-line w40"></div><div class="sk-line w60 foot"></div></div>
      </div>
    </div>
    <template v-else-if="!list.length">
      <p class="shop-note">{{ t('nofound') }}</p>
      <button v-if="filtered" class="chip reset-chip" @click="clearFilters"><i class="fas fa-filter-circle-xmark"></i> {{ t('shop.reset') }}</button>
    </template>
    <template v-else>
      <p class="shop-count" aria-live="polite">{{ toFa(list.length) }} {{ t('shop.count') }}</p>
      <div class="prod-grid">
        <article v-for="p in list" :key="p.id" class="prod-card" :class="{ oos: (p.stock ?? 0) <= 0 }" tabindex="0" role="link" :aria-label="'مشاهده ' + p.title" @click="open(p)" @keydown.enter="open(p)">
          <div class="prod-img">
            <img v-if="p.image" :src="p.image" :alt="p.title" loading="lazy" />
            <i v-else class="fas fa-shirt"></i>
            <span v-if="(p.stock ?? 0) <= 0" class="oos-chip">{{ t('oos') }}</span>
            <span v-else-if="p.oldPrice > p.price" class="off-chip">−{{ toFa(Math.round((1 - p.price / p.oldPrice) * 100)) }}٪</span>
            <span v-if="(p.sold || 0) > 50 && (p.stock ?? 0) > 0" class="sold-chip"><i class="fas fa-fire"></i> {{ toFa(p.sold) }} {{ t('shop.sold') }}</span>
          </div>
          <div class="prod-body">
            <h3>{{ p.title }}</h3>
            <p class="prod-cat">
              <span>{{ CATEGORY_LABELS[p.cat] || p.cat }}</span>
              <span v-if="p.stock > 0 && p.stock <= 5" class="low-note">{{ lowTxt(p.stock) }}</span>
            </p>
            <div class="prod-foot">
              <div class="prod-price">
                <b>{{ formatPrice(p.price) }}</b>
                <s v-if="p.oldPrice > p.price">{{ formatPrice(p.oldPrice) }}</s>
                <small>تومان</small>
              </div>
              <button class="add-btn" :disabled="(p.stock ?? 0) <= 0" title="افزودن سریع به سبد" @click="quickAdd(p, $event)" aria-label="افزودن به سبد"><i class="fas fa-cart-plus"></i></button>
            </div>
          </div>
        </article>
      </div>
    </template>
    <p v-if="site.source === 'local' && !site.loading" class="shop-note" style="margin-top:18px">{{ t('offline') }}</p>
  </section>
</template>

<style scoped>
.shop-hero { display: flex; justify-content: space-between; align-items: center; gap: 16px; background: linear-gradient(120deg, rgba(0, 255, 170, 0.12), rgba(255, 0, 85, 0.1)); border: 1px solid rgba(0, 255, 170, 0.28); border-radius: 18px; padding: 22px 26px; margin-bottom: 20px; }
.shop-hero h1 { margin: 0 0 6px; font-size: clamp(1.1rem, 3vw, 1.5rem); }
.glow { color: #00ffaa; text-shadow: 0 0 16px rgba(0, 255, 170, 0.6); }
.shop-hero p { margin: 0; color: #b9b9d0; font-size: .86rem; }
.hero-tags { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 10px; }
.hero-tags span { font-size: .72rem; color: #9ad7ff; background: rgba(0, 255, 170, .06); border: 1px solid #22223a; border-radius: 999px; padding: 4px 10px; }
.hero-tags i { color: #00ffaa; margin-inline-end: 4px; }
.hero-btn { white-space: nowrap; background: #00ffaa; color: #04110b; font-weight: 800; text-decoration: none; padding: 10px 16px; border-radius: 10px; box-shadow: 0 0 18px rgba(0, 255, 170, 0.35); transition: transform .15s; }
.hero-btn:hover { transform: translateY(-2px); }
.shop-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 14px; }
.shop-q { flex: 1 1 200px; background: #12121f; border: 1px solid #2a2a44; color: #eaeaea; padding: 10px 14px; border-radius: 10px; font: inherit; }
.shop-q:focus { outline: none; border-color: #00ffaa; box-shadow: 0 0 0 3px rgba(0, 255, 170, 0.15); }
.chip-row { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { background: #12121f; color: #b9b9d0; border: 1px solid #2a2a44; border-radius: 999px; padding: 8px 14px; font: inherit; font-size: .8rem; cursor: pointer; }
.chip.on { color: #00ffaa; border-color: rgba(0, 255, 170, 0.45); box-shadow: 0 0 12px rgba(0, 255, 170, 0.18); }
.reset-chip { color: #ff8aa0; border-color: rgba(255, 90, 122, .4); margin-top: 10px; }
.shop-sort { background: #12121f; color: #eaeaea; border: 1px solid #2a2a44; border-radius: 10px; padding: 9px 10px; font: inherit; font-size: .8rem; }
.shop-note { color: #8a8aa8; font-size: .82rem; }
.shop-count { margin: 0 2px 10px; color: #8a8aa8; font-size: .74rem; }

.prod-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(224px, 1fr)); gap: 16px; align-items: stretch; }
.prod-card { display: flex; flex-direction: column; background: #12121f; border: 1px solid #22223a; border-radius: 16px; overflow: hidden; cursor: pointer; transition: transform .18s, border-color .18s, box-shadow .18s; }
.prod-card:hover, .prod-card:focus-visible { transform: translateY(-4px); border-color: rgba(0, 255, 170, 0.5); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 18px rgba(0, 255, 170, 0.12); }
.prod-card.oos { opacity: .78; }
.prod-img { position: relative; aspect-ratio: 1 / 1.05; display: grid; place-items: center; overflow: hidden; background: radial-gradient(120% 90% at 80% 10%, rgba(0, 255, 170, .08), transparent 55%), repeating-linear-gradient(45deg, #14142a 0 12px, #101024 12px 24px); }
.prod-img img { width: 100%; height: 100%; object-fit: cover; transition: transform .35s ease; }
.prod-card:hover .prod-img img { transform: scale(1.05); }
.prod-img i { font-size: 2.6rem; color: #33334f; }
.oos-chip, .off-chip, .sold-chip { position: absolute; top: 10px; font-size: .66rem; font-weight: 800; padding: 4px 9px; border-radius: 8px; backdrop-filter: blur(4px); }
.oos-chip { right: 10px; background: #2a1020d9; color: #ff5a7a; border: 1px solid #ff5a7a55; }
.off-chip { left: 10px; background: #04110bd9; color: #7dffb0; border: 1px solid #00ffaa55; }
.sold-chip { bottom: 10px; top: auto; left: 10px; background: rgba(10, 10, 22, .82); color: #ffd166; border: 1px solid #ffd16633; }
.sold-chip i { color: #ff8a3c; margin-inline-end: 3px; }
.prod-body { flex: 1; display: flex; flex-direction: column; padding: 12px 14px 14px; }
.prod-body h3 { margin: 0 0 3px; font-size: .92rem; line-height: 1.55; min-height: 2.9em; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.prod-cat { margin: 0 0 10px; color: #8a8aa8; font-size: .72rem; display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.low-note { color: #ffd166; font-weight: 700; }
.prod-foot { margin-top: auto; display: flex; justify-content: space-between; align-items: center; gap: 8px; border-top: 1px dashed #22223a; padding-top: 10px; }
.prod-price { display: flex; align-items: baseline; gap: 4px; flex-wrap: wrap; }
.prod-price b { color: #00ffaa; font-size: .95rem; }
.prod-price s { color: #66667f; font-size: .72rem; margin: 0 4px; }
.prod-price small { color: #8a8aa8; font-size: .68rem; }
.add-btn { background: transparent; border: 1px solid rgba(0, 255, 170, 0.4); color: #00ffaa; border-radius: 10px; width: 36px; height: 36px; cursor: pointer; transition: all .15s; flex-shrink: 0; }
.add-btn:hover:not(:disabled) { background: #00ffaa; color: #04110b; transform: scale(1.06); }
.add-btn:disabled { opacity: .3; cursor: not-allowed; }

/* اسکلتون */
.sk-card { cursor: default; pointer-events: none; }
.sk-img, .sk-line { background: linear-gradient(90deg, #16162b 25%, #1d1d36 37%, #16162b 63%); background-size: 300% 100%; animation: sk-shine 1.4s ease infinite; border-radius: 10px; }
.sk-line { height: 13px; margin: 12px 14px 0; }
.sk-line.w80 { width: 80%; margin-top: 14px; }
.sk-line.w40 { width: 40%; }
.sk-line.w60 { width: 60%; margin-bottom: 14px; }
.sk-line.foot { margin-top: auto; }
@keyframes sk-shine { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
</style>
