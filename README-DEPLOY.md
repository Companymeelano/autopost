# مستندات استقرار — PanahFit CMS (فاز ۲.۵)

اپدو حالت دارد: **dev** (Vite:5173 + API:8787 با پروکسی) و **production**
(همان سرور Node، هم API و هم `dist/` را روی یک پورت سرو می‌کند).

## اجرای production (بدون داکر)
```bash
npm ci && npm run build        # dist + کپی public (manifest/sw/icons)
cp .env.example .env            # کلیدها و رمز ادمین را ست کنید
systemctl enable --now panahfit # یا: npm run server
```
- `npm run server` = سرو dist + API روی `PORT` (پیش‌فرض 8787)
- reverse-proxy (nginx) با HTTPS توصیه می‌شود؛ کوکی‌ها `SameSite=Lax` هستند

## داکر
```bash
docker compose up -d --build     # app: :8787 + volume برای data/
docker compose --profile backup up -d backup   # بکاپ روزانه خودکار
```
سلامت کانتینر: `GET /api/health` (healthcheck داخلی هر 30s)

## متغیرهای محیطی (`.env`)
| کلید | کاربرد |
|---|---|
| `PORT` `DATA_DIR` | پورت API و مسیر دیتابیس/مدیا/بکاپ‌ها |
| `ADMIN_USER` `ADMIN_PASS` | فقط هنگام ساخت اولین کاربر (بعداً از پنل تغییرش دهید) |
| `SEED_DEMO_USERS=1` | ساخت حساب‌های نمایشی `editor` / `finance` برای تست نقش‌ها |
| `OPENAI_API_KEY` `OPENAI_MODEL` `OPENAI_BASE_URL` | موتور AI واقعی (هر API سازگار OpenAI؛ نبود = قالب داخلی) |
| `ZARINPAL_MERCHANT_ID` `ZARINPAL_MOBILE` | درگاه واقعی زرین‌پال (نبود = دمو داخلی) |
| `TELEGRAM_BOT_TOKEN` `TELEGRAM_CHAT_ID` | انتشار خودکار پست‌های زمان‌بندی‌شده (نبود = فقط وضعیت داخلی) |
| `BACKUP_KEEP` | تعداد نسخه‌های بکاپ قابل‌نگهداری (پیش‌فرض ۱۴) |

## بکاپ‌گیری و بازیابی
```bash
npm run db:backup    # VACUUM INTO → data/backups/panahfit-<زمان>.sqlite (integrity-check می‌شود)
# cron روزانه:
# 15 3 * * * cd /opt/panahfit && node server/backup.js >> /var/log/panahfit-backup.log 2>&1
```
**بازیابی (سناریوی تست‌شده):** توقف سرویس ← قرار دادن فایل备份 به‌جای `data/panahfit.db`
(فایل‌های `-wal`/`-shm` قدیمی را پاک کنید) ← استارت سرویس ← بررسی `/api/health` و لاگین.

## تست‌ها در CI
- هر push/PR: `vitest run --coverage` (گیت ratchet پوشش) + `vite build` + بیلد ایمیج داکر با smoke تست healthcheck
- e2e: `npm run test:e2e` (Playwright chromium — در CI با webServer خودکار؛ در حالت لوکال ابتدا `npm run build`)

## نکات امنیتی اعمال‌شده
CSP کامل `default-src 'self'` (بدون CDN) · scrypt برای رمزها · کوکی HttpOnly/Lax ·
rate-limit لاگین و اندپوینت‌های عمومی · magic-byte check برای آپلود مدیا ·
path-traversal guard · نقش‌های admin/editor/finance با اجرای سمت سرور · لاگ ممیزی کامل.
