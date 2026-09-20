// ============================================================================
// فاز ۶.۵ — حالت اپلیکیشن: 'web' (کامل) | 'shop' (فقط فروشگاه) | 'admin' (فقط پنل)
// در بیلد APK، VITE_APP در زمان build تعریف می‌شود؛ وقتی اپ به سرور ریموت
// وصل می‌شود، همان حالت با ?app=... به URL اضافه و در localStorage می‌نشیند،
// تا یک بیلد وب روی سرور، هر دو نسخه را دقیق پشتیبانی کند.
// ============================================================================
const KEY = 'pf.app.mode'

export function buildMode() {
  const m = String(import.meta.env.VITE_APP || 'web').toLowerCase()
  return m === 'shop' || m === 'admin' ? m : 'web'
}

export function storedMode(storage = globalThis.localStorage) {
  try { return storage.getItem(KEY) } catch { return null }
}

/** حالت مؤثر: بیلد-تایم اولویت دارد؛ وگرنه query/localStorage (برای حالت ریموتِ WebView) */
export function appMode(win = globalThis.window) {
  const b = buildMode()
  if (b !== 'web') return b
  try {
    const q = new URLSearchParams(win.location.search || '').get('app')
    if (q === 'shop' || q === 'admin') { try { win.localStorage.setItem(KEY, q) } catch { /* noop */ } return q }
    const s = storedMode()
    return s === 'shop' || s === 'admin' ? s : 'web'
  } catch { return 'web' }
}

/** query لازم برای ریدایرکت نیتیو بر پایه حالت بیلد */
export function modeQuery() {
  const b = buildMode()
  return b === 'web' ? '' : (b === 'shop' ? '?app=shop' : '?app=admin')
}
