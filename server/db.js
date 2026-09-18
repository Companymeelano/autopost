// ============================================================================
// لایه دیتابیس — node:sqlite داخلی (بدون وابستگی خارجی)
// هر موجود در جدول records به‌صورت سطر JSON (coll + id + pos) ذخیره می‌شود؛
// تنظیمات/rev در kv؛ کاربران/نشست‌ها/تراکنش‌ها/ممیزی/ورودها جداول مستقل‌اند.
// ============================================================================
import { createRequire } from 'node:module'
//绕过 — Vite/vitest در externalize کردن node:sqlite مشکل دارد؛ require مستقیم پایدار است
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { defaultState, COLL_KEYS } from '../src/data/seeds.js'
import { hashPassword, newToken } from './lib.js'

const DAY = 24 * 3600 * 1000

export function openDb(dbPath, adminCreds = { username: 'admin', password: '12345' }) {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      coll TEXT NOT NULL, id INTEGER NOT NULL, data TEXT NOT NULL, pos INTEGER NOT NULL,
      PRIMARY KEY (coll, id)
    );
    CREATE INDEX IF NOT EXISTS idx_records_coll ON records(coll, pos);
    CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY, passhash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, username TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, authority TEXT UNIQUE NOT NULL,
      amount INTEGER NOT NULL, description TEXT, status TEXT NOT NULL,
      ref_id TEXT, gateway TEXT NOT NULL, coupon TEXT,
      created_at TEXT NOT NULL, verified_at TEXT
    );
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL,
      action TEXT NOT NULL, entity TEXT, detail TEXT, at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_at ON audit(at DESC);
    CREATE TABLE IF NOT EXISTS push_subs (
      endpoint TEXT PRIMARY KEY, keys TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ref TEXT UNIQUE NOT NULL,
      buyer TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL, note TEXT,
      items TEXT NOT NULL, total INTEGER NOT NULL, discount INTEGER NOT NULL DEFAULT 0,
      payable INTEGER NOT NULL, coupon TEXT, authority TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'waiting', ref_id TEXT,
      created_at TEXT NOT NULL, verified_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE TABLE IF NOT EXISTS logins (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL,
      ok INTEGER NOT NULL, ip TEXT, at TEXT NOT NULL
    );
  `)
  // مهاجرت ملایم برای دیتابیس‌های فاز قبل
  try { db.exec('ALTER TABLE transactions ADD COLUMN coupon TEXT') } catch { /* موجود */ }
  // فاز ۵ — مرسوله و گاه‌شمار وضعیت سفارش
  try { db.exec('ALTER TABLE orders ADD COLUMN carrier TEXT') } catch { /* موجود */ }
  try { db.exec('ALTER TABLE orders ADD COLUMN tracking TEXT') } catch { /* موجود */ }
  try { db.exec("ALTER TABLE orders ADD COLUMN timeline TEXT NOT NULL DEFAULT '[]'") } catch { /* موجود */ }
  try { db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'") } catch { /* موجود */ }

  // --- seed یک‌باره ---
  const seeded = db.prepare("SELECT v FROM kv WHERE k='seeded'").get()
  if (!seeded) {
    const s = defaultState()
    const ins = db.prepare('INSERT INTO records (coll, id, data, pos) VALUES (?,?,?,?)')
    for (const key of COLL_KEYS) {
      s[key].forEach((row, i) => ins.run(key, Number(row.id) || i + 1, JSON.stringify(row), i))
    }
    db.prepare("INSERT INTO kv (k, v) VALUES ('settings', ?)").run(JSON.stringify(s.settings))
    db.prepare("INSERT INTO kv (k, v) VALUES ('seeded', '1')").run()
    db.prepare("INSERT INTO kv (k, v) VALUES ('rev', '1')").run()
  }
  if (!db.prepare('SELECT username FROM users LIMIT 1').get()) {
    db.prepare('INSERT INTO users (username, passhash, role, created_at) VALUES (?,?,?,?)')
      .run(adminCreds.username, hashPassword(adminCreds.password), 'admin', new Date().toISOString())
    console.log(`[db] کاربر مدیر ساخته شد: ${adminCreds.username} (رمز پیش‌فرض را تغییر دهید)`)
    // دو حساب نمایشی برای حالت dev نقش‌ها (با EDITOR_PASS/FINANCE_PASS قابل تغییر)
    if (process.env.PF_TEST === '1' || process.env.SEED_DEMO_USERS === '1') {
      for (const [u, p, role] of [['editor', 'editor123', 'editor'], ['finance', 'finance123', 'finance']]) {
        try { db.prepare('INSERT INTO users (username, passhash, role, created_at) VALUES (?,?,?,?)').run(u, hashPassword(p), role, new Date().toISOString()) } catch { /* تکراری */ }
      }
    }
  }

  const stmt = {
    list: db.prepare('SELECT data FROM records WHERE coll=? ORDER BY pos'),
    getRow: db.prepare('SELECT rowid AS rid, data FROM records WHERE coll=? AND id=?'),
    updateRow: db.prepare('UPDATE records SET data=? WHERE coll=? AND id=?'),
    replaceDel: db.prepare('DELETE FROM records WHERE coll=?'),
    replaceIns: db.prepare('INSERT INTO records (coll, id, data, pos) VALUES (?,?,?,?)'),
    getKv: db.prepare('SELECT v FROM kv WHERE k=?'),
    setKv: db.prepare('INSERT INTO kv (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v'),
    findUser: db.prepare('SELECT * FROM users WHERE username=?'),
    listUsers: db.prepare('SELECT username, role, created_at FROM users ORDER BY created_at'),
    insertUser: db.prepare('INSERT INTO users (username, passhash, role, created_at) VALUES (?,?,?,?)'),
    updateUserRole: db.prepare('UPDATE users SET role=? WHERE username=?'),
    updateUserPass: db.prepare('UPDATE users SET passhash=? WHERE username=?'),
    deleteUser: db.prepare('DELETE FROM users WHERE username=?'),
    deleteSessionsOf: db.prepare('DELETE FROM sessions WHERE username=?'),
    insertSession: db.prepare('INSERT INTO sessions (token, username, expires_at) VALUES (?,?,?)'),
    getSession: db.prepare('SELECT * FROM sessions WHERE token=?'),
    delSession: db.prepare('DELETE FROM sessions WHERE token=?'),
    pruneSessions: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
    insertTx: db.prepare('INSERT INTO transactions (authority, amount, description, status, gateway, coupon, created_at) VALUES (?,?,?,?,?,?,?)'),
    getTx: db.prepare('SELECT * FROM transactions WHERE authority=?'),
    verifyTx: db.prepare("UPDATE transactions SET status='paid', ref_id=?, verified_at=? WHERE authority=? AND status='waiting'"),
    failTx: db.prepare("UPDATE transactions SET status='failed', verified_at=? WHERE authority=? AND status='waiting'"),
    listTx: db.prepare('SELECT * FROM transactions ORDER BY id DESC LIMIT 50'),
    paidInRange: db.prepare("SELECT * FROM transactions WHERE status='paid' AND verified_at >= ?"),
    insertAudit: db.prepare('INSERT INTO audit (username, action, entity, detail, at) VALUES (?,?,?,?,?)'),
    listAudit: db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ? OFFSET ?'),
    countAudit: db.prepare('SELECT COUNT(*) AS n FROM audit'),
    insertLogin: db.prepare('INSERT INTO logins (username, ok, ip, at) VALUES (?,?,?,?)'),
    listLogins: db.prepare('SELECT * FROM logins ORDER BY id DESC LIMIT 50'),
    toneStats: db.prepare("SELECT detail, COUNT(*) AS n FROM audit WHERE action='ai.caption' AND at >= ? GROUP BY detail ORDER BY n DESC LIMIT 5"),
    pushAdd: db.prepare('INSERT INTO push_subs (endpoint, keys, created_at) VALUES (?,?,?) ON CONFLICT(endpoint) DO UPDATE SET keys=excluded.keys, created_at=excluded.created_at'),
    pushDel: db.prepare('DELETE FROM push_subs WHERE endpoint=?'),
    pushList: db.prepare('SELECT * FROM push_subs ORDER BY created_at DESC LIMIT 200'),
    pushCount: db.prepare('SELECT COUNT(*) AS n FROM push_subs'),
    createOrder: db.prepare('INSERT INTO orders (ref, buyer, phone, address, note, items, total, discount, payable, coupon, authority, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'),
    orderByRef: db.prepare('SELECT * FROM orders WHERE ref=?'),
    orderByAuth: db.prepare('SELECT * FROM orders WHERE authority=?'),
    listOrders: db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT ?'),
    orderSetStatus: db.prepare("UPDATE orders SET status=?, ref_id=COALESCE(?, ref_id), verified_at=? WHERE ref=? AND status=?"),
    orderSetAuth: db.prepare('UPDATE orders SET authority=? WHERE ref=?'),
    couponRows: db.prepare('SELECT id, data FROM records WHERE coll=\'coupons\' ORDER BY pos'),
    couponSet: db.prepare('UPDATE records SET data=? WHERE coll=\'coupons\' AND id=?'),
  }

  const getRev = () => Number(stmt.getKv.get('rev')?.v ?? 1)
  const shapeOrder = (r) => ({
    ...r,
    items: JSON.parse(r.items || '[]'),
    timeline: (() => { try { return JSON.parse(r.timeline || '[]') } catch { return [] } })(),
  })

  return {
    raw: db,
    getRev,
    bumpRev() { const n = getRev() + 1; stmt.setKv.run('rev', String(n)); return n },

    /** کل وضعیت CMS (همه مجموعه‌ها + تنظیمات) */
    getState() {
      const out = {}
      for (const key of COLL_KEYS) out[key] = stmt.list.all(key).map((r) => JSON.parse(r.data))
      out.settings = JSON.parse(stmt.getKv.get('settings')?.v ?? 'null') ?? defaultState().settings
      return out
    },

    /** جایگزینی اتمیک همه مجموعه‌ها + تنظیمات (هماتای PUT /api/state) */
    replaceState(next) {
      db.exec('BEGIN')
      try {
        for (const key of COLL_KEYS) {
          stmt.replaceDel.run(key)
          ;(next[key] || []).forEach((row, i) => {
            const rid = Number.isInteger(Number(row.id)) && Number(row.id) > 0 ? Number(row.id) : i + 1
            stmt.replaceIns.run(key, rid, JSON.stringify(row), i)
          })
        }
        if (next.settings) stmt.setKv.run('settings', JSON.stringify(next.settings))
        stmt.setKv.run('updated_at', new Date().toISOString())
        db.exec('COMMIT')
      } catch (e) { db.exec('ROLLBACK'); throw e }
    },

    /** به‌روزرسانی هدفمند یک رکورد (برای scheduler/redeem بدون بازنویسی کل سند) */
    updateRecord(coll, id, data) {
      return stmt.updateRow.run(JSON.stringify(data), coll, Number(id)).changes > 0
    },
    getRecord(coll, id) {
      const r = stmt.getRow.get(coll, Number(id))
      return r ? JSON.parse(r.data) : null
    },

    emptyState() {
      return COLL_KEYS.every((key) => stmt.list.all(key).length === 0)
    },

    /* --- کاربر و نشست --- */
    findUser(username) { return stmt.findUser.get(String(username)) || null },
    listUsers() { return stmt.listUsers.all() },
    createUser(username, passhash, role) {
      stmt.insertUser.run(username, passhash, role, new Date().toISOString())
    },
    setUserRole(username, role) { return stmt.updateUserRole.run(role, username).changes > 0 },
    destroySession(token) { if (token) stmt.delSession.run(String(token)) },
    setPassword(username, newHash) { stmt.updateUserPass.run(newHash, username) },
    deleteUser(username) { stmt.deleteSessionsOf.run(username); return stmt.deleteUser.run(username).changes > 0 },
    createSession(username) {
      const token = newToken()
      stmt.pruneSessions.run(Date.now())
      stmt.insertSession.run(token, username, Date.now() + 7 * DAY)
      return token
    },
    sessionUser(token) {
      if (!token) return null
      const s = stmt.getSession.get(String(token))
      if (!s) return null
      if (s.expires_at < Date.now()) { stmt.delSession.run(s.token); return null }
      return s.username
    },
    touchSeed() { stmt.setKv.run('seeded', new Date().toISOString()) },
    dropSessions(username) { stmt.deleteSessionsOf.run(username) },
    /* --- گزارش مالی (فاز ۴) --- */
    financeReport(fromIso, toIso) {
      const norm = (v, fb) => { if (v == null || v === '') return fb; const d = new Date(String(v)); return isNaN(d) ? fb : d }
      const F = norm(fromIso, new Date(0)).toISOString()
      const T = norm(toIso, new Date(Date.now() + 86400_000)).toISOString()
      const orders = db.prepare("SELECT * FROM orders WHERE created_at >= ? AND created_at <= ? ORDER BY id DESC").all(F, T)
      const paid = orders.filter((o) => ['paid', 'shipped'].includes(o.status))
      const cancelledPaid = orders.filter((o) => o.status === 'cancelled' && o.ref_id)
      const agg = {
        from: F.slice(0, 10), to: T.slice(0, 10),
        orderCount: paid.length,
        gross: paid.reduce((a, o) => a + o.total, 0),
        discounts: paid.reduce((a, o) => a + (o.discount || 0), 0),
        collected: paid.reduce((a, o) => a + o.payable, 0),
        refunds: cancelledPaid.reduce((a, o) => a + o.payable, 0),
        refundCount: cancelledPaid.length,
      }
      agg.daily = db.prepare("SELECT substr(verified_at,1,10) AS d, SUM(amount) AS total, COUNT(*) AS n FROM transactions WHERE status='paid' AND verified_at >= ? AND verified_at <= ? GROUP BY d ORDER BY d").all(F, T)
      agg.cancellations = db.prepare("SELECT substr(verified_at,1,10) AS d, COUNT(*) AS n, SUM(payable) AS total FROM orders WHERE status='cancelled' AND ref_id IS NOT NULL AND ref_id != '' AND verified_at >= ? AND verified_at <= ? GROUP BY d ORDER BY d").all(F, T)
      agg.coupons = db.prepare("SELECT coupon AS code, COUNT(*) AS n, SUM(discount) AS total FROM orders WHERE coupon IS NOT NULL AND status IN ('paid','shipped') AND created_at >= ? AND created_at <= ? GROUP BY coupon ORDER BY total DESC").all(F, T)
      agg.byGateway = db.prepare("SELECT gateway, COUNT(*) AS n, SUM(amount) AS total FROM transactions WHERE status='paid' AND verified_at >= ? AND verified_at <= ? GROUP BY gateway").all(F, T)
      agg.byStatus = orders.reduce((m2, o) => { m2[o.status] = (m2[o.status] || 0) + 1; return m2 }, {})
      return agg
    },

    /* --- اشتراک پوش (فاز ۴) --- */
    pushAdd(endpoint, keysJson) { return stmt.pushAdd.run(String(endpoint), keysJson, new Date().toISOString()).changes },
    pushRemove(endpoint) { return stmt.pushDel.run(String(endpoint)).changes },
    pushList() { return stmt.pushList.all().map((r) => ({ ...r, keys: JSON.parse(r.keys) })) },
    pushCount() { return stmt.pushCount.get().n },

    /* --- سفارش‌ها (فاز ۳) — کسر موجودی اتمیک در لحظه پرداخت --- */
    createOrder(o) {
      stmt.createOrder.run(o.ref, o.buyer, o.phone, o.address, o.note || '', JSON.stringify(o.items),
        o.total, o.discount || 0, o.payable, o.coupon || null, o.authority || null, 'waiting', new Date().toISOString())
      this.orderLog(o.ref, { label: 'created' })
      return this.orderByRef(o.ref)
    },
    orderByRef(ref) { const r = stmt.orderByRef.get(String(ref)); return r && shapeOrder(r) },
    listOrders(limit = 100) { return stmt.listOrders.all(Math.min(Number(limit) || 100, 300)).map(shapeOrder) },
    orderSetAuthority(ref, authority) { stmt.orderSetAuth.run(authority, String(ref)) },
    /** تسویه سفارش: waiting→paid + کسر استوک و افزایش sold (اگر موجودی کم باشد کل تراکنش rollback) */
    settleOrder(authority, refId) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const row = stmt.orderByAuth.get(String(authority))
        if (!row) { db.exec('COMMIT'); return { ok: false, error: 'not_found' } }
        if (row.status !== 'waiting') { db.exec('COMMIT'); return { ok: row.status === 'paid' || row.status === 'shipped', deduped: true, status: row.status, ref: row.ref } }
        const items = JSON.parse(row.items)
        const rows = []
        for (const it of items) {
          const r = stmt.getRow.get('products', Number(it.id))
          if (!r) { db.exec('ROLLBACK'); return { ok: false, error: 'product_missing', productId: it.id } }
          const p = JSON.parse(r.data)
          if ((p.stock ?? 0) < it.qty) { db.exec('ROLLBACK'); return { ok: false, error: 'insufficient_stock', productId: it.id, title: p.title, stock: p.stock ?? 0, qty: it.qty } }
          rows.push([it.id, { ...p, stock: (p.stock ?? 0) - it.qty, sold: (p.sold || 0) + it.qty }])
        }
        for (const [id, data] of rows) stmt.updateRow.run(JSON.stringify(data), 'products', Number(id))
        stmt.orderSetStatus.run('paid', refId || 'DEMO-' + Date.now().toString(36).toUpperCase(), new Date().toISOString(), row.ref, 'waiting')
        db.exec('COMMIT')
        this.bumpRev()
        this.orderLog(row.ref, { label: 'paid', ref_id: refId || null })
        return { ok: true, status: 'paid', ref: row.ref }
      } catch (e) { try { db.exec('ROLLBACK') } catch { /* noop */ } throw e }
    },
    /** لغو سفارش: بازگرداندن موجودی فقط اگر پرداخت‌شده باشد */
    cancelOrder(ref) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const row = stmt.orderByRef.get(String(ref))
        if (!row || !['waiting', 'paid'].includes(row.status)) { db.exec('COMMIT'); return { ok: false, error: row ? 'bad_status' : 'not_found' } }
        if (row.status === 'paid') {
          for (const it of JSON.parse(row.items)) {
            const r = stmt.getRow.get('products', Number(it.id))
            if (!r) continue
            const p = JSON.parse(r.data)
            stmt.updateRow.run(JSON.stringify({ ...p, stock: (p.stock ?? 0) + it.qty, sold: Math.max(0, (p.sold || 0) - it.qty) }), 'products', Number(it.id))
          }
        }
        stmt.orderSetStatus.run('cancelled', null, new Date().toISOString(), row.ref, row.status)
        db.exec('COMMIT')
        this.bumpRev()
        this.orderLog(row.ref, { label: 'cancelled', refunded: row.status === 'paid' })
        return { ok: true, status: 'cancelled', refunded: row.status === 'paid' }
      } catch (e) { try { db.exec('ROLLBACK') } catch { /* noop */ } throw e }
    },
    failOrder(ref) { return stmt.orderSetStatus.run('failed', null, new Date().toISOString(), String(ref), 'waiting').changes > 0 },
    /** فاز ۵ — افزودن یک گام به گاه‌شمار وضعیت سفارش */
    orderLog(ref, entry) {
      const cur = stmt.orderByRef.get(String(ref))
      if (!cur) return null
      let tl = []
      try { tl = JSON.parse(cur.timeline || '[]') } catch { /* خراب */ }
      tl.push({ at: new Date().toISOString(), ...entry })
      if (tl.length > 40) tl = tl.slice(-40)
      db.prepare('UPDATE orders SET timeline=? WHERE ref=?').run(JSON.stringify(tl), String(ref))
      return tl
    },
    /** فاز ۵ — ثبت ارسال مرسوله: paid→shipped + اپراتور رهگیری + پیامک (توسط route) */
    shipOrder(ref, { carrier = '', tracking = '', by = '' } = {}) {
      const n = stmt.orderSetStatus.run('shipped', null, new Date().toISOString(), String(ref), 'paid')
      if (!(n.changes > 0)) return false
      const carrierV = String(carrier || '').trim().slice(0, 40) || null
      const trackV = String(tracking || '').replace(/\s/g, '').slice(0, 60) || null
      db.prepare('UPDATE orders SET carrier=?, tracking=? WHERE ref=?').run(carrierV, trackV, String(ref))
      this.orderLog(ref, { label: 'shipped', carrier: carrierV, tracking: trackV, by: by || null })
      return true
    },
    /** افزایش اتمی شمارنده مصرف کوپن با کد (بدون بازنویسی کل سند) */
    redeemCouponByCode(code) {
      db.exec('BEGIN IMMEDIATE')
      try {
        for (const row of stmt.couponRows.all()) {
          const c = JSON.parse(row.data)
          if (String(c.code).toUpperCase() === String(code).toUpperCase()) {
            stmt.couponSet.run(JSON.stringify({ ...c, used: (c.used || 0) + 1 }), row.id)
            db.exec('COMMIT')
            return true
          }
        }
        db.exec('COMMIT')
        return false
      } catch (e) { db.exec('ROLLBACK'); throw e }
    },
    defaultState,

    /* --- ممیزی و ورودها --- */
    audit(username, action, entity = '', detail = '') {
      stmt.insertAudit.run(String(username ?? 'anon'), action, String(entity ?? '').slice(0, 60), String(detail ?? '').slice(0, 300), new Date().toISOString())
      // سقف ساده‌ی جدول ممیزی
      if (stmt.countAudit.get().n > 5000) db.exec('DELETE FROM audit WHERE id <= (SELECT MAX(id)-4000 FROM audit)')
    },
    listAudit(limit = 100, offset = 0) {
      return { items: stmt.listAudit.all(Math.min(Number(limit) || 100, 200), Math.max(0, Number(offset) || 0)), total: stmt.countAudit.get().n }
    },
    logLogin(username, ok, ip) { stmt.insertLogin.run(String(username).slice(0, 60), ok ? 1 : 0, String(ip || '').slice(0, 45), new Date().toISOString()) },
    listLogins() { return stmt.listLogins.all() },

    /* --- تراکنش‌های پرداخت --- */
    createTx({ authority, amount, description, gateway, coupon }) {
      stmt.insertTx.run(authority, Math.trunc(amount), String(description || ''), 'waiting', gateway, coupon ? String(coupon).toUpperCase().slice(0, 30) : null, new Date().toISOString())
      return stmt.getTx.get(authority)
    },
    markTx(authority, refId = null, ok = true) {
      const r = ok ? stmt.verifyTx.run(String(refId ?? ''), new Date().toISOString(), authority)
                   : stmt.failTx.run(new Date().toISOString(), authority)
      return r.changes > 0
    },
    getTx(authority) { return stmt.getTx.get(String(authority)) || null },
    listTx() { return stmt.listTx.all() },
    paidSince(isoDate) { return stmt.paidInRange.all(isoDate) },
    toneStatsSince(isoDate) { return stmt.toneStats.all(isoDate) },
  }
}
