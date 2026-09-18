// ============================================================================
// مدیا — آپلود واقعی روی دیسک (data/media) + سرو با کش immutable + پاک‌سازی
// state فقط مسیر /media/<file> را نگه می‌دارد؛ دیگر base64 در دیتابیس نیست.
// ============================================================================
import { writeFileSync, existsSync, mkdirSync, statSync, unlinkSync, readdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, extname } from 'node:path'
import { sendError, sendJson, SECURITY_HEADERS } from './lib.js'

const EXT_BY_MIME = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }
const MAX_B64 = 4 * 1024 * 1024 // ≈ 3MB باینری
const FILE_RE = /^[a-f0-9]{40}\.(png|jpe?g|webp)$/

export function createMediaStore(mediaDir) {
  mkdirSync(mediaDir, { recursive: true })
  return {
    mediaDir,

    /** body: { data: 'data:image/png;base64,...', name } → { path, bytes, id } */
    save({ data, name }) {
      const m = /^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/.exec(String(data || ''))
      if (!m) throw Object.assign(new Error('فرمت تصویر نامعتبر است (png/jpeg/webp).'), { status: 422 })
      const b64 = m[2].replace(/\s/g, '')
      if (b64.length > MAX_B64) throw Object.assign(new Error('حجم تصویر بیشتر از ۳ مگابایت است.'), { status: 413 })
      const buf = Buffer.from(b64, 'base64')
      if (!buf.length || !buf.equals(Buffer.from(buf.toString('base64'), 'base64'))) throw Object.assign(new Error('داده base64 معتبر نیست.'), { status: 422 })
      // magic-bytes — نه فقط mime که کلاینت فرستاده
      const sigOk =
        (m[1] === 'image/png' && buf.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
        (m[1] === 'image/jpeg' && buf[0] === 0xff && buf[1] === 0xd8) ||
        (m[1] === 'image/webp' && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP')
      if (!sigOk) throw Object.assign(new Error('محتوای فایل با نوع اعلام‌شده همخوانی ندارد.'), { status: 422 })
      const id = createHash('sha1').update(buf).digest('hex')
      const file = join(mediaDir, id + EXT_BY_MIME[m[1]])
      if (!existsSync(file)) writeFileSync(file, buf, { flag: 'wx' })
      return { path: `/media/${id}${EXT_BY_MIME[m[1]]}`, bytes: buf.length, id }
    },

    /** سرو فایل با ETag immutable — مسیر فقط /^\/media\/[hash]\.(ext)$/ */
    serve(pathname, req, res) {
      const fname = pathname.slice('/media/'.length)
      if (!FILE_RE.test(fname)) { sendError(res, 400, 'نام فایل نامعتبر.'); return }
      const file = join(mediaDir, fname)
      if (!existsSync(file)) { sendError(res, 404, 'فایل یافت نشد.'); return }
      const st = statSync(file)
      const etag = `W/"${st.size}-${Math.round(st.mtimeMs)}"`
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag }); res.end(); return }
      const ext = extname(fname)
      res.writeHead(200, {
        'Content-Type': ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg',
        'Content-Length': st.size,
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: etag,
        ...SECURITY_HEADERS,
      })
      res.end(readFileSync(file))
    },

    /** فایل‌های بلااستفاده (ارجاعی در state ندارند) قدیمی‌تر از maxAgeMs حذف می‌شوند */
    sweep(referencedPaths, maxAgeMs = 24 * 3600 * 1000) {
      const removed = []
      try {
        for (const f of readdirSync(mediaDir)) {
          if (!FILE_RE.test(f)) continue
          const ref = `/media/${f}`
          if (referencedPaths.has(ref)) continue
          const p = join(mediaDir, f)
          if (Date.now() - statSync(p).mtimeMs < maxAgeMs) continue
          try { unlinkSync(p); removed.push(f) } catch { /* in-use */ }
        }
      } catch { /* dir gone */ }
      return removed
    },
  }
}

