// ============================================================================
// ادغام سه‌طرفه‌ی سطری (row-level 3-way merge) برای مجموعه‌های CMS
// base = آخرین نسخه‌ی همگام‌شده · mine = نسخه‌ی فعلی من · theirs = نسخه‌ی سرور
// قانون: ردیف‌هایی که من تغییر دادم برنده‌اند؛ بقیه از سرور؛ افزودن‌ها حفظ،
// حذف‌های من اعمال، حذف‌های سرور (که من دست نزده‌ام) اعمال می‌شوند.
// ============================================================================

function byId(rows) {
  const m = new Map()
  for (const r of rows || []) m.set(String(r?.id), r)
  return m
}

export function mergeCollection(base = [], mine = [], theirs = []) {
  const bMap = byId(base); const mMap = byId(mine); const tMap = byId(theirs)
  const touched = new Set()
  // ردیف‌هایی که من تغییرشان داده‌ام (ویرایش/حذف) — نام有效率‌ها کنار گذاشته می‌شوند
  for (const [id, row] of mMap) {
    const b = bMap.get(id)
    if (!b || JSON.stringify(b) !== JSON.stringify(row)) touched.add(id)
  }
  for (const id of bMap.keys()) if (!mMap.has(id)) touched.add(id) // حذف‌های من

  // ترتیب پایه: ترتیب سرور؛ سپس افزودنی‌های من
  const out = []
  const used = new Set()
  for (const t of theirs || []) {
    const id = String(t?.id)
    used.add(id)
    const m = mMap.get(id)
    if (touched.has(id)) {
      if (mMap.has(id)) out.push(m) // ویرایش من برنده
      // else: من حذفش کردم → از خروجی بیرون می‌ماند
    } else {
      out.push(t) // دست من نخورده → سرور برنده (شامل افزودن‌های دیگران)
    }
  }
  for (const m of mine || []) {
    const id = String(m?.id)
    if (!used.has(id) && !bMap.has(id)) out.push(m) // افزودنیِ تازه‌ی من (در base نبوده) → حفظ می‌شود
  }
  return out
}
