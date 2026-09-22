// ============================================================================
// فاز ۶ — بوت‌استرپ نسخه اندروید (Capacitor)
// اپ نیتیو یک پوسته است: اگر سرور میلانو تنظیم‌شده باشد WebView به همان
// آدرس می‌رود (همه URLهای نسبی/مدیا/درگاه طبیعی کار می‌کنند)؛ اگر نباشد
// صفحه‌ی «اتصال به سرور» نمایش داده می‌شود. در مرورگر عادی این فایل هیچ
// اثری ندارد.
// ============================================================================
const KEY = 'pf.server.v1'
import { modeQuery } from './app-mode'

/** افزودن app=shop/admin به آدرس مقصد تا حالت نسخه روی سرور هم اعمال شود */
function withMode(url) {
  const mq = modeQuery()
  if (!mq) return url
  return url + (url.includes('?') ? '&' : '') + mq.slice(1)
}

export function isNativeApp(win = window) {
  const w = win
  return !!(w.Capacitor && w.Capacitor.isNativePlatform && w.Capacitor.isNativePlatform())
    || /(PanahFit|Meelano)App/.test(w.navigator?.userAgent || '')
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

const BOOT_CSS = `body{margin:0;background:radial-gradient(1200px 800px at 80% -10%,#1b1140 0%,#050505 55%);color:#eaeaea;font:14px Vazirmatn,Tahoma,system-ui;display:grid;place-items:center;min-height:100vh}
.b{width:min(460px,92vw);background:linear-gradient(160deg,#151528,#0c0c18);border:1px solid #2b2b4a;border-radius:22px;padding:30px 26px;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.07)}
h1{font-size:1.2rem;font-weight:900;color:#ccff00;margin:6px 0;text-shadow:0 0 22px rgba(204,255,0,.35)}
.muted{color:#8a8aa8;font-size:.8rem;line-height:1.9}
input{width:100%;box-sizing:border-box;background:#0d0d18;border:1px solid #2a2a45;border-radius:12px;padding:12px;color:#eaeaea;font-size:.9rem;direction:ltr;text-align:left;margin:14px 0;box-shadow:inset 0 2px 6px rgba(0,0,0,.5)}
button{background:linear-gradient(135deg,#ccff00,#39ff8d);border:0;border-radius:12px;padding:12px 22px;font-weight:900;color:#04120a;cursor:pointer;font-size:.9rem;box-shadow:0 10px 24px rgba(204,255,0,.28),inset 0 -3px 0 rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.5);transition:transform .12s}
button:active{transform:translateY(2px)}
button.ghost{background:#17172c;color:#a9a9d0;box-shadow:inset 0 1px 0 rgba(255,255,255,.06);border:1px solid #2b2b4a}
.err{color:#ff5a7a;font-size:.78rem;min-height:18px}
.ok{color:#39ff8d;font-size:.78rem;min-height:18px}
.logo{width:74px;height:74px;margin:0 auto 10px;border-radius:22px;background:linear-gradient(145deg,#ccff00,#00c8ff 70%);display:grid;place-items:center;font-size:2rem;color:#050512;box-shadow:0 18px 40px rgba(0,200,255,.35),inset 0 -6px 12px rgba(0,0,0,.3),inset 0 4px 8px rgba(255,255,255,.55);transform:perspective(400px) rotateY(-8deg) rotateX(6deg)}
.chips{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;font-size:.72rem}
.chip{padding:3px 12px;border-radius:99px;background:#14142a;border:1px solid #2b2b4a;color:#9ad7ff}
.chip.good{color:#39ff8d;border-color:#1c4a36}.chip.bad{color:#ff7a92;border-color:#4a1c2a}
.row{display:flex;gap:10px;justify-content:center;margin-top:12px}`

export function renderBootForm(doc, onConnect, onDemo) {
  doc.documentElement.dir = 'rtl'
  doc.body.innerHTML = `<div class="b"><div class="logo">⚡</div><h1>میلانو — Meelano</h1>
<p class="muted">برای اتصال، آدرس پنل/فروشگاه میلانو روی هاست را وارد کنید.<br/>مثال: <b dir="ltr">https://your-domain.ir</b> یا <b dir="ltr">http://192.168.1.50:8787</b></p>
<input id="pu" type="url" inputmode="url" placeholder="https://…" autocomplete="off" autocapitalize="off" spellcheck="false"/>
<div class="err" id="pe"></div>
<div class="chips" id="pc" style="display:none"></div>
<div class="row"><button id="pb">اتصال امن به سرور</button><button id="pd" class="ghost">🧪 مشاهده دمو</button></div>`
  const input = doc.getElementById('pu')
  const err = doc.getElementById('pe')
  const chips = doc.getElementById('pc')
  const submit = async () => {
    const n = onConnect(String(input.value))
    if (!n) { err.textContent = 'آدرس معتبر نیست (حداقل http/https و دامنه یا IP شبکه).'; return }
    err.textContent = ''
    chips.style.display = 'flex'
    chips.innerHTML = '<span class="chip">… بررسی سلامت سرور و دیتابیس</span>'
    try {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null
      const t = ctl && setTimeout(() => ctl.abort(), 6000)
      const r = await fetch(n.replace(/\/$/, '') + '/api/health', { signal: ctl && ctl.signal })
      t && clearTimeout(t)
      const j = r.ok ? await r.json() : {}
      const db = (j.db && j.db.engine) || 'sqlite-local'
      chips.innerHTML = `<span class="chip good">✓ سرور پاسخ داد</span><span class="chip good">${db === 'mysql' ? '✓ دیتابیس MySQL هاست همگام است' : 'دیتابیس محلی سرور'}</span><span class="chip">v${j.version || '?'}</span>`
    } catch {
      chips.innerHTML = '<span class="chip bad">هشدار: سرور پاسخ سلامت نداد — باز هم وارد می‌شویم</span>'
    }
    setTimeout(() => {}, 700)
  }
  doc.getElementById('pb').addEventListener('click', submit)
  doc.getElementById('pd').addEventListener('click', onDemo)
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit() })
  input.focus()
}

/** در main.js قبل از mount صدا زده می‌شود. خروجی: false اگر صفحه ریدایرکت می‌شود (mount لازم نیست) */
export function nativeBoot({ win = window, doc = document, storage = window.localStorage } = {}) {
  if (!isNativeApp(win)) return true
  const base = getServerBase(storage)
  if (base && win.location.origin + win.location.pathname.replace(/\/$/, '') !== base) {
    const path = win.location.pathname + win.location.search + win.location.hash
    win.location.replace(withMode(base + (path === '/' ? '' : path)))
    return false
  }
  if (base) {
    // فاز ۷.۵ — اولین اجرای اپ بعد از اتصال: ویزارد کامل اتصال (سرور ← ورود ← دیتابیس cPanel)
    let connectDone = false
    try { connectDone = storage.getItem('pf.connect.done') === '1' } catch { /* noop */ }
    if (!connectDone) {
      win.location.replace(withMode(base + '/connect'))
      return false
    }
    return true // روی سرور ریموت باز شده؛ مثل مرورگر عادی رفتار کن
  }
  renderBootForm(doc,
    (raw) => { const n = setServerBase(raw, storage); if (n) win.location.replace(withMode(n)); return n },
    () => { try { storage.setItem('pf.demo', '1') } catch { /* noop */ } doc.body.innerHTML = '<div class="b"><h1>🧪 حالت دمو</h1><p class="muted">در حال بارگذاری نسخه نمایشی میلانو…</p></div>'; setTimeout(() => win.location.reload(), 400) })
  return false
}
