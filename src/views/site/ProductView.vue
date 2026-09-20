<script setup>
// صفحه محصول — گالری، قیمت، تعداد + افزودن/خرید فوری، مشابه‌ها، متای سئو
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSite } from '../../stores/site'
import { useCart } from '../../stores/cart'
import { useCms } from '../../stores/cms'
import { formatPrice, toFa, CATEGORY_LABELS } from '../../utils/format'
import { setSeo } from '../../utils/seo'
import { useI18n } from '../../i18n'

const site = useSite()
const cart = useCart()
const cms = useCms()
const route = useRoute()
const router = useRouter()
const qty = ref(1)
const { t } = useI18n()

onMounted(async () => { await site.load(); fixQty() })
const product = computed(() => site.byId(route.params.id))
function fixQty() {
  const stock = Number(product.value?.stock) || 0
  if (qty.value > stock) qty.value = Math.max(1, stock)
}
watch(product, () => {
  fixQty()
  const p = product.value
  if (p) setSeo(p.title + ' — پناه‌فیت', (p.meta?.desc || p.desc || '').slice(0, 155), p.image)
})

const similar = computed(() => {
  const p = product.value
  if (!p) return []
  return site.products.filter((x) => x.id !== p.id && x.cat === p.cat).slice(0, 3)
})
const tags = computed(() => String(product.value?.meta?.hashtags || '').split(/\s+/).filter(Boolean))

function addToCart(go = false) {
  const p = product.value
  if (!p) return
  const r = cart.add(p, qty.value)
  if (!r.ok) { cms.toast(t('toast.oos'), true); return }
  if (go) return router.push('/checkout')
  cms.toast(`«${p.title}» ×${toFa(qty.value)} ` + t('toast.added'))
}
</script>

<template>
  <section v-if="!site.products.length && site.loading" class="pd-empty">در حال بارگذاری…</section>
  <section v-else-if="!product" class="pd-empty">
    <i class="fas fa-face-frown"></i>
    <p>{{ t('prod.notfound') }}</p>
    <RouterLink to="/" class="pd-back">{{ t('prod.back') }}</RouterLink>
  </section>

  <section v-else class="pd">
    <p class="pd-crumb"><RouterLink to="/">{{ t('nav.home') }}</RouterLink> / {{ CATEGORY_LABELS[product.cat] || 'محصولات' }} / {{ product.title }}</p>
    <div class="pd-grid">
      <div class="pd-media">
        <img v-if="product.image" :src="product.image" :alt="product.title" />
        <i v-else class="fas fa-shirt"></i>
      </div>
      <div class="pd-info">
        <h1>{{ product.title }}</h1>
        <p class="pd-cat">{{ CATEGORY_LABELS[product.cat] || product.cat }}</p>
        <div class="pd-price-row">
          <b class="pd-price">{{ formatPrice(product.price) }} <small>تومان</small></b>
          <s v-if="product.oldPrice > product.price">{{ formatPrice(product.oldPrice) }}</s>
          <span v-if="product.oldPrice > product.price" class="pd-off">{{ toFa(Math.round((1 - product.price / product.oldPrice) * 100)) }}٪ تخفیف</span>
        </div>
        <p class="pd-stock" :class="product.stock > 10 ? 'in' : product.stock > 0 ? 'low' : 'out'">
          <i class="fas" :class="product.stock > 0 ? 'fa-circle-check' : 'fa-circle-xmark'"></i>
          <span v-if="product.stock > 10">{{ t('prod.stock.in') }} ({{ toFa(product.stock) }})</span>
          <span v-else-if="product.stock > 0">{{ toFa(product.stock) }} {{ t('prod.stock.low') }}</span>
          <span v-else>{{ t('prod.stock.out') }}</span>
        </p>
        <p class="pd-desc">{{ product.desc || t('prod.desc.empty') }}</p>
        <div class="pd-buy">
          <div class="qty-box" role="group" aria-label="تعداد">
            <button type="button" :disabled="qty <= 1" @click="qty--" aria-label="کاهش">−</button>
            <input v-model.number="qty" type="number" min="1" :max="Math.max(1, product.stock)" aria-label="تعداد" />
            <button type="button" :disabled="qty >= product.stock" @click="qty++" aria-label="افزایش">+</button>
          </div>
          <button class="pd-add" :disabled="product.stock <= 0" @click="addToCart(false)"><i class="fas fa-cart-plus"></i> {{ t('prod.add') }}</button>
          <button class="pd-buynow" :disabled="product.stock <= 0" @click="addToCart(true)">{{ t('prod.buynow') }}</button>
        </div>
        <div class="pd-trust" aria-hidden="true">
          <span><i class="fas fa-bolt"></i> {{ t('shop.fast') }}</span>
          <span><i class="fas fa-shield-heart"></i> {{ t('shop.guarantee') }}</span>
          <span><i class="fas fa-lock"></i> {{ t('shop.secure') }}</span>
        </div>
        <div v-if="tags.length" class="pd-tags">
          <span v-for="t in tags" :key="t" class="pd-tag">{{ t }}</span>
        </div>
      </div>
    </div>

    <div v-if="similar.length" class="pd-similar">
      <h2>{{ t('prod.similar') }}</h2>
      <div class="sim-grid">
        <RouterLink v-for="s in similar" :key="s.id" :to="'/product/' + s.id" class="sim-card">
          <div class="sim-img"><img v-if="s.image" :src="s.image" :alt="s.title" loading="lazy" /><i v-else class="fas fa-shirt"></i></div>
          <h3>{{ s.title }}</h3>
          <b>{{ formatPrice(s.price) }} تومان</b>
        </RouterLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.pd { display: grid; gap: 22px; }
.pd-empty { text-align: center; padding: 70px 0; color: #8a8aa8; }
.pd-empty i { font-size: 2.4rem; display: block; margin-bottom: 12px; color: #33334f; }
.pd-back { color: #00ffaa; display: inline-block; margin-top: 8px; }
.pd-crumb { margin: 0; font-size: .75rem; color: #66667f; }
.pd-crumb a { color: #8a8aa8; text-decoration: none; }
.pd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; align-items: start; }
@media (max-width: 800px) { .pd-grid { grid-template-columns: 1fr; } }
.pd-media { aspect-ratio: 1; border-radius: 18px; overflow: hidden; display: grid; place-items: center; background: repeating-linear-gradient(45deg, #14142a 0 14px, #101024 14px 28px); border: 1px solid #22223a; }
.pd-media img { width: 100%; height: 100%; object-fit: cover; }
.pd-media i { font-size: 4rem; color: #33334f; }
.pd-info h1 { margin: 0 0 4px; font-size: clamp(1.15rem, 3vw, 1.6rem); }
.pd-cat { color: #8a8aa8; font-size: .78rem; margin: 0 0 12px; }
.pd-price-row { display: flex; align-items: baseline; gap: 12px; margin-bottom: 10px; }
.pd-price { color: #00ffaa; font-size: 1.35rem; text-shadow: 0 0 14px rgba(0, 255, 170, 0.35); }
.pd-price small { font-size: .7rem; color: #8a8aa8; }
.pd-price-row s { color: #66667f; font-size: .9rem; }
.pd-off { background: #241019; color: #ff5a7a; border: 1px solid #ff005566; padding: 3px 9px; border-radius: 8px; font-size: .72rem; font-weight: 800; }
.pd-stock { font-size: .8rem; margin: 0 0 12px; }
.pd-stock.in { color: #7dffb0; } .pd-stock.low { color: #ffd166; } .pd-stock.out { color: #ff5a7a; }
.pd-desc { color: #b9b9d0; font-size: .88rem; line-height: 1.9; margin: 0 0 16px; }
.pd-buy { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.qty-box { display: flex; border: 1px solid #2a2a44; border-radius: 10px; overflow: hidden; background: #12121f; }
.qty-box button { width: 36px; background: transparent; border: 0; color: #00ffaa; font-size: 1rem; cursor: pointer; }
.qty-box button:disabled { color: #44445e; cursor: not-allowed; }
.qty-box input { width: 52px; text-align: center; background: transparent; border: 0; color: #eaeaea; font: inherit; border-inline: 1px solid #2a2a44; }
.pd-add { background: #12121f; color: #00ffaa; border: 1px solid rgba(0, 255, 170, 0.45); padding: 11px 18px; border-radius: 10px; font: inherit; font-weight: 700; cursor: pointer; }
.pd-add:hover:not(:disabled) { box-shadow: 0 0 16px rgba(0, 255, 170, 0.3); }
.pd-buynow { background: #00ffaa; color: #04110b; border: 0; padding: 11px 18px; border-radius: 10px; font: inherit; font-weight: 800; cursor: pointer; box-shadow: 0 0 18px rgba(0, 255, 170, 0.35); }
.pd-add:disabled, .pd-buynow:disabled { opacity: .4; cursor: not-allowed; box-shadow: none; }
.pd-trust { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
.pd-trust span { font-size: .7rem; color: #9ad7ff; background: #0d0d18; border: 1px solid #22223a; border-radius: 999px; padding: 5px 11px; }
.pd-trust i { color: #00ffaa; margin-inline-end: 5px; }
.pd-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 14px; }
.pd-tag { font-size: .72rem; color: #9ad7ff; background: rgba(61, 139, 255, 0.1); border: 1px solid rgba(61, 139, 255, 0.3); padding: 3px 9px; border-radius: 999px; }
.pd-similar h2 { font-size: 1.05rem; margin: 0 0 12px; }
.sim-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
.sim-card { background: #12121f; border: 1px solid #22223a; border-radius: 14px; padding: 10px; text-decoration: none; color: #eaeaea; transition: all .18s; }
.sim-card:hover { border-color: rgba(0, 255, 170, 0.5); transform: translateY(-3px); }
.sim-img { aspect-ratio: 1; border-radius: 10px; overflow: hidden; display: grid; place-items: center; background: #101024; margin-bottom: 8px; }
.sim-img img { width: 100%; height: 100%; object-fit: cover; }
.sim-img i { color: #33334f; font-size: 1.6rem; }
.sim-card h3 { font-size: .82rem; margin: 0 0 4px; }
.sim-card b { color: #00ffaa; font-size: .8rem; }
</style>
