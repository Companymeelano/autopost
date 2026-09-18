// @vitest-environment node
// فاز ۴ — Web Push: اشتراک، VAPID واقعی، رمزنگاری aes128gcm در برابر stub سرویس اشتراک
process.env.PF_TEST = '1'
process.env.DATA_DIR = 'memory'
process.env.ADMIN_USER = 'admin'
process.env.ADMIN_PASS = 'push-test-9'
process.env.SEED_DEMO_USERS = '1'

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { clientKeys, pushDecrypt, verifyVapidJwt } from '../../server/push.js'

let server, DB, PUSH, base, SESSION = ''
let stub, stubPort
const hits = []
let stubMode = 'ok'
const ck = clientKeys()

async function call(path, { method = 'GET', body, auth = true } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(auth && SESSION ? { Cookie: `pf_session=${SESSION}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  let data = {}
  try { data = await res.clone().json() } catch { /* non-json */ }
  return { status: res.status, data, headers: res.headers }
}

beforeAll(async () => {
  stub = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      hits.push({ headers: req.headers, body: Buffer.concat(chunks) })
      res.writeHead(stubMode === 'gone' ? 410 : 201)
      res.end()
    })
  })
  stub.keepAliveTimeout = 0
  await new Promise((r) => stub.listen(0, '127.0.0.1', r))
  stubPort = stub.address().port

  const mod = await import('../../server/index.js')
  server = mod.server; DB = mod.DB; PUSH = mod.PUSH
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'push-test-9' }) })
  SESSION = (r.headers.get('set-cookie') || '').match(/pf_session=([^;]+)/)?.[1] || ''
})

afterAll(() => { server.close(); stub.close(); DB.raw.close() })

describe('push subscription API', () => {
  it('public-key exposes VAPID public (65B raw) even in demo mode', async () => {
    const r = await call('/api/push/public-key', { auth: false })
    expect(r.status).toBe(200)
    expect(r.data.enabled).toBe(true)
    expect(['demo', 'vapid-env']).toContain(r.data.mode)
    expect(Buffer.from(r.data.key, 'base64url').length).toBe(65)
  })

  it('subscribe: valid https-style local endpoint ok; bogus rejected', async () => {
    const ok = await call('/api/push/subscribe', { method: 'POST', auth: false, body: { endpoint: `http://127.0.0.1:${stubPort}/p/one`, keys: { p256dh: ck.p256dh, auth: ck.auth } } })
    expect(ok.status).toBe(201)
    expect(ok.data.subs).toBe(1)
    const dup = await call('/api/push/subscribe', { method: 'POST', auth: false, body: { endpoint: `http://127.0.0.1:${stubPort}/p/one`, keys: { p256dh: ck.p256dh, auth: ck.auth } } })
    expect(dup.data.subs).toBe(1) // upsert نه ردیف دوتا
    const evil = await call('/api/push/subscribe', { method: 'POST', auth: false, body: { endpoint: 'http://evil.example.com/p', keys: { p256dh: ck.p256dh, auth: ck.auth } } })
    expect(evil.status).toBe(422)
    const badKeys = await call('/api/push/subscribe', { method: 'POST', auth: false, body: { endpoint: `http://127.0.0.1:${stubPort}/p/x`, keys: { p256dh: 'xx', auth: 'yy' } } })
    expect(badKeys.status).toBe(422)
  })

  it('list is admin-only and hides secrets', async () => {
    const ed = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'editor', password: 'editor123' }) })
    const edTok = (ed.headers.get('set-cookie') || '').match(/pf_session=([^;]+)/)?.[1]
    expect((await fetch(base + '/api/push', { headers: { cookie: `pf_session=${edTok}` } })).status).toBe(403)
    const l = await call('/api/push')
    expect(l.data.total).toBe(1)
    expect(l.data.items[0].endpoint).toContain('127.0.0.1')
    expect(JSON.stringify(l.data)).not.toContain(ck.auth)
  })

  it('test push delivers real encrypted VAPID payload verified & decrypted by client keys', async () => {
    const t = await call('/api/push/test', { method: 'POST' })
    expect(t.status).toBe(200)
    expect(t.data.sent, JSON.stringify(t.data)).toBe(1)
    const h = hits[hits.length - 1]
    expect(h.headers['ttl']).toBe('60')
    expect(h.headers['content-encoding']).toBe('aes128gcm')
    expect(h.headers['crypto-key']).toContain('dh=')
    const auth = String(h.headers.authorization || '')
    expect(auth.startsWith('vapid t=')).toBe(true)
    const [, jwtPart, kPart] = auth.match(/vapid t=([^,]+), k=(.+)/) || []
    const pubRaw = Buffer.from(PUSH.publicKey(), 'base64url')
    expect(Buffer.from(kPart.trim(), 'base64url').equals(pubRaw)).toBe(true)
    expect(verifyVapidJwt(jwtPart, pubRaw)).toBe(true)
    const plain = pushDecrypt(h.body, ck.private, ck.auth)
    const payload = JSON.parse(plain)
    expect(payload.title).toContain('آزمون')
    expect(payload.url).toBe('/#/settings')
  })

  it('order.paid triggers a site push (fire-and-forget hook)', async () => {
    const before = hits.length
    const st = await (await fetch(base + '/api/state', { headers: { cookie: `pf_session=${SESSION}` } })).json()
    const o = await call('/api/public/orders', { method: 'POST', auth: false, body: { buyer: 'پوش تستی', phone: '09121231234', address: 'تهران پوش کوچه ۱ پلاک ۲', items: [{ id: st.products[0].id, qty: 1 }] } })
    await fetch(base + `/api/public/orders/return?ref=${o.data.ref}&decision=ok`, { redirect: 'manual' })
    for (let i = 0; i < 50 && hits.length === before; i++) await new Promise((r) => setTimeout(r, 20))
    expect(hits.length).toBeGreaterThan(before)
    const payload = JSON.parse(pushDecrypt(hits[hits.length - 1].body, ck.private, ck.auth))
    expect(payload.title).toContain('سفارش پرداخت شد')
    expect(payload.url).toContain('/#/order/')
  })

  it('410 Gone prunes the subscription automatically', async () => {
    stubMode = 'gone'
    const t = await call('/api/push/test', { method: 'POST' })
    expect(t.data.removed).toBe(1)
    const l = await call('/api/push')
    expect(l.data.total).toBe(0)
    stubMode = 'ok'
  })

  it('unsubscribe on missing endpoint → ok:false', async () => {
    const r = await call('/api/push/unsubscribe', { method: 'POST', auth: false, body: { endpoint: 'http://nope/x' } })
    expect(r.status).toBe(200)
    expect(r.data.ok).toBe(false)
  })

  it('health reports push mode', async () => {
    const h = await fetch(base + '/api/health')
    const d = await h.json()
    expect(String(d.push)).toMatch(/^(demo|vapid-env):\d+$/)
  })
})
