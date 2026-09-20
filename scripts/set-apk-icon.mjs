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
// حذف adaptive icon template → launcher خودش PNG را scale می‌کند (بدون ارجاع شکسته)
try { rmSync(join(res, 'mipmap-anydpi-v26'), { recursive: true, force: true }); n++ } catch { /* noop */ }
console.log(`[icon] ${n} فایل آیکون به‌روزرسانی شد`)
