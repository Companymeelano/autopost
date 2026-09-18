// ============================================================================
// فاز ۴ — دوزبانه‌سازی سایت عمومی (fa/en) با تغییر جهت RTL/LTR
// پنل مدیریت عمداً فارسی می‌ماند؛ scope توسط App.vue ست می‌شود
// ============================================================================
import { reactive, computed } from 'vue'

const LANG_KEY = 'panahfit.lang.v1'

const dict = {
  fa: {
    'nav.home': 'خانه و فروشگاه', 'nav.blog': 'وبلاگ', 'nav.contact': 'تماس با ما',
    'hero.title1': 'توان و تناسب، با', 'hero.title2': 'پناه‌فیت',
    'hero.sub': 'کالکشن ورزشی با', 'hero.sub2': 'تخفیف ویژه محصولات جدید', 'hero.sub3': '— ارسال سریع به سراسر کشور',
    'hero.blog': 'مجله ورزشی',
    'search': 'جست‌وجوی محصول…', 'all': 'همه',
    'sort.popular': 'پرفروش‌ترین', 'sort.fresh': 'جدیدترین', 'sort.cheap': 'ارزان‌ترین', 'sort.expensive': 'گران‌ترین',
    'loading': 'در حال بارگذاری محصولات…', 'nofound': 'محصولی با این فیلترها پیدا نشد.',
    'oos': 'ناموجود', 'off': '٪ تخفیف',
    'prod.notfound': 'این محصول یافت نشد یا از فروشگاه حذف شده است.', 'prod.back': 'بازگشت به فروشگاه',
    'prod.stock.in': 'موجود در انبار', 'prod.stock.low': 'باقی مانده!', 'prod.stock.out': 'ناموجود',
    'prod.desc.empty': 'برای این محصول توضیحی ثبت نشده است.',
    'prod.add': 'افزودن به سبد', 'prod.buynow': 'خرید فوری', 'prod.similar': 'محصولات مشابه', 'prod.toman': 'تومان',
    'toast.added': 'به سبد اضافه شد.', 'toast.oos': 'موجودی این محصول تکمیل است.',
    'blog.title': 'مجله پناه‌فیت', 'blog.empty': 'هنوز پست منتشرشده‌ای وجود ندارد.',
    'post.back': '→ همه نوشته‌ها', 'post.notfound': 'این نوشته یافت نشد.',
    'ck.title': 'سبد خرید و پرداخت', 'ck.ship': 'مشخصات ارسال', 'ord.th.item': 'محصول', 'ord.th.qty': 'تعداد', 'ord.th.amount': 'مبلغ', 'ord.paidTitle': '', 'ck.items': 'اقلام سبد', 'ck.coupon': 'کد تخفیف', 'ck.apply': 'اعمال',
    'ck.buyer': 'نام و نام خانوادگی', 'ck.phone': 'موبایل', 'ck.address': 'آدرس کامل', 'ck.note': 'توضیحات سفارش',
    'ck.submit': 'تأیید و پرداخت آنلاین', 'ck.sum': 'خلاصه سفارش', 'ck.total': 'جمع اقلام', 'ck.discount': 'تخفیف کوپن',
    'ck.pay': 'قابل پرداخت', 'ck.priceNote': 'قیمت‌ها نهایی در سرور محاسبه و پس از پرداخت، موجودی انبار کسر می‌شود.',
    'ck.empty': 'سبد خرید خالی است.', 'ck.gotoShop': 'رفتن به فروشگاه',
    'ck.e.buyer': 'نام را کامل وارد کنید.', 'ck.e.phone': 'شماره موبایل معتبر نیست.', 'ck.e.address': 'آدرس کامل را بنویسید (حداقل ۱۰ نویسه).', 'ck.e.items': 'سبد خرید خالی است.',
    'ord.title': 'وضعیت سفارش', 'ord.checking': 'در حال بررسی…',
    'ord.waiting': 'در انتظار پرداخت', 'ord.paid': 'پرداخت موفق — در صف پردازش', 'ord.shipped': 'ارسال شده', 'ord.cancelled': 'لغو شده', 'ord.failed': 'پرداخت ناموفق',
    'ord.notfound': 'سفارش یافت نشد.', 'ord.track': 'کد رهگیری:', 'ord.continue': 'ادامه پرداخت', 'ord.retry': 'بازگشت و تلاش دوباره', 'ord.keep': 'ادامه خرید',
    'ct.title': 'با ما در تماس باشید', 'ct.lead': 'پشتیبانی سفارش، همکاری فروشگاهی یا سوال درباره سایز — پیام شما مستقیم در میز کار پنل پناه‌فیت ثبت می‌شود.',
    'ct.form': 'فرم تماس', 'ct.user': 'نام شما', 'ct.subject': 'موضوع', 'ct.body': 'متن پیام', 'ct.send': 'ارسال پیام',
    'ct.done': 'پیام شما ثبت شد ✅', 'ct.doneSub': 'تیم پناه‌فیت معمولاً کمتر از ۲۴ ساعت پاسخ می‌دهد.', 'ct.another': 'ارسال پیام دیگر',
    'ft.shop': 'سبد خرید و پرداخت', 'ft.login': 'ورود پنل مدیریت', 'ft.rights': '© پناه‌فیت — توان و تناسب',
    'push.on': 'فعال‌سازی اعلان‌ها', 'push.off': 'اعلان‌ها غیرفعال‌اند', 'push.ok': 'اعلان‌ها فعال شد 🔔', 'push.no': 'مرورگر اعلان پشتیبانی نمی‌کند.', 'push.denied': 'اجازه اعلان در مرورگر رد شده است.',
    'offline': '⚠ مشاهده آفلاین — برای ثبت سفارش و پرداخت آنلاین، سرور باید در دسترس باشد.',
    'lang.switch': 'English',
  },
  en: {
    'nav.home': 'Shop', 'nav.blog': 'Blog', 'nav.contact': 'Contact',
    'hero.title1': 'Power & fit, with', 'hero.title2': 'PanahFit',
    'hero.sub': 'Athletic collection with', 'hero.sub2': 'special launch discounts', 'hero.sub3': '— fast shipping nationwide',
    'hero.blog': 'Fitness journal',
    'search': 'Search products…', 'all': 'All',
    'sort.popular': 'Best selling', 'sort.fresh': 'Newest', 'sort.cheap': 'Price ↑', 'sort.expensive': 'Price ↓',
    'loading': 'Loading products…', 'nofound': 'No products match these filters.',
    'oos': 'Out of stock', 'off': '% OFF',
    'prod.notfound': 'Product not found or removed from the store.', 'prod.back': 'Back to shop',
    'prod.stock.in': 'In stock', 'prod.stock.low': 'left in stock!', 'prod.stock.out': 'Out of stock',
    'prod.desc.empty': 'No description provided for this product.',
    'prod.add': 'Add to cart', 'prod.buynow': 'Buy now', 'prod.similar': 'Similar products', 'prod.toman': 'T',
    'toast.added': 'added to cart.', 'toast.oos': 'Stock limit reached for this item.',
    'blog.title': 'PanahFit Journal', 'blog.empty': 'No published posts yet.',
    'post.back': '→ All posts', 'post.notfound': 'Post not found.',
    'ck.title': 'Cart & checkout', 'ck.ship': 'Shipping details', 'ord.th.item': 'Item', 'ord.th.qty': 'Qty', 'ord.th.amount': 'Amount', 'ord.paidTitle': '', 'ck.items': 'Cart items', 'ck.coupon': 'Coupon code', 'ck.apply': 'Apply',
    'ck.buyer': 'Full name', 'ck.phone': 'Mobile', 'ck.address': 'Full address', 'ck.note': 'Order note',
    'ck.submit': 'Confirm & pay online', 'ck.sum': 'Order summary', 'ck.total': 'Subtotal', 'ck.discount': 'Coupon discount',
    'ck.pay': 'Payable', 'ck.priceNote': 'Final prices are computed on the server; stock is deducted right after payment.',
    'ck.empty': 'Your cart is empty.', 'ck.gotoShop': 'Go to shop',
    'ck.e.buyer': 'Enter your full name.', 'ck.e.phone': 'Enter a valid mobile number.', 'ck.e.address': 'Address must be at least 10 characters.', 'ck.e.items': 'Your cart is empty.',
    'ord.title': 'Order status', 'ord.checking': 'Checking…',
    'ord.waiting': 'Awaiting payment', 'ord.paid': 'Paid — processing queue', 'ord.shipped': 'Shipped', 'ord.cancelled': 'Cancelled', 'ord.failed': 'Payment failed',
    'ord.notfound': 'Order not found.', 'ord.track': 'Tracking code:', 'ord.continue': 'Continue payment', 'ord.retry': 'Back and retry', 'ord.keep': 'Keep shopping',
    'ct.title': 'Get in touch', 'ct.lead': 'Order support, wholesale or sizing questions — your message lands directly in the PanahFit admin desk.',
    'ct.form': 'Contact form', 'ct.user': 'Your name', 'ct.subject': 'Subject', 'ct.body': 'Message', 'ct.send': 'Send message',
    'ct.done': 'Message sent ✅', 'ct.doneSub': 'The PanahFit team usually replies within 24 hours.', 'ct.another': 'Send another',
    'ft.shop': 'Cart & checkout', 'ft.login': 'Admin panel', 'ft.rights': '© PanahFit — Power & Fit',
    'push.on': 'Enable notifications', 'push.off': 'Notifications off', 'push.ok': 'Notifications enabled 🔔', 'push.no': 'This browser does not support notifications.', 'push.denied': 'Notification permission was denied.',
    'offline': '⚠ Offline preview — the server must be reachable to order and pay online.',
    'lang.switch': 'فارسی',
  },
}

const state = reactive({
  lang: (() => { try { return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'fa' } catch { return 'fa' } })(),
  scope: 'site', // 'site' | 'admin'
})

export function applyDirection() {
  const html = document.documentElement
  if (state.scope === 'site' && state.lang === 'en') { html.dir = 'ltr'; html.lang = 'en' }
  else { html.dir = 'rtl'; html.lang = state.scope === 'admin' ? 'fa' : state.lang }
}

export function setScope(scope) { state.scope = scope; applyDirection() }

export function useI18n() {
  const t = (key, vars) => {
    let s = dict[state.lang]?.[key] ?? dict.fa[key] ?? key
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v)
    return s
  }
  function toggle() {
    state.lang = state.lang === 'fa' ? 'en' : 'fa'
    try { localStorage.setItem(LANG_KEY, state.lang) } catch { /* noop */ }
    applyDirection()
  }
  return { t, lang: computed(() => state.lang), toggle, isEn: computed(() => state.scope === 'site' && state.lang === 'en') }
}
