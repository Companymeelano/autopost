<script setup>
// فاز ۷.۵ — ویزارد اتصال میلانو: سرور → ورود مدیر → دیتابیس cPanel/MySQL → فراخوانی داده
// در اپ اندروید پیش از هر چیز همین صفحه باز می‌شود؛ در وب هم از /login قابل دسترسی است.
import { reactive, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useCms } from '../../stores/cms'
import { appMode } from '../../app-mode'
import { isNativeApp, clearServerBase } from '../../native-boot'

const cms = useCms()
const router = useRouter()
const mode = appMode()
const isNative = isNativeApp()
const origin = globalThis.location.origin

const step = reactive({ server: 0, login: 0, db: 0, go: 0 }) // 0 pending, 1 active-ish ok-partial, 2 done, -1 err
const health = ref(null)
const busy = ref('')
const msg = reactive({ server: '', login: '', db: '' })

const creds = reactive({ username: 'admin', password: '' })
const dbf = reactive({ host: 'localhost', port: '3306', user: '', password: '', database: '', prefix: 'pf_', ssl: false })
const dbReport = ref(null)
const dbTables = ref(null)

async function run(key, fn) {
  busy.value = key
  msg[key] = ''
  try { await fn() } catch (e) { msg[key] = e?.message || 'خطای نامشخص'; step[key] = -1 }
  finally { busy.value = '' }
}

async function pingServer() {
  await run('server', async () => {
    const r = await fetch('/api/health', { cache: 'no-store' })
    if (!r.ok) throw new Error('سرور پاسخ نداد (HTTP ' + r.status + ')')
    health.value = await r.json()
    step.server = 2
  })
}
pingServer()

function rehost() { clearServerBase(); location.replace('/?re=' + Date.now()) }

async function doLogin() {
  await run('login', async () => {
    const r = await cms.login(creds.username.trim(), creds.password)
    if (!r.ok) throw new Error(r.form || 'ورود ناموفق')
    step.login = 2
  })
}

async function dbTest() {
  await run('db', async () => {
    const r = await fetch('/api/db/test', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ ...dbf, port: Number(dbf.port) }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || !d.ok) throw new Error(d.error || 'تست اتصال ناموفق')
    msg.db = '✓ متصل — MySQL ' + d.version + ' — ' + (d.existingTables?.length || 0) + ' جدول میلانو از قبل موجود است'
    step.db = step.db === 2 ? 2 : 1
  })
}
async function dbApply() {
  await run('db', async () => {
    if (!cms.authed) throw new Error('ابتدا در پنل وارد شوید (مرحلهٔ ۲)')
    const r = await fetch('/api/db/apply', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ ...dbf, port: Number(dbf.port), importLocal: true }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || !d.ok) throw new Error(d.error || 'اعمال ناموفق')
    msg.db = '✓ ۱۵ جدول ساخته/تطبیق شد و داده جایگذاری گردید'
    step.db = 2
    await dbHealth()
  })
}
async function dbHealth() {
  try {
    const r = await fetch('/api/db/health', { credentials: 'same-origin' })
    const d = await r.json()
    dbTables.value = d.tables || []
    dbReport.value = (d.tables || []).every((t) => t.status === 'ok') ? 'all-ok' : 'issues'
  } catch { dbReport.value = null }
}
async function dbPull() {
  await run('db', async () => {
    const r = await fetch('/api/db/pull', { method: 'POST', credentials: 'same-origin' })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error || 'فراخوانی ناموفق')
    msg.db = `✓ داده از جداول میزبان فراخوانی شد — محصولات: ${d.rows.products}، پست‌ها: ${d.rows.posts}`
    step.db = 2
  })
}
async function dbRepair() {
  await run('db', async () => {
    const r = await fetch('/api/db/repair', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: '{}' })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || 'ترمیم ناموفق')
    await dbHealth()
    msg.db = '✓ ترمیم خودکار انجام شد'
  })
}

const dbSkip = () => { step.db = 2; msg.db = 'اتصال دیتابیس فعلاً رد شد — از تنظیمات پنل هر زمان قابل برقراری است' }
const canFinish = computed(() => step.server === 2)
async function finish() {
  try { localStorage.setItem('pf.connect.done', '1') } catch { /* noop */ }
  await router.push(mode === 'admin' || cms.authed ? (cms.authed ? '/dashboard' : '/login') : '/')
}
</script>

<template>
  <div class="connect-scene lux-scene">
    <div class="lux-orb orb-a" aria-hidden="true"></div>
    <div class="lux-orb orb-b" aria-hidden="true"></div>
    <div class="lux-grid" aria-hidden="true"></div>

    <main class="connect-card lux-auth-card" role="main">
      <header class="connect-head">
        <span class="ico3d ico3d-hero"><i class="fas fa-satellite-dish"></i></span>
        <h1>اتصال به هاست <small>Meelano Connect</small></h1>
        <p>میلانو را به سرور و دیتابیس MySQL هاست اشتراکی (cPanel) وصل کنید — پس از تأیید سلامت، داده‌ها فراخوانی می‌شوند.</p>
      </header>

      <!-- ۱ سرور -->
      <section class="lux-step" :class="{ done: step.server === 2, active: step.server !== 2 }">
        <h3><span class="lux-num">۱</span> سرور میلانو روی هاست
          <span v-if="step.server === 2" class="lux-ok"><i class="fas fa-check-circle"></i> برقرار</span>
          <span v-else-if="step.server === -1" class="lux-bad"><i class="fas fa-circle-xmark"></i> ناموفق</span>
        </h3>
        <p class="lux-step-note" dir="ltr">{{ origin }}</p>
        <div v-if="health" class="connect-chips">
          <span class="chip">API v{{ health.version }}</span>
          <span class="chip good">سازگار با {{ health.app }}</span>
          <span class="chip" :class="health.db?.engine === 'mysql' ? 'good' : ''">دیتابیس: {{ health.db?.engine === 'mysql' ? 'MySQL هاست ✓ همگام' : 'موتور محلی' }}</span>
        </div>
        <div class="connect-btns">
          <button class="cms-btn mini" :disabled="busy === 'server'" @click="pingServer"><i class="fas" :class="busy === 'server' ? 'fa-spinner fa-spin' : 'fa-rotate'"></i> تست دوباره</button>
          <button v-if="isNative" class="cms-btn mini ghost" @click="rehost"><i class="fas fa-pen"></i> تغییر آدرس سرور</button>
        </div>
        <p v-if="msg.server" class="lux-bad">{{ msg.server }}</p>
      </section>

      <!-- ۲ ورود -->
      <section class="lux-step" :class="{ done: step.login === 2 }">
        <h3><span class="lux-num">۲</span> ورود مدیر پنل <span v-if="step.login === 2" class="lux-ok"><i class="fas fa-check-circle"></i> وارد شدید</span></h3>
        <p class="lux-step-note">برای ساخت و مدیریت جداول لازم است. اگر فقط می‌خواهید فروشگاه را ببینید، رد کنید.</p>
        <template v-if="!cms.authed">
          <div class="connect-grid2">
            <label>نام کاربری<input v-model="creds.username" dir="ltr" autocomplete="username" /></label>
            <label>رمز عبور<input v-model="creds.password" type="password" dir="ltr" autocomplete="current-password" /></label>
          </div>
          <div class="connect-btns">
            <button class="cms-btn mini" :disabled="busy === 'login'" @click="doLogin"><i class="fas" :class="busy === 'login' ? 'fa-spinner fa-spin' : 'fa-right-to-bracket'"></i> ورود</button>
            <button class="cms-btn mini ghost" @click="step.login = 2; msg.login = 'رد شد'">رد کردن</button>
          </div>
          <p v-if="msg.login" class="lux-bad">{{ msg.login }}</p>
        </template>
      </section>

      <!-- ۳ دیتابیس -->
      <section class="lux-step" :class="{ done: step.db === 2 }">
        <h3><span class="lux-num">۳</span> دیتابیس MySQL هاست (cPanel)
          <span v-if="step.db === 2" class="lux-ok"><i class="fas fa-database"></i> متصل و همگام</span>
        </h3>
        <p class="lux-step-note">از cPanel ← MySQL® Databases: نام دیتابیس، کاربر و رمز را وارد کنید. میلانو ۱۵ جدول همهٔ بخش‌ها را می‌سازد، داده را جایگذاری و ساختار را تطبیق/ترمیم می‌کند.</p>
        <div class="connect-grid3">
          <label>هاست<input v-model="dbf.host" dir="ltr" placeholder="localhost" /></label>
          <label>پورت<input v-model="dbf.port" dir="ltr" inputmode="numeric" /></label>
          <label>پیشوند جداول<input v-model="dbf.prefix" dir="ltr" placeholder="pf_" /></label>
          <label>نام دیتابیس<input v-model="dbf.database" dir="ltr" placeholder="user_meelano" /></label>
          <label>کاربر دیتابیس<input v-model="dbf.user" dir="ltr" placeholder="user_db" /></label>
          <label>رمز دیتابیس<input v-model="dbf.password" type="password" dir="ltr" /></label>
        </div>
        <label class="connect-ssl"><input type="checkbox" v-model="dbf.ssl" /> اتصال امن SSL</label>
        <div class="connect-btns">
          <button class="cms-btn mini" :disabled="busy === 'db'" @click="dbTest"><i class="fas" :class="busy === 'db' ? 'fa-spinner fa-spin' : 'fa-random'"></i> تست اتصال</button>
          <button class="cms-btn mini primary" :disabled="busy === 'db'" @click="dbApply"><i class="fas fa-magic"></i> ساخت و جایگذاری جداول</button>
          <button class="cms-btn mini ghost" :disabled="busy === 'db'" @click="dbHealth"><i class="fas fa-heartbeat"></i> سلامت</button>
          <button class="cms-btn mini ghost" :disabled="busy === 'db' || step.db !== 2" @click="dbPull"><i class="fas fa-download"></i> فراخوانی داده</button>
          <button class="cms-btn mini ghost" v-if="dbReport === 'issues'" @click="dbRepair"><i class="fas fa-screwdriver-wrench"></i> ترمیم</button>
          <button class="cms-btn mini ghost" @click="dbSkip">رد کردن</button>
        </div>
        <p v-if="msg.db" :class="msg.db.startsWith('✓') ? 'lux-ok' : (msg.db.startsWith('اتصال دیتابیس') ? 'lux-step-note' : 'lux-bad')">{{ msg.db }}</p>
        <div v-if="dbTables?.length" class="connect-tables">
          <span v-for="t in dbTables" :key="t.table" class="chip" :class="t.status === 'ok' ? 'good' : 'bad'" :title="t.label + ' — ' + (t.rows ?? 0) + ' سطر'">
            {{ t.label }} {{ t.status === 'ok' ? '✓' : '!' }}
          </span>
        </div>
      </section>

      <button class="cms-btn connect-finish" :disabled="!canFinish" @click="finish">
        <i class="fas fa-door-open"></i> فراخوانی اطلاعات و ورود به {{ mode === 'admin' ? 'پنل' : 'فروشگاه' }}
      </button>
      <RouterLink to="/login" class="connect-alt">رفتن مستقیم به ورود پنل <i class="fas fa-arrow-left"></i></RouterLink>
    </main>
  </div>
</template>

<style scoped>
.connect-scene { min-height: 100vh; display: grid; place-items: center; padding: 26px 14px; }
.connect-card { width: min(620px, 96vw); padding: 30px 28px; }
.connect-head { text-align: center; }
.connect-head .ico3d-hero { width: 64px; height: 64px; margin: 0 auto 10px; border-radius: 20px; font-size: 1.7rem; display: grid; place-items: center;
  background: linear-gradient(145deg, #d6ff26 0%, #39ff8d 55%, #00c8ff 100%); color: #05050f;
  box-shadow: 0 22px 45px rgba(204, 255, 0, .32), 0 8px 18px rgba(0, 200, 255, .25), inset 0 -7px 14px rgba(0, 0, 0, .35), inset 0 4px 8px rgba(255, 255, 255, .75);
  transform: perspective(460px) rotateY(-12deg) rotateX(8deg); }
.connect-head h1 { margin: 10px 0 4px; font-size: 1.5rem; font-weight: 900; letter-spacing: .5px;
  background: linear-gradient(180deg, #f4ffd2, #ccff00 55%, #69c600); -webkit-background-clip: text; background-clip: text; color: transparent; }
.connect-head h1 small { display: block; font-size: .72rem; letter-spacing: 3px; color: #8f8fb0; -webkit-text-fill-color: #8f8fb0; margin-top: 4px; }
.connect-head p { color: #a9a9d0; font-size: .8rem; line-height: 2; margin: 8px auto 18px; max-width: 46ch; }

.connect-chips { display: flex; gap: 8px; flex-wrap: wrap; margin: 4px 0 2px; }
.connect-chips .chip, .connect-tables .chip { font-size: .68rem; padding: 4px 12px; border-radius: 99px; background: #14142a; border: 1px solid #2b2b4a; color: #9ad7ff; }
.connect-chips .chip.good, .connect-tables .chip.good { color: #39ff8d; border-color: #1c4a36; }
.connect-tables .chip.bad { color: #ff7a92; border-color: #4a1c2a; }
.connect-tables { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 10px; }

.connect-grid2, .connect-grid3 { display: grid; gap: 10px; margin: 8px 0; }
.connect-grid2 { grid-template-columns: 1fr 1fr; }
.connect-grid3 { grid-template-columns: repeat(3, 1fr); }
.connect-grid2 label, .connect-grid3 label { font-size: .68rem; font-weight: 800; color: #a9a9d0; display: grid; gap: 5px; }
.connect-grid2 input, .connect-grid3 input, .connect-ssl { font-family: inherit; }
.connect-grid2 input, .connect-grid3 input { background: #0c0c18; border: 1px solid #26264a; border-radius: 11px; color: #eaeaff; padding: 10px 12px; font-size: .84rem; transition: border-color .2s, box-shadow .2s; }
.connect-grid2 input:focus, .connect-grid3 input:focus { outline: none; border-color: rgba(204, 255, 0, .6); box-shadow: 0 0 0 3px rgba(204, 255, 0, .12), 0 0 18px rgba(204, 255, 0, .12); }
.connect-ssl { display: flex; gap: 8px; align-items: center; font-size: .74rem; color: #b9b9d4; margin: 4px 0 8px; }

.connect-btns { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
.cms-btn.mini { width: auto; margin-top: 0; padding: 9px 15px; font-size: .78rem; border-radius: 12px; background: linear-gradient(160deg, #23233f, #121224); color: #dcdcf5; border: 1px solid #2b2b4a;
  box-shadow: 0 10px 22px rgba(0, 0, 0, .4), inset 0 1px 0 rgba(255, 255, 255, .08); }
.cms-btn.mini:hover:not(:disabled) { transform: translateY(-2px); border-color: rgba(204, 255, 0, .4); }
.cms-btn.mini.ghost { background: transparent; }
.cms-btn.mini.primary { background: linear-gradient(150deg, #e2ff4d, #ccff00 45%, #39ff8d); color: #06180a; border: 0; font-weight: 900;
  box-shadow: 0 14px 28px rgba(204, 255, 0, .3), inset 0 2px 4px rgba(255, 255, 255, .7), inset 0 -4px 8px rgba(0, 0, 0, .22); }
.connect-finish { margin-top: 18px; font-size: 1rem; padding: 15px; background: linear-gradient(150deg, #e2ff4d 0%, #ccff00 45%, #39ff8d 100%); color: #06180a; border: 0; }
.connect-alt { display: block; text-align: center; margin-top: 12px; font-size: .74rem; color: #7d7da0; text-decoration: none; }
.connect-alt:hover { color: #ccff00; }
</style>
