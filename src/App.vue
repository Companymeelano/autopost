<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCms } from './stores/cms'
import ToastHost from './components/ToastHost.vue'
import ModalHost from './components/ModalHost.vue'
import CommandPalette from './components/CommandPalette.vue'
import SiteShell from './components/site/SiteShell.vue'

const cms = useCms()
const route = useRoute()
const router = useRouter()
const sidebarOpen = ref(false)

const NAV_ALL = [
  { page: 'dashboard', icon: 'fa-tachometer-alt', label: 'داشبورد و گزارش‌گیری' },
  { page: 'products', icon: 'fa-box-open', label: 'مدیریت محصولات (CRUD)' },
  { page: 'posts', icon: 'fa-newspaper', label: 'مدیریت محتوا و پست‌ها' },
  { page: 'pricing', icon: 'fa-tags', label: 'قیمت‌گذاری و تخفیفات' },
  { page: 'messages', icon: 'fa-inbox', label: 'پیام‌ها و درخواست‌ها' },
  { page: 'ai', icon: 'fa-brain', label: 'تولید محتوای هوشمند (AI)' },
  { page: 'orders', icon: 'fa-receipt', label: 'مدیریت سفارش‌ها', perm: 'payments' },
  { page: 'payments', icon: 'fa-credit-card', label: 'پرداخت و تراکنش‌ها', perm: 'payments' },
  { page: 'audit', icon: 'fa-user-shield', label: 'گزارش ممیزی', perm: 'audit' },
  { page: 'users', icon: 'fa-users', label: 'کاربران و نقش‌ها', perm: 'users' },
  { page: 'settings', icon: 'fa-cog', label: 'تنظیمات API و عمومی', perm: 'state:settings' },
]
const NAV = computed(() => NAV_ALL.filter((n) => !n.perm || cms.can(n.perm)))
const currentNav = computed(() => route.meta.nav || '')
const SYNC_META = {
  offline: ['آفلاین (محلی)', 'fa-plug'],
  idle: ['متصل به سرور', 'fa-wifi'],
  saving: ['در حال همگام‌سازی…', 'fa-spinner fa-spin'],
  ok: ['همگام با سرور', 'fa-cloud-check-alt'],
  error: ['خطای همگام‌سازی', 'fa-triangle-exclamation'],
}
const syncLabel = computed(() => (SYNC_META[cms.sync.status] || SYNC_META.idle)[0])
const syncIcon = computed(() => (SYNC_META[cms.sync.status] || SYNC_META.idle)[1])

// بستن سایدبار موبایل + ریست اسکرول با هر تغییر مسیر
watch(route, () => {
  sidebarOpen.value = false
  const wrapper = document.getElementById('content-wrapper')
  if (wrapper) wrapper.scrollTop = 0
  window.scrollTo({ top: 0 })
})

async function logout() {
  if (!window.confirm('آیا از خروج از پنل مطمئن هستید؟')) return
  await cms.logout()
  cms.closeModal()
  cms.toast('خروج از پنل مدیریت انجام شد.')
  router.push('/login')
}
</script>

<template>
  <!-- فاز ۳: صفحات عمومی سایت (برای مهمان و ورودکرده) -->
  <SiteShell v-if="route.meta.site">
    <router-view />
  </SiteShell>

  <!-- مهمان: فقط صفحه ورود -->
  <template v-else-if="!cms.authed">
    <router-view />
  </template>

  <!-- کاربر واردشده: پوسته پنل -->
  <div v-else id="cms-layout">
    <header>
      <div class="brand"><i class="fas fa-bolt"></i> PanahFit CMS</div>
      <div class="profile-info" style="font-size: 0.9rem; display: flex; align-items: center; gap: 10px;">
        <span class="sync-badge" :class="'sync-' + cms.sync.status" :title="'وضعیت همگام‌سازی: ' + cms.sync.status">
          <i class="fas" :class="syncIcon"></i> {{ syncLabel }}
        </span>
        <RouterLink to="/" title="مشاهده فروشگاه" style="color:#9a9ab5;text-decoration:none;padding:6px 9px;border:1px solid #333;border-radius:8px;"><i class="fas fa-globe"></i></RouterLink>
        <i class="fas fa-user-circle" style="color: var(--primary);"></i>
        <span>{{ cms.user || 'مدیر سیستم' }}</span>
      </div>
      <button type="button" class="menu-toggle" aria-label="باز و بسته کردن منو"
              aria-controls="sidebar" :aria-expanded="String(sidebarOpen)"
              @click="sidebarOpen = !sidebarOpen">
        <i class="fas fa-bars"></i>
      </button>
    </header>

    <aside id="sidebar" :class="{ open: sidebarOpen }">
      <nav class="sidebar-menu" aria-label="منوی اصلی">
        <RouterLink v-for="n in NAV" :key="n.page" :to="'/' + n.page"
                    :data-page="n.page" :class="{ active: currentNav === n.page }">
          <i class="fas" :class="n.icon"></i> {{ n.label }}
        </RouterLink>
        <a href="#" style="color: var(--accent-hot-red);" @click.prevent="logout">
          <i class="fas fa-sign-out-alt"></i> خروج از پنل
        </a>
      </nav>
    </aside>

    <div class="overlay" v-show="sidebarOpen" @click="sidebarOpen = false"></div>

    <div id="content-wrapper">
      <router-view v-slot="{ Component }">
        <component :is="Component" class="page-section active" />
      </router-view>
    </div>
  </div>

  <CommandPalette />
      <ToastHost />
  <ModalHost />
</template>

<style>
/* پوسته Vue با v-if مدیریت می‌شود؛ قانون CSS ارثی «display:none» خنثی می‌شود */
#cms-layout { display: flex; }
</style>
