// ============================================================================
// فاز ۵ — پیامک ارسالی (Kavenegar) با fallback موک
// بدون KAVENEGAR_API_KEY: مود mock — هر پیام در حلقه آخر ثبت و در audit می‌شود
// ============================================================================
export function createSms(ENV = {}) {
  const key = ENV.KAVENEGAR_API_KEY || ''
  const sender = ENV.KAVENEGAR_SENDER || ''
  const log = [] // mock ring (برای تست/دیباگ)
  const mode = key ? 'kavenegar' : 'mock'

  async function send({ to, template, tokens = {}, text }) {
    const phone = String(to || '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).trim()
    if (!/^09\d{9}$/.test(phone)) return { ok: false, skipped: 'bad-phone' }
    const entry = { to: phone, template, tokens, at: new Date().toISOString(), text: text || `template:${template} ${JSON.stringify(tokens)}` }
    if (mode === 'mock') {
      log.push(entry)
      while (log.length > 50) log.shift()
      return { ok: true, mode, id: log.length }
    }
    try {
      const q = new URLSearchParams({ receptor: phone, template, ...Object.fromEntries(Object.entries(tokens).map(([k, v]) => [`${k}`, String(v)])) })
      if (sender) q.set('sender', sender)
      const r = await fetch(`https://api.kavenegar.com/v1/${encodeURIComponent(key)}/sms/send.json?${q.toString()}`)
      const d = await r.json().catch(() => ({}))
      const ok = r.status === 200 && d?.return?.status >= 200 && d?.return?.status < 300
      return { ok, mode, status: r.status, id: d?.result?.id ?? null, error: ok ? null : (d?.return?.statusText || `HTTP ${r.status}`) }
    } catch (e) {
      return { ok: false, mode, error: e.message }
    }
  }
  return { mode, send, mockLog: mode === 'mock' ? log : [] }
}
