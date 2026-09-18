// ============================================================================
// CSV — خروجی اکسل‌پسند (BOM + CRLF) و پارسر import با پشتیبانی نقل‌قول
// ============================================================================
import { validateProduct } from './validation.js'
import { normFa } from './format.js'

const HEADERS = ['id', 'title', 'cat', 'price', 'stock', 'sold', 'desc']
const FA_HEADER = { id: 'شناسه', title: 'عنوان', cat: 'دسته', price: 'قیمت', stock: 'موجودی', sold: 'فروش', desc: 'توضیحات' }

function esc(v) {
  const s = String(v ?? '')
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function productsToCsv(products) {
  const lines = [HEADERS.map((h) => FA_HEADER[h]).join(',')]
  for (const p of products) {
    lines.push(HEADERS.map((h) => esc(h === 'desc' ? String(p.desc ?? '').replace(/[\r\n]+/g, ' ') : p[h] ?? '')).join(','))
  }
  return '\uFEFF' + lines.join('\r\n')
}

/** پارسر CSV minimal- RFC4180-ish: نقل‌قول، «""»، CRLF/LF */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQ = false
  const src = String(text).replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ } else inQ = false
      } else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((x) => x !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((x) => x !== '')) rows.push(row)
  return rows
}

const HEADER_MAP = {
  'شناسه': 'id', id: 'id', 'عنوان': 'title', title: 'title',
  'دسته': 'cat', 'دسته‌بندی': 'cat', cat: 'cat', category: 'cat',
  'قیمت': 'price', price: 'price', 'موجودی': 'stock', stock: 'stock',
  'فروش': 'sold', sold: 'sold', 'توضیحات': 'desc', desc: 'desc', description: 'desc',
}
const CAT_ALIASES = { ست: 'set', set: 'set', لگ: 'legging', 'لگینگ': 'legging', legging: 'legging', 'نیم‌تنه': 'bra', 'نیم تنه': 'bra', bra: 'bra', 'اکسسوری': 'acc', acc: 'acc', 'متفرقه': 'other', other: 'other' }

/**
 * rows (آرایه‌ی آرایه از parseCsv) → { items: [{ row, product, errors }], headerErrors }
 * بررسی dry-run: خطاهای validateProduct عیناً در UI نمایش داده می‌شود.
 */
export function mapCsvRows(rows, existingIds = []) {
  if (!rows.length) return { items: [], error: 'فایل خالی است.' }
  const header = rows[0].map((h) => normFa(String(h).trim()))
  const cols = header.map((h) => HEADER_MAP[h] ?? null)
  if (!cols.includes('title')) return { items: [], error: 'ستون «عنوان» (title) در هدر یافت نشد.' }
  const items = []
  const seen = new Set(existingIds.map(Number))
  for (let i = 1; i < rows.length; i++) {
    const raw = rows[i]
    const product = {}
    cols.forEach((key, cIdx) => {
      if (!key) return
      let v = String(raw[cIdx] ?? '').trim()
      if (key === 'cat') v = CAT_ALIASES[normFa(v)] || CAT_ALIASES[v] || v
      if (key === 'price' || key === 'stock' || key === 'sold' || key === 'id') {
        v = normFa(v).replace(/[,_\s]/g, '')
        v = v === '' ? '' : Number(v)
      }
      if (key === 'price' || key === 'stock') { product[key] = v === '' ? '' : v } else if (v !== '') product[key] = v
    })
    product.title = String(product.title ?? '').trim()
    const errors = validateProduct(product)
    if (seen.has(Number(product.id))) errors.id = 'این شناسه با ردیف دیگری در فایل تکراری است.'
    if (product.id != null) seen.add(Number(product.id))
    items.push({ line: i + 1, product, errors })
  }
  if (!items.length) return { items: [], error: 'هیچ ردیف معتبری با ستون عنوان یافت نشد.' }
  return { items, error: null }
}

/** اعمال روی استور: id جدید برای ردیف‌های بی‌id؛ ادغام با idهای موجود (update) */
export function applyCsvItems(cms, items) {
  let created = 0
  let updated = 0
  for (const { product } of items) {
    const hasId = Number.isInteger(Number(product.id)) && Number(product.id) > 0
    const target = hasId ? cms.products.find((p) => p.id === Number(product.id)) : null
    const form = { title: product.title, cat: product.cat || 'other', price: Number(product.price) || 0, stock: Number(product.stock) || 0 }
    if (product.sold != null && Number.isFinite(Number(product.sold))) form.sold = Number(product.sold)
    if (product.desc) form.desc = product.desc
    cms.saveProduct(form, target ? target.id : null)
    target ? updated++ : created++
  }
  return { created, updated }
}
