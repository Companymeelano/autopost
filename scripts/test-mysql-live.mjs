// ============================================================================
// آزمون زنده پل MySQL روی سرور واقعی (MySQL 8 در CI) — با اجرای:
//   node --disable-warning=ExperimentalWarning scripts/test-mysql-live.mjs
// متغیرها: PF_TEST_MYSQL_HOST/PORT/USER/PASS/DB
// صحت: اتصال → اعمال → سلامت → خراب‌سازی عمدی → ترمیم → push زنده → pull
// ============================================================================
import { spawn } from 'node:child_process'

const PORT = 18891
const BASE = `http://127.0.0.1:${PORT}`
const MX = {
  host: process.env.PF_TEST_MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.PF_TEST_MYSQL_PORT || 3306),
  user: process.env.PF_TEST_MYSQL_USER || 'root',
  password: process.env.PF_TEST_MYSQL_PASS || 'root',
  database: process.env.PF_TEST_MYSQL_DB || 'meelano_test',
  prefix: 'pf_',
}
let failed = []
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}`); if (!cond) failed.push(name) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sql = (q) => new Promise((res, rej) => {
  const p = spawn('mysql', ['-h', MX.host, '-P', String(MX.port), '-u', MX.user, `-p${MX.password}`, '-N', '-B', '-e', q, MX.database], { stdio: ['ignore', 'pipe', 'pipe'] })
  let out = '', err = ''
  p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d))
  p.on('exit', (c) => (c ? rej(new Error(err.slice(0, 200))) : res(out.trim())))
})

const srv = spawn('node', ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: 'data-live', ADMIN_PASS: 'live-test-9', CSP_FRAME_ANCESTORS: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
srv.stdout.on('data', () => {})
srv.stderr.on('data', (d) => process.stderr.write(d))

async function main() {
  // آماده‌سازی DB تست
  await sql(`CREATE DATABASE IF NOT EXISTS \`${MX.database}\``).catch(() => {})
  await sql('DROP SCHEMA IF EXISTS x; ') .catch(() => {})
  await sql(`DROP DATABASE IF EXISTS \`${MX.database}\`; CREATE DATABASE \`${MX.database}\` CHARACTER SET utf8mb4;`)
  for (let i = 0; i < 20; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break } catch { await sleep(400) } }
  let cookie = ''
  const api = async (path, opts = {}) => {
    const r = await fetch(BASE + '/api' + path, { ...opts, headers: { 'content-type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: opts.body && JSON.stringify(opts.body) })
    const setc = r.headers.get('set-cookie'); if (setc) cookie = setc.split(';')[0]
    return { status: r.status, d: await r.json().catch(() => ({})) }
  }
  ok('health پاسخ داد', (await api('/health')).status === 200)
  const lg = await api('/auth/login', { method: 'POST', body: { username: 'admin', password: 'live-test-9' } })
  ok('ورود مدیر', lg.status === 200)

  // تست کانفیگ
  const t = await api('/db/test', { method: 'POST', body: { ...MX } })
  ok('db/test موفق (MySQL واقعی)', t.status === 200 && t.d.ok && /8\.0|8\./i.test(t.d.version))

  // اعمال: ساخت جداول + جایگذاری داده seed
  const a = await api('/db/apply', { method: 'POST', body: { ...MX } })
  ok('db/apply موفق', a.status === 200 && a.d.ok)
  const cnt = Number(await sql('SELECT COUNT(*) FROM pf_products'))
  const localCnt = (await api('/public/products')).d.products?.length ?? 0
  ok(`جایگذاری محصولات روی MySQL (${cnt} = ${localCnt})`, cnt === localCnt && cnt > 0)
  const kvRev = await sql("SELECT v FROM pf_kv WHERE k='rev'")
  ok('rev در kv نوشته شد', /^\d+$/.test(kvRev))

  // سلامت اولیه
  const h1 = await api('/db/health')
  ok('health: همه ۱۵ جدول ok', h1.d.tables?.length === 15 && h1.d.tables.every((x) => x.status === 'ok'))

  // خراب‌سازی عمدی: حذف یک ستون → health باید broken بگوید
  await sql('ALTER TABLE pf_products DROP COLUMN updated_at')
  const h2 = await api('/db/health')
  const bad = (h2.d.tables || []).find((x) => x.table === 'products')
  ok('شناسایی ساختار خراب (missing column)', bad?.status === 'broken' && bad.missingColumns?.includes('updated_at'))
  const rp = await api('/db/repair', { method: 'POST', body: {} })
  ok('ترمیم خودکار (ALTER)', rp.status === 200 && rp.d.tables.find((x) => x.table === 'products')?.status === 'ok')
  const cols = await sql("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='" + MX.database + "' AND table_name='pf_products' AND column_name='updated_at'")
  ok('ستون بازگردانده شد در MySQL', cols === '1')

  // جدول حذف‌شده → rebuild با create
  await sql('DROP TABLE pf_coupons')
  const h3 = await api('/db/health')
  ok('جدول حذف‌شده = missing', (h3.d.tables || []).find((x) => x.table === 'coupons')?.status === 'missing')
  await api('/db/repair', { method: 'POST', body: {} })
  ok('repair جدول غایب را ساخت', (await sql(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${MX.database}' AND table_name='pf_coupons'`)) === '1')

  // همگام زنده: افزودن محصول از پنل (PUT state) → در MySQL ظاهر شود
  const st0 = (await api('/state')).d
  st0.products.push({ id: 901, title: 'لگ میلانو زنده', cat: 'legging', price: 121000, stock: 3, sold: 0, desc: '', image: '' })
  st0.rev = st0.rev
  const put = await api('/state', { method: 'PUT', body: st0 })
  ok('PUT state پنل', put.status === 200)
  for (let i = 0; i < 15; i++) { await sleep(800); if ((await sql('SELECT COUNT(*) FROM pf_products')) === String(localCnt + 1)) break }
  ok('همگام زنده: محصول تازه در MySQL', (await sql('SELECT COUNT(*) FROM pf_products')) === String(localCnt + 1))

  // سفارش واقعی درگاه دمو → جداول orders + order_items
  const or = await api('/public/orders', { method: 'POST', body: { buyer: 'ایمان میلانو', phone: '09122223344', address: 'تهران، آزمایش', items: [{ id: 901, qty: 2 }] } })
  ok('ثبت سفارش', [200, 201].includes(or.status) && or.d.ref)
  const pay = await fetch(BASE + '/api/public/orders/return?ref=' + or.d.ref + '&decision=ok')
  ok('پرداخت دمو', pay.status < 400)
  await sleep(4200)
  ok('جدول orders پر شد', Number(await sql('SELECT COUNT(*) FROM pf_orders')) >= 1)
  ok('اقلام سفارش (order_items)', Number(await sql('SELECT COUNT(*) FROM pf_order_items')) >= 1)
  ok('موجودی همگام با پنل', (await api('/public/products')).d.products.find((p) => p.id === 901)?.stock === 1)

  // pull: ویرایش مستقیم روی MySQL → فراخوانی موتور محلی
  await sql("UPDATE pf_products SET data=JSON_REPLACE(data,'$.title','عنوان از هاست') WHERE id=901")
  const pu = await api('/db/pull', { method: 'POST' })
  ok('pull موفق از میزبان', pu.status === 200 && pu.d.rows.products === localCnt + 1)
  ok('داده ویرایش‌شده در پنل/فروشگاه', (await api('/public/products')).d.products.find((p) => p.id === 901)?.title === 'عنوان از هاست')

  // قطع اتصال
  const dc = await api('/db/disconnect', { method: 'POST' })
  ok('disconnect', dc.status === 200 && (await api('/db')).d.enabled === false)

  srv.kill('SIGTERM')
  if (failed.length) { console.error('FAILED: ' + failed.join(' | ')); process.exit(1) }
  console.log('ALL MYSQL-LIVE CHECKS PASSED ✅')
  process.exit(0)
}
main().catch((e) => { console.error('FATAL', e); srv.kill('SIGTERM'); process.exit(1) })
setTimeout(() => { console.error('TIMEOUT'); srv.kill('SIGTERM'); process.exit(1) }, 180_000).unref()
