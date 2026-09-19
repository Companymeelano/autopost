// ============================================================================
// داده عمومی سایت (فاز ۳) — /api/public/site؛ در نبود سرور از state محلی پنل
// ============================================================================
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useCms } from './cms'

export const useSite = defineStore('site', () => {
  const products = ref([])
  const posts = ref([])
  const settings = ref({})
  const source = ref('local') // 'server' | 'local'
  const error = ref('')
  const loading = ref(false)

  const publishedPosts = computed(() => posts.value)
  const cats = computed(() => [...new Set(products.value.map((p) => p.cat).filter(Boolean))])

  function byId(id) {
    const n = Number(id)
    return products.value.find((p) => Number(p.id) === n) || null
  }
  function postById(id) {
    const n = Number(id)
    return posts.value.find((p) => Number(p.id) === n) || null
  }

  async function load(force = false) {
    if (loading.value) return
    if ((products.value.length || posts.value.length) && !force) return
    loading.value = true
    error.value = ''
    try {
      const r = await fetch('/api/public/site')
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const d = await r.json()
      products.value = d.products || []
      posts.value = d.posts || []
      settings.value = d.settings || {}
      source.value = 'server'
    } catch (e) {
      // حالت آفلاین/دِمو: از استور پنل (localStorage) خوانده می‌شود
      const cms = useCms()
      const hidden = cms.settings?.hideZeroStock
      products.value = cms.products
        .filter((p) => !hidden || (p.stock ?? 0) > 0)
        .map((p) => ({ id: p.id, title: p.title, cat: p.cat, price: p.price, oldPrice: p.oldPrice || 0, stock: p.stock ?? 0, desc: p.desc || '', image: String(p.image || '').startsWith('/media/') ? p.image : '', meta: p.meta || {} }))
      posts.value = cms.posts.filter((p) => p.status === 'published')
      settings.value = { siteName: cms.settings?.siteName || 'پناه‌فیت', newDiscount: !!cms.settings?.newDiscount, telegramChannel: cms.settings?.telegramChannel || '', phone: cms.settings?.phone || '', address: cms.settings?.address || '' }
      source.value = 'local'
      error.value = ''
    } finally { loading.value = false }
  }

  /** خرید فقط آنلاین ممکن است (سرور باید قیمت را تأیید کند) */
  const canBuy = computed(() => source.value === 'server')

  return { products, posts, settings, source, error, loading, cats, publishedPosts, byId, postById, load, canBuy }
})
