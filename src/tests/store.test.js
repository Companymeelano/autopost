import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ref, nextTick } from 'vue'

const STORAGE_KEY = 'panahfit_cms_v1'

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  setActivePinia(createPinia())
})
afterEach(() => { vi.useRealTimers() })

async function freshStore() {
  vi.resetModules()
  const { useCms } = await import('../stores/cms.js')
  return useCms()
}

describe('cms store', () => {
  it('seeds default data', async () => {
    const cms = await freshStore()
    expect(cms.products).toHaveLength(3)
    expect(cms.requests.filter((r) => r.status === 'new')).toHaveLength(3)
    expect(cms.authed).toBe(false)
  })

  it('saves products to localStorage with debounce', async () => {
    const cms = await freshStore()
    cms.saveProduct({ title: 'محصول جدید تستی', cat: 'set', price: 100, stock: 2 })
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull() // debounced
    await nextTick()
    vi.advanceTimersByTime(300)
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    expect(saved.products).toHaveLength(4)
    expect(saved.products[3].title).toBe('محصول جدید تستی')
    expect(saved.products[3].id).toBe(4)
    expect(saved.products[3].sold).toBe(0)
  })

  it('restores persisted state on reload', async () => {
    const first = await freshStore()
    first.saveProduct({ title: 'پایدار', cat: 'bra', price: 5, stock: 1 })
    first.settings.maintenance = true
    await nextTick(); vi.advanceTimersByTime(300)

    const second = await freshStore()
    expect(second.products.some((p) => p.title === 'پایدار')).toBe(true)
    expect(second.settings.maintenance).toBe(true)
  })

  it('tolerates corrupt localStorage', async () => {
    localStorage.setItem(STORAGE_KEY, '{not-json!')
    const cms = await freshStore()
    expect(cms.products).toHaveLength(3)
  })

  it('edit by id mutates in place', async () => {
    const cms = await freshStore()
    const res = cms.saveProduct({ title: 'لگ ویرایش', cat: 'legging', price: 520000, stock: 80 }, 2)
    expect(res.actionType).toBe('ویرایش')
    expect(cms.products.find((p) => p.id === 2).price).toBe(520000)
  })

  it('copy + remove + restore (undo)', async () => {
    const cms = await freshStore()
    const clone = cms.copyProduct(1)
    expect(clone.title).toContain('(کپی)')
    expect(cms.products).toHaveLength(4)
    const res = cms.removeProduct(1)
    expect(cms.products).toHaveLength(3)
    cms.restoreProduct(res.removed, res.idx)
    expect(cms.products.find((p) => p.id === 1)).toBeTruthy()
  })

  it('posts CRUD', async () => {
    const cms = await freshStore()
    const post = cms.savePost({ title: 'پست تازه', author: 'مدیر', status: 'published', date: '۱۴۰۵/۰۶/۲۷', body: 'x' })
    expect(post.id).toBe(3)
    cms.savePost({ title: 'پست اصلاح', author: 'a', status: 'draft', date: post.date }, 3)
    expect(cms.posts.find((p) => p.id === 3).title).toBe('پست اصلاح')
    const r = cms.removePost(3)
    expect(cms.posts).toHaveLength(2)
    cms.restorePost(r.removed, r.idx)
    expect(cms.posts).toHaveLength(3)
  })

  it('coupons: create unique, toggle, remove+restore', async () => {
    const cms = await freshStore()
    const c = cms.createCoupon({ code: 'panah10', percent: 10, maxUses: 50 })
    expect(c.code).toBe('PANAH10')
    expect(c.maxUses).toBe(50)
    c.active = false
    const res = cms.removeCoupon(0)
    expect(cms.coupons).toHaveLength(0)
    cms.restoreCoupon(res.removed, res.index)
    expect(cms.coupons[0].code).toBe('PANAH10')
  })

  it('requests & messages actions', async () => {
    const cms = await freshStore()
    cms.resolveRequest(9001)
    expect(cms.requests.find((r) => r.id === 9001).status).toBe('done')
    expect(cms.replyMessage(1, 'پاسخ تست')).toBe(true)
    const m = cms.messages.find((x) => x.id === 1)
    expect(m.status).toBe('answered')
    expect(m.reply).toBe('پاسخ تست')
  })

  it('provinces update', async () => {
    const cms = await freshStore()
    cms.saveProvince(2, { delta: 9, ship: 40000 })
    expect(cms.provinces.find((p) => p.id === 2)).toMatchObject({ delta: 9, ship: 40000 })
  })

  it('kpis compute from data', async () => {
    const cms = await freshStore()
    const k = cms.kpis()
    expect(k.revenue).toBe(850000 * 140 + 490000 * 210 + 320000 * 60)
    expect(k.orders).toBe(410)
    expect(k.pending).toBe(3)
  })

  it('backup export/import round-trip; rejects bad payload', async () => {
    const cms = await freshStore()
    cms.createCoupon({ code: 'X1', percent: 5, maxUses: '' })
    const payload = JSON.parse(cms.exportPayload())
    expect(payload.app).toBe('panahfit-cms')
    expect(payload.coupons[0].code).toBe('X1')
    expect(() => cms.importPayload({ nope: 1 })).toThrow()
    cms.products.push({ id: 99, title: 'extra', cat: 'set', price: 1, stock: 1 })
    cms.importPayload(payload)
    expect(cms.products).toHaveLength(3)
    expect(cms.coupons).toHaveLength(1)
  })

  it('resetToSeed restores defaults', async () => {
    const cms = await freshStore()
    cms.products.length = 0
    cms.resetToSeed()
    expect(cms.products).toHaveLength(3)
  })

  it('toast lifecycle with undo action', async () => {
    const cms = await freshStore()
    const spy = ref(0)
    cms.toast('حذف شد', false, { label: '↩', onAction: () => spy.value++ })
    expect(cms.toasts).toHaveLength(1)
    const t = cms.toasts[0]
    cms.runToastAction(t)
    expect(spy.value).toBe(1)
    expect(cms.toasts).toHaveLength(0)
  })

  it('toast auto-dismiss', async () => {
    const cms = await freshStore()
    cms.toast('short')
    vi.advanceTimersByTime(3300)
    expect(cms.toasts).toHaveLength(0)
  })

  it('modal open/close', async () => {
    const cms = await freshStore()
    cms.openModal('عنوان', 'post', { postId: 1 })
    expect(cms.modal).toMatchObject({ open: true, title: 'عنوان', view: 'post' })
    expect(cms.modal.props.postId).toBe(1)
    cms.closeModal()
    expect(cms.modal.open).toBe(false)
  })
})
