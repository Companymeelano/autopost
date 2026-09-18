// ============================================================================
// بکاپ‌گیری از دیتابیس — VACUUM INTO (اسنپ‌شات اتمی و سازگار با WAL)
// اجرای دستی: npm run db:backup   |   در کانتینر: سرویس backup
// بازیابی: stop سرور → کپی فایل备份 روی data/panahfit.db → start (سناریوی تست‌شده)
// ============================================================================
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = process.env.DATA_DIR === 'memory' ? '/tmp' : join(ROOT, process.env.DATA_DIR || 'data')
const DB_FILE = join(DATA, 'panahfit.db')
const BACKUP_DIR = join(DATA, 'backups')
const KEEP = Number(process.env.BACKUP_KEEP || 14)

mkdirSync(BACKUP_DIR, { recursive: true })
const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 13) // 20260918-1433
const out = join(BACKUP_DIR, `panahfit-${ts}.sqlite`)

const db = new DatabaseSync(DB_FILE, { readOnly: true })
db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`)
db.close()

// verify سلامت + لاگ اندازه
const v = new DatabaseSync(out, { readOnly: true })
const okRow = v.prepare('PRAGMA integrity_check').get()
v.close()
const mb = (statSync(out).size / 1024 / 1024).toFixed(2)
console.log(`[backup] ${out} (${mb} MB) integrity: ${okRow?.integrity_check || JSON.stringify(okRow)}`)

// حذف نسخه‌های قدیمی‌تر از KEEP
const files = readdirSync(BACKUP_DIR).filter((f) => /^panahfit-\d{12,13}\.sqlite$/.test(f)).sort()
while (files.length > KEEP) {
  const old = files.shift()
  unlinkSync(join(BACKUP_DIR, old))
  console.log('[backup] حذف نسخه قدیمی:', old)
}
if (!okRow || okRow.integrity_check !== 'ok') process.exit(2)
