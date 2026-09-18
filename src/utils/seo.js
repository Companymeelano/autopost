// SEO کلاینت (فاز ۳) — تنظیم title/description/og برای صفحات عمومی SPA
function upsert(key, val, content) {
  let el = document.head.querySelector(`meta[${key}="${val}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(key, val)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

export function setSeo(title, desc, image) {
  document.title = title
  upsert('name', 'description', desc || '')
  upsert('property', 'og:title', title)
  upsert('property', 'og:description', desc || '')
  if (image) upsert('property', 'og:image', image)
}
