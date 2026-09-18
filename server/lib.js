// ============================================================================
// ابزارهای مشترک سرور — env، کوکی، JSON، هش رمز (scrypt)، محدودساز نرخ، استاتیک
// وابستگی بیرونی: هیچ (فقط ماژول‌های نود)
// ============================================================================
import { readFileSync, existsSync, statSync } from 'node:fs'
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { extname, join, normalize, resolve } from 'node:path'

/* ---------------- env ساده (بدون dotenv) ---------------- */
export function loadEnv(dir) {
  const out = {}
  try {
    const raw = readFileSync(join(dir, '.env'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
      if (m && !line.trim().startsWith('#')) {
        out[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    }
  } catch { /* .env اختیاری است */ }
  return out
}

/* ---------------- JSON helpers ---------------- */
export function sendJson(res, status, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...extraHeaders,
  })
  res.end(body)
}
export function sendError(res, status, message, fields = null) {
  sendJson(res, status, { error: message, ...(fields ? { fields } : {}) })
}

const MAX_BODY = 8 * 1024 * 1024 // 8MB — جای کافی برای state + تصویر base64
export function readBody(req) {
  return new Promise((resolveP, rejectP) => {
    const type = String(req.headers['content-type'] || '')
    if (type && !type.includes('application/json')) {
      rejectP(httpErr(415, 'Content-Type باید application/json باشد.'))
      return
    }
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) { rejectP(httpErr(413, 'حجم بدنه درخواست بیشتر از حد مجاز (۸ مگابایت) است.')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => {
      if (!chunks.length) { resolveP({}); return }
      try { resolveP(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { rejectP(httpErr(400, 'بدنه درخواست JSON معتبر نیست.')) }
    })
    req.on('error', rejectP)
  })
}

export function httpErr(status, message, fields = null) {
  const e = new Error(message)
  e.status = status
  e.fields = fields
  return e
}

/* ---------------- کوکی ---------------- */
export function parseCookies(req) {
  const out = {}
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}
export const SESSION_COOKIE = 'pf_session'
export function sessionCookie(token, maxAgeSec) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}`
}

/* ---------------- رمزنگاری کاربر ---------------- */
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(String(password), salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}
export function verifyPassword(password, stored) {
  try {
    const [algo, salt, hash] = String(stored).split('$')
    if (algo !== 'scrypt' || !salt || !hash) return false
    const check = scryptSync(String(password), salt, 64).toString('hex')
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'))
  } catch { return false }
}
export const newToken = () => randomBytes(32).toString('hex')
export const sign = (secret, value) => createHmac('sha256', secret).update(value).digest('hex')

/* ---------------- محدودساز نرخ (in-memory) ---------------- */
export function rateLimiter({ max, windowMs }) {
  const hits = new Map()
  return function allow(key) {
    const now = Date.now()
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs)
    if (arr.length >= max) { hits.set(key, arr); return false }
    arr.push(now)
    hits.set(key, arr)
    if (hits.size > 5000) { // خانه‌تکانی
      for (const [k, v] of hits) { if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k) }
    }
    return true
  }
}

/* ---------------- هدردرهای امنیتی و فایل استاتیک ---------------- */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
}
// سرو dist با محافظت در برابر path traversal + SPA fallback به index.html
export function serveStatic(rootDir, urlPath, res, csp = null) {
  let p = normalize(decodeURIComponent(urlPath.split('?')[0].split('#')[0]))
  if (p.includes('..')) { sendError(res, 400, 'مسیر نامعتبر.') ; return }
  let file = resolve(join(rootDir, p))
  if (!file.startsWith(resolve(rootDir))) { sendError(res, 403, 'دسترسی ممنوع.'); return }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(rootDir, 'index.html') // SPA fallback
  if (!existsSync(file)) { sendError(res, 404, 'یافت نشد.') ; return }
  const data = readFileSync(file)
  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] || 'application/octet-stream',
    'Content-Length': data.length,
    ...(extname(file) === '.html' ? { 'Cache-Control': 'no-cache' } : { 'Cache-Control': 'public, max-age=31536000, immutable' }),
    ...(csp ? { 'Content-Security-Policy': csp } : {}),
    ...SECURITY_HEADERS,
  })
  res.end(data)
}
