// ============================================================================
// لایه ارتباط با سرور فاز ۲ — health detection + fetch با کوکی same-origin
// ============================================================================
const BASE = '/api'
import { isDemoMode } from '../app-mode.js'
let online = false

export function isOnline() { return online }

export async function checkOnline() {
  if (isDemoMode()) { online = false; return false } // دمو: هرگز به سرور وصل نمی‌شویم
  try {
    const r = await fetch(BASE + '/health', { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(1500) })
    online = r.ok
    if (r.ok) { try { online = !!(await r.json()).ok } catch { online = false } }
  } catch { online = false }
  return online
}

export async function apiFetch(path, { method = 'GET', body, raw = false } = {}) {
  const res = await fetch(BASE + path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    signal: AbortSignal.timeout(25000),
  })
  if (raw) return res
  let data = {}
  try { data = await res.json() } catch { /* پاسخ بدون body */ }
  if (!res.ok) {
    const e = new Error(data.error || `خطای سرور (${res.status})`)
    e.status = res.status
    e.fields = data.fields || null
    e.data = data
    throw e
  }
  return data
}
