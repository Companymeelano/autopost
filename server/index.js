// ============================================================================
// PanahFit — سرور فاز ۲.۵: احراز هویت + نقش‌ها، دیتابیس SQLite، همزمانی (rev)،
// مدیا روی دیسک، ممیزی، صف انتشار خودکار، گزارش‌ها، AI و درگاه پرداخت
// اجرای: node server/index.js   (پیش‌فرض http://0.0.0.0:8787)
// در dev، Vite مسیرهای /api و /media را به همین سرور proxy می‌کند.
// ============================================================================
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'

import {
  loadEnv, sendJson, sendError, readBody, httpErr, parseCookies, sessionCookie, SESSION_COOKIE,
  verifyPassword, hashPassword, rateLimiter, serveStatic, SECURITY_HEADERS,
} from './lib.js'
import { openDb } from './db.js'
import { generateCaption, createPayment, verifyPayment, aiSource, paymentSource } from './services.js'
import { createMediaStore } from './media.js'
import { createScheduler } from './scheduler.js'
import { ROLE_PERMS, ROLE_LABELS, permsFor, editableColsFor } from './roles.js'
import { defaultState, COLL_KEYS, VALID_CATS } from '../src/data/seeds.js'
import { validateProduct, validatePost, validateCoupon, validateLogin } from '../src/utils/validation.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENV = { ...loadEnv(ROOT), ...process.env }
const PORT = Number(ENV.PORT || 8787)
const IS_TEST = process.env.PF_TEST === '1'
const DB = openDb(ENV.DATA_DIR === 'memory' ? ':memory:' : join(ROOT, ENV.DATA_DIR || 'data', 'panahfit.db'),
  { username: ENV.ADMIN_USER || 'admin', password: ENV.ADMIN_PASS || '12345' })
const MEDIA = createMediaStore(ENV.DATA_DIR === 'memory' ? '/tmp/panahfit-media-test' : join(ROOT, ENV.DATA_DIR || 'data', 'media'))
const SCHED = createScheduler({ DB, env: ENV, audit: DB.audit })

const loginLimiter = rateLimiter({ max: 8, windowMs: 60_000 })
const publicLimiter = rateLimiter({ max: 30, windowMs: 60_000 })

const FRAME = ENV.CSP_FRAME_ANCESTORS ? `'${String(ENV.CSP_FRAME_ANCESTORS).replace(/'/g, '')}'` : "'self'" // در production: CSP_FRAME_ANCESTORS=none
const CSP = `default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors ${FRAME}; media-src 'self'`
const sendJsonSafe = (res, status, obj, extra = {}) => sendJson(res, status, obj, { 'Content-Security-Policy': CSP, ...extra })

/* ================= نقش‌ها ================= */
function userView(u) {
  return { username: u.username, role: u.role || 'admin', roleLabel: ROLE_LABELS[u.role] || u.role, perms: permsFor(u.role || 'admin') }
}
function requirePerm(user, perm) {
  const perms = permsFor(user.role)
  if (perm !== '*' && !perms.includes(perm)) throw httpErr(403, `نقش «${ROLE_LABELS[user.role] || user.role}» اجازه این عملیات را ندارد.`)
}

/* ================= اعتبارسنجی سمت سرور ================= */
function assertState(p) {
  if (!p || typeof p !== 'object') throw httpErr(400, 'ساختار داده نامعتبر است.')
  const errors = []
  const isInt = (v) => Number.isInteger(v) && v > 0 && v <= 1e9
  for (const key of COLL_KEYS) {
    if (p[key] != null && !Array.isArray(p[key])) throw httpErr(422, `«${key}» باید آرایه باشد.`, [{ field: key, msg: 'آرایه لازم است' }])
  }
  ;(p.products || []).forEach((x, i) => {
    const e = validateProduct(x)
    if (!isInt(Number(x.id))) e.id = 'شناسه نامعتبر.'
    if (x.cat && !VALID_CATS.includes(x.cat)) e.cat = 'دسته‌بندی نامعتبر است.'
    if (Object.keys(e).length) errors.push({ coll: 'products', index: i, fields: e })
  })
  ;(p.posts || []).forEach((x, i) => {
    const e = validatePost(x, { requireFuture: false }) // پست زمان‌گذشته در صف باید قابل ذخیره باشد (منتشر می‌شود)
    if (!isInt(Number(x.id))) e.id = 'شناسه نامعتبر.'
    if (Object.keys(e).length) errors.push({ coll: 'posts', index: i, fields: e })
  })
  const seenCodes = new Set()
  ;(p.coupons || []).forEach((x, i) => {
    const before = [...seenCodes]
    const e = validateCoupon(x, before.map((c) => ({ code: c })))
    const code = String(x.code ?? '').trim().toUpperCase()
    if (seenCodes.has(code)) e.code = 'کد تکراری در مجموعه داده‌ها.'
    if (code) seenCodes.add(code)
    if (Object.keys(e).length) errors.push({ coll: 'coupons', index: i, fields: e })
  })
  ;(p.requests || []).forEach((x, i) => {
    const e = {}
    if (!isInt(Number(x.id))) e.id = 'شناسه نامعتبر.'
    if (!['new', 'done'].includes(x.status)) e.status = 'وضعیت نامعتبر است.'
    if (!String(x.subject ?? '').trim()) e.subject = 'موضوع الزامی است.'
    if (Object.keys(e).length) errors.push({ coll: 'requests', index: i, fields: e })
  })
  ;(p.messages || []).forEach((x, i) => {
    const e = {}
    if (!isInt(Number(x.id))) e.id = 'شناسه نامعتبر.'
    if (!String(x.subject ?? '').trim()) e.subject = 'موضوع الزامی است.'
    if (!['new', 'answered'].includes(x.status)) e.status = 'وضعیت نامعتبر است.'
    if (Object.keys(e).length) errors.push({ coll: 'messages', index: i, fields: e })
  })
  ;(p.provinces || []).forEach((x, i) => {
    const e = {}
    if (!String(x.name ?? '').trim()) e.name = 'نام استان الزامی است.'
    const d = Number(x.delta); const sh = Number(x.ship)
    if (!Number.isInteger(d) || d < 0 || d > 50) e.delta = 'اختلاف قیمت باید عدد صحیح ۰ تا ۵۰ باشد.'
    if (!Number.isFinite(sh) || sh < 0) e.ship = 'هزینه ارسال باید عدد نامنفی باشد.'
    if (Object.keys(e).length) errors.push({ coll: 'provinces', index: i, fields: e })
  })
  if (p.settings != null && (typeof p.settings !== 'object' || Array.isArray(p.settings))) throw httpErr(422, 'تنظیمات باید آبجکت باشد.')
  if (errors.length) {
    const first = errors[0]
    const msg = `اعتبارسنجی سرور: «${first.coll}» سطر ${first.index + 1} — ${Object.values(first.fields)[0]}`
    throw httpErr(422, msg, errors)
  }
}

function changedCols(next) {
  const cur = DB.getState()
  const out = []
  for (const key of COLL_KEYS) {
    if (JSON.stringify(next[key] ?? []) !== JSON.stringify(cur[key])) out.push(key)
  }
  if (next.settings && JSON.stringify(next.settings) !== JSON.stringify(cur.settings)) out.push('settings')
  return out
}

/** مهاجرت تصاویر base64 باقی‌مانده در payload → فایل دیسک (قدرت‌مندسازی تدریجی) */
function externalizeImages(payload) {
  let moved = 0
  const scan = (rows, key) => {
    for (const row of rows || []) {
      const v = row?.[key]
      if (typeof v === 'string' && v.startsWith('data:image/')) {
        try { row[key] = MEDIA.save({ data: v }).path; moved++ } catch { /* اگر نامعتبر بود، اعتبارسنجی متعارف رد می‌کند */ }
      }
    }
  }
  scan(payload.products, 'image')
  scan(payload.posts, 'image')
  return moved
}
function referencedMediaPaths() {
  const refs = new Set()
  const st = DB.getState()
  for (const key of ['products', 'posts']) for (const row of st[key]) if (typeof row?.image === 'string' && row.image.startsWith('/media/')) refs.add(row.image)
  return refs
}

/* ================= هندلرها ================= */
function publicProducts() {
  const st = DB.getState()
  let list = st.products
  if (st.settings.hideZeroStock) list = list.filter((p) => (p.stock ?? 0) > 0)
  return list.map(({ id, title, cat, price, stock, image }) => ({ id, title, cat, price, stock, hasImage: !!image }))
}
async function handle(req, res) {
  const url = new URL(req.url, 'http://x')
  const path = url.pathname
  const method = req.method || 'GET'

  /* ---- مدیا (عمومی برای نمایش در <img>) ---- */
  if (path.startsWith('/media/')) return MEDIA.serve(path, req, res)

  /* ---- عمومی ---- */
  if (path === '/api/health' && method === 'GET') {
    return sendJsonSafe(res, 200, {
      ok: true, app: 'panahfit-api', version: 3,
      ai: aiSource(ENV), payment: paymentSource(ENV),
      scheduler: IS_TEST ? 'off' : 'on', uptimeSec: Math.round(process.uptime()), time: new Date().toISOString(),
    })
  }
  if (path === '/api/public/pricing' && method === 'GET') {
    if (DB.getState().settings.maintenance) return sendJsonSafe(res, 503, { error: 'سایت در حالت نگهداری است.' })
    const st = DB.getState()
    return sendJsonSafe(res, 200, { provinces: st.provinces, newDiscount: !!st.settings.newDiscount })
  }
  if (path === '/api/public/products' && method === 'GET') {
    if (DB.getState().settings.maintenance) return sendJsonSafe(res, 503, { error: 'سایت در حالت نگهداری است.' })
    return sendJsonSafe(res, 200, { items: publicProducts() })
  }
  if (path === '/api/public/coupons/verify' && method === 'POST') {
    if (!publicLimiter(req.socket.remoteAddress || 'x')) throw httpErr(429, 'تعداد درخواست‌های شما زیاد است؛ کمی بعد تلاش کنید.')
    const b = await readBody(req)
    const code = String(b.code ?? '').trim().toUpperCase()
    const amount = Number(b.amount)
    if (!code || !Number.isFinite(amount) || amount <= 0) throw httpErr(422, 'کد و مبلغ (تومان، مثبت) را درست وارد کنید.')
    const c = DB.getState().coupons.find((x) => x.code === code)
    const check = checkCoupon(c, amount)
    return sendJsonSafe(res, 200, check)
  }
  if (path === '/api/public/requests' && method === 'POST') {
    if (!publicLimiter(req.socket.remoteAddress || 'x')) throw httpErr(429, 'تعداد درخواست‌های شما زیاد است؛ کمی بعد تلاش کنید.')
    const b = await readBody(req)
    const subject = String(b.subject ?? '').trim()
    const body = String(b.body ?? '').trim()
    const user = String(b.user ?? '').trim()
    const e = {}
    if (subject.length < 3) e.subject = 'موضوع کوتاه است.'
    if (body.length < 5) e.body = 'متن پیام کوتاه است.'
    if (user.length < 2) e.user = 'نام خود را وارد کنید.'
    if (Object.keys(e).length) throw httpErr(422, 'فرم را کامل کنید.', e)
    const st = DB.getState()
    const id = Math.max(9000, ...st.requests.map((r) => Number(r.id) || 0)) + 1
    st.requests.unshift({ id, type: 'فرم تماس', subject, user, date: new Date().toLocaleString('fa-IR'), status: 'new', body })
    DB.replaceState(st); DB.bumpRev()
    DB.audit('site', 'request.create', `req#${id}`, subject.slice(0, 60))
    return sendJsonSafe(res, 201, { ok: true, id })
  }

  /* ---- احراز هویت ---- */
  if (path === '/api/auth/login' && method === 'POST') {
    const ip = req.socket.remoteAddress || 'x'
    if (!loginLimiter(ip)) { throw httpErr(429, 'تلاش بیش از حد؛ یک دقیقه صبر کنید.') }
    const b = await readBody(req)
    const e = validateLogin(b.username, b.password)
    if (Object.keys(e).length) throw httpErr(422, 'نام کاربری و رمز عبور را وارد کنید.', e)
    const u = DB.findUser(String(b.username).trim())
    if (!u || !verifyPassword(String(b.password), u.passhash)) {
      DB.logLogin(b.username, false, ip)
      DB.audit(b.username, 'login.fail', '', `ip:${ip}`)
      throw httpErr(401, 'نام کاربری یا رمز عبور اشتباه است.')
    }
    DB.logLogin(u.username, true, ip)
    DB.audit(u.username, 'login', '', 'ok')
    const token = DB.createSession(u.username)
    return sendJsonSafe(res, 200, { ok: true, ...userView(u) }, { 'Set-Cookie': sessionCookie(token, 7 * 24 * 3600) })
  }
  if (path === '/api/auth/logout' && method === 'POST') {
    const { [SESSION_COOKIE]: t } = parseCookies(req)
    DB.destroySession(t)
    return sendJsonSafe(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) })
  }

  /* ---- احراز نشست ---- */
  const { [SESSION_COOKIE]: token } = parseCookies(req)
  const uname = DB.sessionUser(token)
  if (!uname) throw httpErr(401, 'برای این عملیات باید وارد شوید.')
  const user = DB.findUser(uname)

  if (path === '/api/auth/me' && method === 'GET') return sendJsonSafe(res, 200, { ok: true, ...userView(user) })
  if (path === '/api/auth/password' && method === 'POST') {
    const b = await readBody(req)
    if (!verifyPassword(String(b.oldPassword || ''), user.passhash)) throw httpErr(422, 'رمز فعلی نادرست است.', { oldPassword: 'رمز فعلی نادرست است.' })
    const np = String(b.newPassword || '')
    if (np.length < 8) throw httpErr(422, 'رمز جدید حداقل ۸ نویسه.', { newPassword: 'حداقل ۸ نویسه' })
    DB.setPassword(user.username, hashPassword(np))
    DB.audit(user.username, 'password.change', '', '')
    return sendJsonSafe(res, 200, { ok: true })
  }

  /* ---- وضعیت کامل + همزمانی ---- */
  if (path === '/api/state' && method === 'GET') {
    return sendJsonSafe(res, 200, { ...DB.getState(), rev: DB.getRev() })
  }
  if (path === '/api/state' && method === 'PUT') {
    const b = await readBody(req)
    const baseRev = Number(b.rev ?? 0)
    const current = DB.getRev()
    // If-Match (هدهد) یا body.rev — اگر فرستاده شد، بررسی می‌شود؛ force=1 برای دورزدن (ادغام دستی UI)
    const ifMatch = Number(req.headers['if-match']?.replace(/[^0-9]/g, '') || 0) || baseRev
    const force = url.searchParams.get('force') === '1'
    if (!force && ifMatch && ifMatch !== current) {
      return sendJsonSafe(res, 409, { error: 'conflict', currentRev: current, state: { ...DB.getState(), rev: current } })
    }
    assertState(b)
    const moved = externalizeImages(b)
    const changed = changedCols(b)
    if (user.role !== 'admin') {
      const allowed = editableColsFor(user.role)
      const denied = changed.filter((c) => !allowed.includes(c))
      if (denied.length) throw httpErr(403, `نقش «${ROLE_LABELS[user.role]}» اجازه ویرایش «${denied.join('، ')}» را ندارد.`)
    }
    DB.replaceState({ ...defaultState(), ...Object.fromEntries(COLL_KEYS.map((k) => [k, b[k] ?? []])), settings: b.settings })
    const rev = DB.bumpRev()
    DB.audit(user.username, 'state.push', changed.join(',') || '—', `rev:${rev}${moved ? ` media:${moved}` : ''}`)
    MEDIA.sweep(referencedMediaPaths())
    return sendJsonSafe(res, 200, { ok: true, rev })
  }
  if (path === '/api/reset' && method === 'POST') {
    requirePerm(user, 'state:settings')
    DB.replaceState(defaultState()); const rev = DB.bumpRev()
    DB.audit(user.username, 'state.reset', '', '')
    return sendJsonSafe(res, 200, { ok: true, rev })
  }

  /* ---- مدیا: آپلود ---- */
  if (path === '/api/media' && method === 'POST') {
    requirePerm(user, 'media')
    const b = await readBody(req)
    const out = MEDIA.save(b)
    DB.audit(user.username, 'media.upload', out.path, `${out.bytes}B`)
    return sendJsonSafe(res, 201, out)
  }

  /* ---- نقش‌ها و کاربران (فقط admin) ---- */
  if (path === '/api/roles' && method === 'GET') {
    return sendJsonSafe(res, 200, { roles: Object.entries(ROLE_PERMS).map(([role, perms]) => ({ role, label: ROLE_LABELS[role], perms })) })
  }
  if (path === '/api/users' && method === 'GET') {
    requirePerm(user, 'users')
    return sendJsonSafe(res, 200, { items: DB.listUsers().map((u) => ({ ...u, roleLabel: ROLE_LABELS[u.role] || u.role })) })
  }
  if (path === '/api/users' && method === 'POST') {
    requirePerm(user, 'users')
    const b = await readBody(req)
    const username = String(b.username || '').trim()
    if (!/^[a-zA-Z0-9_.@-]{3,32}$/.test(username)) throw httpErr(422, 'نام کاربری ۳ تا ۳۲ نویسه (لاتین، عدد، . @ _ -).', { username: 'نامعتبر' })
    if (String(b.password || '').length < 8) throw httpErr(422, 'رمز عبور حداقل ۸ نویسه.', { password: 'حداقل ۸ نویسه' })
    if (!ROLE_PERMS[b.role]) throw httpErr(422, 'نقش نامعتبر.', { role: 'نامعتبر' })
    if (DB.findUser(username)) throw httpErr(409, 'این نام کاربری وجود دارد.', { username: 'تکراری' })
    DB.createUser(username, hashPassword(String(b.password)), b.role)
    DB.audit(user.username, 'user.create', username, b.role)
    return sendJsonSafe(res, 201, { ok: true })
  }
  const mUser = /^\/api\/users\/([a-zA-Z0-9_.@-]{3,32})(\/(role|password))?$/.exec(path)
  if (mUser && (method === 'PUT' || method === 'POST')) {
    requirePerm(user, 'users')
    const [, target, , what] = mUser // گروه ۲ اسلش‌دار است؛ نام واقعی در گروه ۳
    if (!DB.findUser(target)) throw httpErr(404, 'کاربر یافت نشد.')
    const b = await readBody(req)
    if (what === 'role') {
      if (!ROLE_PERMS[b.role]) throw httpErr(422, 'نقش نامعتبر.')
      if (target === user.username && b.role !== 'admin') throw httpErr(422, 'نمی‌توانید نقش خود را از مدیر خارج کنید.')
      DB.setUserRole(target, b.role); DB.dropSessions(target)
      DB.audit(user.username, 'user.role', target, b.role)
      return sendJsonSafe(res, 200, { ok: true })
    }
    if (String(b.password || '').length < 8) throw httpErr(422, 'رمز عبور حداقل ۸ نویسه.')
    DB.setPassword(target, hashPassword(String(b.password)))
    DB.audit(user.username, 'user.password', target, 'admin-reset')
    return sendJsonSafe(res, 200, { ok: true })
  }
  if (mUser && method === 'DELETE') {
    requirePerm(user, 'users')
    const target = mUser[1]
    if (target === user.username) throw httpErr(422, 'حذف حساب خود مجاز نیست.')
    if (!DB.deleteUser(target)) throw httpErr(404, 'کاربر یافت نشد.')
    DB.audit(user.username, 'user.delete', target, '')
    return sendJsonSafe(res, 200, { ok: true })
  }

  /* ---- ممیزی ---- */
  if (path === '/api/audit' && method === 'GET') {
    requirePerm(user, 'audit')
    const { items, total } = DB.listAudit(Number(url.searchParams.get('limit') || 100), Number(url.searchParams.get('offset') || 0))
    return sendJsonSafe(res, 200, { items, total })
  }
  if (path === '/api/audit/logins' && method === 'GET') {
    requirePerm(user, 'audit')
    return sendJsonSafe(res, 200, { items: DB.listLogins() })
  }

  /* ---- صف انتشار (Autopost) ---- */
  if (path === '/api/queue' && method === 'GET') {
    requirePerm(user, 'queue')
    return sendJsonSafe(res, 200, { items: SCHED.queue() })
  }
  if (path === '/api/queue/run' && method === 'POST') {
    requirePerm(user, 'queue')
    const out = await SCHED.runOnce(user.username)
    return sendJsonSafe(res, 200, out)
  }
  if (path === '/api/queue/preview' && method === 'GET') {
    requirePerm(user, 'queue')
    const due = SCHED.queue().filter((q) => q.dueNow).length
    return sendJsonSafe(res, 200, { due })
  }

  /* ---- گزارش‌ها ---- */
  if (path === '/api/reports/summary' && method === 'GET') {
    const days = Math.min(Math.max(Number(url.searchParams.get('days') || 30), 1), 365)
    const since = new Date(Date.now() - days * 24 * 3600 * 1000)
    const sinceIso = since.toISOString()
    const st = DB.getState()
    const txs = DB.paidSince(sinceIso)
    const weekly = new Map()
    for (let d = new Date(since); d <= new Date(); d.setDate(d.getDate() + 1)) {
      weekly.set(isoWeekStart(d), 0)
    }
    for (const t of txs) {
      const wk = isoWeekStart(new Date(t.verified_at || t.created_at))
      if (weekly.has(wk)) weekly.set(wk, weekly.get(wk) + t.amount)
    }
    const tones = DB.toneStatsSince(sinceIso).map((r) => {
      const parts = String(r.detail || '').split('|')
      return { tone: parts[0] || 'نامشخص', count: r.n }
    })
    const perCat = new Map()
    for (const p of st.products) perCat.set(p.cat || '—', (perCat.get(p.cat || '—') || 0) + (p.price || 0) * (p.sold || 0))
    return sendJsonSafe(res, 200, {
      days,
      paidTotal: txs.reduce((s, t) => s + t.amount, 0),
      paidCount: txs.length,
      weekly: [...weekly.entries()].map(([week, total]) => ({ week, total })),
      tones,
      perCat: [...perCat.entries()].map(([cat, revenue]) => ({ cat, revenue })).sort((a, b) => b.revenue - a.revenue),
    })
  }

  /* ---- AI ---- */
  if (path === '/api/ai/caption' && method === 'POST') {
    requirePerm(user, 'ai')
    const b = await readBody(req)
    const title = String(b.title || '').trim()
    if (title.length < 2) throw httpErr(422, 'عنوان محصول لازم است.', { title: 'الزامی' })
    const out = await generateCaption(ENV, { title, tone: b.tone, keywords: b.keywords })
    DB.audit(user.username, 'ai.caption', '', `${b.tone || 'energetic'}|${out.source}`)
    return sendJsonSafe(res, 200, out)
  }

  /* ---- پرداخت ---- */
  if (path === '/api/payments/create' && method === 'POST') {
    requirePerm(user, 'payments')
    const b = await readBody(req)
    const amount = Number(b.amount)
    if (!Number.isFinite(amount) || amount < 1000) throw httpErr(422, 'مبلغ باید حداقل ۱٬۰۰۰ تومان باشد.', { amount: 'نامعتبر' })
    if (amount > 5_000_000_000) throw httpErr(422, 'مبلغ غیرمنطقی است.', { amount: 'سقف: ۵ میلیارد تومان' })
    let coupon = null
    if (b.couponCode) {
      const code = String(b.couponCode).trim().toUpperCase()
      const c = DB.getState().coupons.find((x) => x.code === code)
      const chk = checkCoupon(c, amount)
      if (!chk.valid) throw httpErr(422, chk.message || 'کد تخفیف نامعتبر است.', { couponCode: chk.message || 'نامعتبر' })
      coupon = code
    }
    const base = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || `localhost:${PORT}`}`
    const p = await createPayment(ENV, { amount: coupon ? Math.round(amount * (100 - (DB.getState().coupons.find((x) => x.code === coupon)?.percent || 0)) / 100) : amount, description: b.description, callbackBase: base })
    DB.createTx({ authority: p.authority, amount, description: b.description, gateway: p.mode, coupon })
    DB.audit(user.username, 'payment.create', p.authority, `${amount}T${coupon ? ' ' + coupon : ''}`)
    return sendJsonSafe(res, 201, p)
  }
  if (path === '/api/payments/verify' && method === 'POST') {
    requirePerm(user, 'payments')
    const b = await readBody(req)
    const authority = String(b.authority || '')
    const tx = DB.getTx(authority)
    if (!tx) throw httpErr(404, 'چنین تراکنشی یافت نشد.')
    if (tx.status !== 'waiting') return sendJsonSafe(res, 200, { ok: tx.status === 'paid', status: tx.status, refId: tx.ref_id })
    const v = await verifyPayment(ENV, { authority, amount: tx.amount, refId: b.refId })
    const flipped = DB.markTx(authority, v.refId, v.ok)
    if (v.ok && flipped) {
      if (tx.coupon) redeemCoupon(tx.coupon)
      DB.audit(user.username, 'payment.verify', authority, `paid${tx.coupon ? ' coupon:' + tx.coupon : ''}`)
      return sendJsonSafe(res, 200, { ok: true, status: 'paid', refId: v.refId, redeemed: tx.coupon || null })
    }
    DB.audit(user.username, 'payment.verify', authority, 'failed')
    return sendJsonSafe(res, v.ok ? 200 : 422, { ok: false, status: 'failed', refId: '', error: 'تأیید درگاه ناموفق بود.' })
  }
  if (path === '/api/transactions' && method === 'GET') {
    return sendJsonSafe(res, 200, { items: DB.listTx() })
  }
  if (path === '/api/payments/callback' && method === 'GET') {
    const authority = url.searchParams.get('authority') || ''
    const statusQ = url.searchParams.get('Status') || ''
    const tx = DB.getTx(authority)
    if (tx && tx.status === 'waiting' && statusQ === 'OK') {
      try {
        const v = await verifyPayment(ENV, { authority, amount: tx.amount })
        const flipped = DB.markTx(authority, v.refId, v.ok)
        if (v.ok && flipped && tx.coupon) redeemCoupon(tx.coupon)
      } catch { DB.markTx(authority, null, false) }
    } else if (tx && tx.status === 'waiting') DB.markTx(authority, null, false)
    res.writeHead(302, { Location: `/#/payments?result=${tx && tx.status !== 'waiting' ? 'done' : 'fail'}&authority=${encodeURIComponent(authority)}`, 'Content-Security-Policy': CSP })
    res.end()
    return
  }

  /* ---- بکاپ ---- */
  if (path === '/api/backup/export' && method === 'GET') {
    const body = JSON.stringify({ app: 'panahfit-cms', version: 3, exportedAt: new Date().toISOString(), rev: DB.getRev(), ...DB.getState() }, null, 2)
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="panahfit-backup.json"', ...SECURITY_HEADERS })
    res.end(body)
    return
  }
  if (path === '/api/backup/import' && method === 'POST') {
    requirePerm(user, 'state:settings')
    const b = await readBody(req)
    assertState(b)
    DB.replaceState({ ...defaultState(), ...Object.fromEntries(COLL_KEYS.map((k) => [k, b[k] ?? []])), settings: b.settings })
    const rev = DB.bumpRev()
    DB.audit(user.username, 'backup.import', '', `rev:${rev}`)
    return sendJsonSafe(res, 200, { ok: true, rev })
  }

  throw httpErr(404, 'مسیر API یافت نشد.')
}
/* ---- کوپن: بازه اعتبار + مصرف اتمی ---- */
function checkCoupon(c, amount) {
  if (!c || !c.active) return { valid: false, reason: 'invalid', message: 'کد تخفیف نامعتبر یا غیرفعال است.' }
  const today = new Date().toISOString().slice(0, 10)
  if (c.validFrom && today < String(c.validFrom)) return { valid: false, reason: 'notStarted', message: `این کد از ${c.validFrom} فعال می‌شود.` }
  if (c.validTo && today > String(c.validTo)) return { valid: false, reason: 'expired', message: 'مهلت استفاده از این کد به پایان رسیده است.' }
  if (c.maxUses > 0 && (c.used || 0) >= c.maxUses) return { valid: false, reason: 'maxUses', message: 'سقف استفاده از این کد پر شده است.' }
  const discount = Math.round((amount * c.percent) / 100)
  return { valid: true, percent: c.percent, discount, payable: amount - discount }
}
function redeemCoupon(code) {
  if (!DB.redeemCouponByCode(code)) return
  DB.bumpRev() // تغییر در رکورد کوپن → rev بالا می‌رود تا push بعدی کلاینت با 409 ادغام شود
}
function isoWeekStart(d) {
  const x = new Date(d); const day = (x.getDay() + 6) % 7 // شنبه شروع هفته
  x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0)
  return x.toISOString().slice(0, 10)
}

/* ================= سوکت HTTP ================= */
const DIST = join(ROOT, 'dist')
const server = createServer(async (req, res) => {
  try {
    const p = String(req.url || '/').split('?')[0]
    if (!p.startsWith('/api/') && !p.startsWith('/media/')) {
      if (existsSync(DIST) && (req.method === 'GET' || req.method === 'HEAD')) {
        return serveStatic(DIST, req.url || '/', res, CSP)
      }
      if ((req.url === '/' || req.url === '') && !existsSync(DIST)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP })
        res.end('<h3 dir="rtl">PanahFit API فعال است ✅ — UI را با <code>npm run dev</code> باز کنید یا <code>npm run build</code> بسازید.</h3>')
        return
      }
      return sendError(res, 404, 'نه API و نه فایل استاتیک.')
    }
    await handle(req, res)
  } catch (err) {
    const status = Number.isInteger(err.status) ? err.status : 500
    if (status === 500) console.error('[api]', err)
    if (!res.headersSent) sendJsonSafe(res, status, { error: err.message || 'خطای سرور.', ...(err.fields ? { fields: err.fields } : {}) })
    else res.end()
  }
})

/* ---- زمان‌بند و جاروب مدیا (در تست غیرفعال) ---- */
let schedTimer = null
let sweepTimer = null
if (!IS_TEST) {
  schedTimer = setInterval(() => { SCHED.runOnce('cron').catch(() => {}) }, 30_000)
  sweepTimer = setInterval(() => { try { MEDIA.sweep(referencedMediaPaths()) } catch { /* noop */ } }, 6 * 3600_000)
}

function stopTimers() { clearInterval(schedTimer); clearInterval(sweepTimer) }

if (!IS_TEST) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[panahfit-api] http://0.0.0.0:${PORT}  (ai=${aiSource(ENV)}, payment=${paymentSource(ENV)}, scheduler=${'on'}, db=${ENV.DATA_DIR || 'data/panahfit.db'})`)
  })
}

export { server, handle, assertState, DB, MEDIA, SCHED, stopTimers, checkCoupon }
