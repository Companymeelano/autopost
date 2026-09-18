import { defineConfig } from '@playwright/test'

// e2e در sandbox محلی (بدون مرورگر نصب‌شده) اجرا نمی‌شود؛ در CI کامل اجرا می‌گردد
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8787', // همان سرور production: dist + API روی یک origin
    locale: 'fa-IR',
  },
  webServer: {
    command: 'npm run server',
    url: 'http://127.0.0.1:8787/api/health',
    reuseExistingServer: true,
    env: { ADMIN_PASS: 'e2e-pass-123' },
  },
})
