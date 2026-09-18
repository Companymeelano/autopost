// ============================================================================
// نقش‌ها — سطح دسترسی‌ها. منبع واحد هم برای سرور (اجرا) و هم UI (مخفی‌سازی)
// ============================================================================

export const ROLE_PERMS = {
  admin: ['state:products', 'state:posts', 'state:coupons', 'state:requests', 'state:messages', 'state:provinces', 'state:settings', 'media', 'payments', 'users', 'audit', 'ai', 'queue'],
  editor: ['state:products', 'state:posts', 'media', 'ai', 'audit', 'queue'],
  finance: ['state:coupons', 'state:requests', 'state:messages', 'payments', 'audit'],
}

export const ROLE_LABELS = { admin: 'مدیر کل', editor: 'تولید محتوا', finance: 'مالی' }

export function permsFor(role) { return ROLE_PERMS[role] || [] }

/** مجموعه‌هایی که یک نقش مجاز به ویرایش (در PUT state) است */
export function editableColsFor(role) {
  return permsFor(role).filter((p) => p.startsWith('state:')).map((p) => p.slice(6))
}
