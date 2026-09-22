// تست پل MySQL (cPanel) — بدون میزبان واقعی: fake-in-memory MySQL با SQL-spy
// چرخه کامل: test → apply (ساخت جداول+جایگذاری) → health → repair → push → pull → boot/disconnect
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { openDb } from '../../server/db.js'
import { createMysqlBridge, expectedSchema, expectedColumns } from '../../server/mysql-bridge.js'

/* ماکر MySQL: جداول را به‌صورت آرایهٔ آبجکت نگه می‌دارد و SQLهای بریج را پاسخ می‌دهد */
function makeFakeMysql() {
  const tables = {} // name → { cols:[names], rows:[objs] }
  const log = []
  const byTail = (sql) => { const m = sql.match(/INTO `(\w+)` \(([^)]+)\)/); return m ? { name: m[1], cols: m[2].split(',').map((x) => x.trim()) } : null }
  const qname = (sql) => { const m = sql.match(/(?:FROM|EXISTS|TABLE)(?: IF EXISTS)? `(\w+)`/); return m ? m[1] : null }
  const fake = {
    tables, log,
    async query(sql, params = []) {
      log.push({ sql: sql.replace(/\s+/g, ' ').trim().slice(0, 160), params })
      const p = params
      if (/SELECT VERSION\(\)/.test(sql)) return [{ v: '8.0.42-meelano-fake' }]
      if (/information_schema\.tables/.test(sql)) {
        const like = p[1] ? String(p[1]).replace('%', '') : null
        return Object.keys(tables).filter((n) => !like || n.startsWith(like)).map((n) => ({ n }))
      }
      if (/information_schema\.columns/.test(sql)) {
        const t = tables[String(p[0])]
        return t ? t.cols.map((Field) => ({ Field })) : []
      }
      let m = sql.match(/CREATE TABLE IF NOT EXISTS `(\w+)`\s*\(([\s\S]*)\)/)
      if (m) {
        const name = m[1]
        if (!tables[name]) {
          const spec = expectedSchema('').find((t) => name.endsWith(`_${t.short}`) || name === t.short || name.endsWith(t.short))
          tables[name] = { cols: spec ? expectedColumns(spec) : (m[2].match(/`(\w+)` [A-Z]/g) || []).map((x) => x.replace(/`/g, '').split(' ')[0]), rows: [] }
        }
        return []
      }
      if (/DROP TABLE/.test(sql)) { delete tables[qname(sql)]; return [] }
      m = sql.match(/ALTER TABLE `(\w+)` ADD COLUMN `(\w+)`/)
      if (m) { tables[m[1]].cols.push(m[2]); return [] }
      if (/^DELETE FROM `/.test(sql)) { tables[qname(sql)].rows = []; return [] }
      m = byTail(sql)
      if (m && /^REPLACE/.test(sql)) {
        const t = tables[m.name]
        const row = Object.fromEntries(m.cols.map((c, i) => [c, p[i]]))
        const k = Object.keys(row)[0]
        const i = t.rows.findIndex((r) => String(r[k]) === String(row[k]))
        if (i > -1) t.rows[i] = row; else t.rows.push(row)
        return []
      }
      if (m && /INSERT INTO/.test(sql)) {
        const t = tables[m.name]
        const row = Object.fromEntries(m.cols.map((c, i) => [c, p[i]]))
        const dup = t.rows.find((r) => String(r.id) === String(row.id) || (row.ref && String(r.ref) === String(row.ref)))
        if (/ON DUPLICATE/.test(sql) && dup) Object.assign(dup, row)
        else t.rows.push(row)
        return []
      }
      m = sql.match(/SELECT COUNT\(\*\) AS n FROM `(\w+)`/)
      if (m) return [{ n: tables[m[1]]?.rows.length ?? 0 }]
      m = sql.match(/SELECT data FROM `(\w+)` ORDER BY pos/)
      if (m) return (tables[m[1]]?.rows || []).slice().sort((a, b) => a.pos - b.pos).map((r) => ({ data: r.data }))
      m = sql.match(/SELECT k,v FROM `(\w+)`/)
      if (m) return (tables[m[1]]?.rows || []).map((r) => ({ k: r.k, v: r.v }))
      return []
    },
    async end() { fake.ended = true },
  }
  return fake
}

let dir, localDb, bridge, fake, fakeCfg
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pf-bridge-'))
  localDb = openDb(':memory:', { username: 'admin', password: 'x' })
  fake = makeFakeMysql()
  fakeCfg = { host: 'db.example.ir', port: 3306, user: 'meelano_cms', password: 's3cret', database: 'meelano_cms', prefix: 'pf_' }
  bridge = createMysqlBridge({ openMysql: async () => fake, localDb, dataDir: dir })
})
afterAll(() => { try { bridge.stop(); rmSync(dir, { recursive: true, force: true }) } catch { /* noop */ } })

describe('پل MySQL — چرخه کامل', () => {
  it('test:_ping نسخه و شناسایی جداول موجود', async () => {
    const r = await bridge.test(fakeCfg)
    expect(r.ok).toBe(true)
    expect(r.version).toContain('meelano-fake')
  })

  it('test: اعتبارسنجی فیلدهای اجباری', async () => {
    await expect(bridge.test({ user: '', database: '' })).rejects.toThrow(/الزامی/)
  })

  it('apply: ساخت ۱۵ جدول + جایگذاری داده + kv', async () => {
    const out = await bridge.apply({ ...fakeCfg })
    expect(out.ok).toBe(true)
    const names = Object.keys(fake.tables)
    expect(names.length).toBe(15)
    for (const c of ['products', 'posts', 'coupons', 'orders', 'order_items', 'transactions', 'audit', 'logins', 'push_subs', 'users', 'sessions', 'kv']) expect(names).toContain(`pf_${c}`)
    const nProd = localDb.getState().products.length
    expect(fake.tables.pf_products.rows.length).toBe(nProd)
    expect(fake.tables.pf_kv.rows.some((r) => r.k === 'settings')).toBe(true)
    expect(bridge.getState().enabled).toBe(true)
    expect(bridge.getState().connected).toBe(true)
    expect(bridge.getState().version).toContain('fake')
  })

  it('health: همه جداول ok با شمارش سطر', async () => {
    const h = await bridge.health()
    expect(h.enabled).toBe(true)
    expect(h.tables.every((t) => t.status === 'ok')).toBe(true)
    expect(h.tables.find((t) => t.table === 'products').rows).toBeGreaterThan(0)
  })

  it('repair: ستون جاافتاده → ALTER؛ جدول حذف‌شده → CREATE', async () => {
    fake.tables.pf_products.cols = ['id', 'data'] // خراب‌سازی عمدی ساختار
    let h = await bridge.health()
    expect(h.tables.find((t) => t.table === 'products').status).toBe('broken')
    const r = await bridge.repair({})
    expect(r.tables.find((t) => t.table === 'products').status).toBe('ok')
    expect(fake.tables.pf_products.cols).toContain('pos')
    expect(fake.tables.pf_products.cols).toContain('updated_at')
    delete fake.tables.pf_messages // غایب کامل
    h = await bridge.health()
    expect(h.tables.find((t) => t.table === 'messages').status).toBe('missing')
    const r2 = await bridge.repair({})
    expect(r2.tables.find((t) => t.table === 'messages').status).toBe('ok')
  })

  it('repair rebuild: جدول معیوب با drop+create هم‌ساز می‌شود', async () => {
    fake.tables.pf_orders = { cols: ['id', 'ref', 'weird_col'], rows: [{ id: 1, ref: 'x', weird_col: 1 }] }
    const r = await bridge.repair({ rebuild: ['orders'] })
    expect(r.tables.find((t) => t.table === 'orders').repaired).toBe('rebuilt')
    expect(fake.tables.pf_orders.rows.length).toBe(0)
    await bridge.push()
    expect(fake.tables.pf_orders.cols).toContain('payable')
  })

  it('push: دگرگونی پنل (afزودن محصول) روی MySQL جایگذاری می‌شود', async () => {
    const st = localDb.getState()
    st.products.push({ id: 555, title: 'میلانو همگام', cat: 'legging', price: 99000, stock: 2, sold: 0, desc: '', image: '' })
    localDb.replaceState(st)
    localDb.bumpRev()
    const out = await bridge.push()
    expect(out.ok).toBe(true)
    expect(fake.tables.pf_products.rows.some((r) => String(JSON.parse(r.data).title) === 'میلانو همگام')).toBe(true)
  })

  it('pull: ویرایش روی میزبان → بازگشت به موتور محلی و bump rev', async () => {
    const row = fake.tables.pf_products.rows.find((r) => Number(r.id) === 555)
    row.data = JSON.stringify({ id: 555, title: 'عنوان از دیتابیس هاست', cat: 'legging', price: 88000, stock: 5, sold: 0, desc: '', image: '' })
    const revBefore = localDb.getRev()
    const out = await bridge.pull()
    expect(out.rows.products).toBe(fake.tables.pf_products.rows.length)
    expect(localDb.getState().products.find((p) => p.id === 555).title).toBe('عنوان از دیتابیس هاست')
    expect(localDb.getRev()).toBeGreaterThan(revBefore)
  })

  it('config بازنویسی‌شده → boot خودکار پس از ری‌استارت (disconnect+boot)', async () => {
    await bridge.disconnect()
    expect(bridge.getState().connected).toBe(false)
    await bridge.apply(fakeCfg) // اتصال مجدد → کانفیگ enabled روی دیسک
    await bridge.stop()
    const bridge2 = createMysqlBridge({ openMysql: async () => makeFakeMysql(), localDb, dataDir: dir })
    const ok = await bridge2.boot()
    expect(ok).toBe(true)
    const s = bridge2.getState()
    expect(s.enabled).toBe(true)
    expect(s.config.password).toBe('••••••••') // رمز در پاسخ عمومی ماسک می‌شود
    expect(s.config.user).toBe('meelano_cms')
    bridge2.stop()
  })

  it('getState: rev محلی و انتظار جداول', () => {
    const s = bridge.getState()
    expect(s.localRev).toBeGreaterThan(0)
    expect(s.tablesExpected).toBe(15)
  })
})
