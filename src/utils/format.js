// ============================================================================
// ابزارهای فرمت و نرمال‌سازی فارسی
// ============================================================================

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

/** تبدیل ارقام لاتین به فارسی */
export function toFa(v) {
  return String(v).replace(/\d/g, (d) => FA_DIGITS[+d])
}

/** فرمت قیمت: 850000 → «۸۵۰,۰۰۰» */
export function formatPrice(n) {
  return toFa(Number(n || 0).toLocaleString('en-US'))
}

/**
 * یکسان‌سازی متن فارسی برای جستجو:
 * حروف عربی↔فارسی، نیم‌فاصله، ارقام سه‌گانه (فارسی/عربی/لاتین)، فاصله‌های اضافی
 */
export function normFa(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** تاریخ شمسی قطعی با Intl (سازگار با همه ICUها: جداکننده «/») */
export function dateJalali(d = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('fa-IR-u-nu-arabext-ca-persian', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d)
    const g = (t) => (parts.find((x) => x.type === t) || {}).value || ''
    return `${g('year')}/${g('month')}/${g('day')}`
  } catch {
    return toFa(d.toISOString().slice(0, 10))
  }
}

export const CATEGORY_LABELS = { set: 'ست', legging: 'لگ', bra: 'نیم‌تنه', shoes: 'کفش', acc: 'اکسسوری' }

/** شناسه بعدی = max + 1 */
export function nextIdOf(arr) {
  return arr.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1
}
