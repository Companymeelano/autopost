// فاز ۶.۵ — استمپ نسخه در android/app/build.gradle (جایگزین sed شکننده CI)
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
const version = String(process.argv[2] || '0.0-dev').replace(/[^\w.\-+]/g, '-').slice(0, 60)
const code = Number(process.argv[3] || 1) || 1
const file = 'android/app/build.gradle'
if (!existsSync(file)) { console.error(`[stamp] فایل نیست: ${file}`); process.exit(1) }
let s = readFileSync(file, 'utf8')
s = s.replace(/^(\s*)versionCode\s+\d+/m, `$1versionCode ${code}`)
if (!/versionCode\s+\d+/.test(s)) s = s.replace(/defaultConfig \{/, `defaultConfig {\n        versionCode ${code}`)
s = s.replace(/^(\s*)versionName\s+".*"/m, `$1versionName "${version}"`)
if (!/versionName\s+"/.test(s)) s = s.replace(/versionCode \d+/, (m) => `${m}\n        versionName "${version}"`)
writeFileSync(file, s)
console.log(`[stamp] versionCode=${code} versionName=${version}`)
console.log(s.split('\n').filter((l) => /version/.test(l)).join('\n'))
