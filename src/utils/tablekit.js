// ============================================================================
// ابزارهای جدول: فیلتر، مرتب‌سازی، صفحه‌بندی — توابع خالص و قابل تست
// ============================================================================
import { normFa } from './format.js'

/** فیلتر نرمال‌شده فارسی روی چند فیلد متنی/عددی */
export function filterRows(rows, query, fields, extras = []) {
  const q = normFa(query)
  if (!q) return rows.slice()
  return rows.filter((row) => {
    for (const f of fields) if (normFa(row[f]).includes(q)) return true
    for (const fn of extras) if (fn(row, q)) return true
    return false
  })
}

/** مقایسه‌گر امن: رشته/عدد/null */
function cmpVal(a, b) {
  if (a == null) a = ''
  if (b == null) b = ''
  if (typeof a === 'number' || typeof b === 'number') {
    const na = Number(a); const nb = Number(b)
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
  }
  return normFa(a).localeCompare(normFa(b), 'fa')
}

export function sortRows(rows, key, dir = 'asc') {
  if (!key) return rows.slice()
  const sign = dir === 'desc' ? -1 : 1
  return rows.slice().sort((a, b) => sign * cmpVal(a[key], b[key]))
}

/** صفحه‌بندی؛ outOfRange: صفحه خواسته فراتر از آخر بود */
export function paginate(rows, page, size) {
  const total = rows.length
  const pageCount = Math.max(1, Math.ceil(total / size))
  const clamped = Math.min(Math.max(1, page), pageCount)
  const start = (clamped - 1) * size
  return {
    pageRows: rows.slice(start, start + size),
    page: clamped,
    pageCount,
    total,
    from: total ? start + 1 : 0,
    to: Math.min(start + size, total),
    outOfRange: clamped !== page,
  }
}
