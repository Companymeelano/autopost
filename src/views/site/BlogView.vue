<script setup>
// وبلاگ — فقط پست‌های منتشرشده (از /api/public/site)
import { onMounted } from 'vue'
import { useSite } from '../../stores/site'
import { useI18n } from '../../i18n'

const site = useSite()
const { t } = useI18n()
onMounted(() => site.load())
</script>

<template>
  <section class="blog">
    <h1><i class="fas fa-newspaper"></i> {{ t('blog.title') }}</h1>
    <p v-if="site.loading" class="bl-note">{{ t('loading') }}</p>
    <p v-else-if="!site.posts.length" class="bl-note">{{ t('blog.empty') }}</p>
    <div v-else class="bl-grid">
      <RouterLink v-for="p in site.posts" :key="p.id" :to="'/post/' + p.id" class="bl-card">
        <div class="bl-head" v-if="p.image"><img :src="p.image" :alt="p.title" loading="lazy" /></div>
        <div class="bl-body">
          <h2>{{ p.title }}</h2>
          <p>{{ String(p.body || '').slice(0, 120) }}{{ String(p.body || '').length > 120 ? '…' : '' }}</p>
          <small>{{ p.author || 'تیم پناه‌فیت' }} · {{ p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('fa-IR') : p.date }}</small>
        </div>
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
.blog h1 { margin: 0 0 18px; font-size: 1.35rem; }
.blog h1 i { color: #00ffaa; margin-left: 8px; }
.bl-note { color: #8a8aa8; font-size: .85rem; }
.bl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.bl-card { background: #12121f; border: 1px solid #22223a; border-radius: 16px; overflow: hidden; text-decoration: none; color: #eaeaea; transition: all .18s; display: block; }
.bl-card:hover { border-color: rgba(0, 255, 170, 0.45); transform: translateY(-3px); box-shadow: 0 10px 26px rgba(0, 0, 0, 0.45); }
.bl-head { aspect-ratio: 2.2; overflow: hidden; }
.bl-head img { width: 100%; height: 100%; object-fit: cover; }
.bl-body { padding: 14px 16px 16px; }
.bl-body h2 { font-size: .98rem; margin: 0 0 8px; }
.bl-body p { color: #b9b9d0; font-size: .8rem; line-height: 1.8; margin: 0 0 10px; }
.bl-body small { color: #66667f; font-size: .7rem; }
</style>
