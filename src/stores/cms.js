// ============================================================================
// استور مرکزی پنل (Pinia) — منبع واحد حقیقت + اتوسیو localStorage
// ============================================================================
import { defineStore } from 'pinia'
import { ref, reactive, watch } from 'vue'
import { nextIdOf } from '../utils/format.js'
import { apiFetch, checkOnline } from '../utils/api.js'
import { COLL_KEYS } from '../data/seeds.js'
import { mergeCollection } from '../utils/merge.js'

const STORAGE_KEY = 'panahfit_cms_v1'

import { defaultState } from '../data/seeds.js'

function lsGet(k) { try { return localStorage.getItem(k) } catch { return null } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true } catch { return false } }

function loadState() {
  const d = defaultState()
  try {
    const raw = lsGet(STORAGE_KEY)
    if (!raw) return d
    const p = JSON.parse(raw)
    for (const key of ['products', 'posts', 'coupons', 'requests', 'messages', 'provinces']) {
      if (Array.isArray(p[key])) d[key] = p[key]
    }
    if (p.settings && typeof p.settings === 'object') Object.assign(d.settings, p.settings)
  } catch (err) { console.warn('خطا در بارگذاری وضعیت ذخیره‌شده:', err) }
  return d
}

export const useCms = defineStore('cms', () => {
  const initial = loadState()
  // --- داده‌ها ---
  const products = reactive(initial.products)
  const posts = reactive(initial.posts)
  const coupons = reactive(initial.coupons)
  const requests = reactive(initial.requests)
  const messages = reactive(initial.messages)
  const provinces = reactive(initial.provinces)
  const settings = reactive(initial.settings)

  // --- وضعیت نشست و UI ---
  const authed = ref(false)
  const toasts = reactive([])
  let toastSeq = 0
  const modal = reactive({ open: false, title: '', view: null, props: {} })

  // --- اتوسیو (deep watcher) به localStorage ---
  let saveTimer = null
  let quotaWarned = false
  function persist() {
    if (saveTimer) return
    saveTimer = setTimeout(() => {
      saveTimer = null
      const ok = lsSet(STORAGE_KEY, JSON.stringify({ products, posts, coupons, requests, messages, provinces, settings }))
      if (!ok && !quotaWarned) {
        quotaWarned = true
        toast('ذخیره در حافظه محلی انجام نشد (دسترسی نیست یا پر است).', true)
      } else if (ok) quotaWarned = false
      queuePush()
    }, 250)
  }
  watch([products, posts, coupons, requests, messages, provinces, settings], persist, { deep: true })

  // --- Toast ---
  function toast(text, error = false, action = null) {
    const id = ++toastSeq
    toasts.push({ id, text, error, action })
    setTimeout(() => dismissToast(id), action ? 6500 : 3200)
    return id
  }
  function dismissToast(id) {
    const i = toasts.findIndex((t) => t.id === id)
    if (i > -1) toasts.splice(i, 1)
  }
  function runToastAction(t) {
    const fn = t.action?.onAction
    dismissToast(t.id)
    if (typeof fn === 'function') fn()
  }

  // --- Modal ---
  function openModal(title, view, props = {}) {
    modal.title = title
    modal.view = view
    modal.props = props
    modal.open = true
  }
  function closeModal() {
    modal.open = false
    modal.view = null
    modal.props = {}
  }

  // --- CRUD محصولات ---
  function saveProduct(form, id = null) {
    if (id != null) {
      const p = products.find((x) => x.id === id)
      if (p) Object.assign(p, form)
      return { ok: true, product: p, actionType: 'ویرایش' }
    }
    const prod = { id: nextIdOf(products), sold: 0, ...form }
    products.push(prod)
    return { ok: true, product: prod, actionType: 'افزودن' }
  }
  function copyProduct(id) {
    const src = products.find((p) => p.id === id)
    if (!src) return null
    const clone = { ...src, id: nextIdOf(products), title: src.title + ' (کپی)' }
    products.push(clone)
    return clone
  }
  function removeProduct(id) {
    const idx = products.findIndex((p) => p.id === id)
    if (idx === -1) return null
    const [removed] = products.splice(idx, 1)
    return { removed, idx }
  }
  function restoreProduct(removed, idx) {
    products.splice(Math.min(idx, products.length), 0, removed)
  }

  // --- CRUD پست‌ها ---
  function savePost(form, id = null) {
    if (id != null) {
      const p = posts.find((x) => x.id === id)
      if (p) Object.assign(p, form)
      return p
    }
    const post = { id: nextIdOf(posts), ...form }
    posts.push(post)
    return post
  }
  function copyPost(id) {
    const src = posts.find((p) => p.id === id)
    if (!src) return null
    const clone = { ...src, id: nextIdOf(posts), title: src.title + ' (کپی)' }
    posts.push(clone)
    return clone
  }
  function removePost(id) {
    const idx = posts.findIndex((p) => p.id === id)
    if (idx === -1) return null
    const [removed] = posts.splice(idx, 1)
    return { removed, idx }
  }
  function restorePost(removed, idx) {
    posts.splice(Math.min(idx, posts.length), 0, removed)
  }

  // --- کوپن‌ها ---
  function createCoupon({ code, percent, maxUses, validFrom, validTo }) {
    const coupon = { code: code.trim().toUpperCase(), percent: Number(percent), maxUses: Number(maxUses) || 0, used: 0, active: true }
    if (validFrom) coupon.validFrom = validFrom
    if (validTo) coupon.validTo = validTo
    coupons.push(coupon)
    return coupon
  }
  function couponState(c, today = new Date().toISOString().slice(0, 10)) {
    if (!c.active) return 'off'
    if (c.validFrom && today < c.validFrom) return 'future'
    if (c.validTo && today > c.validTo) return 'expired'
    if (c.maxUses > 0 && (c.used || 0) >= c.maxUses) return 'maxed'
    return 'ok'
  }
  function removeCoupon(index) {
    const [removed] = coupons.splice(index, 1)
    return { removed, index }
  }
  function restoreCoupon(removed, index) {
    coupons.splice(Math.min(index, coupons.length), 0, removed)
  }

  // --- درخواست‌ها و پیام‌ها ---
  function resolveRequest(id) {
    const r = requests.find((x) => x.id === id)
    if (r) r.status = 'done'
  }
  function replyMessage(id, reply) {
    const m = messages.find((x) => x.id === id)
    if (!m) return false
    m.status = 'answered'
    m.reply = reply
    return true
  }

  // --- استان‌ها ---
  function saveProvince(id, { delta, ship }) {
    const p = provinces.find((x) => x.id === id)
    if (p) Object.assign(p, { delta, ship })
    return p
  }

  // --- بکاپ/بازیابی/ریست ---
  function exportPayload() {
    return JSON.stringify({ app: 'panahfit-cms', version: 3, rev: remoteRev, exportedAt: new Date().toISOString(), products, posts, coupons, requests, messages, provinces, settings }, null, 2)
  }
  function importPayload(p) {
    if (!p || !Array.isArray(p.products)) throw new Error('invalid backup')
    for (const key of ['products', 'posts', 'coupons', 'requests', 'messages', 'provinces']) {
      const target = { products, posts, coupons, requests, messages, provinces }[key]
      target.length = 0
      if (Array.isArray(p[key])) target.push(...p[key])
      else target.push(...defaultState()[key])
    }
    if (p.settings) Object.assign(settings, p.settings)
    persist()
  }
  function resetToSeed() {
    importPayload(defaultState())
  }

  // --- KPI ها ---
  function kpis() {
    const revenue = products.reduce((s, p) => s + (p.price || 0) * (p.sold || 0), 0)
    const orders = products.reduce((s, p) => s + (p.sold || 0), 0)
    const pending = requests.filter((r) => r.status === 'new').length
    return { revenue, orders, pending, productsCount: products.length }
  }


  // ===================== فاز ۲.۵ — همگام همزمان، مدیا، نقش‌ها =====================
  // localStorage منبع فوری؛ سرور منبع پایدار با rev (شماره نسخه).
  // PUT با rev → اگر نسخه سرور جلوتر باشد 409 → ادغام محلی-روی-پایه‌ی‌سرور.
  // BroadcastChannel: تب‌های دیگر همان مرورگر بلافاصله pull می‌کنند.
  const online = ref(false)
  const user = ref('')
  const role = ref('admin')
  const perms = ref([])
  const sync = reactive({ status: 'offline', lastOk: 0, lastError: '', conflict: false }) // offline|idle|saving|ok|error

  const collRefs = { products, posts, coupons, requests, messages, provinces }
  let snapshot = ''
  let remoteRev = 0
  let pushTimer = null
  let pushInFlight = false
  let pushAgain = false

  let chan = null
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      chan = new BroadcastChannel('panahfit-sync')
      chan.onmessage = async (ev) => {
        if (ev?.data?.type === 'state' && ev.data.rev && ev.data.rev !== remoteRev) await pullStateSilent()
      }
    }
  } catch { chan = null }

  const ALL_PERMS = ['state:products', 'state:posts', 'state:coupons', 'state:requests', 'state:messages', 'state:provinces', 'state:settings', 'media', 'payments', 'users', 'audit', 'ai', 'queue']
  function can(perm) {
    if (!online.value) return true // حالت محلی: همه‌چیز در دسترس (رفتار فاز قبل)
    return perms.value.includes(perm)
  }
  function canEdit(coll) { return can(`state:${coll}`) }

  function currentPayload() {
    return { products, posts, coupons, requests, messages, provinces, settings }
  }
  function payloadJson() {
    return JSON.stringify(currentPayload(), (k, v) => (typeof v === 'function' ? undefined : v))
  }
  async function migrateMedia() {
    // data: URL در state → فایل دیسک سمت سرور (dedup با hash)؛ state فقط مسیر را نگه می‌دارد
    let moved = 0
    const scan = async (rows, key) => {
      for (const row of rows) {
        const v = row?.[key]
        if (typeof v === 'string' && v.startsWith('data:image/')) {
          try { const r = await apiFetch('/media', { method: 'POST', body: { data: v } }); row[key] = r.path; moved++ } catch { /* base64 می‌ماند و کار می‌کند */ }
        }
      }
    }
    await scan(products, 'image')
    await scan(posts, 'image')
    if (moved) persist()
    return moved
  }
  function queuePush(force = false) {
    if (!online.value || !authed.value) return
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = setTimeout(() => { pushTimer = null; pushNow(force) }, force ? 0 : 600)
  }
  async function pushNow(force = false) {
    if (pushInFlight) { pushAgain = true; return }
    pushInFlight = true
    try {
      if (force) await migrateMedia()
      const json = payloadJson()
      if (!force && json === snapshot) { sync.status = 'ok'; return }
      sync.status = 'saving'
      const body = JSON.parse(json)
      if (!force && remoteRev) body.rev = remoteRev
      const r = await apiFetch('/state', { method: 'PUT', body })
      remoteRev = r.rev || remoteRev + 1
      snapshot = json
      sync.status = 'ok'
      sync.lastOk = Date.now()
      sync.lastError = ''
      sync.conflict = false
      if (chan) try { chan.postMessage({ type: 'state', rev: remoteRev }) } catch { /* noop */ }
    } catch (e) {
      if (e.status === 409 && e.data?.state) {
        await mergeConflict(e.data.state)
        return
      }
      sync.status = 'error'
      sync.lastError = e.message
      const firstField = Array.isArray(e.fields) ? e.fields[0] : null
      const msg = firstField ? `سرور: ${Object.values(firstField.fields || {})[0] || e.message}` : `سرور: ${e.message}`
      toast(`همگام‌سازی با سرور ناموفق — ${msg}`, true, { label: 'تلاش مجدد', onAction: () => pushNow(true) })
    } finally {
      pushInFlight = false
      if (pushAgain) { pushAgain = false; queuePush(true) }
    }
  }
  function diffCols(baseObj) {
    const cur = JSON.parse(payloadJson())
    const out = new Set()
    if (!baseObj) return out
    for (const key of COLL_KEYS) if (JSON.stringify(baseObj[key]) !== JSON.stringify(cur[key])) out.add(key)
    if (JSON.stringify(baseObj.settings) !== JSON.stringify(cur.settings)) out.add('settings')
    return out
  }
  async function mergeConflict(serverPayload) {
    // پایگاه: نسخه سرور؛ روی آن، فقط مجموعه‌هایی که محلاً تغییر کرده‌بودم اعمال مجدد می‌شوند
    sync.conflict = true
    const mine = JSON.parse(payloadJson())
    const mineDirty = diffCols(snapshot ? JSON.parse(snapshot) : null)
    if (!snapshot) for (const key of COLL_KEYS) mineDirty.add(key) // پایه‌ی ناآشنا → همه‌چیز «تغییر من» حساب می‌شود
    const baseObj = snapshot ? JSON.parse(snapshot) : null
    applyRemote(serverPayload)
    for (const key of COLL_KEYS) {
      if (!mineDirty.has(key)) continue
      // ادغام سطری: ویرایش/حذف/افزودن من برنده، افزودنی‌های دیگران از سرور حفظ می‌شود
      const merged = mergeCollection(baseObj?.[key] ?? [], mine[key] ?? [], serverPayload[key] ?? [])
      const t = collRefs[key]
      t.length = 0
      t.push(...JSON.parse(JSON.stringify(merged)))
    }
    if (mineDirty.has('settings')) Object.assign(settings, JSON.parse(JSON.stringify(mine.settings)))
    toast(mineDirty.size
      ? 'تغییر هم‌زمانی روی سرور بود؛ نسخه سرور پایه شد و تغییرات محلی شما رویش اعمال مجدد شد.'
      : 'نسخه جدید سرور دریافت شد.', true)
    await pushNow(true)
  }
  function applyRemote(st) {
    for (const key of COLL_KEYS) {
      if (!Array.isArray(st[key])) continue
      const target = collRefs[key]
      target.length = 0
      target.push(...JSON.parse(JSON.stringify(st[key])))
    }
    if (st.settings && typeof st.settings === 'object') Object.assign(settings, JSON.parse(JSON.stringify(st.settings)))
    if (typeof st.rev === 'number') remoteRev = st.rev
    snapshot = payloadJson() // داده فعلی == سرور → push بی‌مورد
  }
  async function pullState() {
    try {
      applyRemote(await apiFetch('/state'))
      sync.conflict = false
      toast('داده‌ها از سرور دریافت شد.')
      return true
    } catch (e) {
      toast(`دریافت از سرور ناموفق بود (${e.message}).`, true)
      return false
    }
  }
  async function pushToServer() {
    await pushNow(true)
    if (sync.status !== 'error') toast('داده‌های محلی روی سرور بارگذاری شد.')
  }
  function applySession(s) {
    user.value = s.username || ''
    role.value = s.role || 'admin'
    perms.value = Array.isArray(s.perms) && s.perms.length ? s.perms : ALL_PERMS
  }
  async function initRemote() {
    if (!(await checkOnline())) { online.value = false; sync.status = 'offline'; return false }
    online.value = true
    sync.status = 'idle'
    try {
      const me = await apiFetch('/auth/me')
      authed.value = true
      applySession(me)
      snapshot = ''
      await pullStateSilent()
    } catch { /* نشست منقضی — همان مسیر فاز ۱ */ }
    return true
  }
  async function pullStateSilent() {
    try { applyRemote(await apiFetch('/state')) } catch { /* محلی می‌ماند */ }
  }
  async function login(username, password) {
    if (!online.value) {
      await new Promise((r) => setTimeout(r, 450)) // شبیه‌سازی شبکه در حالت محلی
      if (String(username).trim() === 'admin' && password === '12345') {
        authed.value = true
        role.value = 'admin'
        perms.value = ALL_PERMS
        return { ok: true }
      }
      return { ok: false, form: 'نام کاربری یا رمز عبور اشتباه است.' }
    }
    try {
      const r = await apiFetch('/auth/login', { method: 'POST', body: { username, password } })
      authed.value = true
      applySession(r)
      snapshot = ''
      await pullStateSilent() // سرور منبع حقیقت؛ تغییرات حل‌نشده محلی در تنظیمات قابل ارسال‌اند
      toast('نسخه سرور بارگذاری شد. برای بازیابی تغییرات حل‌نشده محلی از «تنظیمات ← ارسال داده‌های محلی» استفاده کنید.')
      return { ok: true }
    } catch (e) {
      return { ok: false, form: e.message, fields: e.fields }
    }
  }
  async function logout() {
    if (online.value) { try { await apiFetch('/auth/logout', { method: 'POST' }) } catch { /* محلی هم کافی است */ } }
    authed.value = false
    user.value = ''
    perms.value = []
  }
  async function changePassword(oldPassword, newPassword, confirm) {
    if (newPassword.length < 8) return { ok: false, fields: { newPassword: 'رمز جدید حداقل ۸ نویسه باشد.' } }
    if (newPassword !== confirm) return { ok: false, fields: { confirm: 'تکرار رمز جدید یکسان نیست.' } }
    try {
      await apiFetch('/auth/password', { method: 'POST', body: { oldPassword, newPassword } })
      return { ok: true }
    } catch (e) {
      return { ok: false, form: e.message, fields: e.fields }
    }
  }
  /** تولید کپشن: آنلاین → سرور (OpenAI/فالبک)؛ آفلاین → قالب محلی با تأخیر نمایشی */
  async function generateCaption(title, tone, keywords = '') {
    if (online.value) {
      try {
        const r = await apiFetch('/ai/caption', { method: 'POST', body: { title, tone, keywords } })
        return { caption: r.caption, source: r.source === 'openai' ? 'مدل هوش مصنوعی (OpenAI-compatible)' : 'قالب داخلی سرور' }
      } catch (e) {
        toast(`فراخوانی AI سرور ناموفق (${e.message}) — از قالب محلی استفاده شد.`, true)
      }
    }
    await new Promise((r) => setTimeout(r, 900))
    return null // null → تولید محلی در ویو انجام شود
  }
  return {
    products, posts, coupons, requests, messages, provinces, settings,
    authed, toasts, modal, online, user, role, perms, sync,
    initRemote, pullState, pushToServer, pushNow, login, logout, changePassword, generateCaption, can, canEdit,
    toast, dismissToast, runToastAction, openModal, closeModal, persist,
    saveProduct, copyProduct, removeProduct, restoreProduct,
    savePost, copyPost, removePost, restorePost,
    createCoupon, removeCoupon, restoreCoupon, couponState,
    resolveRequest, replyMessage, saveProvince,
    exportPayload, importPayload, resetToSeed, kpis,
  }
})
