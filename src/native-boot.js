// ============================================================================
// فاز ۶ — بوت‌استرپ نسخه اندروید (Capacitor)
// اپ نیتیو یک پوسته است: اگر سرور پناه‌فیت تنظیم‌شده باشد WebView به همان
// آدرس می‌رود (همه URLهای نسبی/مدیا/درگاه طبیعی کار می‌کنند)؛ اگر نباشد
// صفحه‌ی «اتصال به سرور» نمایش داده می‌شود. در مرورگر عادی این فایل هیچ
// اثری ندارد.
// ============================================================================
const KEY = 'pf.server.v1'

export function isNativeApp(win = window) {
  const w = win
  return !!(w.Capacitor && w.Capacitor.isNativePlatform && w.Capacitor.isNativePlatform())
    || /PanahFitApp/.test(w.navigator?.userAgent || '')
}

export function normalizeServerUrl(raw) {
  let s = String(raw || '').trim().replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  if (!s) return null
  if (!/^[\x21-\x7e]+$/.test(s.replace(/[^\x21-\x7e]/g, " ")) || /\s/.test(s.replace(/[^\x21-\x7e]/g, " "))) return null // نویسه غیرASCII مثل فارسی در آدرس = باطل
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s
  let u
  try { u = new URL(s) } catch { return null }
  if (!['http:', 'https:'].includes(u.protocol)) return null
  if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return null // داخل WebView به خود گوشی اشاره می‌کند
  u.hash = ''; u.search = ''
  return u.origin + (u.pathname === '/' ? '' : u.pathname.replace(/\/$/, ''))
}

export function getServerBase(storage = window.localStorage) {
  try { return normalizeServerUrl(storage.getItem(KEY)) } catch { return null }
}
export function setServerBase(url, storage = window.localStorage) {
  const n = normalizeServerUrl(url)
  if (!n) return null
  try { storage.setItem(KEY, n) } catch { /* noop */ }
  return n
}
export function clearServerBase(storage = window.localStorage) {
  try { storage.removeItem(KEY) } catch { /* noop */ }
}

const BOOT_CSS = `body{margin:0;background:#050505;color:#eaeaea;font:14px Vazirmatn,Tahoma,system-ui;display:grid;place-items:center;min-height:100vh}
.b{width:min(420px,92vw);background:#12121f;border:1px solid #22223a;border-radius:18px;padding:26px;text-align:center}
h1{font-size:1.05rem;color:#00ffaa;margin:0 0 6px}.muted{color:#8a8aa8;font-size:.8rem;line-height:1.8}
input{width:100%;box-sizing:border-box;background:#0d0d18;border:1px solid #2a2a45;border-radius:10px;padding:11px 12px;color:#eaeaea;font-size:.9rem;direction:ltr;text-align:left;margin:14px 0}
button{background:linear-gradient(135deg,#00ffaa,#00c8ff);border:0;border-radius:10px;padding:11px 20px;font-weight:800;color:#04121a;cursor:pointer;font-size:.88rem}
.err{color:#ff5a7a;font-size:.76rem;min-height:16px}.logo{font-size:2rem;margin-bottom:4px}`

function renderBootForm(doc, onSubmit) {
  doc.documentElement.dir = 'rtl'
  doc.body.innerHTML = `<div class="b"><div class="logo">⚡</div><h1>پناه‌فیت — اتصال به سرور</h1>
<p class="muted">برای استفاده، آدرس پنل/فروشگاه پناه‌فیت خود را وارد کنید.<br/>مثال: <b dir="ltr">https://panah.fit</b> یا <b dir="ltr">http://192.168.1.50:8787</b></p>
<input id="pu" type="url" inputmode="url" placeholder="https://…" autocomplete="off" autocapitalize="off" spellcheck="false"/>
<div class="err" id="pe"></div><button id="pb">اتصال</button></div>`
  const input = doc.getElementById('pu')
  const err = doc.getElementById('pe')
  const submit = () => {
    const n = onSubmit(String(input.value))
    if (!n) { err.textContent = 'آدرس معتبر نیست (حداقل http/https و دامنه یا IP شبکه).'; return }
    err.textContent = ''
  }
  doc.getElementById('pb').addEventListener('click', submit)
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit() })
  input.focus()
}

/** در main.js قبل از mount صدا زده می‌شود. خروجی: false اگر صفحه ریدایرکت می‌شود (mount لازم نیست) */
export function nativeBoot({ win = window, doc = document, storage = window.localStorage } = {}) {
  if (!isNativeApp(win)) return true
  const base = getServerBase(storage)
  if (base && win.location.origin + win.location.pathname.replace(/\/$/, '') !== base) {
    const path = win.location.pathname + win.location.search + win.location.hash
    win.location.replace(base + (path === '/' ? '' : path))
    return false
  }
  if (base) return true // روی سرور ریموت باز شده؛ مثل مرورگر عادی رفتار کن
  renderBootForm(doc, (raw) => {
    const n = setServerBase(raw, storage)
    if (n) win.location.replace(n)
    return n
  })
  return false
}
