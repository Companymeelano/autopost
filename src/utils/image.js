// ============================================================================
// پردازش تصویر محصول: برش مربع از مرکز + کوچک‌سازی + فشرده‌سازی JPEG
// (مناسب localStorage؛ خروجی dataURL با سقف حجم مشخص)
// ============================================================================

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 // ۲ مگابایت
export const MAX_IMAGE_EDGE = 800
export const JPEG_QUALITY = 0.82

/** اعتبارسنجی فایل انتخابی — پیام خطا یا null */
export function validateImageFile(file) {
  if (!file) return 'فایلی انتخاب نشده است.'
  if (!file.type?.startsWith('image/')) return 'فقط فایل تصویری مجاز است.'
  if (file.size > MAX_UPLOAD_BYTES) return 'حجم تصویر باید کمتر از ۲ مگابایت باشد.'
  return null
}

export function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(new Error('read-failed'))
    r.readAsDataURL(file)
  })
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('decode-failed'))
    img.src = src
  })
}

/**
 * @param {string} dataUrl تصویر مبدأ
 * @param {{square:boolean, maxEdge?:number, quality?:number}} opts
 * @returns {Promise<string>} dataURL پردازش‌شده (در خطای canvas، همان مبدأ برگردانده می‌شود)
 */
export async function processImage(dataUrl, opts = {}) {
  const { square = true, maxEdge = MAX_IMAGE_EDGE, quality = JPEG_QUALITY } = opts
  let img
  try { img = await loadImage(dataUrl) } catch { return dataUrl }
  try {
    let w = img.naturalWidth || 0
    let h = img.naturalHeight || 0
    if (!w || !h) return dataUrl
    let sx = 0, sy = 0
    if (square) { const side = Math.min(w, h); sx = (w - side) / 2; sy = (h - side) / 2; w = side; h = side }
    const scale = Math.min(1, maxEdge / Math.max(w, h))
    const cw = Math.max(1, Math.round(w * scale))
    const ch = Math.max(1, Math.round(h * scale))
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, cw, ch)
    ctx.drawImage(img, sx, sy, w, h, 0, 0, cw, ch)
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    return dataUrl
  }
}
