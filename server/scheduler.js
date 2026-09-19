// ============================================================================
// صف انتشار خودکار (Autopost) — پست‌های status='scheduled' پس از رسیدن
// publishAt منتشر می‌شوند؛ در صورت تنظیم TELEGRAM_BOT_TOKEN، ارسال به کانال
// تلگرام با تلاش مجدد (حداکثر ۵ بار) و ثبت خطا.
// ============================================================================

export function createScheduler({ DB, env, audit }) {
  let running = false

  async function publishOne(post) {
    const text = [post.title, post.body].filter(Boolean).join('\n\n')
    if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(12000),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) throw new Error(j.description || `تلگرام: HTTP ${r.status}`)
      return 'telegram'
    }
    return 'internal' // بدون کانال — فقط وضعیت در CMS به‌روزرسانی می‌شود
  }

  /** یک پاس روی صف؛ از cron و endpoint دستی صدا زده می‌شود */
  async function runOnce(username = 'system') {
    if (running) return { skipped: true }
    running = true
    const done = []
    try {
      const now = new Date()
      const st = DB.getState()
      const due = (st.posts || []).filter((p) => p.status === 'scheduled' && p.publishAt && new Date(p.publishAt) <= now)
      for (const post of due) {
        const cur = DB.getRecord('posts', post.id)
        if (!cur || cur.status !== 'scheduled') continue
        try {
          const channel = await publishOne(cur)
          DB.updateRecord('posts', post.id, { ...cur, status: 'published', publishedAt: now.toISOString(), publishChannel: channel, publishError: undefined, attempts: (cur.attempts || 0) + 1 })
          DB.bumpRev()
          DB.audit(username, 'post.publish', `post#${post.id}`, `خودکار (${channel})`)
          done.push({ id: post.id, ok: true, channel })
        } catch (e) {
          const attempts = (cur.attempts || 0) + 1
          const next = attempts >= 5 ? { ...cur, status: 'failed', attempts, publishError: String(e.message).slice(0, 200) }
                                      : { ...cur, attempts, publishError: String(e.message).slice(0, 200) }
          DB.updateRecord('posts', post.id, next)
          DB.bumpRev()
          DB.audit(username, 'post.publish.fail', `post#${post.id}`, e.message)
          done.push({ id: post.id, ok: false, error: e.message, attempts })
        }
      }
    } finally { running = false }
    return { processed: done.length, done }
  }

  /** وضعیت فعلی صف برای UI */
  function queue() {
    const st = DB.getState()
    return (st.posts || [])
      .filter((p) => p.status === 'scheduled' || p.status === 'failed')
      .map((p) => ({
        id: p.id, title: p.title, publishAt: p.publishAt || null, status: p.status,
        attempts: p.attempts || 0, lastError: p.publishError || '',
        dueNow: p.status === 'scheduled' && p.publishAt ? new Date(p.publishAt) <= new Date() : false,
      }))
      .sort((a, b) => String(a.publishAt || '9').localeCompare(String(b.publishAt || '9')))
  }

  return { runOnce, queue }
}
