// @vitest-environment node
// فاز ۳ — فروشگاه عمومی: site API، ثبت/تسویه/لغو سفارش، کسر اتمیک موجودی، sitemap
process.env.PF_TEST = '1'
process.env.DATA_DIR = 'memory'
process.env.ADMIN_USER = 'admin'
process.env.ADMIN_PASS = 'site-test-pass'
process.env.SEED_DEMO_USERS = '1'

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

let server, DB, base, SESSION = ''

async function call(path, { method = 'GET', body, auth = true } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(auth && SESSION ? { Cookie: `pf_session=${SESSION}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  let data = {}
  try { data = await res.clone().json() } catch { /* non-json */ }
  return { status: res.status, data, headers: res.headers }
}

beforeAll(async () => {
  const mod = await import('../../server/index.js')
  server = mod.server
  DB = mod.DB
  await new Promise((res) => server.listen(0, '127.0.0.1', res))
  base = `http://127.0.0.1:${server.address().port}`
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'site-test-pass' }) })
  SESSION = (r.headers.get('set-cookie') || '').match(/pf_session=([^;]+)/)?.[1] || ''
  // کوپن فعال برای تست تخفیف روی سفارش
  const st = await (await fetch(base + '/api/state', { headers: { cookie: `pf_session=${SESSION}` } })).json()
  st.coupons.push({ code: 'SITE10', percent: 10, maxUses: 2, used: 0, active: true })
  await fetch(base + '/api/state', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: `pf_session=${SESSION}` }, body: JSON.stringify(st) })
})

afterAll(() => { server.close(); DB.raw.close() })

describe('public site API', () => {
  it('GET /api/public/site → products + published posts only + settings', async () => {
    const r = await fetch(base + '/api/public/site')
    expect(r.status).toBe(200)
    const d = await r.json()
    expect(d.products).toHaveLength(3)
    expect(d.products[0].title).toContain('نایک')
    expect(d.settings.siteName).toBeTruthy()
    expect(d.posts.every((p) => !p.status || p.status === 'undefined')).toBe(true) // status فیلترشده ارسال نمی‌شود
    expect(d.posts).toHaveLength(1) // فقط منتشرشده (draft بیرون)
    // base64 image لوگو به بیرون نمی‌رود
    expect(d.products.every((p) => p.image === '' || p.image.startsWith('/media/'))).toBe(true)
  })

  it('sitemap.xml lists products + published post; robots points to it', async () => {
    const sm = await fetch(base + '/sitemap.xml')
    expect(sm.status).toBe(200)
    expect(sm.headers.get('content-type')).toContain('application/xml')
    const xml = await sm.text()
    expect(xml).toContain('/#/product/2')
    expect(xml).toContain('/#/post/1')
    expect(xml).not.toContain('/#/post/2') // draft در sitemap نباشد
    const rb = await fetch(base + '/robots.txt')
    expect(await rb.text()).toContain('Sitemap:')
  })
})

describe('public orders: create → gateway → settle', () => {
  let ref = ''
  let stockBefore = 0

  it('rejects bogus payloads with field errors', async () => {
    const r = await call('/api/public/orders', { method: 'POST', auth: false, body: { buyer: 'ا', phone: '123', address: 'k', items: [{ id: 999, qty: 1 }] } })
    expect(r.status).toBe(422)
    expect(r.data.fields.buyer).toBeTruthy()
    expect(r.data.fields.phone).toBeTruthy()
    expect(r.data.fields.item_999).toBeTruthy()
  })

  it('rejects quantity above stock', async () => {
    const st = await (await fetch(base + '/api/state', { headers: { cookie: `pf_session=${SESSION}` } })).json()
    const target = st.products[1]
    const r = await call('/api/public/orders', { method: 'POST', auth: false, body: { buyer: 'سارا مرادی', phone: '09121234567', address: 'تهران، خیابان test، پلاک ۵', items: [{ id: target.id, qty: (target.stock ?? 5) + 50 }] } })
    expect(r.status).toBe(422)
    expect(r.data.fields['item_' + target.id]).toContain('موجودی')
  })

  it('computes totals from DB (client price lies ignored) and creates order', async () => {
    const st = await (await fetch(base + '/api/state', { headers: { cookie: `pf_session=${SESSION}` } })).json()
    const p1 = st.products[0]
    stockBefore = p1.stock
    const r = await call('/api/public/orders', {
      method: 'POST', auth: false,
      body: { buyer: 'سارا مرادی', phone: '۰۹۱۲۱۲۳۴۵۶۷', address: 'تهران، ولیعصر، کوچه بهار، پلاک ۵', items: [{ id: p1.id, qty: 2, price: 1 }], couponCode: 'site10' },
    })
    expect(r.status).toBe(201)
    ref = r.data.ref
    expect(ref).toMatch(/^PF-/)
    const expectedTotal = p1.price * 2
    expect(r.data.total).toBe(expectedTotal)
    expect(r.data.discount).toBe(Math.round(expectedTotal * 0.1))
    expect(r.data.payUrl).toContain('/gateway?ref=')
  })

  it('gateway page renders order summary (demo)', async () => {
    const r = await fetch(base + `/gateway?ref=${encodeURIComponent(ref)}`)
    expect(r.status).toBe(200)
    const html = await r.text()
    expect(html).toContain('درگاه پرداخت')
    expect(html).toContain(ref)
  })

  it('decision=ok settles: order paid + stock decremented + coupon used + rev bumped', async () => {
    const revBefore = DB.getRev()
    const r = await fetch(base + `/api/public/orders/return?ref=${encodeURIComponent(ref)}&decision=ok`, { redirect: 'manual' })
    expect(r.status).toBe(302)
    expect(r.headers.get('location')).toBe(`/#/order/${ref}`)
    // استوک کسر و sold زیاد شده — هم در state ادمین
    const st = await (await fetch(base + '/api/state', { headers: { cookie: `pf_session=${SESSION}` } })).json()
    const p1 = st.products[0]
    expect(p1.stock).toBe(stockBefore - 2)
    expect(p1.sold).toBe(142)
    expect(DB.getRev()).toBeGreaterThan(revBefore)
    // کوپن مصرف شد
    expect(st.coupons.find((c) => c.code === 'SITE10').used).toBe(1)
    // سفارش public status
    const o = await (await fetch(base + '/api/public/orders/' + ref)).json()
    expect(o.status).toBe('paid')
    expect(o.refId).toBeTruthy()
    // تراکنش برای گزارش‌های داشبورد ثبت شد (paid)
    const stx = DB.getState()
    expect(stx.settings).toBeTruthy()
    const txList = (await call('/api/transactions')).data.items
    const mine = txList.find((t) => t.description.includes(ref))
    expect(mine.status).toBe('paid')
  })

  it('double settle is idempotent (stock not decremented twice)', async () => {
    const st1 = await (await fetch(base + '/api/state', { headers: { cookie: `pf_session=${SESSION}` } })).json()
    await fetch(base + `/api/public/orders/return?ref=${encodeURIComponent(ref)}&decision=ok`, { redirect: 'manual' })
    const st2 = await (await fetch(base + '/api/state', { headers: { cookie: `pf_session=${SESSION}` } })).json()
    expect(st2.products[0].stock).toBe(st1.products[0].stock)
  })

  it('decision=fail marks order failed and stock untouched', async () => {
    const st = await (await fetch(base + '/api/state', { headers: { cookie: `pf_session=${SESSION}` } })).json()
    const before = st.products[2].stock
    const o1 = await call('/api/public/orders', { method: 'POST', auth: false, body: { buyer: 'مهدی رستمی', phone: '09129876543', address: 'اصفهان، چهارباغ بالا، پلاک ۱۲', items: [{ id: st.products[2].id, qty: 3 }] } })
    expect(o1.status).toBe(201)
    await fetch(base + `/api/public/orders/return?ref=${o1.data.ref}&decision=ko`, { redirect: 'manual' })
    const o2 = await (await fetch(base + '/api/public/orders/' + o1.data.ref)).json()
    expect(o2.status).toBe('failed')
    const st2 = await (await fetch(base + '/api/state', { headers: { cookie: `pf_session=${SESSION}` } })).json()
    expect(st2.products[2].stock).toBe(before)
  })

  it('maintenance mode blocks orders', async () => {
    const st = await (await fetch(base + '/api/state', { headers: { cookie: `pf_session=${SESSION}` } })).json()
    st.settings.maintenance = true
    await fetch(base + '/api/state', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: `pf_session=${SESSION}` }, body: JSON.stringify(st) })
    const r = await call('/api/public/orders', { method: 'POST', auth: false, body: { buyer: 'تست تست', phone: '09121112233', address: 'آدرس کامل تستی ۱۲۳', items: [{ id: 1, qty: 1 }] } })
    expect(r.status).toBe(503)
    const site = await fetch(base + '/api/public/site')
    expect(site.status).toBe(503)
    const st2 = await (await fetch(base + '/api/state', { headers: { cookie: `pf_session=${SESSION}` } })).json()
    st2.settings.maintenance = false
    await fetch(base + '/api/state', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: `pf_session=${SESSION}` }, body: JSON.stringify(st2) })
  })
})

describe('admin orders management', () => {
  let ref = ''
  it('lists orders; editor 403, finance ok', async () => {
    // سفارشی با کوپن SITE10 بساز و پرداخت کن
    const st = await (await fetch(base + '/api/state', { headers: { cookie: `pf_session=${SESSION}` } })).json()
    const o = await call('/api/public/orders', { method: 'POST', auth: false, body: { buyer: 'Ali Rezaei', phone: '09122223344', address: 'مشهد، Vakil Blvd, No 9', items: [{ id: st.products[1].id, qty: 2 }] } })
    ref = o.data.ref
    await fetch(base + `/api/public/orders/return?ref=${ref}&decision=ok`, { redirect: 'manual' })

    const ed = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'editor', password: 'editor123' }) })
    const edTok = (ed.headers.get('set-cookie') || '').match(/pf_session=([^;]+)/)?.[1]
    const denied = await fetch(base + '/api/orders', { headers: { cookie: `pf_session=${edTok}` } })
    expect(denied.status).toBe(403)

    const l = await call('/api/orders')
    expect(l.status).toBe(200)
    expect(l.data.items[0].ref).toBe(ref)
    expect(l.data.items[0].items).toHaveLength(1)
  })

  it('ship transitions paid→shipped; cancel restores stock', async () => {
    const st1 = await (await fetch(base + '/api/state', { headers: { cookie: `pf_session=${SESSION}` } })).json()
    const s1 = st1.products[1].stock
    const ok = await call(`/api/orders/${ref}/ship`, { method: 'POST' })
    expect(ok.status).toBe(200)
    expect(ok.data.status).toBe('shipped')
    // ship دوباره باید رد شود
    expect((await call(`/api/orders/${ref}/ship`, { method: 'POST' })).status).toBe(409)
    // لغو روی shipped رد شود
    expect((await call(`/api/orders/${ref}/cancel`, { method: 'POST' })).status).toBe(409)

    // سفارش جدید → لغو → بازگشت موجودی
    const o = await call('/api/public/orders', { method: 'POST', auth: false, body: { buyer: 'Test Cancel', phone: '09125556677', address: 'Tehran Test St 1', items: [{ id: st1.products[1].id, qty: 4 }] } })
    await fetch(base + `/api/public/orders/return?ref=${o.data.ref}&decision=ok`, { redirect: 'manual' })
    const st2 = await (await fetch(base + '/api/state', { headers: { cookie: `pf_session=${SESSION}` } })).json()
    expect(st2.products[1].stock).toBe(s1 - 4)
    const c = await call(`/api/orders/${o.data.ref}/cancel`, { method: 'POST' })
    expect(c.status).toBe(200)
    expect(c.data.refunded).toBe(true)
    const st3 = await (await fetch(base + '/api/state', { headers: { cookie: `pf_session=${SESSION}` } })).json()
    expect(st3.products[1].stock).toBe(s1)
    expect(st3.products[1].sold).toBe(st2.products[1].sold - 4)
  })

  it('audit trail contains order lifecycle actions', async () => {
    const r = await call('/api/audit?limit=50')
    const actions = r.data.items.map((i) => i.action)
    expect(actions).toContain('order.create')
    expect(actions).toContain('order.paid')
    expect(actions).toContain('order.ship')
    expect(actions).toContain('order.cancel')
  })
})
