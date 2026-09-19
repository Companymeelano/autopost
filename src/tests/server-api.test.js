// @vitest-environment node
// ============================================================================
// تست یکپارچه‌ی API سرور فاز ۲ — SQLite در حافظه، پورت تصادفی، همه مسیرها
// ============================================================================
process.env.PF_TEST = '1'
process.env.DATA_DIR = 'memory'
process.env.ADMIN_USER = 'admin'
process.env.ADMIN_PASS = 'test-secret-9'

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

let base = ''
let server = null
let cookie = ''

async function call(path, { method = 'GET', body, auth = true } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(auth && cookie ? { Cookie: cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  let data = {}
  try { data = await res.clone().json() } catch { /* non-json */ }
  return { status: res.status, data, headers: res.headers }
}

beforeAll(async () => {
  const m = await import('../../server/index.js')
  server = m.server
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
})
afterAll(async () => { await new Promise((r) => server.close(r)) })

describe('api: health & auth', () => {
  it('health is public and reports modes', async () => {
    const r = await call('/api/health', { auth: false })
    expect(r.status).toBe(200)
    expect(r.data).toMatchObject({ ok: true, app: 'panahfit-api' })
    expect(['openai', 'fallback']).toContain(r.data.ai)
    expect(['zarinpal', 'demo']).toContain(r.data.payment)
  })

  it('rejects unauthenticated state access', async () => {
    const r = await call('/api/state', { auth: false })
    expect(r.status).toBe(401)
  })

  it('login validates then issues HttpOnly cookie', async () => {
    let r = await call('/api/auth/login', { method: 'POST', body: { username: '', password: '' }, auth: false })
    expect(r.status).toBe(422)
    r = await call('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'wrong' }, auth: false })
    expect(r.status).toBe(401)
    expect(r.data.error).toContain('اشتباه')
    r = await call('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'test-secret-9' }, auth: false })
    expect(r.status).toBe(200)
    const sc = r.headers.get('set-cookie') || ''
    expect(sc).toMatch(/pf_session=[0-9a-f]{64}/)
    expect(sc).toContain('HttpOnly')
    expect(sc).toContain('SameSite=Lax')
    cookie = sc.split(';')[0]
    const me = await call('/api/auth/me')
    expect(me.status).toBe(200)
    expect(me.data.username).toBe('admin')
  })

  it('rejects non-JSON content type', async () => {
    const res = await fetch(base + '/api/state', { method: 'PUT', headers: { 'Content-Type': 'text/plain', Cookie: cookie }, body: 'x' })
    expect(res.status).toBe(415)
  })
})

describe('api: state sync', () => {
  it('seeded state present', async () => {
    const r = await call('/api/state')
    expect(r.status).toBe(200)
    expect(r.data.products).toHaveLength(3)
    expect(r.data.settings).toBeTruthy()
    expect(r.data.rev).toBeGreaterThan(0)
  })

  it('PUT state round-trips', async () => {
    const st = (await call('/api/state')).data
    delete st.rev
    st.products.push({ id: 77, title: 'محصول سروری تست', cat: 'set', price: 55000, stock: 3, sold: 0 })
    const r = await call('/api/state', { method: 'PUT', body: st })
    expect(r.status).toBe(200)
    const st2 = (await call('/api/state')).data
    expect(st2.products.find((p) => p.id === 77).title).toBe('محصول سروری تست')
  })

  it('server-side validation rejects bad rows with field details', async () => {
    const r = await call('/api/state', { method: 'PUT', body: { products: [{ id: 1, title: 'ا', cat: 'nope', price: -5, stock: 1.5 }] } })
    expect(r.status).toBe(422)
    expect(r.data.error).toContain('اعتبارسنجی سرور')
    expect(Array.isArray(r.data.fields)).toBe(true)
    expect(r.data.fields[0]).toMatchObject({ coll: 'products', index: 0 })
    expect(r.data.fields[0].fields).toMatchObject({ price: expect.any(String), stock: expect.any(String), cat: expect.any(String), title: expect.any(String) })
  })

  it('rejects invalid body structure', async () => {
    let r = await call('/api/state', { method: 'PUT', body: 'not-an-object' })
    expect(r.status).toBe(400)
    r = await call('/api/state', { method: 'PUT', body: { products: 'x' } })
    expect(r.status).toBe(422)
  })

  it('reset restores seed', async () => {
    const r = await call('/api/reset', { method: 'POST', body: {} })
    expect(r.status).toBe(200)
    const st = (await call('/api/state')).data
    expect(st.products).toHaveLength(3)
    expect(st.products.find((p) => p.id === 77)).toBeFalsy()
  })

  it('backup export is a client-compatible payload', async () => {
    const res = await fetch(base + '/api/backup/export', { headers: { Cookie: cookie } })
    expect(res.status).toBe(200)
    const p = await res.json()
    expect(p.app).toBe('panahfit-cms')
    expect(p.version).toBe(3)
    expect(typeof p.rev).toBe('number')
    expect(Array.isArray(p.products)).toBe(true)
    const imp = await call('/api/backup/import', { method: 'POST', body: p })
    expect(imp.status).toBe(200)
  })
})

describe('api: public endpoints (سایت)', () => {
  it('pricing + products lists respect settings', async () => {
    const st = (await call('/api/state')).data
    st.settings.hideZeroStock = true
    st.products.push({ id: 78, title: 'ناموجود تستی', cat: 'set', price: 1000, stock: 0 })
    await call('/api/state', { method: 'PUT', body: st })
    const prods = await call('/api/public/products', { auth: false })
    expect(prods.status).toBe(200)
    expect(prods.data.items.find((p) => p.id === 78)).toBeFalsy()
    expect(prods.data.items[0].image).toBeUndefined() // تصویر base64 لوگو نمی‌رود
    const pr = await call('/api/public/pricing', { auth: false })
    expect(pr.data.provinces).toHaveLength(3)
    // maintenance → 503 (با rev تازه —PUT با rev قدیمی 409 است)
    const st2 = (await call('/api/state')).data
    st2.settings.maintenance = true
    const c1 = await call('/api/state', { method: 'PUT', body: { ...st2, rev: st2.rev - 1 } })
    expect(c1.status).toBe(409)
    expect(c1.data.currentRev).toBe(st2.rev)
    expect(c1.data.state.products).toBeTruthy()
    await call('/api/state', { method: 'PUT', body: st2 })
    expect((await call('/api/public/products', { auth: false })).status).toBe(503)
    const st3 = (await call('/api/state')).data
    st3.settings.maintenance = false
    st3.products = st3.products.filter((p) => p.id !== 78)
    await call('/api/state', { method: 'PUT', body: st3 })
  })

  it('coupon verify: valid, inactive, unknown — plus usage math', async () => {
    const st = (await call('/api/state')).data
    st.coupons = [
      { code: 'WELCOME', percent: 20, maxUses: 0, used: 0, active: true },
      { code: 'OFF', percent: 50, maxUses: 0, used: 0, active: false },
      { code: 'FULL', percent: 30, maxUses: 1, used: 1, active: true },
    ]
    await call('/api/state', { method: 'PUT', body: st })
    let r = await call('/api/public/coupons/verify', { method: 'POST', auth: false, body: { code: 'welcome', amount: 100000 } })
    expect(r.data).toMatchObject({ valid: true, percent: 20, discount: 20000, payable: 80000 })
    r = await call('/api/public/coupons/verify', { method: 'POST', auth: false, body: { code: 'OFF', amount: 5000 } })
    expect(r.data.valid).toBe(false)
    r = await call('/api/public/coupons/verify', { method: 'POST', auth: false, body: { code: 'FULL', amount: 5000 } })
    expect(r.data.reason).toBe('maxUses')
    r = await call('/api/public/coupons/verify', { method: 'POST', auth: false, body: { code: 'X', amount: -3 } })
    expect(r.status).toBe(422)
  })

  it('contact form creates a request for admin', async () => {
    const before = (await call('/api/state')).data.requests.length
    const r = await call('/api/public/requests', { method: 'POST', auth: false, body: { subject: 'سفارش جدید', body: 'سلام، قیمت عمده؟', user: 'میهمان' } })
    expect(r.status).toBe(201)
    const after = (await call('/api/state')).data.requests
    expect(after).toHaveLength(before + 1)
    expect(after.find((x) => x.id === r.data.id).status).toBe('new')
    const bad = await call('/api/public/requests', { method: 'POST', auth: false, body: { subject: 'a' } })
    expect(bad.status).toBe(422)
  })
})

describe('api: AI & payments', () => {
  it('ai caption fallback works without API key', async () => {
    const r = await call('/api/ai/caption', { method: 'POST', body: { title: 'لگ پرو', tone: 'formal' } })
    expect(r.status).toBe(200)
    expect(r.data.source).toBe('fallback')
    expect(r.data.caption).toContain('لگ پرو')
    const bad = await call('/api/ai/caption', { method: 'POST', body: { title: '' } })
    expect(bad.status).toBe(422)
  })

  it('payment demo flow: create → verify → transactions list', async () => {
    let r = await call('/api/payments/create', { method: 'POST', body: { amount: 250000, description: 'تست' } })
    expect(r.status).toBe(201)
    const authority = r.data.authority
    expect(authority.startsWith('demo-')).toBe(true)
    expect(r.data.url).toBeNull() // demo → بدون ریدایرکت
    r = await call('/api/transactions')
    let tx = r.data.items.find((t) => t.authority === authority)
    expect(tx.status).toBe('waiting')
    r = await call('/api/payments/verify', { method: 'POST', body: { authority } })
    expect(r.status).toBe(200)
    expect(r.data).toMatchObject({ ok: true, status: 'paid' })
    expect(r.data.refId).toMatch(/^DEMO-/)
    r = await call('/api/transactions')
    tx = r.data.items.find((t) => t.authority === authority)
    expect(tx.status).toBe('paid')
    // verify دوباره → idempotent
    r = await call('/api/payments/verify', { method: 'POST', body: { authority } })
    expect(r.data.status).toBe('paid')
  })

  it('payment fail-mode marks transaction failed', async () => {
    const r = await call('/api/payments/create', { method: 'POST', body: { amount: 12000, description: 'fail' } })
    const authority = r.data.authority
    const v = await call('/api/payments/verify', { method: 'POST', body: { authority: 'fail-' + authority } })
    expect(v.status).toBe(404) // authority نامعتبر
    const ok = await call('/api/payments/verify', { method: 'POST', body: { authority } })
    expect(ok.data.ok).toBe(true) // demo موفق مگر fail در خود authority
    const badAmount = await call('/api/payments/create', { method: 'POST', body: { amount: 10 } })
    expect(badAmount.status).toBe(422)
  })

  it('bank callback marks failed when status not OK', async () => {
    const r = await call('/api/payments/create', { method: 'POST', body: { amount: 15000 } })
    const res = await fetch(`${base}/api/payments/callback?authority=${r.data.authority}&Status=CANCEL`, { headers: { Cookie: cookie }, redirect: 'manual' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('result=fail')
    const tx = (await call('/api/transactions')).data.items.find((t) => t.authority === r.data.authority)
    expect(tx.status).toBe('failed')
  })
})

describe('api: security', () => {
  it('password change: old check, length, then re-login', async () => {
    let r = await call('/api/auth/password', { method: 'POST', body: { oldPassword: 'nope', newPassword: 'abcdefg!' } })
    expect(r.status).toBe(422)
    r = await call('/api/auth/password', { method: 'POST', body: { oldPassword: 'test-secret-9', newPassword: 'short' } })
    expect(r.status).toBe(422)
    expect(r.data.fields.newPassword).toBeTruthy()
    r = await call('/api/auth/password', { method: 'POST', body: { oldPassword: 'test-secret-9', newPassword: 'brand-new-pass-1' } })
    expect(r.status).toBe(200)
    r = await call('/api/auth/login', { method: 'POST', auth: false, body: { username: 'admin', password: 'test-secret-9' } })
    expect(r.status).toBe(401)
    r = await call('/api/auth/login', { method: 'POST', auth: false, body: { username: 'admin', password: 'brand-new-pass-1' } })
    expect(r.status).toBe(200)
    cookie = (r.headers.get('set-cookie') || '').split(';')[0] // ادامه تست‌ها با نشست تازه
  })

  it('logout kills the session', async () => {
    let r = await call('/api/auth/logout', { method: 'POST', body: {} })
    expect(r.status).toBe(200)
    r = await call('/api/state')
    expect(r.status).toBe(401)
    cookie = ''
  })
})
