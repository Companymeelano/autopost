// @vitest-environment node
// فاز ۴ — گزارش مالی، CSV، فاکتور چاپی
process.env.PF_TEST = '1'
process.env.DATA_DIR = 'memory'
process.env.ADMIN_USER = 'admin'
process.env.ADMIN_PASS = 'fin-test-9'
process.env.SEED_DEMO_USERS = '1'

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

let server, DB, base, SESSION = '', FIN = ''

async function call(path, { method = 'GET', body, auth = true } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(auth && SESSION ? { Cookie: `pf_session=${SESSION}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  let data = {}
  try { data = await res.clone().json() } catch { /* text */ }
  return { status: res.status, data, headers: res.headers, text: await res.text() }
}
async function login(u, p) {
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })
  return (r.headers.get('set-cookie') || '').match(/pf_session=([^;]+)/)?.[1] || ''
}

let paidRef = '', cancelledRef = '', couponOrderRef = ''
let expCollected = 0, expDiscounts = 0

beforeAll(async () => {
  const mod = await import('../../server/index.js')
  server = mod.server; DB = mod.DB
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
  SESSION = await login('admin', 'fin-test-9')
  FIN = await login('finance', 'finance123')

  // کوپن برای تست جمع‌آوری تخفیفات
  const st = await (await fetch(base + '/api/state', { headers: { cookie: `pf_session=${SESSION}` } })).json()
  st.coupons.push({ code: 'FIN15', percent: 15, maxUses: 0, used: 0, active: true })
  await fetch(base + '/api/state', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: `pf_session=${SESSION}` }, body: JSON.stringify(st) })

  const st2 = await (await fetch(base + '/api/state', { headers: { cookie: `pf_session=${SESSION}` } })).json()
  const p1 = st2.products[0], p2 = st2.products[1]

  // سفارش ۱: ساده، پرداخت‌شده
  let o = await call('/api/public/orders', { method: 'POST', auth: false, body: { buyer: 'رضا ک.', phone: '09120001111', address: 'تهران، امتحان کوچه الف، پلاک ۱۲', items: [{ id: p1.id, qty: 1 }] } })
  paidRef = o.data.ref
  expCollected += o.data.payable
  await fetch(base + `/api/public/orders/return?ref=${paidRef}&decision=ok`, { redirect: 'manual' })

  // سفارش ۲: با کوپن FIN15 → سپس لغو (استرداد)
  o = await call('/api/public/orders', { method: 'POST', auth: false, body: { buyer: 'نگار ب.', phone: '09120002222', address: 'اصفهان، چهارباغ، پلاک ۳۴', items: [{ id: p2.id, qty: 2 }], couponCode: 'FIN15' } })
  couponOrderRef = o.data.ref
  expDiscounts += o.data.discount
  await fetch(base + `/api/public/orders/return?ref=${couponOrderRef}&decision=ok`, { redirect: 'manual' })
  cancelledRef = couponOrderRef
  await call(`/api/orders/${cancelledRef}/cancel`, { method: 'POST' })
  // لغوشده از collected خارج است (status cancelled)
})

afterAll(() => { server.close(); DB.raw.close() })

describe('finance report', () => {
  it('aggregates only paid/shipped with refunds and coupons broken out', async () => {
    const r = await call('/api/finance/report')
    expect(r.status).toBe(200)
    const d = r.data
    expect(d.orderCount).toBe(1) // سفارش کوپن‌دار لغو شده
    expect(d.collected).toBe(expCollected)
    expect(d.gross).toBeGreaterThan(d.collected - 1) // gross = total سفارش پرداختی
    expect(d.refunds).toBeGreaterThan(0)
    expect(d.refundCount).toBe(1)
    expect(d.coupons.find((c) => c.code === 'FIN15')).toBeFalsy() // لغو → شمرده نمی‌شود
    expect(d.daily.length).toBeGreaterThanOrEqual(1)
    expect(d.byStatus.cancelled).toBe(1)
  })

  it('fee & net follow settings.gatewayFeePct', async () => {
    const st = await (await fetch(base + '/api/state', { headers: { cookie: `pf_session=${SESSION}` } })).json()
    st.settings.gatewayFeePct = 10
    await fetch(base + '/api/state', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: `pf_session=${SESSION}` }, body: JSON.stringify(st) })
    const r = await call('/api/finance/report')
    expect(r.data.feePct).toBe(10)
    expect(r.data.fee).toBe(Math.round(expCollected * 0.1))
    expect(r.data.net).toBe(expCollected - Math.round(expCollected * 0.1))
  })

  it('csv format: bom + header + rows', async () => {
    const res = await fetch(base + '/api/finance/report?format=csv', { headers: { cookie: `pf_session=${FIN}` } })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    const ab = await res.arrayBuffer()
    expect(new Uint8Array(ab)[0]).toBe(0xEF) // BOM utf8
    const txt = new TextDecoder('utf-8').decode(ab)
    expect(txt).toContain('date,paid_count,paid_total,cancel_count,cancel_refund')
    expect(txt.split('\n').length).toBeGreaterThanOrEqual(2)
  })

  it('permissions: editor 403, finance 200', async () => {
    const ED = await login('editor', 'editor123')
    const denied = await fetch(base + '/api/finance/report', { headers: { cookie: `pf_session=${ED}` } })
    expect(denied.status).toBe(403)
    const ok = await fetch(base + '/api/finance/report', { headers: { cookie: `pf_session=${FIN}` } })
    expect(ok.status).toBe(200)
  })
})

describe('printable invoice', () => {
  it('renders paid order with items, amounts, tracking code and print button', async () => {
    const res = await fetch(base + `/invoice/${paidRef}`)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain(paidRef)
    expect(html).toContain('ست ورزشی نایک پرایم')
    expect(html).toContain('کد رهگیری')
    expect(html).toContain('window.print()')
    expect(html).toContain('@media print')
    expect(html).toContain('پرداخت‌شده')
  })
  it('unknown ref → 404; malformed → 404 without touching DB', async () => {
    expect((await fetch(base + '/invoice/PF-NOPE-11')).status).toBe(404)
    expect((await fetch(base + '/invoice/%2e%2e%2f%2e%2e%2fpasswd')).status).toBe(404)
  })
})
