// ============================================================================
// سرویس‌های سرور: هوش مصنوعی (OpenAI-compatible) و درگاه پرداخت (زرین‌پال)
// هر دو حالت واقعی (با env) و حالت نمایشی/آفلاین دارند.
// ============================================================================

/* ---------------- AI ---------------- */
const TONE_PROMPT = {
  energetic: 'لحن پرانرژی و انگیزشی، مناسب کپشن اینستاگرام برند لباس ورزشی بانوان',
  formal: 'لحن رسمی و اطلاعاتی، مناسب کپشن اینستاگرام برند لباس ورزشی',
  humorous: 'لحن طنز و صمیمی، مناسب کپشن اینستاگرام برند لباس ورزشی',
}

const FALLBACK = {
  energetic: (t) => `آماده‌اید برای شکستن رکورد؟ 💥 ${t}، ترکیبی از استایل و عملکرد بی‌نظیر. پارچه تنفسی، پشتیبانی عالی! همین حالا بهترین خودت باش.\n#فیتنس #PanahFit #لباس_ورزشی #ورزش_بانوان #انگیزشی`,
  formal: (t) => `${t}؛ طراحی‌شده با متریال درجه‌یک برای تمرین‌های حرفه‌ای. برای مشاهده مشخصات فنی و ثبت سفارش به وب‌سایت PanahFit مراجعه کنید.\n#PanahFit #فیتنس_حرفه‌ای #مشخصات_فنی`,
  humorous: (t) => `با ${t} آن‌قدر خفن می‌شی که آینه هم بهت حسودی می‌کنه! 😎 یک ورزش سبک، یک استایل سنگین.\n#فیتنس_با_حال #PanahFit`,
}

export function aiSource(env) {
  return env.OPENAI_API_KEY ? 'openai' : 'fallback'
}

export async function generateCaption(env, { title, tone = 'energetic', keywords = '' }) {
  const t = String(title).trim()
  const k = String(keywords || '').trim()
  if (env.OPENAI_API_KEY) {
    const base = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || 'gpt-4o-mini',
          temperature: 0.8,
          max_tokens: 300,
          messages: [
            { role: 'system', content: 'تو کپی‌رایتر فارسی‌زبان یک برند لباس ورزشی هستی. فقط متن کپشن را برگردان، بدون توضیح اضافه.' },
            { role: 'user', content: `برای محصول «${t}» یک کپشن اینستاگرام بنویس. ${TONE_PROMPT[tone] || TONE_PROMPT.energetic}.${k ? ` کلمات کلیدی: ${k}.` : ''} حداکثر ۶۰ کلمه + ۵ هشتگ فارسی.` },
          ],
        }),
        signal: AbortSignal.timeout(20000),
      })
      if (res.ok) {
        const j = await res.json()
        const text = j?.choices?.[0]?.message?.content?.trim()
        if (text) return { caption: text, source: 'openai' }
      }
      // خطای provider → fallback محلی (کاربر هرگز خطای خام نمی‌بیند)
    } catch { /* timeout/network → fallback */ }
  }
  const tpl = FALLBACK[tone] || FALLBACK.energetic
  return { caption: tpl(t) + (k ? `\n(کلیدواژه‌ها: ${k})` : ''), source: 'fallback' }
}

/* ---------------- پرداخت ---------------- */
export function paymentSource(env) {
  return env.ZARINPAL_MERCHANT_ID ? 'zarinpal' : 'demo'
}

/** درخواست پرداخت: در حالت واقعی WebPay زرین‌پال، در حالت دمو authority محلی */
export async function createPayment(env, { amount, description, callbackBase }) {
  const amountRial = Math.trunc(Number(amount)) * 10 // تومان → ریال
  if (env.ZARINPAL_MERCHANT_ID) {
    const res = await fetch('https://api.zarinpal.com/pg/v4/payment/request.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_id: env.ZARINPAL_MERCHANT_ID,
        amount: amountRial,
        description: String(description || 'سفارش PanahFit').slice(0, 100),
        callback_url: `${callbackBase}/api/payments/callback`,
        mobile: env.ZARINPAL_MOBILE || undefined,
      }),
      signal: AbortSignal.timeout(15000),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok || j?.errors?.code) throw new Error(j?.errors?.detail || 'درگاه پاسخ نداد.')
    const authority = j.data.authority
    return { authority, url: `https://www.zarinpal.com/pg/StartPay/${authority}`, mode: 'zarinpal' }
  }
  const authority = `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  return { authority, url: null, mode: 'demo' }
}

/** تأیید پرداخت — دمو: هر authority با پسوند fail- رد و بقیه موفق */
export async function verifyPayment(env, { authority, amount, refId }) {
  const amountRial = Math.trunc(Number(amount)) * 10
  if (env.ZARINPAL_MERCHANT_ID) {
    const res = await fetch('https://api.zarinpal.com/pg/v4/payment/verify.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant_id: env.ZARINPAL_MERCHANT_ID, authority, amount: amountRial }),
      signal: AbortSignal.timeout(15000),
    })
    const j = await res.json().catch(() => ({}))
    const data = j?.data || {}
    if (!res.ok || data.code !== 100) throw new Error('تأیید درگاه ناموفق بود.')
    return { ok: true, refId: String(data.ref_id || '') }
  }
  const ok = String(authority).startsWith('demo-') && !String(authority).includes('fail-')
  return { ok, refId: ok ? (String(refId || '') || `DEMO-${String(authority).slice(-6).toUpperCase()}`) : '', mode: 'demo' }
}
