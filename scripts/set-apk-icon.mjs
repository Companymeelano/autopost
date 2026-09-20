// فاز ۶.۵ — آیکون launcher اندروید از آیکون‌های موجود PWA (بعد از cap add اجرا شود)
import { copyFileSync, existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const src = 'public/icons/icon-512.png'
if (!existsSync(src)) { console.log('[icon] منبع آیکون نیست؛ skip'); process.exit(0) }
if (!existsSync('android')) { console.log('[icon] پوشه android نیست (اول npx cap add android)؛ skip'); process.exit(0) }
const res = 'android/app/src/main/res'
let n = 0
for (const d of existsSync(res) ? readdirSync(res) : []) {
  if (!/^mipmap-/.test(d)) continue
  const dir = join(res, d)
  if (d.includes('anydpi')) { try { rmSync(join(dir, 'ic_launcher.xml'), { force: true }); rmSync(join(dir, 'ic_launcher_round.xml'), { force: true }); n++ } catch { /* noop */ } continue }
  for (const f of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
    const p = join(dir, f)
    if (existsSync(p)) { copyFileSync(src, p); n++ }
  }
}
// fallback برای anydpi خالی‌شده
if (existsSync(join(res, 'mipmap-anydpi-v26'))) writeFileSync(join(res, 'mipmap-anydpi-v26', 'ic_launcher.xml'),
`<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>`)
console.log(`[icon] ${n} فایل آیکون به‌روزرسانی شد`)
