import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource/vazirmatn/400.css'
import '@fontsource/vazirmatn/700.css'
import '@fontsource/vazirmatn/900.css'
import '@fortawesome/fontawesome-free/css/fontawesome.min.css'
import '@fortawesome/fontawesome-free/css/solid.min.css'
import '@fortawesome/fontawesome-free/css/regular.min.css'
import './assets/admin.css'
import './assets/lux.css'
import App from './App.vue'
import { makeRouter } from './router'
import { useCms } from './stores/cms'
import { nativeBoot } from './native-boot'

// فاز ۶ — در اپ نیتیو (Capacitor) یا ریدایرکت به سرور تنظیم‌شده یا فرم اتصال
// نمایش داده می‌شود؛ در این حالت mount نمی‌کنیم. مرورگر = همیشه true.
if (nativeBoot()) {
  const app = createApp(App)
  app.use(createPinia())
  app.use(makeRouter())
  app.mount('#app')

  // فاز ۲: تشخیص سرور و بازیابی نشست (بدون بلاک‌کردن رندر — UI آفلاین فوری)
  const cms = useCms()
  cms.ready = cms.initRemote() // گارد روتر فقط برای نخستین ناوبری auth این Promise را منتظر می‌ماند

  // PWA (فاز ۲.۵): ثبت service worker فقط در production build
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => { /* پشتیبانی نشد — اپ بدون آفلاین‌مود کار می‌کند */ })
    })
  }
}
