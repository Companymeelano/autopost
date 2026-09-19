// فاز ۳ — مسیر خرید عمومی: فروشگاه → محصول → سبد → درگاه دمو → تأیید پرداخت → پنل سفارش‌ها
import { test, expect } from '@playwright/test'

test('complete public purchase flow with real server', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.prod-card')).not.toHaveCount(0)
  const firstName = await page.locator('.prod-card h3').first().innerText()

  // ورود به صفحه محصول و افزودن به سبد
  await page.locator('.prod-card').first().click()
  await expect(page).toHaveURL(/#\/product\/\d+/)
  await expect(page.locator('.pd-info h1')).toHaveText(firstName)
  await page.locator('.pd-add').click()

  // چک‌پوینت فاز ۴: سوئیچ زبان روی همان مسیر
  await page.locator('.site-lang').click()
  await expect(page.locator('.site-nav a').first()).toHaveText('Shop')
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  await page.locator('.site-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')

  // checkout و ثبت سفارش
  await page.locator('.site-cart').click()
  await expect(page).toHaveURL(/#\/checkout/)
  await page.fill('#ck-buyer', 'ایمان تستی')
  await page.fill('#ck-phone', '09123334455')
  await page.fill('#ck-address', 'تهران، خیابان ولیعصر، کوچه نمونه، پلاک ۱۲')
  await page.locator('form').last().locator('.ck-pay').click()

  // درگاه دمو سمت سرور → پرداخت موفق
  await page.waitForURL('**/gateway?ref=PF-**', { timeout: 10_000 })
  await expect(page.locator('.card')).toContainText('قابل پرداخت')
  await page.getByText('پرداخت موفق').click()

  // صفحه وضعیت: سفارش پرداخت‌شده + کد رهگیری
  await expect(page).toHaveURL(/#\/order\/PF-/, { timeout: 10_000 })
  await expect(page.locator('.od-status')).toContainText('پرداخت موفق')
  await expect(page.locator('.od-tr')).toContainText('کد رهگیری')

  // صفحه فاکتور قابل‌چاپ (فاز ۴)
  await page.goto(`/invoice/${(page.url().match(/order\/(PF-[\w-]+)/) || [])[1]}`)
  await expect(page.locator('.sheet')).toContainText('قابل پرداخت')

  // پنل: ورود مدیر و دیدن سفارش + کسر موجودی
  await page.goto('/login')
  await page.fill('#login-user', 'admin')
  await page.fill('#login-pass', 'e2e-pass-123')
  await page.locator('button[type=submit]').click()
  await expect(page).toHaveURL(/#\/dashboard/, { timeout: 10_000 })

  await page.goto('/orders')
  await expect(page.locator('.cms-table tbody tr').first()).toContainText('PF-')
  await expect(page.locator('.st-chip').first()).toContainText('پرداخت‌شده')

  // سفارش در داشبورد/ممیزی هم ثبت شده (audit)
  const audit = await page.request.get('/api/audit?limit=30')
  const body = await audit.json()
  const acts = body.items.map((i: { action: string }) => i.action)
  expect(acts).toContain('order.create')
  expect(acts).toContain('order.paid')

  // گزارش مالی ادمین با داده واقعی
  await page.goto('/reports')
  await expect(page.locator('.fin-kpis .net b')).toBeVisible()
  await expect(page.locator('.fin-kpis .k').first()).toContainText('سفارش')
})
