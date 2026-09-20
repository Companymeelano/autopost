// @vitest-environment node
// فاز ۵ — prerender سئو: متا/OG/JSON-LD در صفحات عمومی، noindex پنل و صفحات ناموجود،
// cache با rev، فرار HTML. بدون وابستگی به سرور کامل (renderer مستقیم با state ساختگی).
process.env.PF_TEST = '1'

import { createHash } from 'node:crypto'
import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSeoRenderer } from '../../server/seo.js'

const DIST = mkdtempSync(join(tmpdir(), 'pf-seo-'))
let state
let rev = 1

const reqOf = (proto = 'https') => ({ headers: { host: 'panah.fit', 'x-forwarded-proto': proto } })

let SEO
beforeAll(() => {
  writeFileSync(join(DIST, 'index.html'),
    '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>پناه‌فیت</title></head><body><div id="app"></div><script src="/assets/main.js"></script></body></html>')
  state = {
    settings: { siteName: 'پناه‌فیت', maintenance: false, address: 'تهران، خیابان آزادی', phone: '021-1234' },
    products: [
      { id: 2, title: 'لگ زنانه آیرودینامیک', price: 490000, oldPrice: 590000, stock: 3, image: '/media/lg.png', desc: 'پارچه نسل‌سوم', sku: 'L1' },
      { id: 3, title: 'ساق‌بند', price: 320000, stock: 0, image: '', desc: 'فشار متغیر' },
    ],
    posts: [
      { id: 1, status: 'published', title: 'راهنمای انتخاب سایز', body: 'خط اول\nخط دوم <script>alert(1)</script>', author: 'Admin', date: '1404-01-01' },
      { id: 2, status: 'draft', title: 'پست_محرمانه_درافت', body: 'مخفی' },
    ],
  }
  SEO = createSeoRenderer({ DIST, getState: () => state, getRev: () => rev })
})

describe('seo prerender', () => {
  it('product page: title, OG, InStock schema with IRR + discount strikethrough', () => {
    const html = SEO.render('/product/2', reqOf())
    expect(html).toBeTruthy()
    expect(html).toContain('<title>لگ زنانه آیرودینامیک — پناه‌فیت</title>')
    expect(html).toContain('property="og:image" content="https://panah.fit/media/lg.png"')
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    expect(m).toBeTruthy()
    const ld = JSON.parse(m[1])
    expect(ld['@type']).toBe('Product')
    expect(ld.offers.priceCurrency).toBe('IRR')
    expect(ld.offers.price).toBe(490000)
    expect(ld.offers.availability).toBe('https://schema.org/InStock')
    expect(html).toContain('490,000')
    expect(html).toContain('<s') // قیمت قبلی خط‌خورده
    expect(html).toContain('موجود در انبار (3 عدد)')
    expect(html.match(/<title>/g)).toHaveLength(1)
    expect(html).toContain('<div id="app">')
    expect(html.indexOf('seo-card')).toBeLessThan(html.indexOf('</body>'))
  })

  it('unknown product & draft posts stay hidden / noindex', () => {
    const nf = SEO.render('/product/999', reqOf())
    expect(nf).toContain('noindex')
    const blog = SEO.render('/blog', reqOf())
    expect(blog).toContain('راهنمای انتخاب سایز')
    expect(blog).not.toContain('پست_محرمانه_درافت')
    const post = SEO.render('/post/1', reqOf())
    expect(post).toContain('BlogPosting')
    expect(post).toContain('&lt;script&gt;') // فرار HTML در بدنه
    expect(post).not.toContain('<script>alert(1)</script>')
    expect(SEO.render('/post/2', reqOf())).toContain('noindex') // draft → یافت نشد
  })

  it('checkout/order are noindex; admin/other paths render nothing (fallback noindex shell)', () => {
    expect(SEO.render('/checkout', reqOf())).toContain('noindex')
    expect(SEO.render('/order/PF-X1', reqOf())).toContain('noindex')
    expect(SEO.render('/dashboard', reqOf())).toBe(null)
    const shell = SEO.renderShellNoindex(reqOf())
    expect(shell).toContain('noindex')
    expect(shell).toContain('<script src="/assets/main.js">') // SPA دست‌نخورده
  })

  it('maintenance → renderer off; unknown paths null; assets-by-ext not prerendered by server guard', () => {
    expect(SEO.render('/favicon.ico', reqOf())).toBe(null)
    state.settings.maintenance = true
    rev++
    expect(SEO.render('/shop', reqOf())).toBe(null)
    state.settings.maintenance = false
    rev++
  })

  it('cache keyed by rev: stale until bump', () => {
    const a = SEO.render('/product/2', reqOf())
    state.products[0].title = 'لگ جدید ۱۴۰۵'
    const b = SEO.render('/product/2', reqOf()) // rev عوض نشده → کش قدیمی
    expect(b).toContain('لگ زنانه آیرودینامیک')
    rev++
    const c = SEO.render('/product/2', reqOf())
    expect(c).toContain('لگ جدید ۱۴۰۵')
    expect(c).not.toContain('لگ زنانه آیرودینامیک — پناه‌فیت')
    state.products[0].title = 'لگ زنانه آیرودینامیک'
    rev++
  })

  it('CSP hash covers the injected JSON-LD script', () => {
    const html = SEO.render('/product/2', reqOf()) || SEO.render('/product/3', reqOf())
    const h = SEO.cspFor(html)
    expect(h).toMatch(/^'sha256-[A-Za-z0-9+/=]{44}'$/)
    // هش باید دقیقاً با متن همان اسکریپتِ آن صفحه بخورد
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
        const expectHash = "'sha256-" + createHash('sha256').update(m[1], 'utf8').digest('base64') + "'"
    expect(h).toBe(expectHash)
  })
})
