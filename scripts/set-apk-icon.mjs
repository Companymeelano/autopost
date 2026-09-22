// فاز ۶.۵ — آیکون launcher اندروید از آیکون‌های موجود PWA (بعد از cap add اجرا شود)
import { copyFileSync, existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const CANDIDATES = ['build-assets/meelano-icon-1024.png', 'public/icons/icon-512.png']
const src = CANDIDATES.find((f) => existsSync(f)) || CANDIDATES[1]
if (!existsSync(src)) { console.log('[icon] منبع آیکون نیست؛ skip'); process.exit(0) }
if (!existsSync('android')) { console.log('[icon] پوشه android نیست (اول npx cap add android)؛ skip'); process.exit(0) }
const res = 'android/app/src/main/res'
let n = 0
import { execSync } from 'node:child_process'
const SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
let hasConvert = false
try { execSync('convert -version', { stdio: 'ignore' }); hasConvert = true } catch { /* fallback */ }
function render(src2, px, out2, square = true) {
  if (hasConvert) {
    const geo = square ? `${px}x${px}` : `${Math.round(px * 1.42)}x${Math.round(px * 1.42)}`
    execSync(`convert ${src2} -resize ${geo}${square ? '' : ' -gravity center -extent ${px}x${px}'} -strip PNG8:${out2}`, { stdio: 'ignore' })
    return true
  }
  try { copyFileSync(src2, out2); return true } catch { return false }
}
for (const d of existsSync(res) ? readdirSync(res) : []) {
  if (!/^mipmap-/.test(d)) continue
  const dir = join(res, d)
  if (d.includes('anydpi')) { try { rmSync(join(dir, 'ic_launcher.xml'), { force: true }); rmSync(join(dir, 'ic_launcher_round.xml'), { force: true }); n++ } catch { /* noop */ } continue }
  const bucket = Object.entries(SIZES).find(([k]) => d.endsWith(k))?.[1] || 96
  for (const f of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
    const p = join(dir, f)
    if (existsSync(p)) { render(src, f.includes('foreground') ? bucket * 1.42 : bucket, p, !f.includes('foreground')); n++ }
  }
}
// حذف adaptive icon template → launcher خودش PNG را scale می‌کند (بدون ارجاع شکسته)
try { rmSync(join(res, 'mipmap-anydpi-v26'), { recursive: true, force: true }); n++ } catch { /* noop */ }
console.log(`[icon] ${n} فایل آیکون به‌روزرسانی شد`)
