// @vitest-environment node
// فاز ۵ — ارسال مرسوله (carrier/tracking/گاه‌شمار)، پیامک mock روی ship،
// و پیام‌های خطای انگلیسی سمت سرور بر اساس Accept-Language.
process.env.PF_TEST = '1'
process.env.DATA_DIR = 'memory'
process.env.ADMIN_USER = 'admin'
process.env.ADMIN_PASS = 'ship5-pass'
process.env.SEED_DEMO_USERS = '1'

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

let server, DB, SMS, base, SESSION = ''

async function call(path, { method = 'GET', body, auth = true, lang } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(lang ? { 'accept-language': lang } : {}),
      ...(auth && SESSION ? { Cookie: `pf_session=${SESSION}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  let data = {}
  try { data = await res.clone().json() } catch { /* html */ }
  return { status: res.status, data, text: await res.text().catch(() => '') }
}

beforeAll(async () => {
  const mod = await import('../../server/index.js')
  server = mod.server
  DB = mod.DB
  SMS = mod.SMS
  await new Promise((res) => server.listen(0, '127.0.0.1', res))
  base = `http://127.0.0.1:${server.address().port}`
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'ship5-pass' }) })
  SESSION = (r.headers.get('set-cookie') || '').match(/pf_session=([^;]+)/)?.[1] || ''
})
afterAll(() => { server.close(); DB.raw.close() })

async function makePaidOrder() {
  const st = DB.getState()
  const p = st.products[0]
  const o = await call('/api/public/orders', { method: 'POST', auth: false, body: { buyer: 'مریم test', phone: '09121234567', address: 'تهران، کوچه تست، پلاک ۱۲', items: [{ id: p.id, qty: 1 }] } })
  expect(o.status).toBe(201)
  const ref = o.data.ref
  await fetch(base + `/api/public/orders/return?ref=${encodeURIComponent(ref)}&decision=ok`, { redirect: 'manual' })
  return ref
}

describe('shipment & timeline', () => {
  it('order timeline records created → paid steps', async () => {
    const ref = await makePaidOrder()
    const g = await call(`/api/public/orders/${ref}`, { auth: false })
    expect(g.status).toBe(200)
    expect(g.data.status).toBe('paid')
    const labels = g.data.timeline.map((x) => x.label)
    expect(labels).toEqual(['created', 'paid'])
    expect(g.data.timeline[1].ref_id).toBeTruthy()
  })

  it('ship stores carrier/tracking, appends timeline step, exposes to buyer API', async () => {
    const ref = await makePaidOrder()
    const s = await call(`/api/orders/${ref}/ship`, { method: 'POST', body: { carrier: 'تیپاکس', tracking: ' TX 123 456 ' } })
    expect(s.status).toBe(200)
    expect(s.data.status).toBe('shipped')
    expect(s.data.carrier).toBe('تیپاکس')
    expect(s.data.tracking).toBe('TX123456') // فاصله‌ها حذف
    const g = await call(`/api/public/orders/${ref}`, { auth: false })
    expect(g.data.status).toBe('shipped')
    expect(g.data.carrier).toBe('تیپاکس')
    expect(g.data.tracking).toBe('TX123456')
    expect(g.data.timeline.at(-1).label).toBe('shipped')
    expect(g.data.timeline.at(-1).by).toBe('admin')
    // در لیست ادمین هم باید دیده شود
    const list = await call('/api/orders')
    const row = list.data.items.find((x) => x.ref === ref)
    expect(row.carrier).toBe('تیپاکس')
    expect(row.timeline.at(-1).label).toBe('shipped')
  })

  it('ship only allowed from paid; double-ship rejected; no-perm 403', async () => {
    const st = DB.getState()
    const p = st.products[0]
    const w = await call('/api/public/orders', { method: 'POST', auth: false, body: { buyer: 'Ali', phone: '09129998877', address: 'کرج، خیابان تست ۵، واحد ۳', items: [{ id: p.id, qty: 1 }] } })
    const bad = await call(`/api/orders/${w.data.ref}/ship`, { method: 'POST', body: { carrier: 'پست' } })
    expect(bad.status).toBe(409)
    await fetch(base + `/api/public/orders/return?ref=${w.data.ref}&decision=ok`, { redirect: 'manual' })
    await call(`/api/orders/${w.data.ref}/ship`, { method: 'POST', body: {} })
    const again = await call(`/api/orders/${w.data.ref}/ship`, { method: 'POST', body: {} })
    expect(again.status).toBe(409)
    const anon = await call(`/api/orders/${w.data.ref}/ship`, { method: 'POST', auth: false, body: {} })
    expect(anon.status).toBeGreaterThanOrEqual(401) // بدون سشن → 401/403
  })

  it('ship triggers mock SMS to buyer phone with tracking tokens (never blocks)', async () => {
    const before = SMS.mockLog.length
    const ref = await makePaidOrder()
    const s = await call(`/api/orders/${ref}/ship`, { method: 'POST', body: { carrier: 'پیک', tracking: 'PK-9' } })
    expect(s.status).toBe(200)
    for (let i = 0; i < 20 && SMS.mockLog.length === before; i++) await new Promise((r2) => setTimeout(r2, 25))
    const msg = SMS.mockLog.at(-1)
    expect(msg.to).toBe('09121234567')
    expect(msg.template).toBe('tracking-code')
    expect(msg.tokens.tracking).toBe('PK-9')
    expect(msg.tokens.ref).toBe(ref)
  })

  it('cancel appends a timeline step with refund flag', async () => {
    const ref = await makePaidOrder()
    const c = await call(`/api/orders/${ref}/cancel`, { method: 'POST' })
    expect(c.status).toBe(200)
    const g = await call(`/api/public/orders/${ref}`, { auth: false })
    const last = g.data.timeline.at(-1)
    expect(last.label).toBe('cancelled')
    expect(last.refunded).toBe(true)
  })
})

describe('Accept-Language EN server messages', () => {
  it('order validation messages switch to English', async () => {
    const r = await call('/api/public/orders', { method: 'POST', auth: false, lang: 'en-US,en;q=0.9', body: { buyer: 'x', phone: '123', address: 'short', items: [] } })
    expect(r.status).toBe(422)
    expect(r.data.error).toMatch(/cart is empty/i)
    expect(r.data.fields.items).toMatch(/Invalid number/i)
  })

  it('field-level errors in English; fa default unchanged', async () => {
    const en = await call('/api/public/orders', { method: 'POST', auth: false, lang: 'en', body: { buyer: 'ab', phone: '555', address: 'a', items: [{ id: 1, qty: 1 }] } })
    expect(en.status).toBe(422)
    expect(en.data.fields.buyer).toMatch(/full name/i)
    expect(en.data.fields.phone).toMatch(/must start with 09/i)
    expect(en.data.fields.address).toMatch(/at least 10/i)
    const fa = await call('/api/public/orders', { method: 'POST', auth: false, body: { buyer: 'ab', phone: '555', address: 'a', items: [{ id: 1, qty: 1 }] } })
    expect(fa.data.fields.buyer).toContain('نام')
  })

  it('404 order and ship-conflict and coupon errors are localized', async () => {
    const nf = await call('/api/public/orders/PF-NOPE', { auth: false, lang: 'en' })
    expect(nf.data.error).toBe('Order not found.')
    const nfFa = await call('/api/public/orders/PF-NOPE', { auth: false })
    expect(nfFa.data.error).toContain('سفارش')
    const cp = await call('/api/public/coupons/verify', { method: 'POST', auth: false, lang: 'en', body: { code: '', amount: -5 } })
    expect(cp.data.error).toMatch(/valid coupon code/i)
  })
})
