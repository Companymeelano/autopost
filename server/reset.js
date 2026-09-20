// پاک‌سازی کامل دیتابیس (data/panahfit.db) — برای شروع تازه
import { rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const f of ['panahfit.db', 'panahfit.db-wal', 'panahfit.db-shm']) {
  const p = join(ROOT, 'data', f)
  if (existsSync(p)) { rmSync(p); console.log('حذف شد:', p) }
}
console.log('دیتابیس پاک‌سازی شد. در بار بعد با داده‌های نمونه seed می‌شود.')
