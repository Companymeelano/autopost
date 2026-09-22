<script setup>
import { isDemoMode, setDemoMode } from '../app-mode'
import { reactive, ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useCms } from '../stores/cms'
import { validateLogin } from '../utils/validation'

const cms = useCms()
const router = useRouter()
const route = useRoute()
const demoOn = ref(isDemoMode())
const form = reactive({ username: 'admin', password: '' })
const errors = ref({})
const busy = ref(false)

function enterDemo() {
  setDemoMode(!demoOn.value)
  if (!demoOn.value) sessionStorage.setItem('pf.demo.autologin', '1')
  location.reload()
}

async function submit() {
  errors.value = validateLogin(form.username, form.password)
  if (Object.keys(errors.value).length) return
  busy.value = true
  const r = await cms.login(form.username, form.password) // آنلاین → /api/auth/login | آفلاین/دمو → شبیه‌سازی محلی
  busy.value = false
  if (r.ok) {
    cms.toast('ورود موفقیت‌آمیز. به پنل مدیریت میلانو خوش آمدید.')
    router.push(route.query.to || '/dashboard')
  } else {
    errors.value = { ...(r.fields || {}), form: r.form || 'خطای نامشخص.' }
  }
}

// دمو: یک‌بار ورود خودکار با داده نمونه، بدون تایپ رمز
onMounted(async () => {
  if (!isDemoMode() || cms.online) return
  if (sessionStorage.getItem('pf.demo.autologin') === '1') {
    sessionStorage.removeItem('pf.demo.autologin')
    form.username = 'admin'; form.password = '12345'
    await submit()
  }
})
</script>

<template>
  <main id="login-page" class="lux-scene">
    <div class="lux-orb orb-a" aria-hidden="true"></div>
    <div class="lux-orb orb-b" aria-hidden="true"></div>
    <div class="lux-grid" aria-hidden="true"></div>

    <div class="auth-container lux-auth-card">
      <div class="lux-brand">
        <span class="ico3d ico3d-hero"><i class="fas fa-bolt"></i></span>
        <h1 class="lux-wordmark">MEELANO</h1>
        <p class="lux-wordmark-fa">پنل مدیریت میلانو <span class="brand-en">— نسخه ۳</span></p>
      </div>

      <div class="lux-sep" aria-hidden="true"><i class="fas fa-diamond"></i></div>

      <p class="login-hint">
        <template v-if="cms.online">
          <span class="lux-live-dot"></span> اتصال سرور برقرار است — احراز هویت سمت سرور انجام می‌شود.
        </template>
        <template v-else-if="demoOn">
          <span class="lux-demo-dot"></span> حالت دمو — داده‌های نمونهٔ میلانو، بدون نیاز به سرور.
        </template>
        <template v-else>
          برای ورود سریع می‌توانید از <strong>حالت دمو</strong> استفاده کنید، یا اطلاعات پیش‌فرض: admin / 12345
        </template>
      </p>

      <form @submit.prevent="submit" class="lux-form" novalidate>
        <div class="form-group-3d">
          <label for="cms-username"><i class="fas fa-user-astronaut"></i> نام کاربری</label>
          <div class="lux-input-shell" :class="{ 'has-err': errors.username }">
            <input id="cms-username" v-model="form.username" type="text" class="cms-input"
                   :class="{ invalid: errors.username }" placeholder="admin" autocomplete="username" />
          </div>
          <span v-if="errors.username" class="field-error">{{ errors.username }}</span>
        </div>
        <div class="form-group-3d">
          <label for="cms-password"><i class="fas fa-fingerprint"></i> رمز عبور</label>
          <div class="lux-input-shell" :class="{ 'has-err': errors.password }">
            <input id="cms-password" v-model="form.password" type="password" class="cms-input"
                   placeholder="••••••••" autocomplete="current-password" />
          </div>
          <span v-if="errors.password" class="field-error">{{ errors.password }}</span>
        </div>
        <p v-if="errors.form" class="field-error lux-form-err" role="alert"><i class="fas fa-triangle-exclamation"></i> {{ errors.form }}</p>
        <button class="cms-btn lux-cta" type="submit" :disabled="busy">
          <span class="lux-cta-icon"><i class="fas" :class="busy ? 'fa-spinner fa-spin' : 'fa-right-to-bracket'"></i></span>
          {{ busy ? 'در حال بررسی...' : 'ورود به پنل' }}
        </button>
      </form>

      <div class="lux-or" aria-hidden="true"><span>یا</span></div>

      <div class="demo-row">
        <RouterLink class="lux-ghost" to="/connect" style="text-decoration:none"><i class="fas fa-satellite-dish"></i> اتصال به هاست و دیتابیس</RouterLink>
        <button id="login-demo" type="button" class="lux-ghost" :disabled="busy" @click="enterDemo">
          <span class="ico3d ico3d-s"><i class="fas fa-flask"></i></span>
          {{ demoOn ? 'خروج از حالت دمو' : 'ورود به حالت دمو (بدون سرور)' }}
        </button>
      </div>
      <p class="lux-foot"><i class="fab fa-vuejs"></i> میلانو Meelano — توان و تناسب</p>
    </div>
  </main>
</template>

<style scoped>
/* ===== صحنه ===== */
.lux-scene { min-height: 100vh; display: grid; place-items: center; position: relative; overflow: hidden;
  background: radial-gradient(1200px 700px at 78% -12%, #1c1147 0%, transparent 55%),
              radial-gradient(900px 600px at -10% 110%, #06281f 0%, transparent 50%), #050505; }
.lux-orb { position: absolute; border-radius: 50%; filter: blur(70px); opacity: .35; animation: floaty 14s ease-in-out infinite alternate; pointer-events: none; }
.orb-a { width: 380px; height: 380px; background: #ccff00; top: -120px; inset-inline-end: -80px; opacity: .16; }
.orb-b { width: 420px; height: 420px; background: #00c8ff; bottom: -160px; inset-inline-start: -100px; opacity: .14; animation-delay: -7s; }
@keyframes floaty { from { transform: translate3d(0,0,0) scale(1); } to { transform: translate3d(30px,-40px,0) scale(1.15); } }
.lux-grid { position: absolute; inset: 0; opacity: .05; pointer-events: none;
  background-image: linear-gradient(#ccff00 1px, transparent 1px), linear-gradient(90deg, #ccff00 1px, transparent 1px);
  background-size: 44px 44px; mask-image: radial-gradient(closest-side, #000, transparent); }

/* ===== کارت ===== */
.lux-auth-card { position: relative; width: min(420px, 92vw); padding: 34px 30px 22px; border-radius: 26px;
  background: linear-gradient(165deg, rgba(28,28,52,.92), rgba(10,10,20,.94));
  border: 1px solid rgba(255,255,255,.09);
  box-shadow: 0 40px 90px rgba(0,0,0,.65), 0 0 0 1px rgba(204,255,0,.06), inset 0 1px 0 rgba(255,255,255,.1);
  backdrop-filter: blur(18px) saturate(1.35); animation: cardIn .5s cubic-bezier(.2,.9,.3,1.2); }
.lux-auth-card::before { content: ''; position: absolute; inset: -1px; border-radius: 27px; padding: 1px; pointer-events: none;
  background: conic-gradient(from 210deg, rgba(204,255,0,.55), rgba(0,200,255,.35) 30%, transparent 55%, rgba(204,255,0,.28) 85%, transparent);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; }
@keyframes cardIn { from { opacity: 0; transform: translateY(22px) scale(.97); } to { opacity: 1; transform: none; } }

/* ===== برند ===== */
.lux-brand { text-align: center; margin-bottom: 6px; }
.ico3d-hero { width: 74px; height: 74px; margin: 0 auto 12px; border-radius: 22px; font-size: 2rem;
  background: linear-gradient(145deg, #d6ff26 0%, #39ff8d 55%, #00c8ff 100%); color: #05050f;
  box-shadow: 0 22px 45px rgba(204,255,0,.32), 0 8px 18px rgba(0,200,255,.25), inset 0 -7px 14px rgba(0,0,0,.35), inset 0 4px 8px rgba(255,255,255,.75);
  transform: perspective(460px) rotateY(-12deg) rotateX(8deg); }
.ico3d-hero:hover { transform: perspective(460px) rotateY(0) rotateX(0) translateY(-2px); }
.lux-wordmark { margin: 0; font-size: 2rem; font-weight: 900; letter-spacing: 6px; direction: ltr;
  background: linear-gradient(180deg, #f4ffd2 0%, #ccff00 45%, #69c600 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 4px 14px rgba(204,255,0,.35)); }
.lux-wordmark-fa { margin: 6px 0 0; font-size: .82rem; color: #b9b9d4; font-weight: 800; }
.brand-en { opacity: .6; font-weight: 400; font-size: .85em; }
.lux-sep { display: flex; align-items: center; gap: 10px; color: rgba(204,255,0,.5); margin: 14px 0 10px; font-size: .55rem; }
.lux-sep::before, .lux-sep::after { content: ''; height: 1px; flex: 1; background: linear-gradient(90deg, transparent, rgba(204,255,0,.45), transparent); }

/* ===== متن‌ها ===== */
.login-hint { color: #9a9ab5; font-size: .78rem; margin: 0 0 16px; text-align: center; line-height: 2; }
.lux-live-dot, .lux-demo-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-inline-end: 6px; vertical-align: 1px; }
.lux-live-dot { background: #39ff8d; box-shadow: 0 0 10px #39ff8d; animation: pulse 1.6s infinite; }
.lux-demo-dot { background: #ffd166; box-shadow: 0 0 10px #ffd166; }
@keyframes pulse { 50% { opacity: .45; } }

/* ===== ورودی‌ها ===== */
.lux-form .form-group-3d { margin-bottom: 14px; }
.lux-form label { display: flex; align-items: center; gap: 7px; font-size: .74rem; font-weight: 800; color: #a9a9d0; }
.lux-form label i { color: #ccff00; opacity: .8; font-size: .72rem; }
.lux-input-shell { position: relative; border-radius: 14px; padding: 1px; margin-top: 7px;
  background: linear-gradient(145deg, rgba(255,255,255,.14), rgba(255,255,255,.03));
  transition: background .25s, box-shadow .25s; }
.lux-input-shell:focus-within { background: linear-gradient(145deg, rgba(204,255,0,.75), rgba(0,200,255,.4)); box-shadow: 0 0 0 4px rgba(204,255,0,.12), 0 10px 26px rgba(0,0,0,.45); }
.lux-input-shell.has-err { background: linear-gradient(145deg, rgba(255,46,99,.8), rgba(255,46,99,.25)); }
.lux-input-shell :deep(.cms-input) { margin-top: 0; border: 0; border-radius: 13px; background: #0c0c18; box-shadow: inset 0 2px 8px rgba(0,0,0,.55); padding: 13px 15px; }
.lux-input-shell :deep(.cms-input:focus) { box-shadow: inset 0 2px 8px rgba(0,0,0,.55), inset 0 0 0 1px rgba(204,255,0,.25); }
.lux-form-err { text-align: center; background: rgba(255,46,99,.08); border: 1px solid rgba(255,46,99,.35); border-radius: 12px; padding: 8px; }

/* ===== CTA لاکچری ===== */
.lux-cta { position: relative; overflow: hidden; width: 100%; margin-top: 8px; padding: 14px; border-radius: 15px; border: 0;
  background: linear-gradient(150deg, #e2ff4d 0%, #ccff00 38%, #39ff8d 100%); color: #06180a; font-size: 1rem; font-weight: 900;
  box-shadow: 0 16px 34px rgba(204,255,0,.34), inset 0 -5px 12px rgba(0,0,0,.25), inset 0 3px 6px rgba(255,255,255,.8);
  display: inline-flex; align-items: center; justify-content: center; gap: 10px; transition: transform .14s ease, box-shadow .14s ease; }
.lux-cta:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 24px 44px rgba(204,255,0,.45), inset 0 -5px 12px rgba(0,0,0,.25), inset 0 3px 6px rgba(255,255,255,.8); }
.lux-cta:active:not(:disabled) { transform: translateY(2px) scale(.99); }
.lux-cta::after { content: ''; position: absolute; top: 0; bottom: 0; inset-inline-start: -60%; width: 45%; transform: skewX(-24deg);
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.65), transparent); animation: shine 3.4s ease-in-out infinite; }
@keyframes shine { 0%, 55% { inset-inline-start: -60%; } 85%, 100% { inset-inline-start: 130%; } }
.lux-cta-icon { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 9px; background: rgba(6,24,10,.22); box-shadow: inset 0 1px 3px rgba(0,0,0,.35), 0 1px 0 rgba(255,255,255,.5); font-size: .8rem; }

/* ===== خطوط جدا و دکمه دمو ===== */
.lux-or { display: flex; align-items: center; gap: 12px; margin: 16px 0 10px; color: #63637f; font-size: .7rem; }
.lux-or::before, .lux-or::after { content: ''; flex: 1; height: 1px; background: rgba(255,255,255,.08); }
.lux-ghost { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; font-family: inherit; font-weight: 800; font-size: .85rem;
  padding: 12px; border-radius: 14px; color: #ffd166; background: linear-gradient(160deg, #191932, #0d0d1c); border: 1px solid rgba(255,209,102,.28);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 10px 24px rgba(0,0,0,.4); transition: transform .14s, box-shadow .14s, border-color .14s; }
.lux-ghost:hover { transform: translateY(-2px); border-color: rgba(255,209,102,.6); box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 16px 30px rgba(0,0,0,.5), 0 0 22px rgba(255,209,102,.12); }
.lux-ghost:active { transform: translateY(1px); }
.demo-row { margin-top: 0; text-align: center; }
.lux-foot { text-align: center; font-size: .66rem; color: #55556e; margin: 14px 0 0; letter-spacing: .5px; }
.lux-foot i { color: #39ff8d; }

@media (prefers-reduced-motion: reduce) { .lux-cta::after, .lux-orb { animation: none; } }
</style>
