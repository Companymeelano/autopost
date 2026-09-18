<script setup>
// پوسته عمومی سایت (فاز ۳) — header + nav + badge سبد + footer
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCart } from '../../stores/cart'
import { useSite } from '../../stores/site'
import { toFa } from '../../utils/format'

const cart = useCart()
const site = useSite()
const route = useRoute()
const nav = [
  { to: '/', label: 'خانه و فروشگاه' },
  { to: '/blog', label: 'وبلاگ' },
  { to: '/contact', label: 'تماس با ما' },
]
const cartCount = computed(() => cart.count)
onMounted(() => site.load())
</script>

<template>
  <div class="site-shell">
    <header class="site-header">
      <RouterLink to="/" class="site-logo"><i class="fas fa-bolt"></i> {{ site.settings.siteName || 'پناه‌فیت' }}</RouterLink>
      <nav class="site-nav" aria-label="ناوبری اصلی">
        <RouterLink v-for="n in nav" :key="n.to" :to="n.to" :class="{ on: route.path === n.to }">{{ n.label }}</RouterLink>
      </nav>
      <div class="site-actions">
        <RouterLink to="/checkout" class="site-cart" :title="'سبد خرید: ' + cartCount + ' قلم'">
          <i class="fas fa-shopping-cart"></i>
          <span v-if="cartCount" class="cart-badge">{{ toFa(cartCount) }}</span>
        </RouterLink>
        <RouterLink to="/login" class="site-admin" title="پنل مدیریت"><i class="fas fa-user-shield"></i></RouterLink>
      </div>
    </header>

    <main class="site-main">
      <slot />
    </main>

    <footer class="site-footer">
      <div>
        <h4>پناه‌فیت</h4>
        <p>{{ site.settings.address || 'تهران — ارسال به سراسر کشور' }}</p>
      </div>
      <div>
        <h4>ارتباط</h4>
        <p v-if="site.settings.phone"><i class="fas fa-phone"></i> {{ site.settings.phone }}</p>
        <p v-if="site.settings.telegramChannel"><i class="fab fa-telegram"></i> {{ site.settings.telegramChannel }}</p>
      </div>
      <div>
        <h4>دسترسی سریع</h4>
        <p><RouterLink to="/checkout">سبد خرید و پرداخت</RouterLink></p>
        <p><RouterLink to="/login">ورود پنل مدیریت</RouterLink></p>
      </div>
      <p class="site-copy">© {{ new Date().getFullYear() }} پناه‌فیت — توان و تناسب</p>
    </footer>
  </div>
</template>

<style>
/* ——— پوسته عمومی سایت (سبک هماهنگ با پنل؛ گلوبال عمداً) ——— */
.site-shell { min-height: 100vh; display: flex; flex-direction: column; background: radial-gradient(1200px 500px at 80% -10%, rgba(0, 255, 170, 0.07), transparent), #0a0a14; color: #eaeaea; }
.site-header { display: flex; align-items: center; gap: 18px; padding: 14px clamp(16px, 4vw, 48px); position: sticky; top: 0; z-index: 30; background: rgba(10, 10, 20, 0.85); backdrop-filter: blur(10px); border-bottom: 1px solid rgba(0, 255, 170, 0.25); }
.site-logo { font-weight: 900; font-size: 1.15rem; color: #00ffaa; text-decoration: none; text-shadow: 0 0 14px rgba(0, 255, 170, 0.5); }
.site-nav { display: flex; gap: 4px; flex: 1; }
.site-nav a { color: #b9b9d0; text-decoration: none; padding: 7px 13px; border-radius: 9px; font-size: .88rem; transition: all .2s; }
.site-nav a:hover { color: #fff; background: rgba(255, 255, 255, 0.06); }
.site-nav a.on { color: #00ffaa; background: rgba(0, 255, 170, 0.08); box-shadow: inset 0 0 0 1px rgba(0, 255, 170, 0.3); }
.site-actions { display: flex; gap: 10px; align-items: center; }
.site-cart { position: relative; color: #eaeaea; text-decoration: none; font-size: 1.05rem; padding: 8px 12px; border: 1px solid #2a2a44; border-radius: 10px; transition: all .2s; }
.site-cart:hover { border-color: #00ffaa; box-shadow: 0 0 14px rgba(0, 255, 170, 0.25); }
.cart-badge { position: absolute; top: -7px; left: -7px; background: #ff0055; color: #fff; font-size: .66rem; font-weight: 800; min-width: 18px; height: 18px; border-radius: 9px; display: grid; place-items: center; padding: 0 4px; box-shadow: 0 0 10px rgba(255, 0, 85, 0.6); }
.site-admin { color: #9a9ab5; text-decoration: none; padding: 8px 11px; border-radius: 10px; border: 1px solid transparent; }
.site-admin:hover { color: #00ffaa; border-color: rgba(0, 255, 170, 0.3); }
.site-main { flex: 1; width: min(1180px, 94vw); margin: 0 auto; padding: 26px 0 60px; }
.site-footer { border-top: 1px solid #22223a; background: #0c0c18; padding: 26px clamp(16px, 4vw, 48px) 14px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 18px; font-size: .82rem; color: #9a9ab5; }
.site-footer h4 { color: #eaeaea; margin: 0 0 8px; font-size: .92rem; }
.site-footer a { color: #7dffb0; text-decoration: none; }
.site-copy { grid-column: 1 / -1; text-align: center; font-size: .72rem; border-top: 1px dashed #22223a; padding-top: 12px; margin: 4px 0 0; }
@media (max-width: 640px) { .site-nav { display: none; } }
</style>
