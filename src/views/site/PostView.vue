<script setup>
// نمایش یک پست منتشرشده
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useSite } from '../../stores/site'
import { setSeo } from '../../utils/seo'

const site = useSite()
const route = useRoute()
onMounted(async () => {
  await site.load()
  const p = post.value
  if (p) setSeo(p.title + ' — مجله پناه‌فیت', String(p.body || '').slice(0, 150), p.image)
})
const post = computed(() => site.postById(route.params.id))
</script>

<template>
  <section v-if="!post" class="ps-empty">
    <p>این نوشته یافت نشد.</p>
    <RouterLink to="/blog">بازگشت به وبلاگ</RouterLink>
  </section>
  <article v-else class="ps">
    <p class="ps-crumb"><RouterLink to="/blog">مجله</RouterLink> / {{ post.title }}</p>
    <h1>{{ post.title }}</h1>
    <p class="ps-meta"><i class="fas fa-user-pen"></i> {{ post.author || 'تیم پناه‌فیت' }} · <i class="fas fa-calendar-day"></i> {{ post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('fa-IR') : post.date }}</p>
    <img v-if="post.image" class="ps-img" :src="post.image" :alt="post.title" />
    <div class="ps-body"><p v-for="(par, i) in String(post.body || '').split(/\n+/)" :key="i">{{ par }}</p></div>
    <RouterLink to="/blog" class="ps-back">→ همه نوشته‌ها</RouterLink>
  </article>
</template>

<style scoped>
.ps { max-width: 720px; margin: 0 auto; }
.ps-empty { text-align: center; color: #8a8aa8; padding: 60px 0; }
.ps-empty a { color: #00ffaa; display: inline-block; margin-top: 8px; }
.ps-crumb { font-size: .74rem; color: #66667f; margin: 0 0 8px; }
.ps-crumb a { color: #8a8aa8; text-decoration: none; }
.ps h1 { font-size: clamp(1.2rem, 4vw, 1.7rem); margin: 0 0 8px; }
.ps-meta { color: #8a8aa8; font-size: .78rem; margin: 0 0 18px; }
.ps-meta i { color: #00ffaa; margin-left: 4px; }
.ps-img { width: 100%; border-radius: 16px; border: 1px solid #22223a; margin-bottom: 18px; }
.ps-body { color: #cfcfe4; line-height: 2.1; font-size: .92rem; }
.ps-body p { margin: 0 0 14px; }
.ps-back { display: inline-block; margin-top: 12px; color: #00ffaa; text-decoration: none; font-size: .84rem; }
</style>
