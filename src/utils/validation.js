// ============================================================================
// اعتبارسنجی فرم‌ها — پیام‌های خطای فارسی، استاندارد مشترک برای همه فرم‌ها
// خروجی هر بررسی: آبجکت { فیلد: 'پیام خطا' } — خالی یعنی معتبر
// ============================================================================

export function validateProduct(f) {
  const e = {}
  const title = String(f.title ?? '').trim()
  if (!title) e.title = 'عنوان محصول الزامی است.'
  else if (title.length < 3) e.title = 'عنوان باید حداقل ۳ نویسه باشد.'
  else if (title.length > 120) e.title = 'عنوان نباید بیشتر از ۱۲۰ نویسه باشد.'
  if (!f.cat) e.cat = 'دسته‌بندی را انتخاب کنید.'
  const price = Number(f.price)
  if (f.price === '' || f.price == null || !Number.isFinite(price) || price < 0) e.price = 'قیمت باید عددی نامنفی باشد.'
  else if (price > 1_000_000_000) e.price = 'قیمت غیرمنطقی به نظر می‌رسد (سقف: یک میلیارد تومان).'
  const stock = Number(f.stock)
  if (f.stock === '' || f.stock == null || !Number.isInteger(stock) || stock < 0) e.stock = 'موجودی باید عدد صحیح نامنفی باشد.'
  return e
}

export function validateCoupon(f, existing = []) {
  const e = {}
  const code = String(f.code ?? '').trim().toUpperCase()
  if (!code) e.code = 'کد تخفیف را وارد کنید.'
  else if (!/^[A-Z0-9_-]{3,30}$/.test(code)) e.code = 'کد باید ۳ تا ۳۰ نویسه (حرف انگلیسی، عدد، زیرخط یا خط تیره) باشد.'
  else if (existing.some((c) => c.code === code)) e.code = 'این کد از قبل وجود دارد.'
  const percent = Number(f.percent)
  if (!Number.isFinite(percent) || percent < 1 || percent > 100) e.percent = 'درصد تخفیف باید عددی بین ۱ تا ۱۰۰ باشد.'
  if (f.maxUses != null && f.maxUses !== '') {
    const mu = Number(f.maxUses)
    if (!Number.isInteger(mu) || mu < 0) e.maxUses = 'سقف استفاده باید عدد صحیح نامنفی (۰ = بدون سقف) یا خالی باشد.'
  }
  for (const key of ['validFrom', 'validTo']) {
    const v = f[key]
    if (v != null && v !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) e[key] = 'تاریخ باید به قالب YYYY-MM-DD باشد.'
  }
  if (f.validFrom && f.validTo && /^\d{4}-\d{2}-\d{2}$/.test(String(f.validFrom)) && /^\d{4}-\d{2}-\d{2}$/.test(String(f.validTo)) && f.validFrom > f.validTo) {
    e.validTo = 'تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد.'
  }
  return e
}

export function validatePost(f, opts = {}) {
  const e = {}
  const title = String(f.title ?? '').trim()
  if (!title) e.title = 'عنوان پست الزامی است.'
  else if (title.length > 150) e.title = 'عنوان نباید بیشتر از ۱۵۰ نویسه باشد.'
  if (!String(f.author ?? '').trim()) e.author = 'نام نویسنده الزامی است.'
  if (!['published', 'draft', 'scheduled'].includes(f.status)) e.status = 'وضعیت نامعتبر است.'
  if (f.status === 'scheduled') {
    const d = String(f.publishAt ?? '')
    if (!d) e.publishAt = 'برای زمان‌بندی، تاریخ و ساعت انتشار لازم است.'
    else if (Number.isNaN(Date.parse(d))) e.publishAt = 'تاریخ نامعتبر است.'
    else if (opts.requireFuture !== false && Date.parse(d) <= Date.now()) e.publishAt = 'زمان انتشار باید در آینده باشد.'
  }
  return e
}

export function validateLogin(username, password) {
  const e = {}
  if (!String(username ?? '').trim()) e.username = 'نام کاربری را وارد کنید.'
  if (!String(password ?? '')) e.password = 'رمز عبور را وارد کنید.'
  return e
}
