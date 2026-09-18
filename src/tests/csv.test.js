import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { productsToCsv, parseCsv, mapCsvRows, applyCsvItems } from '../utils/csv'
import { useCms } from '../stores/cms.js'

describe('csv util', () => {
  it('export → header + quoting + BOM', () => {
    const csv = productsToCsv([
      { id: 1, title: 'لگ، مشکی "مخصوص"', cat: 'legging', price: 490000, stock: 3, sold: 9, desc: 'خط اول\nخط دوم' },
    ])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const [head, row] = csv.slice(1).split('\r\n')
    expect(head).toBe('شناسه,عنوان,دسته,قیمت,موجودی,فروش,توضیحات')
    expect(row).toBe('1,"لگ، مشکی ""مخصوص""",legging,490000,3,9,خط اول خط دوم')
  })

  it('parse handles quoted commas/newlines', () => {
    const rows = parseCsv('a,b\r\n"x,1","y\n2"\r\nplain,vals')
    expect(rows).toEqual([['a', 'b'], ['x,1', 'y\n2'], ['plain', 'vals']])
  })

  it('mapCsvRows validates rows with same Persian messages + duplicate ids', () => {
    const { items, error } = mapCsvRows(parseCsv('عنوان,دسته,قیمت,موجودی\nلگ یوگا,لگینگ,۳۹,۲\n,,۵,۱\nعنوان کوتاه,a,abc,-2'), [])
    expect(error).toBeFalsy()
    expect(items).toHaveLength(3)
    expect(items[0].product).toMatchObject({ title: 'لگ یوگا', cat: 'legging', price: 39, stock: 2 })
    expect(Object.keys(items[0].errors)).toHaveLength(0)
    expect(items[1].errors.title).toContain('الزامی')
    expect(items[2].errors.price).toBeTruthy()
    expect(items[2].errors.stock).toBeTruthy()
    // ردیف با id تکراری
    const dup = mapCsvRows(parseCsv('شناسه,عنوان,قیمت\n7,کپی,۱\n7,کپی۲,۱'), [1])
    expect(dup.items[1].errors.id).toContain('تکراری')
    // بدون ستون عنوان
    expect(mapCsvRows(parseCsv('a,b\n1,2'), []).error).toContain('عنوان')
  })

  describe('applyCsvItems (store)', () => {
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()) })
    it('creates new + updates by id', () => {
      const cms = useCms()
      const before = cms.products.length
      const { items } = mapCsvRows(parseCsv('شناسه,عنوان,قیمت,موجودی\n1,لگ بروزرسانی‌شده,111,2\n,فقط جدید,222,3'), cms.products.map((p) => p.id))
      const summary = applyCsvItems(cms, items)
      expect(summary).toEqual({ created: 1, updated: 1 })
      expect(cms.products).toHaveLength(before + 1)
      expect(cms.products.find((p) => p.id === 1).title).toBe('لگ بروزرسانی‌شده')
      expect(cms.products.find((p) => p.title === 'فقط جدید').price).toBe(222)
    })
  })
})

import { mergeCollection } from '../utils/merge'

describe('row-level 3-way merge', () => {
  const R = (id, v) => ({ id, v })
  it('my edit wins over concurrent server edit', () => {
    const merged = mergeCollection([R(1, 'base')], [R(1, 'mine')], [R(1, 'theirs')])
    expect(merged).toEqual([R(1, 'mine')])
  })
  it('untouched rows follow server (additions of others kept)', () => {
    const merged = mergeCollection([R(1, 'base')], [R(1, 'base')], [R(1, 'base'), R(2, 'new-other')])
    expect(merged.map((x) => x.id)).toEqual([1, 2])
  })
  it('my delete wins; my add survives', () => {
    const merged = mergeCollection([R(1, 'a'), R(2, 'b')], [R(1, 'a'), R(9, 'mine-add')], [R(1, 'a'), R(2, 'server-kept')])
    expect(merged.map((x) => x.id).sort()).toEqual([1, 9])
  })
  it('server delete wins when I did not touch it', () => {
    const merged = mergeCollection([R(1, 'a'), R(2, 'b')], [R(1, 'a'), R(2, 'b')], [R(1, 'a')])
    expect(merged).toEqual([R(1, 'a')])
  })
  it('fresh client (empty base): everything of mine is additions; server rows kept', () => {
    const merged = mergeCollection([], [R(5, 'x')], [R(1, 's')])
    expect(merged.map((x) => x.id).sort()).toEqual([1, 5])
  })
})
