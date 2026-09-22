// ============================================================================
// پل دیتابیس — همگام‌سازی زنده با MySQL هاست اشتراکی (cPanel)
// پنل و فروشگاه روی موتور محلی (SQLite) می‌چرخند؛ این لایه پس از «اعمال»،
// همهٔ جداول هر بخش از پنل را روی MySQL میزبان می‌سازد، داده را جایگذاری
// می‌کند، هر دگرگونی تازه را همگام نگه می‌دارد و سلامت/تطبیق/ترمیم جداول را
// گزارش و اصلاح می‌کند. فروشگاه همان داده‌های همگام‌شده را از API می‌خواند.
// (منطق schema محض و واحد-آزمون‌پذیر؛ اتصال قابل‌تزریق برای تست)
// ============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export const COLL_TABLES = [
  ['products', 'محصولات'],
  ['posts', 'پست‌ها و محتوا'],
  ['coupons', 'کدهای تخفیف'],
  ['messages', 'پیام‌ها'],
  ['requests', 'درخواست‌های همکاری'],
  ['provinces', 'استان‌ها و شهرها'],
]

const LONG = 'LONGTEXT'

/** ساختار مورد انتظار هر جدول — مرجع «تطبیق و ترمیم» برای سلامت */
export function expectedSchema(prefix = 'pf_') {
  const base = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
  const render = (cols) => `(${cols.map((c) => (c.raw ? `  ${c.raw}` : `  \`${c.name}\` ${c.ddl}`)).join(',\n')})\n  ${base}`
  const mk = (short, label, cols) => {
    const name = `${prefix}${short}`
    return { name, short, label, cols, ddl: `CREATE TABLE IF NOT EXISTS \`${name}\`\n${render(cols)}` }
  }
  const collCols = [
    { name: 'id', ddl: 'BIGINT NOT NULL' },
    { name: 'pos', ddl: 'INT NOT NULL DEFAULT 0' },
    { name: 'data', ddl: `${LONG} NOT NULL` },
    { name: 'updated_at', ddl: 'VARCHAR(32) NOT NULL' },
    { raw: 'PRIMARY KEY (`id`)', name: 'PRIMARY KEY', virtual: true },
    { raw: 'KEY `pos_idx` (`pos`)', name: 'pos_idx', virtual: true },
  ]
  const AI = { name: 'id', ddl: 'BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY' }
  return [
    ...COLL_TABLES.map(([c, label]) => mk(c, label, collCols.map((x) => ({ ...x })))),
    mk('orders', 'سفارش‌ها', [
      AI,
      { name: 'ref', ddl: 'VARCHAR(64) NOT NULL UNIQUE' },
      { name: 'buyer', ddl: 'VARCHAR(120) NOT NULL' },
      { name: 'phone', ddl: 'VARCHAR(32) NOT NULL' },
      { name: 'address', ddl: `${LONG} NOT NULL` },
      { name: 'note', ddl: LONG },
      { name: 'items', ddl: `${LONG} NOT NULL` },
      { name: 'total', ddl: 'BIGINT NOT NULL DEFAULT 0' },
      { name: 'discount', ddl: 'BIGINT NOT NULL DEFAULT 0' },
      { name: 'payable', ddl: 'BIGINT NOT NULL DEFAULT 0' },
      { name: 'coupon', ddl: 'VARCHAR(40)' },
      { name: 'authority', ddl: 'VARCHAR(80)' },
      { name: 'carrier', ddl: 'VARCHAR(64)' },
      { name: 'tracking', ddl: 'VARCHAR(80)' },
      { name: 'timeline', ddl: LONG },
      { name: 'status', ddl: 'VARCHAR(16) NOT NULL' },
      { name: 'ref_id', ddl: 'VARCHAR(80)' },
      { name: 'created_at', ddl: 'VARCHAR(32) NOT NULL' },
      { name: 'verified_at', ddl: 'VARCHAR(32)' },
    ]),
    mk('order_items', 'اقلام سفارش‌ها', [
      AI,
      { name: 'order_ref', ddl: 'VARCHAR(64) NOT NULL' },
      { name: 'product_id', ddl: 'BIGINT NOT NULL' },
      { name: 'title', ddl: 'VARCHAR(180) NOT NULL' },
      { name: 'qty', ddl: 'INT NOT NULL DEFAULT 1' },
      { name: 'price', ddl: 'BIGINT NOT NULL DEFAULT 0' },
      { raw: 'KEY `oref_idx` (`order_ref`)', name: 'oref_idx', virtual: true },
    ]),
    mk('transactions', 'تراکنش‌های پرداخت', [
      AI,
      { name: 'authority', ddl: 'VARCHAR(64) NOT NULL UNIQUE' },
      { name: 'amount', ddl: 'BIGINT NOT NULL' },
      { name: 'description', ddl: 'VARCHAR(255)' },
      { name: 'status', ddl: 'VARCHAR(16) NOT NULL' },
      { name: 'ref_id', ddl: 'VARCHAR(80)' },
      { name: 'gateway', ddl: 'VARCHAR(24) NOT NULL' },
      { name: 'coupon', ddl: 'VARCHAR(40)' },
      { name: 'created_at', ddl: 'VARCHAR(32) NOT NULL' },
      { name: 'verified_at', ddl: 'VARCHAR(32)' },
    ]),
    mk('audit', 'گزارش ممیزی', [
      AI,
      { name: 'username', ddl: 'VARCHAR(80) NOT NULL' },
      { name: 'action', ddl: 'VARCHAR(40) NOT NULL' },
      { name: 'entity', ddl: 'VARCHAR(80)' },
      { name: 'detail', ddl: 'VARCHAR(320)' },
      { name: 'at', ddl: 'VARCHAR(32) NOT NULL' },
    ]),
    mk('logins', 'لاگ ورود‌ها', [
      AI,
      { name: 'username', ddl: 'VARCHAR(80) NOT NULL' },
      { name: 'ok', ddl: 'TINYINT NOT NULL DEFAULT 0' },
      { name: 'ip', ddl: 'VARCHAR(48)' },
      { name: 'at', ddl: 'VARCHAR(32) NOT NULL' },
    ]),
    mk('push_subs', 'اشتراک‌های پوش‌نوتیف', [
      { name: 'endpoint', ddl: 'VARCHAR(191) NOT NULL PRIMARY KEY' },
      { name: 'keys', ddl: `${LONG} NOT NULL` },
      { name: 'created_at', ddl: 'VARCHAR(32) NOT NULL' },
    ]),
    mk('users', 'کاربران پنل', [
      { name: 'username', ddl: 'VARCHAR(80) NOT NULL PRIMARY KEY' },
      { name: 'passhash', ddl: 'VARCHAR(255) NOT NULL' },
      { name: 'role', ddl: "VARCHAR(24) NOT NULL DEFAULT 'admin'" },
      { name: 'created_at', ddl: 'VARCHAR(32) NOT NULL' },
    ]),
    mk('sessions', 'نشست‌های فعال', [
      { name: 'token', ddl: 'VARCHAR(191) NOT NULL PRIMARY KEY' },
      { name: 'username', ddl: 'VARCHAR(80) NOT NULL' },
      { name: 'expires_at', ddl: 'BIGINT NOT NULL' },
    ]),
    mk('kv', 'تنظیمات سایت و نسخهٔ داده', [
      { name: 'k', ddl: 'VARCHAR(64) NOT NULL PRIMARY KEY' },
      { name: 'v', ddl: `${LONG} NOT NULL` },
    ]),
  ]
}

/** فقط ستون‌های داده‌ای (بدون کلیدهای مجازی) برای مقایسهٔ information_schema */
export function expectedColumns(t) {
  return t.cols.filter((c) => !c.virtual).map((c) => c.name)
}

/** مقایسهٔ ستون‌های موجود با ساختار اصلی → وضعیت ok/broken/missing */
export function diffTable(table, actualCols) {
  if (!actualCols || !actualCols.length) {
    return { table: table.short, label: table.label, exists: false, status: 'missing', missingColumns: expectedColumns(table) }
  }
  const want = expectedColumns(table)
  const have = actualCols.map((c) => String(c.Field ?? c.field ?? c.COLUMN_NAME ?? '')).filter(Boolean)
  const haveLow = new Set(have.map((x) => x.toLowerCase()))
  const wantLow = new Set(want.map((x) => x.toLowerCase()))
  const missingColumns = want.filter((x) => !haveLow.has(x.toLowerCase()))
  const extraColumns = have.filter((x) => !wantLow.has(x.toLowerCase()))
  const status = missingColumns.length ? 'broken' : 'ok'
  return { table: table.short, label: table.label, exists: true, status, missingColumns, extraColumns }
}

export const DEFAULT_CFG = { host: 'localhost', port: 3306, user: '', password: '', database: '', prefix: 'pf_', ssl: false }
export function normalizeCfg(raw = {}) {
  const c = { ...DEFAULT_CFG, ...raw }
  c.port = Math.min(65535, Math.max(1, Number(c.port) || 3306))
  c.prefix = (String(c.prefix || 'pf_').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 12) || 'pf_')
  if (!/_$/.test(c.prefix)) c.prefix += '_'
  c.ssl = !!c.ssl
  c.database = String(c.database || '').replace(/[^a-zA-Z0-9_$]/g, '').slice(0, 64)
  c.user = String(c.user || '').slice(0, 80)
  c.host = String(c.host || 'localhost').trim().slice(0, 120)
  return c
}
export function maskCfg(c) { return { ...c, password: c.password ? '••••••••' : '' } }

/**
 * ساخت پل. تزریقات:
 *  openMysql?(cfg)→pool-like {query, end}  — پیش‌فرض mysql2/promise
 *  localDb → نمای SQLite فعال (getState/getRev/replaceState/bumpRev/raw/listOrders/listTx/listUsers…)
 */
export function createMysqlBridge({ openMysql, localDb, dataDir, log = () => {}, onSync = null }) {
  const cfgPath = join(dataDir, 'db-config.json')
  let cfg = { enabled: false, mysql: { ...DEFAULT_CFG }, syncUsers: false, importLocal: true }
  let conn = null
  let loop = null
  let lastPushedRev = -1
  let status = { connected: false, lastSyncAt: 0, lastErr: '', pending: 0, running: false, serverVersion: '' }
  try { if (existsSync(cfgPath)) cfg = { ...cfg, ...JSON.parse(readFileSync(cfgPath, 'utf8')) } } catch { /* کانفیگ خراب = پیش‌فرض */ }

  const P = () => cfg.mysql?.prefix || 'pf_'
  const save = () => { try { writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), { mode: 0o600 }) } catch (e) { log('db-config save failed:', e.message) } }
  /** خوراک یکسان برای mysql2 ([rows,fields]) و ماک‌های تست (rows) */
  async function qr(k, sql, params = []) {
    const out = await k.query(sql, params)
    return Array.isArray(out) && Array.isArray(out[0]) ? out[0] : out
  }
  const q = (sql, params = []) => qr(conn, sql, params)

  async function openFresh(c) { return openMysql ? await openMysql(c) : await mysqlOpen(c) }

  async function test(rawCfg) {
    const c = normalizeCfg(rawCfg)
    if (!c.user || !c.database) throw new Error('نام کاربری دیتابیس و نام دیتابیس الزامی است.')
    const k = await openFresh(c)
    try {
      const v = await qr(k, 'SELECT VERSION() AS v')
      const t = await qr(k, 'SELECT table_name AS n FROM information_schema.tables WHERE table_schema=? AND table_name LIKE ?', [c.database, `${c.prefix}%`])
      return { ok: true, version: String(v[0]?.v ?? ''), existingTables: (t || []).map((r) => String(r.n ?? r.N)) }
    } finally { try { await k.end?.() } catch { /* noop */ } }
  }

  async function ensureSchema(k, prefix) {
    const report = []
    const rows = await qr(k, 'SELECT table_name AS n FROM information_schema.tables WHERE table_schema=DATABASE()')
    const have = new Set((rows || []).map((r) => String(r.n ?? r.N ?? '').toLowerCase()))
    for (const t of expectedSchema(prefix)) {
      if (have.has(t.name.toLowerCase())) { report.push({ table: t.short, action: 'kept' }); continue }
      await k.query(t.ddl)
      report.push({ table: t.short, action: 'created' })
    }
    return report
  }

  /** سلامت (و در صورت repair=true ترمیم): ساخت جدول، افزودن ستون، rebuild اجباری */
  async function healthOf(k, prefix, { repair = false, rebuild = [] } = {}) {
    const out = []
    for (const t of expectedSchema(prefix)) {
      const cols = (await qr(k, 'SELECT column_name AS Field FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?', [t.name])) || []
      let d = diffTable(t, cols)
      if (repair && d.status === 'missing') { await k.query(t.ddl); d = { ...d, status: 'ok', repaired: 'created', missingColumns: [] } }
      else if (repair && d.status === 'broken') {
        if (rebuild.includes(t.short)) {
          await k.query(`DROP TABLE IF EXISTS \`${t.name}\``)
          await k.query(t.ddl)
          d = { ...d, status: 'ok', repaired: 'rebuilt', missingColumns: [] }
        } else {
          const byName = Object.fromEntries(t.cols.filter((c) => !c.virtual).map((c) => [c.name, c.ddl]))
          for (const m of d.missingColumns) await k.query(`ALTER TABLE \`${t.name}\` ADD COLUMN \`${m}\` ${byName[m]}`)
          d = { ...d, status: 'ok', repaired: 'altered', missingColumns: [] }
        }
      }
      let rows = null
      if (d.exists) { try { const r = await qr(k, `SELECT COUNT(*) AS n FROM \`${t.name}\``); rows = Number(r[0]?.n ?? 0) } catch { rows = null } }
      out.push({ ...d, rows })
    }
    return out
  }

  /* ================= Push: جایگذاری کامل دادهٔ پنل روی MySQL ================= */
  async function pushAll() {
    const prefix = P()
    const st = localDb.getState()
    const now = new Date().toISOString()
    for (const [coll] of COLL_TABLES) {
      const rows = Array.isArray(st[coll]) ? st[coll] : []
      await q(`DELETE FROM \`${prefix}${coll}\``)
      for (let i = 0; i < rows.length; i++) {
        const id = Number.isInteger(Number(rows[i]?.id)) && Number(rows[i].id) > 0 ? Number(rows[i].id) : i + 1
        await q(`INSERT INTO \`${prefix}${coll}\` (id,pos,data,updated_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE pos=VALUES(pos), data=VALUES(data), updated_at=VALUES(updated_at)`,
          [id, i, JSON.stringify(rows[i]), now])
      }
    }
    await q(`REPLACE INTO \`${prefix}kv\` (k,v) VALUES (?,?)`, ['settings', JSON.stringify(st.settings || {})])
    await q(`REPLACE INTO \`${prefix}kv\` (k,v) VALUES (?,?)`, ['rev', String(localDb.getRev())])
    await q(`REPLACE INTO \`${prefix}kv\` (k,v) VALUES (?,?)`, ['updated_at', now])

    const orders = localDb.listOrders(300) || []
    await q(`DELETE FROM \`${prefix}order_items\``)
    await q(`DELETE FROM \`${prefix}orders\``)
    for (const o of orders) {
      await q(`INSERT INTO \`${prefix}orders\` (ref,buyer,phone,address,note,items,total,discount,payable,coupon,authority,carrier,tracking,timeline,status,ref_id,created_at,verified_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [o.ref, o.buyer, o.phone, o.address, o.note || '', JSON.stringify(o.items || []), Number(o.total) || 0, Number(o.discount) || 0, Number(o.payable) || 0,
        o.coupon || null, o.authority || null, o.carrier || null, o.tracking || null, JSON.stringify(o.timeline || []), o.status, o.ref_id || null, o.created_at, o.verified_at || null])
      for (const it of o.items || []) {
        await q(`INSERT INTO \`${prefix}order_items\` (order_ref,product_id,title,qty,price) VALUES (?,?,?,?,?)`,
          [o.ref, Number(it.id) || 0, String(it.title ?? it.name ?? '').slice(0, 180), Math.max(1, Number(it.qty) || 1), Number(it.price) || 0])
      }
    }

    const tx = (await localDb.listTx()) || []
    await q(`DELETE FROM \`${prefix}transactions\``)
    for (const t of tx) await q(`INSERT INTO \`${prefix}transactions\` (authority,amount,description,status,ref_id,gateway,coupon,created_at,verified_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      [t.authority, Number(t.amount) || 0, String(t.description || ''), t.status, t.ref_id || null, t.gateway, t.coupon || null, t.created_at, t.verified_at || null])

    const au = localDb.listAudit(2000, 0)
    await q(`DELETE FROM \`${prefix}audit\``)
    for (const a of au?.items || []) await q(`INSERT INTO \`${prefix}audit\` (username,action,entity,detail,at) VALUES (?,?,?,?,?)`,
      [a.username, a.action, a.entity || '', a.detail || '', a.at])
    const lg = (await localDb.listLogins()) || []
    await q(`DELETE FROM \`${prefix}logins\``)
    for (const l of lg) await q(`INSERT INTO \`${prefix}logins\` (username,ok,ip,at) VALUES (?,?,?,?)`, [l.username, l.ok ? 1 : 0, l.ip || '', l.at])

    const subs = (await localDb.pushList()) || []
    await q(`DELETE FROM \`${prefix}push_subs\``)
    for (const s of subs) await q(`INSERT INTO \`${prefix}push_subs\` (endpoint,keys,created_at) VALUES (?,?,?)`, [s.endpoint, typeof s.keys === 'string' ? s.keys : JSON.stringify(s.keys), s.created_at])

    if (cfg.syncUsers) {
      const us = localDb.raw.prepare('SELECT username, passhash, role, created_at FROM users').all()
      await q(`DELETE FROM \`${prefix}users\``)
      for (const u of us) await q(`INSERT INTO \`${prefix}users\` (username,passhash,role,created_at) VALUES (?,?,?,?)`, [u.username, u.passhash || '', u.role || 'admin', u.created_at || now])
      const ss = localDb.raw.prepare('SELECT token, username, expires_at FROM sessions').all()
      await q(`DELETE FROM \`${prefix}sessions\``)
      for (const s of ss) await q(`INSERT INTO \`${prefix}sessions\` (token,username,expires_at) VALUES (?,?,?)`, [s.token, s.username, s.expires_at])
    }
    return { at: now, orders: orders.length, transactions: tx.length, collections: COLL_TABLES.map(([c]) => [c, (st[c] || []).length]) }
  }

  /* ============ Pull: فراخوانی جداول میزبان → موتور محلی (بازیابی/انتقال) ============ */
  async function pullAll() {
    const prefix = P()
    const st = { settings: null }
    const kv = await q(`SELECT k,v FROM \`${prefix}kv\``)
    for (const r of kv) if (r.k === 'settings') { try { st.settings = JSON.parse(r.v) } catch { /* noop */ } }
    let total = 0
    for (const [coll] of COLL_TABLES) {
      const rs = await q(`SELECT data FROM \`${prefix}${coll}\` ORDER BY pos`)
      st[coll] = rs.map((r) => { try { return JSON.parse(r.data) } catch { return null } }).filter(Boolean)
      total += st[coll].length
    }
    if (!total && !st.settings) throw new Error('جداول میزبان خالی‌اند؛ ابتدا «جایگذاری کامل داده» (Push) را بزنید.')
    if (!st.settings) st.settings = localDb.getState().settings
    localDb.replaceState(st)
    localDb.bumpRev()
    try { onSync && onSync('pull') } catch { /* noop */ }
    return { rows: Object.fromEntries(COLL_TABLES.map(([c]) => [c, st[c].length])), settings: true }
  }

  /* =============== حلقهٔ همگام زنده: با هر rev تازه → جایگذاری =============== */
  function startLoop() {
    stopLoop()
    lastPushedRev = localDb.getRev()
    loop = setInterval(async () => {
      if (status.running || !conn || !cfg.enabled) return
      const rev = localDb.getRev()
      if (rev === lastPushedRev) return
      status.pending = rev - lastPushedRev
      status.running = true
      try {
        await pushAll()
        lastPushedRev = rev
        status.lastSyncAt = Date.now()
        status.lastErr = ''
        status.pending = 0
        try { onSync && onSync('push') } catch { /* noop */ }
      } catch (e) {
        status.lastErr = String(e?.message || e).slice(0, 240)
        if (/table .* doesn't exist|Unknown database/i.test(status.lastErr)) status.lastErr += ' — «ساخت و تطبیق جداول» را بزنید.'
      } finally { status.running = false }
    }, 2500)
    if (loop.unref) loop.unref()
  }
  function stopLoop() { if (loop) clearInterval(loop); loop = null }

  /** اعمال: اتصال → ساخت جداول غایب → تطبیق/ترمیم → جایگذاری داده → حلقهٔ زنده */
  async function apply(rawCfg, opts = {}) {
    const c = normalizeCfg(rawCfg)
    if (!c.user || !c.database) throw new Error('نام کاربری دیتابیس و نام دیتابیس الزامی است.')
    { // فاز اول با اتصال موقت (schema) تا خطا قبل از فعال‌سازی رخ ندهد
      const k = await openFresh(c)
      try {
        status.serverVersion = String((await qr(k, 'SELECT VERSION() AS v'))[0]?.v ?? '')
        await ensureSchema(k, c.prefix)
        const report = await healthOf(k, c.prefix, { repair: true, rebuild: opts.rebuild || [] })
        opts.onReport && opts.onReport(report)
      } finally { try { await k.end?.() } catch { /* noop */ } }
    }
    if (conn) { try { await conn.end() } catch { /* noop */ } conn = null }
    cfg = { ...cfg, enabled: true, mysql: c, syncUsers: !!opts.syncUsers, importLocal: opts.importLocal !== false }
    save()
    conn = await openFresh(c)
    try {
      if (cfg.importLocal) await pushAll()
      startLoop()
      lastPushedRev = localDb.getRev()
      status = { ...status, connected: true, lastErr: '', pending: 0, lastSyncAt: Date.now() }
      return { ok: true }
    } catch (e) {
      await disconnect().catch(() => {})
      throw e
    }
  }

  async function liveCheck(opts = {}) {
    if (!conn || !cfg.enabled) return { enabled: false, tables: [] }
    try {
      const tables = await healthOf(conn, P(), opts)
      return { enabled: true, tables, prefix: P(), version: status.serverVersion, lastSyncAt: status.lastSyncAt, lastErr: status.lastErr }
    } catch (e) {
      status.lastErr = String(e?.message || e).slice(0, 240)
      return { enabled: true, error: status.lastErr, tables: [] }
    }
  }

  async function disconnect() {
    stopLoop()
    if (conn) { try { await conn.end() } catch { /* noop */ } conn = null }
    cfg = { ...cfg, enabled: false }
    save()
    status = { ...status, connected: false }
    return { ok: true }
  }

  /** پس از ری‌استارت سرور: کانفیگ فعال → اتصال و ادامهٔ همگام‌سازی */
  async function boot() {
    if (!cfg.enabled || !cfg.mysql?.user || !cfg.mysql?.database) return false
    try { conn = await openFresh(cfg.mysql); startLoop(); status = { ...status, connected: true, lastErr: '' }; return true }
    catch (e) { status.lastErr = `اتصال خودکار MySQL ناموفق: ${String(e?.message || e).slice(0, 200)}`; return false }
  }

  function getState() {
    return {
      enabled: !!cfg.enabled,
      connected: !!status.connected,
      syncUsers: !!cfg.syncUsers,
      config: maskCfg(cfg.mysql || DEFAULT_CFG),
      version: status.serverVersion,
      lastSyncAt: status.lastSyncAt,
      lastErr: status.lastErr,
      pending: status.pending,
      running: status.running,
      localRev: localDb.getRev(),
      tablesExpected: expectedSchema(P()).length,
    }
  }

  return {
    getState, test, apply, disconnect, boot, stop: stopLoop,
    health: (o) => liveCheck(o),
    repair: async (o) => { if (!conn) throw new Error('اتصال MySQL فعال نیست.'); return { tables: await healthOf(conn, P(), { repair: true, ...o }) } },
    push: async () => { const r = await pushAll(); lastPushedRev = localDb.getRev(); status.lastSyncAt = Date.now(); status.pending = 0; return { ok: true, ...r } },
    pull: () => pullAll(),
  }
}

/* درایور واقعی — lazy import تا بدون نصب mysql2 هم ماژول بارگذاری/تست شود */
async function mysqlOpen(c) {
  const { createPool } = await import('mysql2/promise')
  return createPool({
    host: c.host, port: c.port, user: c.user, password: c.password, database: c.database,
    ssl: c.ssl ? { rejectUnauthorized: false } : undefined,
    waitForConnections: true, connectionLimit: 6, charset: 'utf8mb4_unicode_ci',
  })
}
