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
import { createPushService } from './push.js'
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
const PUSH = createPushService(ENV, DB)
/** ارسال fire-and-forget؛ خطا هرگز مسیر کاربر را نمی‌شکند */
function siteNotify(payload) { PUSH.notify(payload).then((o) => console.log('[push-hook]', JSON.stringify(o))).catch((e) => console.log('[push-hook-err]', e.message)) }


const loginLimiter = rateLimiter({ max: 8, windowMs: 60_000 })
const publicLimiter = rateLimiter({ max: 30, windowMs: 60_000 })
const orderLimiter = rateLimiter({ max: 10, windowMs: 60_000 })

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
      scheduler: IS_TEST ? 'off' : 'on', push: `${PUSH.mode}:${DB.pushCount()}`, uptimeSec: Math.round(process.uptime()), time: new Date().toISOString(),
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
    siteNotify({ title: '📮 پیام جدید از سایت', body: `${user}: ${subject}`.slice(0, 120), url: '/#/messages', tag: 'request' })
    return sendJsonSafe(res, 201, { ok: true, id })
  }


  /* ---- فاز ۳: صفحات عمومی سایت ---- */
  if (path === '/gateway' && method === 'GET') return gatewayPage(url.searchParams.get('ref') || '', req, res)
  if (path.startsWith('/invoice/') && method === 'GET') return invoicePage(path.slice('/invoice/'.length), req, res)
  if (path === '/sitemap.xml' && method === 'GET') return sitemapXml(req, res)
  if (path === '/robots.txt' && method === 'GET') {
    const base = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || 'localhost'}`
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS })
    return res.end(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${base}/sitemap.xml\n`)
  }
  if (path === '/api/public/site' && method === 'GET') {
    const st = DB.getState()
    if (st.settings.maintenance) return sendJsonSafe(res, 503, { error: 'سایت در حالت نگهداری است.' })
    let products = st.products
    if (st.settings.hideZeroStock) products = products.filter((p) => (p.stock ?? 0) > 0)
    const pub = products.map((p) => ({
      id: p.id, title: p.title, cat: p.cat, price: p.price, oldPrice: p.oldPrice || 0,
      stock: p.stock ?? 0, sold: p.sold || 0, desc: p.desc || '',
      image: String(p.image || '').startsWith('/media/') ? p.image : '', // base64 به کاربر عمومی نرود
      meta: p.meta || {},
    }))
    const posts = st.posts.filter((p) => p.status === 'published')
      .map(({ id, title, body, date, author, channel, publishedAt }) => ({ id, title, body, date, author, channel, publishedAt }))
      .sort((a, b) => String(b.publishedAt || b.date || '').localeCompare(String(a.publishedAt || a.date || '')))
    return sendJsonSafe(res, 200, {
      products: pub, posts,
      settings: { siteName: st.settings.siteName || 'پناه‌فیت', newDiscount: !!st.settings.newDiscount, telegramChannel: st.settings.telegramChannel || '', phone: st.settings.phone || '', address: st.settings.address || '' },
    })
  }
  if (path === '/api/public/orders' && method === 'POST') {
    if (DB.getState().settings.maintenance) throw httpErr(503, 'سایت موقتاً در حالت نگهداری است.')
    if (!orderLimiter(req.socket.remoteAddress || 'x')) throw httpErr(429, 'برای جلوگیری از سفارش‌های رباتیک، کمی بعد تلاش کنید.')
    const b = await readBody(req)
    const st = DB.getState()
    const e = {}
    const buyer = String(b.buyer ?? '').trim()
    const phone = String(b.phone ?? '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).trim()
    const address = String(b.address ?? '').trim()
    if (buyer.length < 3) e.buyer = 'نام و نام خانوادگی را کامل وارد کنید.'
    if (!/^09\d{9}$/.test(phone)) e.phone = 'شماره موبایل باید با 09 شروع شده و ۱۱ رقم باشد.'
    if (address.length < 10) e.address = 'آدرس کامل حداقل ۱۰ نویسه است.'
    const raw = Array.isArray(b.items) ? b.items : []
    if (!raw.length || raw.length > 30) throw httpErr(422, 'سبد خرید خالی یا بیش از حد بزرگ است.', { items: 'تعداد اقلام نامعتبر' })
    const map = new Map(st.products.map((p) => [Number(p.id), p]))
    const clean = []
    for (const it of raw) {
      const p = map.get(Number(it.id))
      if (!p) { e['item_' + it.id] = 'این محصول دیگر وجود ندارد.'; continue }
      const qty = Math.floor(Number(it.qty))
      if (!Number.isInteger(qty) || qty < 1) { e['item_' + it.id] = 'تعداد نامعتبر است.'; continue }
      if ((p.stock ?? 0) <= 0 && st.settings.hideZeroStock) { e['item_' + it.id] = 'این محصول ناموجود است.'; continue }
      if ((p.stock ?? 0) < qty) { e['item_' + it.id] = `موجودی فقط ${p.stock ?? 0} عدد است.`; continue }
      if (qty > 99) { e['item_' + it.id] = 'حداکثر ۹۹ عدد در هر سفارش.'; continue }
      clean.push({ id: Number(p.id), title: p.title, price: Number(p.price) || 0, qty })
    }
    if (Object.keys(e).length) throw httpErr(422, 'سبد خرید قابل ثبت نیست.', e)
    const total = clean.reduce((s2, x) => s2 + x.price * x.qty, 0)
    let discount = 0; let coupon = null
    if (b.couponCode) {
      const code = String(b.couponCode).trim().toUpperCase()
      const c = st.coupons.find((x) => x.code === code)
      const chk = checkCoupon(c, total)
      if (!chk.valid) throw httpErr(422, chk.message || 'کد تخفیف نامعتبر است.', { couponCode: chk.message || 'نامعتبر' })
      discount = chk.discount; coupon = code
    }
    const payable = total - discount
    if (payable < 1000) throw httpErr(422, 'حداقل مبلغ قابل‌پرداخت ۱٬۰۰۰ تومان است.', { payable: 'کم از حد مجاز' })
    const ref = 'PF-' + Date.now().toString(36).toUpperCase().slice(-7) + '-' + Math.random().toString(36).slice(2, 5).toUpperCase()
    const base = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || `localhost:${PORT}`}`
    const pm = await createPayment(ENV, { amount: payable, description: `سفارش ${ref}`, callbackBase: base })
    DB.createTx({ authority: pm.authority, amount: payable, description: `سفارش ${ref}`, gateway: pm.mode, coupon })
    DB.createOrder({ ref, buyer, phone, address, note: String(b.note ?? '').slice(0, 500), items: clean, total, discount, payable, coupon, authority: pm.authority })
    DB.audit('site', 'order.create', ref, `${clean.length} قلم، ${payable}T${coupon ? ' ' + coupon : ''}`)
    return sendJsonSafe(res, 201, { ref, total, discount, payable, authority: pm.authority, mode: pm.mode, payUrl: pm.url || `/gateway?ref=${encodeURIComponent(ref)}` })
  }
  if (path === '/api/public/orders/return' && method === 'GET') {
    const ref = String(url.searchParams.get('ref') || '')
    const decision = String(url.searchParams.get('decision') || 'ok')
    const order = DB.orderByRef(ref)
    if (!order) throw httpErr(404, 'سفارش یافت نشد.')
    if (order.status === 'waiting') {
      if (decision === 'ok' && order.authority) {
        try {
          const v = await verifyPayment(ENV, { authority: order.authority, amount: order.payable })
          const settled = DB.settleOrder(order.authority, v.refId)
          if (settled.ok) {
            if (v.ok) DB.markTx(order.authority, v.refId, true)
            if (order.coupon) redeemCoupon(order.coupon)
            DB.audit('site', 'order.paid', ref, `ref:${v.refId || 'demo'}`)
            siteNotify({ title: '⚡ سفارش پرداخت شد', body: `${ref} • ${(order.buyer || '')}`, url: '/#/order/' + encodeURIComponent(ref), tag: 'order' })
          } else if (settled.error === 'insufficient_stock') {
            DB.failOrder(ref); DB.markTx(order.authority, null, false)
            DB.audit('site', 'order.stockfail', ref, settled.title || '')
          }
        } catch { DB.markTx(order.authority, null, false); DB.failOrder(ref) }
      } else if (decision !== 'ok') {
        if (order.authority) DB.markTx(order.authority, null, false)
        DB.failOrder(ref)
      }
    }
    res.writeHead(302, { Location: `/#/order/${encodeURIComponent(ref)}`, 'Content-Security-Policy': CSP })
    return res.end()
  }
  if (path.startsWith('/api/public/orders/') && method === 'GET') {
    const ref = path.slice('/api/public/orders/'.length)
    const order = /^PF-[A-Z0-9-]{4,}$/i.test(ref) ? DB.orderByRef(ref) : null
    if (!order) throw httpErr(404, 'سفارش یافت نشد.')
    return sendJsonSafe(res, 200, {
      ref: order.ref, status: order.status, refId: order.ref_id || '', buyer: order.buyer,
      total: order.total, discount: order.discount, payable: order.payable, coupon: order.coupon,
      created_at: order.created_at, verified_at: order.verified_at,
      items: order.items.map((i) => ({ id: i.id, title: i.title, qty: i.qty, price: i.price })),
    })
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
  /* ---- فاز ۴: پوش نوتیفیکیشن ---- */
  if (path === '/api/push/public-key' && method === 'GET') {
    return sendJsonSafe(res, 200, { enabled: true, mode: PUSH.mode, key: PUSH.publicKey() })
  }
  if (path === '/api/push/subscribe' && method === 'POST') {
    if (!publicLimiter(req.socket.remoteAddress || 'x')) throw httpErr(429, 'درخواست‌های زیاد؛ کمی بعد تلاش کنید.')
    const b = await readBody(req)
    PUSH.subscribe(b.endpoint, b.keys)
    DB.audit('site', 'push.subscribe', '', String(b.endpoint).slice(0, 80))
    return sendJsonSafe(res, 201, { ok: true, subs: DB.pushCount() })
  }
  if (path === '/api/push/unsubscribe' && method === 'POST') {
    const b = await readBody(req)
    const r = PUSH.unsubscribe(b.endpoint)
    return sendJsonSafe(res, 200, r)
  }
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

  /* ---- سفارش‌ها (مدیریت، فاز ۳) ---- */
  if (path === '/api/orders' && method === 'GET') {
    requirePerm(user, 'payments')
    return sendJsonSafe(res, 200, { items: DB.listOrders(Number(url.searchParams.get('limit')) || 100) })
  }
  {
    const mOrd = path.match(/^\/api\/orders\/(PF-[A-Z0-9-]+)\/(ship|cancel)$/)
    if (mOrd && method === 'POST') {
      requirePerm(user, 'payments')
      const [, ref, op] = mOrd
      if (op === 'ship') {
        const ok = DB.shipOrder(ref)
        if (!ok) throw httpErr(409, 'فقط سفارش پرداخت‌شده قابل ارسال است.')
        DB.audit(user.username, 'order.ship', ref, '')
        return sendJsonSafe(res, 200, { ok: true, status: 'shipped' })
      }
      const r = DB.cancelOrder(ref)
      if (!r.ok) throw httpErr(409, r.error === 'not_found' ? 'سفارش یافت نشد.' : 'این سفارش در وضعیت فعلی قابل لغو نیست.')
      DB.audit(user.username, 'order.cancel', ref, r.refunded ? 'stock-refunded' : '')
      return sendJsonSafe(res, 200, { ok: true, status: 'cancelled', refunded: r.refunded })
    }
  }


  if (path === '/api/push' && method === 'GET') {
    requirePerm(user, 'state:settings')
    return sendJsonSafe(res, 200, { mode: PUSH.mode, items: PUSH.list(), total: DB.pushCount() })
  }
  if (path === '/api/push/test' && method === 'POST') {
    requirePerm(user, 'state:settings')
    const out = await PUSH.notify({ title: '🧪 آزمون پوش پناه‌فیت', body: 'اگر این را می‌بینید، زنجیره VAPID+رمزنگاری سالم است.', url: '/#/settings', tag: 'test' })
    DB.audit(user.username, 'push.test', '', JSON.stringify(out))
    return sendJsonSafe(res, 200, out)
  }

  /* ---- فاز ۴ (ادمین): پوش + گزارش مالی ---- */
  if (path === '/api/push' && method === 'GET') {
    requirePerm(user, 'state:settings')
    return sendJsonSafe(res, 200, { mode: PUSH.mode, items: PUSH.list(), total: DB.pushCount() })
  }
  if (path === '/api/push/test' && method === 'POST') {
    requirePerm(user, 'state:settings')
    const out = await PUSH.notify({ title: '🧪 آزمون پوش پناه‌فیت', body: 'اگر این را می‌بینید، زنجیره VAPID+رمزنگاری سالم است.', url: '/#/settings', tag: 'test' })
    DB.audit(user.username, 'push.test', '', JSON.stringify(out))
    return sendJsonSafe(res, 200, out)
  }
  if (path === '/api/finance/report' && method === 'GET') {
    requirePerm(user, 'payments')
    const st = DB.getState()
    const feePct = Math.min(15, Math.max(0, Number(st.settings.gatewayFeePct) || 0))
    const rep = DB.financeReport(url.searchParams.get('from'), url.searchParams.get('to'))
    rep.feePct = feePct
    rep.fee = Math.round((rep.collected * feePct) / 100)
    rep.net = rep.collected - rep.fee
    if (url.searchParams.get('format') === 'csv') {
      const head = 'date,paid_count,paid_total,cancel_count,cancel_refund'
      const cancels = new Map(rep.cancellations.map((c) => [c.d, c]))
      const lines = rep.daily.map((d) => { const c = cancels.get(d.d) || { n: 0, total: 0 }; cancels.delete(d.d); return `${d.d},${d.n},${d.total},${c.n},${c.total}` })
      for (const [, c] of cancels) lines.push(`${c.d},0,0,${c.n},${c.total}`)
      const csv = '\uFEFF' + [head, ...lines].join('\n')
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="panahfit-finance-${rep.from}_${rep.to}.csv"`, ...SECURITY_HEADERS })
      return res.end(csv)
    }
    return sendJsonSafe(res, 200, rep)
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

/* ---- صفحه درگاه دمو + sitemap (فاز ۳) ---- */
function fmtToman(n) { return (Number(n) || 0).toLocaleString('fa-IR') }
function esc(s2) { return String(s2 ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) }
function gatewayPage(ref, req, res) {
  const o = ref ? DB.orderByRef(ref) : null
  const head = '<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>درگاه پرداخت — پناه‌فیت</title>' +
    '<style>body{font-family:Vazirmatn,Tahoma,system-ui;background:#0a0a14;color:#eaeaea;display:grid;place-items:center;min-height:100vh;margin:0}' +
    '.card{background:#12121f;border:1px solid #00ffaa44;border-radius:18px;padding:28px 30px;max-width:430px;width:92%;box-shadow:0 0 40px #00ffaa22}' +
    'h1{font-size:1.05rem;margin:0 0 14px;color:#00ffaa}table{width:100%;font-size:.85rem;border-collapse:collapse;margin:10px 0 18px}td{padding:5px 2px;border-bottom:1px dashed #2a2a3f}' +
    '.btns{display:flex;gap:10px}a{flex:1;text-align:center;text-decoration:none;padding:11px;border-radius:10px;font-weight:700}' +
    '.ok{background:#00ffaa;color:#04110b}.no{background:#221025;color:#ff5a7a;border:1px solid #ff5a7a55}</style></head><body>'
  if (!o || o.status !== 'waiting') {
    res.writeHead(o ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    return res.end(head + '<div class="card"><h1>⚡ درگاه پرداخت پناه‌فیت</h1><p>این سفارش در وضعیت «' + esc(o ? o.status : 'ناشناخته') + '» است و نیازی به پرداخت ندارد.</p><div class="btns"><a class="ok" href="/#/">بازگشت به فروشگاه</a></div></div></body></html>')
  }
  const rows = o.items.map((i) => `<tr><td>${esc(i.title)}</td><td style="text-align:left">${fmtToman(i.price * i.qty)}</td></tr>`).join('')
  const back = `/api/public/orders/return?ref=${encodeURIComponent(ref)}&decision=`
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(head + `<div class="card"><h1>⚡ درگاه پرداخت پناه‌فیت (دمو)</h1>
    <p style="font-size:.8rem;color:#9a9ab5">شماره سفارش: ${esc(o.ref)}</p>
    <table>${rows}${o.discount ? `<tr><td>تخفیف کوپن</td><td style="text-align:left;color:#7dffb0">- ${fmtToman(o.discount)}</td></tr>` : ''}
    <tr><td><b>قابل پرداخت</b></td><td style="text-align:left"><b>${fmtToman(o.payable)} تومان</b></td></tr></table>
    <div class="btns"><a class="ok" href="${back}ok">پرداخت موفق</a><a class="no" href="${back}fail" rel="nofollow">عملیات ناموفق</a></div>
    <p style="font-size:.68rem;color:#666;margin-top:14px">این درگاه نمایشی است؛ در محیط production با زرین‌پال واقعی جایگزین می‌شود.</p></div></body></html>`)
}
function invoicePage(ref, req, res) {
  const o = /^PF-[A-Z0-9-]{4,}$/i.test(String(ref)) ? DB.orderByRef(String(ref)) : null
  if (!o) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('invoice not found') }
  const st = DB.getState().settings
  const rows = o.items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.title)}</td><td>${fmtToman(i.qty)}</td><td>${fmtToman(i.price)}</td><td>${fmtToman(i.price * i.qty)}</td></tr>`).join('')
  const dateFa = new Date(o.verified_at || o.created_at).toLocaleDateString('fa-IR', { dateStyle: 'full' })
  const pay = o.status === 'paid' || o.status === 'shipped' ? 'پرداخت‌شده ✅' : o.status === 'cancelled' ? 'لغوشده ❌' : 'پرداخت‌نشده ⏳'
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, max-age=60',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" })
  res.end(`<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>فاکتور ${esc(o.ref)} — پناه‌فیت</title><style>
  @page { size: A4; margin: 18mm } body{font-family:Vazirmatn,Tahoma,sans-serif;background:#f4f4f8;color:#16162a;margin:0}
  .sheet{max-width:720px;margin:26px auto;background:#fff;border-radius:14px;padding:30px 34px;box-shadow:0 8px 30px rgba(20,20,50,.14)}
  h1{font-size:1.1rem;margin:0 0 2px} .muted{color:#6a6a85;font-size:.78rem} table{width:100%;border-collapse:collapse;margin:16px 0;font-size:.85rem}
  th{background:#101024;color:#fff;padding:8px;text-align:right;border-radius:6px 6px 0 0} td{padding:8px;border-bottom:1px solid #e7e7f0}
  .tot{display:flex;flex-direction:column;gap:6px;align-items:flex-start;font-size:.86rem} .tot b{color:#0b7a4d}
  .top{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;border-bottom:2px solid #101024;padding-bottom:14px;margin-bottom:14px}
  .btn{display:inline-block;margin:14px auto 0;background:#101024;color:#fff;text-decoration:none;padding:10px 22px;border-radius:9px;border:0;font:inherit;cursor:pointer}
  @media print { body{background:#fff} .sheet{box-shadow:none;margin:0;max-width:none} .btn{display:none} }
  </style></head><body><div class="sheet">
  <div class="top"><div><h1>⚡ پناه‌فیت</h1><p class="muted">${esc(st.siteName || 'فروشگاه لباس ورزشی')}<br>${esc(st.phone || '')} · ${esc(st.address || '')}</p></div>
  <div style="text-align:left"><p class="muted">شماره فاکتور</p><b>${esc(o.ref)}</b><br><p class="muted">تاریخ</p><span>${dateFa}</span></div></div>
  <table><thead><tr><th>#</th><th>شرح کالا</th><th>تعداد</th><th>واحد (تومان)</th><th>جمع (تومان)</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="tot"><span>جمع کل: <b>${fmtToman(o.total)}</b> تومان</span>
  ${o.discount ? `<span>تخفیف${o.coupon ? ' (کد ' + esc(o.coupon) + ')' : ''}: −${fmtToman(o.discount)} تومان</span>` : ''}
  <span>وضعیت: ${pay}</span>
  <span style="font-size:1rem">قابل پرداخت: <b>${fmtToman(o.status === 'waiting' ? o.payable : o.payable)} تومان</b></span>
  ${o.ref_id ? `<span class="muted">کد رهگیری: ${esc(o.ref_id)}</span>` : ''}</div>
  <p class="muted" style="margin-top:18px">خریدار: ${esc(o.buyer)} · ${esc(o.phone)}<br>${esc(o.address)}</p>
  </div><center><button class="btn" onclick="window.print()">🖨 چاپ یا ذخیره PDF</button></center></body></html>`)
}
function sitemapXml(req, res) {
  const st = DB.getState()
  const base = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || 'localhost'}`
  const urls = ['/', '/blog', '/contact', ...st.products.map((p) => `/#/product/${p.id}`), ...st.posts.filter((p) => p.status === 'published').map((p) => `/#/post/${p.id}`)]
  const body = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    urls.map((u) => `<url><loc>${esc(base + u)}</loc></url>`).join('') + '</urlset>'
  res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', ...SECURITY_HEADERS })
  res.end(body)
}

/* ================= سوکت HTTP ================= */
const DIST = join(ROOT, 'dist')
const server = createServer(async (req, res) => {
  try {
    const p = String(req.url || '/').split('?')[0]
    const SPECIAL = p === '/gateway' || p === '/sitemap.xml' || p === '/robots.txt' || p.startsWith('/invoice/')
    if (!p.startsWith('/api/') && !p.startsWith('/media/') && !SPECIAL) {
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
  schedTimer = setInterval(() => { SCHED.runOnce('cron').then((r) => { for (const d of r?.done || []) if (d.ok) siteNotify({ title: '📣 پست منتشر شد', body: 'پست زمان‌بندی‌شده با موفقیت منتشر شد.', url: '/#/posts', tag: 'post' }) }).catch(() => {}) }, 30_000)
  sweepTimer = setInterval(() => { try { MEDIA.sweep(referencedMediaPaths()) } catch { /* noop */ } }, 6 * 3600_000)
}

function stopTimers() { clearInterval(schedTimer); clearInterval(sweepTimer) }

if (!IS_TEST) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[panahfit-api] http://0.0.0.0:${PORT}  (ai=${aiSource(ENV)}, payment=${paymentSource(ENV)}, scheduler=${'on'}, db=${ENV.DATA_DIR || 'data/panahfit.db'})`)
  })
}

export { server, handle, assertState, DB, MEDIA, SCHED, stopTimers, checkCoupon, PUSH }
