# ⚡ PanahFit — فروشگاه + CMS ورزشی (تمام‌کد محلی)

پروژه فول‌استک «پناه‌فیت»: فروشگاه لباس ورزشی با پنل مدیریت کامل — **RTL فارسی، تقویم شمسی، تم سایبرپانک، بدون هیچ سرویس خارجی**.

## پشته فناوری
- **فرانت**: Vite 6 + Vue 3.5 + Pinia + Vue-Router (hash) + Chart.js — سلف‌هوست Vazirmatn/FontAwesome، PWA آفلاین
- **بک**: Node ≥22 با `node:sqlite` داخلی (بدون ORM) — sessions با scrypt+کوکی، rate-limit، CSP، ممیزی
- **یک سرور برای همه**: در production همان API سرور، `dist/` را هم سرو می‌کند (تک‌اورجین، بدون CORS)

## اجرا
```bash
npm ci
npm run dev      # SPA روی :5173 + API روی :8787 (vite proxy) — dev: admin/12345
# production:
npm run build && npm run server   # همه‌چیز روی :8787
```
داکر و systemd و بکاپ/بازیابی: ← `README-DEPLOY.md`

## تست
```bash
npm test              # 129 تست: یونیت + API یکپارچه + ویوها (jsdom)
npm run test:cov      # با گیت پوشش ratchet (vite.config.js)
npm run test:e2e      # Playwright (لازم: npm run build + دانلود مرورگر؛ در CI خودکار)
```

## فازها (هرکدام یک کامیت/شکاف قابلیت)
| فاز | محتوا |
|---|---|
| ۰ | طراحی و استایل ارثی (legacy-admin.html) |
| ۱ | SPA ویوها + استور pinia + localStorage + مودال‌ها + ۳۹ تست |
| ۲ | سرور production: SQLite، احراز هویت، همگام‌سازی rev/ETag، ارائه‌دهنده AI و درگاه، scheduler |
| ۲.۵ | همزمانی مرج-سطح‌ردیف، مدیا روی دیسک، ممیزی/ورود، نقش‌ها، صف انتشار، CSV، بکاپ VACUUM، CI، PWA، پالت Ctrl+K |
| ۳ | **فروشگاه عمومی**: صفحات سایت، سبد خرید، ثبت سفارش با کسر اتمیک موجودی، درگاه دمو، پیگیری سفارش، وبلاگ، تماس، sitemap/سئو، مدیریت سفارش‌ها |
| ۴ | **اعلان Push واقعی** (VAPID + aes128gcm نیتیو) · **دوزبانه fa/en با LTR** · **گزارش مالی/تسویه** (کارمزد، استرداد، کوپن، CSV) · فاکتور چاپی/PDF · دکمه تست پوش در تنظیمات |
| ۵ | **مسیریابی History** (URL واقعی بدون `#`) · **Prerender سئو سمت سرور** (متا/OG/JSON-LD Product و BlogPosting، کش روی rev، noindex پنل) · **پیگیری مرسوله** (شرکت باربری + کد رهگیری + گاه‌شمار وضعیت برای مشتری) با **پیامک Kavenegar/موک** · **پیام‌های خطای انگلیسی** بر اساس Accept-Language |
| ۶ | **اپ اندروید (Capacitor)**: صفحه اتصال به سرور، build APK در GitHub Actions (`Android APK` workflow) و آپلود خودکار روی Release · بازیابی/پایدارسازی `src/data/seeds.js` و اصلاح `.gitignore` |

## معماری داده
- جدول `records` (coll+id+JSON) برای مجموعه‌های پنل با شمارنده نسخه `rev` (همگام‌سازی/409/merge)
- جداول مستقل: `users` `sessions` `transactions` `orders` `audit` `logins` + فایل مدیا هش‌شده (`data/media/`)
- سفارش: قیمت‌گذاری **فقط سمت سرور** از DB محاسبه می‌شود؛ تسویه در بازگشت از درگاه `settleOrder()` — یک تراکنش `BEGIN IMMEDIATE` شامل waiting→paid + کم‌کردن stock و زیادکردن sold همه اقلام (کم‌موجودی → کل تراکنش rollback و سفارش failed)
- لغو سفارش پرداخت‌شده موجودی و sold را برمی‌گرداند؛ `VACUUM INTO` برای بکاپ گرم

## نقش‌ها
`admin` (کل) · `editor` (محصول/پست/مدیا/AI/صف) · `finance` (کوپن/پیام/درخواست/پرداخت‌ها/سفارش‌ها/ممیزی) — مجوزها سمت سرور روی PUT state (diff مجموعه‌ها) و همه اندپوینت‌ها اعمال می‌شود.

## اندپوینت‌های عمومی سایت
`GET /api/public/site` · `POST /api/public/orders` · `GET/POST /api/push/*` (اشتراک/تست) · `GET /api/public/orders/:ref` · `GET /api/public/orders/return` (وب‌تک درگاه) · `GET /gateway?ref=` (صفحه درگاه دمو) · `GET /api/public/pricing|products|coupons/verify|requests` · `GET /sitemap.xml|/robots.txt` — همگی با rate-limit و احترام به حالت نگهداری.

مستند عملیاتی/استقرار: `README-DEPLOY.md` · متغیرها: `.env.example`

## اپ اندروید (فاز ۶)

وب‌اپ پناه‌فیت با **Capacitor** داخل یک اپ نیتیو اندروید بسته‌بندی می‌شود:

- تنظیمات: `capacitor.config.json` (appId `com.panahfit.app`) — پوشه `android/` تولیدشده در مخزن نیست و CI آن را می‌سازد
- first-run: اپ نیتیو با صفحه **«اتصال به سرور»** باز می‌شود؛ آدرس پنل (مثلاً `https://panah.fit`) ذخیره و WebView به همان سرور می‌رود — همه چیز (فروشگاه، پنل، درگاه، مدیا، پوش) مثل مرورگر کار می‌کند. در تنظیمات پنل هم دکمه «تغییر سرور» هست
- build: اکشن **`Android APK`** را از تب Actions اجرا کنید (workflow_dispatch؛ برای انتشار روی Release تگ `v1.0-android` بزنید). خروجی: artifact `panahfit-apk` + فایل `panahfit.apk` روی Release
- در ماشین محلی با Android SDK: `npm run android:apk`
- APK خروجی **debug** با signing پیش‌فرض است (برای نصب مستقیم؛ برای کافه‌بازار/پلی‌استور باید keystore اختصاصی + assembleRelease تنظیم شود)
- Web Push مرورگری در WebView فعال نیست؛ نوتیفیکیشن در اپ از همان بوق‌های داخل‌اپلی و (آینده) FCM استفاده می‌کند
