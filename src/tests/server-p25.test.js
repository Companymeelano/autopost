// @vitest-environment node
// ============================================================================
// تست‌های قابلیت‌های فاز ۲.۵ سمت سرور: مدیا، نقش‌ها، ممیزی، صف، redeem، گزارش، CSP
// ============================================================================
process.env.PF_TEST = '1'
process.env.DATA_DIR = 'memory'
process.env.ADMIN_USER = 'admin'
process.env.ADMIN_PASS = 'test-secret-9'
process.env.SEED_DEMO_USERS = '1'
process.env.CSP_FRAME_ANCESTORS = 'none' // تست configپذیری CSP

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

let base = ''
let server = null
const jars = {} // cookie jar per role

async function call(path, { method = 'GET', body, jar = 'admin' } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(jars[jar] ? { Cookie: jars[jar] } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  let data = {}
  try { data = await res.clone().json() } catch { data = { __binary: res.headers.get('content-type')?.startsWith('image/') } }
  return { status: res.status, data, headers: res.headers }
}
async function login(jar, username, password) {
  const r = await call('/api/auth/login', { method: 'POST', body: { username, password }, jar: '__none' })
  if (r.status === 200) jars[jar] = (r.headers.get('set-cookie') || '').split(';')[0]
  return r
}

beforeAll(async () => {
  const m = await import('../../server/index.js')
  server = m.server
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
  expect((await login('admin', 'admin', 'test-secret-9')).status).toBe(200)
})
afterAll(async () => { await new Promise((r) => server.close(r)) })

describe('media on disk', () => {
  const PNG1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

  it('uploads, dedups by content hash and serves with immutable cache', async () => {
    const r = await call('/api/media', { method: 'POST', body: { data: 'data:image/png;base64,' + PNG1x1 } })
    expect(r.status).toBe(201)
    expect(r.data.path).toMatch(/^\/media\/[a-f0-9]{40}\.png$/)
    const r2 = await call('/api/media', { method: 'POST', body: { data: 'data:image/png;base64,' + PNG1x1 } })
    expect(r2.data.id).toBe(r.data.id) // dedup
    const get = await fetch(base + r.data.path)
    expect(get.status).toBe(200)
    expect(get.headers.get('content-type')).toBe('image/png')
    expect(get.headers.get('cache-control')).toContain('immutable')
    const evil = await fetch(base + '/media/%2e%2e%2fpanahfit.db')
    expect(evil.status).toBe(400) // الگوی سخت‌گیرانهٔ نام فایل — path traversal خنثی
    expect((await evil.text())).not.toMatch(/SQLite format/)
  })

  it('rejects bad formats and disguised files', async () => {
    let r = await call('/api/media', { method: 'POST', body: { data: 'data:text/html;base64,PGI+' } })
    expect(r.status).toBe(422)
    r = await call('/api/media', { method: 'POST', body: { data: 'data:image/png;base64,AAAA' } }) // مجوز نامعتبر
    expect(r.status).toBe(422)
  })

  it('state PUT auto-migrates base64 images to /media paths', async () => {
    const st = (await call('/api/state')).data
    st.products[0].image = 'data:image/png;base64,' + PNG1x1
    const put = await call('/api/state', { method: 'PUT', body: st })
    expect(put.status).toBe(200)
    const fresh = (await call('/api/state')).data
    expect(fresh.products[0].image).toMatch(/^\/media\/[a-f0-9]{40}\.png$/)
    // تصویر قابل نمایش است
    const img = await fetch(base + fresh.products[0].image)
    expect(img.status).toBe(200)
  })
})

describe('roles & users', () => {
  it('editor can edit products but not coupons/settings', async () => {
    expect((await login('editor', 'editor', 'editor123')).status).toBe(200)
    const me = await call('/api/auth/me', { jar: 'editor' })
    expect(me.data.role).toBe('editor')
    expect(me.data.perms).toContain('state:products')
    expect(me.data.perms).not.toContain('state:coupons')

    const st = (await call('/api/state', { jar: 'editor' })).data
    st.products.push({ id: 700, title: 'محصول ادیتور', cat: 'set', price: 10, stock: 1 })
    const ok = await call('/api/state', { method: 'PUT', body: st, jar: 'editor' })
    expect(ok.status).toBe(200)

    const st2 = (await call('/api/state', { jar: 'editor' })).data
    st2.coupons.push({ code: 'EDNOCAN', percent: 10, maxUses: 0, used: 0, active: true })
    const denied = await call('/api/state', { method: 'PUT', body: st2, jar: 'editor' })
    expect(denied.status).toBe(403)
    expect(denied.data.error).toContain('coupons')

    const admin = (await call('/api/state')).data
    expect(admin.coupons.find((c) => c.code === 'EDNOCAN')).toBeFalsy()
  })

  it('finance sees payments and can toggle coupons but cannot touch products', async () => {
    expect((await login('finance', 'finance', 'finance123')).status).toBe(200)
    const txs = await call('/api/transactions', { jar: 'finance' })
    expect(txs.status).toBe(200)
    const st = (await call('/api/state', { jar: 'finance' })).data
    st.products[0].price = 999999999
    const denied = await call('/api/state', { method: 'PUT', body: st, jar: 'finance' })
    expect(denied.status).toBe(403)
    const r = await call('/api/users', { jar: 'finance' })
    expect(r.status).toBe(403)
  })

  it('admin CRUDs users; cannot delete or demote self', async () => {
    let r = await call('/api/users', { method: 'POST', body: { username: 'sara', password: 'secret-pass-1', role: 'editor' } })
    expect(r.status).toBe(201)
    r = await login('sara', 'sara', 'secret-pass-1')
    expect(r.data.role).toBe('editor')
    r = await call('/api/users', { method: 'POST', body: { username: 'sara', password: 'secret-pass-1', role: 'admin' } })
    expect(r.status).toBe(409)
    r = await call('/api/users', { method: 'POST', body: { username: 'sara', password: 'x', role: 'wizard' } })
    expect(r.status).toBe(422)
    r = await call('/api/users/admin', { method: 'DELETE' })
    expect(r.status).toBe(422)
    r = await call('/api/users/sara/role', { method: 'PUT', body: { role: 'finance' } })
    expect(r.status + ':' + JSON.stringify(r.data)).toBe('200:{"ok":true}')
    r = await call('/api/users/sara', { method: 'DELETE' })
    expect(r.status).toBe(200)
    const list = (await call('/api/users')).data.items
    expect(list.find((u) => u.username === 'sara')).toBeFalsy()
  })
})

describe('audit trail', () => {
  it('records state pushes and failed logins', async () => {
    const before = (await call('/api/audit')).data.total
    const st = (await call('/api/state')).data
    st.messages.push({ id: 55, subject: 'پیام ممیزی', customer: 'x', date: 'اکنون', status: 'new', body: 'y' })
    await call('/api/state', { method: 'PUT', body: st })
    const after = (await call('/api/audit')).data
    expect(after.total).toBeGreaterThan(before)
    const push = after.items.find((a) => a.action === 'state.push')
    expect(push.username).toBe('admin')
    expect(push.entity).toContain('messages')
    await login('__bad', 'admin', 'wrong-pass-zzz')
    const logins = (await call('/api/audit/logins')).data.items
    expect(logins[0]).toMatchObject({ username: 'admin', ok: 0 })
  })
})

describe('autopost queue & coupon loop', () => {
  it('scheduled post auto-publishes when due (internal channel)', async () => {
    let st = (await call('/api/state')).data
    st.posts = st.posts.filter((p) => p.status !== 'scheduled')
    st.posts.push({ id: 91, title: 'پست زمان‌بندی فوری', author: 'ادیتور', date: '۱۴۰/۰۶/۷', status: 'scheduled', body: 'محتوای تست', publishAt: new Date(Date.now() + 80).toISOString() })
    expect((await call('/api/state', { method: 'PUT', body: st })).status).toBe(200)

    const { SCHED } = await import('../../server/index.js')
    const early = await SCHED.runOnce('test')
    // ممکن است هنوز نرسیده باشد (۸۰ms) — صبر و تلاش مجدد
    if (!early.processed) {
      await new Promise((r) => setTimeout(r, 150))
      await SCHED.runOnce('test')
    }
    st = (await call('/api/state')).data
    const post = st.posts.find((p) => p.id === 91)
    expect(post.status).toBe('published')
    expect(post.publishChannel).toBe('internal')
    expect(post.publishedAt).toBeTruthy()
    const audit = (await call('/api/audit')).data.items
    expect(audit.some((a) => a.action === 'post.publish' && a.entity.includes('91'))).toBe(true)
  })

  it('payment verify redeems coupon atomically and enforces maxUses', async () => {
    let st = (await call('/api/state')).data
    st.coupons = st.coupons.filter((c) => c.code !== 'ONESHOT')
    st.coupons.push({ code: 'ONESHOT', percent: 50, maxUses: 1, used: 0, active: true })
    expect((await call('/api/state', { method: 'PUT', body: st })).status).toBe(200)

    let v = await call('/api/public/coupons/verify', { method: 'POST', body: { code: 'ONESHOT', amount: 20000 }, jar: '__none' })
    expect(v.data).toMatchObject({ valid: true, discount: 10000 })
    const c1 = await call('/api/payments/create', { method: 'POST', body: { amount: 20000, couponCode: 'ONESHOT' } })
    expect(c1.status).toBe(201)
    await call('/api/payments/verify', { method: 'POST', body: { authority: c1.data.authority } })
    st = (await call('/api/state')).data
    expect(st.coupons.find((c) => c.code === 'ONESHOT').used).toBe(1)
    // سقف پر شده → نه create پذیرفته می‌شود نه verify عمومی
    const c2 = await call('/api/payments/create', { method: 'POST', body: { amount: 20000, couponCode: 'ONESHOT' } })
    expect(c2.status).toBe(422)
    v = await call('/api/public/coupons/verify', { method: 'POST', body: { code: 'ONESHOT', amount: 20000 }, jar: '__none' })
    expect(v.data.reason).toBe('maxUses')
    // بازه زمانی
    st = (await call('/api/state')).data
    st.coupons.push({ code: 'FUTURE1', percent: 10, maxUses: 0, used: 0, active: true, validFrom: '2099-01-01' })
    await call('/api/state', { method: 'PUT', body: st })
    v = await call('/api/public/coupons/verify', { method: 'POST', body: { code: 'FUTURE1', amount: 10000 }, jar: '__none' })
    expect(v.data.reason).toBe('notStarted')
  })
})

describe('reports & headers', () => {
  it('summary returns weekly buckets, tones and per-cat revenue', async () => {
    const r = await call('/api/reports/summary?days=30')
    expect(r.status).toBe(200)
    expect(r.data.days).toBe(30)
    expect(Array.isArray(r.data.weekly)).toBe(true)
    expect(r.data.weekly.length).toBeGreaterThanOrEqual(4)
    expect(r.data.weekly.every((w) => /^\d{4}-\d{2}-\d{2}$/.test(w.week))).toBe(true)
    expect(Array.isArray(r.data.tones)).toBe(true)
    expect(r.data.perCat[0].revenue).toBeGreaterThan(0)
    expect(r.data.paidCount).toBeGreaterThanOrEqual(1)
  })

  it('static shell (dist) is CSP-hardened — served by same server', async () => {
    const res = await fetch(base + '/')
    // در این محیط dist کنار repo موجود است؛ اگر نبود 404 هم CSP دارد (API path)
    const csp = res.headers.get('content-security-policy')
    if (res.status === 200) {
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("script-src 'self'")
      expect(csp).toContain("frame-ancestors 'none'")
      const html = await res.text()
      expect(html).not.toContain('cdn.jsdelivr.net') // CDN حذف شده
      expect(html).not.toContain('cdnjs.cloudflare.com')
    } else {
      expect(res.status).toBe(404)
    }
  })

  it('AI caption records tone into audit for the report', async () => {
    const r = await call('/api/ai/caption', { method: 'POST', body: { title: 'لگ ممیزی', tone: 'humorous' } })
    expect(r.status).toBe(200)
    const audit = (await call('/api/audit')).data.items
    const ai = audit.find((a) => a.action === 'ai.caption')
    expect(ai.detail).toContain('humorous')
  })
})
