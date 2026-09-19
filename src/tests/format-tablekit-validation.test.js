import { describe, it, expect } from 'vitest'
import { toFa, formatPrice, normFa, dateJalali, nextIdOf, CATEGORY_LABELS } from '../utils/format.js'
import { filterRows, sortRows, paginate } from '../utils/tablekit.js'
import { validateProduct, validateCoupon, validatePost, validateLogin } from '../utils/validation.js'

describe('utils/format', () => {
  it('toFa', () => expect(toFa('order 10')).toBe('order ۱۰'))
  it('formatPrice', () => expect(formatPrice(850000)).toBe('۸۵۰,۰۰۰'))
  it('formatPrice 0/NaN', () => { expect(formatPrice(0)).toBe('۰'); expect(formatPrice(undefined)).toBe('۰') })
  it('normFa: arabic→persian, digits unified, ZWNJ→space', () => {
    expect(normFa('نايك')).toBe(normFa('نایک'))
    expect(normFa('کفش')).toBe(normFa('كفش'))
    expect(normFa('۱۲')).toBe(normFa('12'))
    expect(normFa('نیم‌فاصله')).toBe(normFa('نیم فاصله'))
  })
  it('normFa tolerant to non-string', () => expect(normFa(null)).toBe(''))
  it('dateJalali shape', () => expect(dateJalali()).toMatch(/^۱۴[۰-۹][۰-۹]\/[۰-۹][۰-۹]\/[۰-۹][۰-۹]$/))
  it('nextIdOf', () => {
    expect(nextIdOf([{ id: 3 }, { id: 7 }, {}])).toBe(8)
    expect(nextIdOf([])).toBe(1)
  })
  it('CATEGORY_LABELS keys stable', () => expect(CATEGORY_LABELS.legging).toBe('لگ'))
})

describe('utils/tablekit', () => {
  const rows = [
    { id: 3, title: 'نیم‌تنه فیتنس', cat: 'bra', price: 320000, stock: 12 },
    { id: 1, title: 'ست ورزشی نایک پرو ایر', cat: 'set', price: 850000, stock: 50 },
    { id: 2, title: 'لگ زنانه مشکی', cat: 'legging', price: 490000, stock: 72 },
  ]
  it('filterRows normalizes both sides', () => {
    expect(filterRows(rows, 'نايك', ['title'])).toHaveLength(1)
    expect(filterRows(rows, '', ['title'])).toHaveLength(3)
  })
  it('filterRows with extras', () => {
    const extras = [(r, q) => normFa(String(r.stock)).includes(q)]
    expect(filterRows(rows, '۷۲', ['title'], extras).map((r) => r.id)).toEqual([2])
  })
  it('sortRows numeric asc/desc + string stable', () => {
    expect(sortRows(rows, 'price').map((r) => r.id)).toEqual([3, 2, 1])
    expect(sortRows(rows, 'price', 'desc').map((r) => r.id)).toEqual([1, 2, 3])
    expect(sortRows(rows, null)).toHaveLength(3)
  })
  it('paginate clamps page + reports range', () => {
    const p = paginate(rows, 1, 2)
    expect(p.pageRows).toHaveLength(2)
    expect(p.pageCount).toBe(2)
    expect(p.from).toBe(1)
    const oob = paginate(rows, 9, 2)
    expect(oob.outOfRange).toBe(true)
    expect(oob.page).toBe(2)
    const empty = paginate([], 1, 8)
    expect(empty.pageCount).toBe(1)
    expect(empty.from).toBe(0)
  })
})

describe('utils/validation', () => {
  it('validateProduct requires fields & numbers', () => {
    expect(validateProduct({ title: 'ab', cat: '', price: 'x', stock: -2 })).toMatchObject({
      title: expect.any(String), cat: expect.any(String), price: expect.any(String), stock: expect.any(String),
    })
    expect(validateProduct({ title: 'کفش رانینگ', cat: 'shoes', price: 2000000, stock: 5 })).toEqual({})
  })
  it('validateProduct price cap', () => {
    expect(validateProduct({ title: 'x y z', cat: 'set', price: 9e9, stock: 1 }).price).toBeTruthy()
  })
  it('validateCoupon: format, duplicate', () => {
    expect(validateCoupon({ code: 'ab', percent: 10 }, []).code).toBeTruthy()
    expect(validateCoupon({ code: 'PANAH10', percent: 101 }, []).percent).toBeTruthy()
    expect(validateCoupon({ code: 'a-1', percent: 15 }, [])).toEqual({})
    expect(validateCoupon({ code: 'A-1', percent: 15 }, [{ code: 'A-1' }]).code).toContain('از قبل')
    expect(validateCoupon({ code: 'NEW1', percent: 15, maxUses: 0 }, [])).toEqual({}) // ۰ = بدون سقف
    expect(validateCoupon({ code: 'NEW2', percent: 15, maxUses: -3 }, []).maxUses).toBeTruthy()
  })
  it('validatePost/login minimal rules', () => {
    expect(validatePost({ title: '', author: '', status: 'zz' })).toMatchObject({ title: expect.any(String), author: expect.any(String), status: expect.any(String) })
    expect(validateLogin('a', 'b')).toEqual({})
    expect(validateLogin(' ', '')).toMatchObject({ username: expect.any(String), password: expect.any(String) })
  })
})
