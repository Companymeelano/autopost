// فاز ۶.۵ — تنظیم capacitor.config.json برای نسخه shop یا admin (قبل از cap add)
import { readFileSync, writeFileSync } from 'node:fs'
const variant = String(process.argv[2] || 'web').toLowerCase()
const VARIANTS = {
  shop: { appId: 'com.panahfit.shop', appName: 'پناه‌فیت | فروشگاه', shortName: 'پناه‌فیت' },
  admin: { appId: 'com.panahfit.admin', appName: 'پناه‌فیت | مدیریت', shortName: 'پناه‌فیت پنل' },
  web: { appId: 'com.panahfit.app', appName: 'PanahFit', shortName: 'PanahFit' },
}
const v = VARIANTS[variant]
if (!v) { console.error('variant must be shop|admin|web'); process.exit(2) }
const p = 'capacitor.config.json'
const cfg = JSON.parse(readFileSync(p, 'utf8'))
Object.assign(cfg, { appId: v.appId, appName: v.appName })
writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n')
writeFileSync('.capacitor-variant', variant)
console.log(`[cap-variant] ${variant} → appId=${v.appId} appName=${v.appName}`)
