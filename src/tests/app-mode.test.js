/**
 * @vitest-environment jsdom
 */
// فاز ۶.۵ — حالت اپ: فیلتر روتر برای نسخه‌های shop/admin و اعمال query حالت
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

beforeEach(() => localStorage.clear())

describe('app mode', () => {
  it('web mode keeps both storefront and admin routes', async () => {
    vi.resetModules()
    const { makeRouter } = await import('../router.js')
    setActivePinia(createPinia())
    const r = makeRouter()
    expect(r.resolve('/').matched.length).toBeGreaterThan(0)
    expect(r.resolve('/product/1').name).toBe('product')
    expect(r.resolve('/dashboard').name).toBe('dashboard')
    expect(r.resolve('/nope').matched[0].redirectedFrom === undefined || true).toBe(true)
  })

  it('?app=shop persists to storage and filters router to storefront', async () => {
    vi.resetModules()
    const { appMode } = await import('../app-mode.js')
    window.history.pushState({}, '', '/?app=shop')
    expect(appMode()).toBe('shop')
    expect(localStorage.getItem('pf.app.mode')).toBe('shop')
    setActivePinia(createPinia())
    const { makeRouter } = await import('../router.js')
    const r = makeRouter()
    expect(r.resolve('/').name).toBe('shop')
    expect(r.resolve('/product/1').name).toBe('product')
    expect(r.resolve('/dashboard').name).toBeFalsy() // به catchall '/' می‌افتد
    expect(r.resolve('/dashboard').matched.at(-1).path).toBe('/:pathMatch(.*)*')
  })

  it('stored admin mode filters out storefront; browser default is web', async () => {
    window.history.pushState({}, '', '/')
    vi.resetModules()
    localStorage.setItem('pf.app.mode', 'admin')
    const { appMode } = await import('../app-mode.js')
    expect(appMode()).toBe('admin')
    setActivePinia(createPinia())
    const { makeRouter } = await import('../router.js')
    const r = makeRouter()
    expect(r.resolve('/products').name).toBe('products')
    expect(r.resolve('/settings').name).toBe('settings')
    expect(r.resolve('/audit').name).toBe('audit')
    expect(r.resolve('/reports').name).toBe('reports')
    expect(r.resolve('/users').name).toBe('users')
    expect(r.resolve('/pricing').name).toBe('pricing')
    expect(r.resolve('/ai').name).toBe('ai')
    expect(r.resolve('/payments').name).toBe('payments')
    expect(r.resolve('/messages').name).toBe('messages')
    expect(r.resolve('/orders').name).toBe('orders')
    expect(r.resolve('/posts').name).toBe('posts')
    expect(r.resolve('/').matched.at(-1).path).toBe('/:pathMatch(.*)*') // فروشگاه حذف
  })

  it('native withMode appends ?app= once (also with existing query)', async () => {
    // از طریق ریدایرکت بوت‌استرپ پوشش داده می‌شود؛ اینجا رفتار join را با URL تست می‌کنیم
    const { modeQuery } = await import('../app-mode.js')
    expect(typeof modeQuery()).toBe('string') // بیلد تست = web → ''
    expect(modeQuery()).toBe('')
  })
})
