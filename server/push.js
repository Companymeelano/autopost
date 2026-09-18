// ============================================================================
// فاز ۴ — Web Push نیتیو (بدون وابستگی خارجی)
// • VAPID طبق RFC 8292: JWT ES256 روی کلید EC P-256
// • رمزنگاری payload طبق RFC 8291 + RFC 8188 (Content-Encoding: aes128gcm):
//     PRK = HMAC-SHA256(key=ua-auth, data=ECDH-shared)
//     CEK = HKDF-Expand(PRK, 0x0010||"Content-Encoding: aes128gcm"||0x00)[0..16)
//     IV  = HKDF-Expand(PRK, 0x000c||"Content-Encoding: nonce"||0x00)[0..12)
//   — دقیقاً همان چیزی که مرورگرها (Rust web-push) اعمال می‌کنند
// • در نبود VAPID_PRIVATE، جفت‌کلید درون‌فرآیندی (دمو؛ با ریست سرور عوض می‌شود)
// ============================================================================
import crypto from 'node:crypto'

const b64u = (buf) => Buffer.from(buf).toString('base64url')
const fromB64u = (s) => Buffer.from(String(s), 'base64url')
const concat = (...parts) => Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p))))
const SPKI_PREFIX = Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex')

const pubFromRaw = (raw65) => crypto.createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw65]), format: 'der', type: 'spki' })
const rawFromPub = (pubKey) => Buffer.from(pubKey.export({ type: 'spki', format: 'der' }).subarray(-65))

/* ---------- VAPID ---------- */
export function generateVapid(subject = 'mailto:admin@panahfit.local') {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const raw = rawFromPub(publicKey)
  return { subject, privateKey, publicRaw65: raw, publicKeyB64: b64u(raw) }
}

export function vapidJwt(vapid, aud) {
  const header = b64u(JSON.stringify({ alg: 'ES256', typ: 'JWT' }))
  const claims = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 43_200, sub: vapid.subject }))
  const signing = `${header}.${claims}`
  const der = crypto.sign('sha256', Buffer.from(signing), vapid.privateKey)
  const seq = der[0] === 0x30 ? der.subarray(2) : der
  const rl = seq[1]
  const r = seq.subarray(2, 2 + rl)
  const off = 2 + rl
  const sl = seq[off + 1]
  const s = seq.subarray(off + 2, off + 2 + sl)
  const trim0 = (x) => { let i = 0; while (i < x.length - 1 && x[i] === 0x00) i++; return x.subarray(i) }
  const pad32 = (x) => { const y = trim0(x); return y.length === 32 ? y : concat(Buffer.alloc(32 - y.length), y) }
  return `${signing}.${b64u(concat(pad32(r), pad32(s)))}`
}

/** اعتبارسنجی امضای VAPID (تست/سمت سرویس اشتراک) */
export function verifyVapidJwt(jwt, publicRaw65) {
  const [h, c, sig] = String(jwt).split('.')
  if (!h || !c || !sig) return false
  const raw = fromB64u(sig)
  if (raw.length !== 64) return false
  const trim = (x) => { let i = 0; while (i < x.length - 1 && x[i] === 0) i++; const y = x.subarray(i); return y[0] & 0x80 ? Buffer.concat([Buffer.alloc(1), y]) : y }
  const enc = (x) => concat(Buffer.from([0x02, x.length]), x)
  const body = concat(enc(trim(raw.subarray(0, 32))), enc(trim(raw.subarray(32, 64))))
  const der = Buffer.concat([Buffer.from([0x30, body.length]), body])
  return crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: pubFromRaw(Buffer.from(publicRaw65)), dsaEncoding: 'der' }, der)
}

/* ---------- رمزنگاری aes128gcm ---------- */
function derive(shared, authSecret) {
  const prk = crypto.createHmac('sha256', authSecret).update(shared).digest()
  const infoCek = concat(Buffer.from([0x00, 0x10]), Buffer.from('Content-Encoding: aes128gcm'), Buffer.from([0x00]))
  const infoIv = concat(Buffer.from([0x00, 0x0c]), Buffer.from('Content-Encoding: nonce'), Buffer.from([0x00]))
  const cek = crypto.createHmac('sha256', prk).update(concat(infoCek, Buffer.from([0x01]))).digest().subarray(0, 16)
  const iv = crypto.createHmac('sha256', prk).update(concat(infoIv, Buffer.from([0x01]))).digest().subarray(0, 12)
  return { cek, iv }
}

/** رمزنگاری برای یک مشترک؛ خروجی = بدنهٔ کامل درخواست (salt||rs||idlen||ephPub||ciphertext+tag) */
export function pushEncrypt(payloadStr, uaPublicB64, uaAuthB64) {
  const uaPub = fromB64u(uaPublicB64)
  if (uaPub.length !== 65 || uaPub[0] !== 0x04) throw new Error('push: p256dh نامعتبر است')
  const authSecret = fromB64u(uaAuthB64)
  if (authSecret.length !== 16) throw new Error('push: auth secret نامعتبر است')
  const eph = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const ephRaw = rawFromPub(eph.publicKey)
  const shared = crypto.diffieHellman({ privateKey: eph.privateKey, publicKey: pubFromRaw(uaPub) })
  const { cek, iv } = derive(shared, authSecret)
  const enc = crypto.createCipheriv('aes-128-gcm', cek, iv)
  const ct = concat(enc.update(Buffer.concat([Buffer.from(payloadStr, 'utf8'), Buffer.from([0x02])])), enc.final(), enc.getAuthTag())
  const salt = crypto.randomBytes(16)
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096)
  return { body: Buffer.concat([salt, rs, Buffer.from([65]), ephRaw, ct]), ephRaw }
}

/** رمزگشایی با کلید خصوصی مشترک (معکوس؛ در تست‌ها و stub سرویس استفاده می‌شود) */
export function pushDecrypt(bodyBuf, uaPrivateKey, uaAuthB64) {
  const b = Buffer.isBuffer(bodyBuf) ? bodyBuf : Buffer.from(bodyBuf)
  const ephRaw = b.subarray(21, 86)
  const rest = b.subarray(86)
  const ct = rest.subarray(0, rest.length - 16)
  const tag = rest.subarray(rest.length - 16)
  const shared = crypto.diffieHellman({ privateKey: uaPrivateKey, publicKey: pubFromRaw(ephRaw) })
  const { cek, iv } = derive(shared, fromB64u(uaAuthB64))
  const dec = crypto.createDecipheriv('aes-128-gcm', cek, iv)
  dec.setAuthTag(tag)
  const padded = Buffer.concat([dec.update(ct), dec.final()])
  let end = padded.length
  while (end > 0 && padded[end - 1] === 0x00) end--
  if (padded[end - 1] === 0x02) end--
  return padded.subarray(0, end).toString('utf8')
}

/** تولید جفت‌کلید مشترک (برای تست/شبیه‌سازی pushManager مرورگر) */
export function clientKeys() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  return { private: privateKey, p256dh: b64u(rawFromPub(publicKey)), auth: b64u(crypto.randomBytes(16)) }
}

/* ---------- سرویس ---------- */
export function createPushService(ENV, DB) {
  const subject = ENV.VAPID_SUBJECT || 'mailto:admin@panahfit.local'
  let vapid = null
  let mode = 'demo'
  if (ENV.VAPID_PUBLIC && ENV.VAPID_PRIVATE) {
    try {
      const priv = String(ENV.VAPID_PRIVATE).trim().startsWith('-----')
        ? crypto.createPrivateKey(ENV.VAPID_PRIVATE)
        : crypto.createPrivateKey({ key: JSON.parse(ENV.VAPID_PRIVATE), format: 'jwk' })
      vapid = { subject, privateKey: priv, publicRaw65: fromB64u(ENV.VAPID_PUBLIC), publicKeyB64: String(ENV.VAPID_PUBLIC) }
      mode = 'vapid-env'
    } catch (e) { console.error('[push] کلید VAPID نامعتبر؛ حالت دمو:', e.message) }
  }
  if (!vapid) vapid = generateVapid(subject)

  async function deliver(sub, payload) {
    const { body, ephRaw } = pushEncrypt(JSON.stringify(payload), sub.keys.p256dh, sub.keys.auth)
    const u = new URL(sub.endpoint)
    const jwt = vapidJwt(vapid, `${u.protocol}//${u.host}`)
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 3000)
    try {
      const res = await fetch(sub.endpoint, {
        method: 'POST', signal: ctrl.signal,
        headers: {
          TTL: '60',
          'Content-Type': 'application/octet-stream',
          'Content-Encoding': 'aes128gcm',
          'Crypto-Key': `keyid=P256DH;dh=${b64u(ephRaw)}`,
          Authorization: `vapid t=${jwt}, k=${vapid.publicKeyB64}`,
        },
        body: Uint8Array.from(body),
      })
      if (process.env.PUSH_DEBUG && !(res.status >= 200 && res.status < 300)) console.error('[push-deliver] status', res.status)
      return { status: res.status, ok: res.status >= 200 && res.status < 300, gone: res.status === 404 || res.status === 410 }
    } catch (e) {
      if (process.env.PUSH_DEBUG) console.error('[push-deliver]', e.name, e.message, JSON.stringify(e.cause && (e.cause.code || e.cause.message) || ''))
      return { status: 0, ok: false, error: e.name === 'AbortError' ? 'timeout' : e.message }
    } finally { clearTimeout(t) }
  }

  /** ارسال به همه اشتراک‌ها؛ حذف خودکار اشتراک مرده (404/410) */
  async function notify(payload) {
    const subs = DB.pushList()
    const out = { sent: 0, failed: 0, removed: 0, total: subs.length, errors: [] }
    for (const s of subs) {
      try {
        const r = await deliver(s, payload)
        if (r.gone) { DB.pushRemove(s.endpoint); out.removed++ }
        else if (r.ok) out.sent++
        else { out.failed++; if (r.error) out.errors.push(r.error) }
      } catch (e) { out.failed++; out.errors.push(e.message) }
    }
    if (!out.errors.length) delete out.errors
    try { DB.audit('site', 'push.notify', payload.tag || 'push', JSON.stringify(out)) } catch { /* اختیاری */ }
    return out
  }

  return {
    mode,
    publicKey: () => vapid.publicKeyB64,
    vapidPublicRaw: () => vapid.publicRaw65,
    notify, deliver,
    subscribe(endpoint, keys) {
      let u
      try { u = new URL(String(endpoint)) } catch { throw errLite(422, 'endpoint نامعتبر است.') }
      if (typeof endpoint !== 'string' || !endpoint.length || endpoint.length > 2048) throw errLite(422, 'endpoint نامعتبر است.')
      const isLocal = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)
      if (u.protocol !== 'https:' && !(u.protocol === 'http:' && isLocal)) throw errLite(422, 'endpoint باید https باشد (http فقط برای تست محلی).')
      const p256dh = String(keys?.p256dh || ''), auth = String(keys?.auth || '')
      if (fromB64u(p256dh).length !== 65 || fromB64u(auth).length !== 16) throw errLite(422, 'کلیدهای اشتراک (p256dh/auth) نامعتبرند.')
      DB.pushAdd(endpoint, JSON.stringify({ p256dh, auth }))
      return { ok: true }
    },
    unsubscribe(endpoint) { return { ok: DB.pushRemove(String(endpoint)) > 0 } },
    list() { return DB.pushList().map((s) => ({ endpoint: s.endpoint, created_at: s.created_at })) },
  }
}
function errLite(status, message) { const e = new Error(message); e.status = status; return e }
