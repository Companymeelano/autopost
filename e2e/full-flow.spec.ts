import { test, expect } from '@playwright/test'

// سناریوی کامل: لاگین → ساخت محصول → رفرش (ماندگاری DB) → حذف با undo → پرداخت دمو
test('full admin flow', async ({ page }) => {
  page.on('dialog', (d) => d.accept()) // confirmهای حذف/بازگشت را مرورگر خودکار تأیید کند
  await page.goto('/login')
  await page.fill('#cms-username', 'admin')
  await page.fill('#cms-password', 'e2e-pass-123')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByText('درآمد کل')).toBeVisible()

  // ساخت محصول
  await page.click('text=مدیریت محصولات')
  await page.click('text=افزودن محصول جدید')
  await page.fill('#p-title', 'لگ e2e تست')
  await page.selectOption('#p-cat', 'legging')
  await page.fill('#p-price', '123000')
  await page.fill('#p-stock', '7')
  await page.click('button[type="submit"]:has-text("ذخیره و انتشار")')
  await expect(page).toHaveURL(/\/products/)
  await expect(page.getByText('لگ e2e تست').first()).toBeVisible()

  // رفرش → داده از SQLite برمی‌گردد
  await page.reload()
  await expect(page.getByText('لگ e2e تست').first()).toBeVisible()

  // حذف با undo
  await page.click('tr:has-text("لگ e2e تست") button:has-text("حذف")')
  await expect(page.getByText('لگ e2e تست')).toHaveCount(0)
  await page.click('#toast-stack .toast-item button')
  await expect(page.getByText('لگ e2e تست').first()).toBeVisible()

  // پرداخت دمو
  await page.click('text=پرداخت و تراکنش‌ها')
  await page.fill('#pay-amount', '55000')
  await page.click('button:has-text("ایجاد لینک پرداخت")')
  await expect(page.getByText('حالت دمو')).toBeVisible()
  await page.click('button:has-text("پرداخت موفق")')
  await expect(page.getByText(/تأیید شد/).first()).toBeVisible()
})
