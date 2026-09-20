// ============================================================================
// فاز ۵ — Prerender سئو برای صفحات عمومی (history-mode)
// shell موجود dist + تزریق متای head + JSON-LD + محتوای واقعی داخل #app تا
// خزش‌گرها بدون JS هم عنوان/قیمت/توضیحات/تصویر ببینند. SPA بعد از boot همان
// #app را با اپ واقعی جایگزین می‌کند. کش بر پایه rev: هر ویرایش پنل = invalidate.
// ============================================================================
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import crypto from 'node:crypto'

const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const money = (n) => Number(n || 0).toLocaleString('en-US')

const PRERENDER_CSS = `<style>.seo-shell{max-width:960px;margin:0 auto;padding:24px;font-family:Vazirmatn,Tahoma,system-ui;color:#eaeaea;background:#0a0a14;min-height:60vh}.seo-shell a{color:#00ffaa}.seo-card{background:#12121f;border:1px solid #22223a;border-radius:14px;padding:16px;margin:10px 0}.seo-price{color:#00ffaa;font-size:1.3rem}.seo-muted{color:#8a8aa8;font-size:.85rem}</style>`

function head({ title, desc, image, url, noindex, extra = '' }) {
  const m = []
  m.push(`<title>${esc(title)}</title>`)
  m.push(`<meta name="description" content="${esc(desc)}">`)
  m.push(`<meta property="og:site_name" content="پناه‌فیت | PanahFit">`)
  m.push(`<meta property="og:title" content="${esc(title)}">`)
  if (desc) m.push(`<meta property="og:description" content="${esc(desc)}">`)
  m.push(`<meta property="og:type" content="website">`)
  if (url) m.push(`<meta property="og:url" content="${esc(url)}">`)
  if (image) m.push(`<meta property="og:image" content="${esc(image)}">`, `<meta name="twitter:card" content="summary_large_image">`)
  if (noindex) m.push(`<meta name="robots" content="noindex,nofollow">`)
  return m.join('\n') + '\n' + extra + '\n'
}
function ld(obj) { return `<script type="application/ld+json">${JSON.stringify(obj)}</script>` }

export function createSeoRenderer({ DIST, getState, getRev, settings }) {
  let shell = null, shellMtime = 0
  function readShell() {
    const file = join(DIST, 'index.html')
    const mt = statSync(file).mtimeMs
    if (shell && mt === shellMtime) return shell
    shell = readFileSync(file, 'utf8'); shellMtime = mt
    return shell
  }
  const cache = new Map()

  function render(pathname, req) {
    try {
      const st = getState()
      if (st.settings.maintenance) return null // صفحه نگهداری: SPA خودش هندل می‌کند
      const base = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || ''}`
      const key = `${getRev()}:${pathname}`
      const hit = cache.get(key)
      if (hit) return hit
      const out = build(pathname, st, base)
      if (out) {
        if (cache.size > 60) cache.clear()
        cache.set(key, out)
      }
      return out
    } catch { return null }
  }

  function build(pathname, st, base) {
    const siteName = st.settings.siteName || 'پناه‌فیت'
    let headMeta = '', content = '', ldJson = ''
    const prod = pathname.match(/^\/product\/(\d+)$/)
    const post = pathname.match(/^\/post\/(\d+)$/)

    if (pathname === '/' || pathname === '/shop') {
      const cards = st.products.slice(0, 12).map((p) =>
        `<div class="seo-card"><a href="/product/${p.id}"><h2 style="margin:0 0 6px;font-size:1rem">${esc(p.title)}</h2></a><span class="seo-price">${money(p.price)} تومان</span> <span class="seo-muted">${(p.stock ?? 0) > 0 ? 'موجود' : 'ناموجود'}</span>${p.image ? `<br><img src="${esc(p.image)}" alt="${esc(p.title)}" width="160" loading="lazy">` : ''}</div>`).join('')
      content = `<h1>${esc(siteName)} — فروشگاه لباس ورزشی</h1><p class="seo-muted">${esc(st.settings.address || '')}</p>${cards}`
      ldJson = ld({ '@context': 'https://schema.org', '@type': 'WebSite', name: siteName, url: base + '/', potentialAction: { '@type': 'ViewAction', target: base + '/product/1' } })
      headMeta = head({ title: siteName + ' | فروشگاه لباس ورزشی', desc: 'کالکشن ورزشی پناه‌فیت با تخفیف‌های ویژه و ارسال سریع به سراسر کشور.', url: base + '/' })
    } else if (prod) {
      const p = st.products.find((x) => Number(x.id) === Number(prod[1]))
      if (!p) { content = '<h1>محصول یافت نشد</h1>'; headMeta = head({ title: 'محصول یافت نشد — پناه‌فیت', noindex: true }); }
      else {
        const desc = String(p.meta?.desc || p.desc || '').slice(0, 155)
        content = `<div class="seo-card"><h1 style="margin:0 0 6px">${esc(p.title)}</h1>
<p class="seo-muted">${esc(p.cat || '')}${p.oldPrice > p.price ? ' — تخفیف‌دار' : ''}</p>
<p class="seo-price">${money(p.price)} تومان${p.oldPrice > p.price ? ` <s style="color:#66667f;font-size:.9rem">${money(p.oldPrice)}</s>` : ''}</p>
${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.title)}" style="max-width:340px;border-radius:12px">` : ''}
<p>${esc(p.desc || '')}</p><p class="seo-muted">${(p.stock ?? 0) > 0 ? `موجود در انبار (${p.stock} عدد)` : 'ناموجود'}</p>
<p><a href="/product/${p.id}">مشاهده و خرید در فروشگاه</a></p></div>`
        headMeta = head({ title: p.title + ' — ' + siteName, desc, image: p.image && String(p.image).startsWith('/media/') ? base + p.image : undefined, url: base + pathname })
        ldJson = ld({
          '@context': 'https://schema.org', '@type': 'Product', name: p.title,
          description: p.desc || p.meta?.desc || '', sku: p.sku || ('PF-' + p.id),
          ...(p.image && String(p.image).startsWith('/media/') ? { image: base + p.image } : {}),
          brand: { '@type': 'Brand', name: siteName },
          offers: { '@type': 'Offer', price: p.price, priceCurrency: 'IRR', url: base + pathname, availability: (p.stock ?? 0) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' },
        })
      }
    } else if (pathname === '/blog') {
      const posts = st.posts.filter((x) => x.status === 'published')
      content = `<h1>مجله پناه‌فیت</h1>` + posts.slice(0, 12).map((x) =>
        `<div class="seo-card"><a href="/post/${x.id}"><h2 style="margin:0 0 4px;font-size:1rem">${esc(x.title)}</h2></a><p class="seo-muted">${esc(String(x.body || '').slice(0, 140))}…</p></div>`).join('')
      headMeta = head({ title: 'مجله و اخبار — ' + siteName, desc: 'مقالات تمرین، راهنمای سایز و اخبار کالکشن پناه‌فیت', url: base + '/blog' })
    } else if (post) {
      const x = st.posts.find((y) => y.status === 'published' && Number(y.id) === Number(post[1]))
      if (!x) { content = '<h1>نوشته یافت نشد</h1>'; headMeta = head({ title: 'نوشته یافت نشد — پناه‌فیت', noindex: true }) }
      else {
        content = `<article><h1>${esc(x.title)}</h1><p class="seo-muted">${esc(x.author || '')} · ${esc(x.date || '')}</p>${String(x.body || '').split(/\n+/).map((par) => `<p>${esc(par)}</p>`).join('')}</article><p><a href="/blog">بازگشت به مجله</a></p>`
        headMeta = head({ title: x.title + ' — مجله پناه‌فیت', desc: String(x.body || '').slice(0, 155), image: x.image ? base + x.image : undefined, url: base + pathname })
        ldJson = ld({ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: x.title, datePublished: x.publishedAt || undefined, author: { '@type': 'Organization', name: siteName }, ...(x.image ? { image: base + x.image } : {}) })
      }
    } else if (pathname === '/contact') {
      content = `<h1>تماس با ما</h1><p>${esc(st.settings.address || '')}</p><p>${esc(st.settings.phone || '')} ${esc(st.settings.telegramChannel || '')}</p>`
      headMeta = head({ title: 'تماس با ما — ' + siteName, desc: 'پشتیبانی سفارش و همکاری فروشگاهی پناه‌فیت', url: base + '/contact' })
    } else if (pathname === '/checkout' || pathname.startsWith('/order/')) {
      content = '<h1>پناه‌فیت</h1>'
      headMeta = head({ title: 'سبد خرید — ' + siteName, noindex: true, desc: '' })
    } else return null // مسیرهای پنل و بقیه → shell سراسری با noindex (پایین)

    return inject(readShell(), headMeta + PRERENDER_CSS, content, ldJson)
  }

  /** shell با noindex عمومی برای مسیرهای ادمین (فقط پاسخ HTML؛ SPA دست‌نخورده) */
  function renderShellNoindex(req) {
    try {
      const sh = readShell()
      const meta = head({ title: 'پناه‌فیت — پنل مدیریت', desc: '', noindex: true })
      return inject(sh, meta, '', '')
    } catch { return null }
  }

  function inject(shellHtml, meta, content, ldJson) {
    let html = shellHtml
    html = html.replace(/<title>[\s\S]*?<\/title>/, '') // عنوان shell حذف می‌شود تا تکراری نشود
    html = html.replace('</head>', (meta || '') + '\n</head>')
    if (content) html = html.replace(/<div id="app"><\/div>|<div id="app">\s*<\/div>/, `<div id="app">${content}</div>`)
    if (ldJson) html = html.replace('</head>', ldJson + '\n</head>')
    return html
  }

  return { render, renderShellNoindex, cspFor(html) {
    if (!html) return null
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    if (!m) return null
    const hash = crypto.createHash('sha256').update(m[1], 'utf8').digest('base64')
    return `'sha256-${hash}'`
  } }
}
