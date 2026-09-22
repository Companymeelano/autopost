// ============================================================================
// Meelano — نقطه ورود استقرار روی cPanel (Passenger / Setup Node.js App)
// در cPanel: Setup Node.js App → Create Application
//   Node.js version : 20 یا بالاتر (ترجیحاً 22)
//   Application Mode: Production
//   Application Root: پوشه‌ای که ریپو را در آن کش کرده‌اید (مثلاً ~/meelano)
//   Application URL : دامنه/زیردامنه شما
//   Startup File    : deploy/cpanel/start.js
//   Passenger env   : ADMIN_PASS=رمز-اولیه-قوی  (در صورت نیاز envهای دیگر)
// سپس در SSH/ترمنال همان پروژه: npm ci --omit=dev && npm run build
// ============================================================================
const path = require('node:path')
const { pathToFileURL } = require('node:url')

process.env.NODE_ENV = process.env.NODE_ENV || 'production'
// Passenger پورت را در env می‌دهد؛ نبودش یعنی اجرای دستی روی ۸۷۸۷
if (!process.env.PORT) process.env.PORT = '8787'

const entry = path.join(__dirname, '..', '..', 'server', 'index.js')
import(pathToFileURL(entry).href).catch((e) => {
  console.error('[meelano] راه‌اندازی سرور شکست خورد:', e)
  process.exit(1)
})
