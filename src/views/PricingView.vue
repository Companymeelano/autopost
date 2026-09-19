<script setup>
import { reactive, ref } from 'vue'
import { apiFetch } from '../utils/api'
import { useCms } from '../stores/cms'
import { validateCoupon } from '../utils/validation'
import { formatPrice, toFa } from '../utils/format'
import { copyText } from '../utils/clipboard'
import SwitchToggle from '../components/SwitchToggle.vue'

const cms = useCms()
const form = reactive({ code: '', percent: '', maxUses: '', validFrom: '', validTo: '' })
const verifyForm = reactive({ code: '', amount: '' })
const verifyResult = ref(null)
const verifyBusy = ref(false)
async function verifyCoupon() {
  verifyBusy.value = true
  verifyResult.value = null
  try {
    const r = await apiFetch('/public/coupons/verify', { method: 'POST', body: { code: verifyForm.code.trim(), amount: Number(verifyForm.amount) } })
    verifyResult.value = r
  } catch (e) {
    verifyResult.value = { valid: false, message: e.message }
  } finally { verifyBusy.value = false }
}
const errors = ref({})

function createCoupon() {
  errors.value = validateCoupon(form, cms.coupons)
  if (Object.keys(errors.value).length) return
  cms.createCoupon({ code: form.code, percent: form.percent, maxUses: form.maxUses, validFrom: form.validFrom, validTo: form.validTo })
  cms.toast(`کد تخفیف «${form.code.trim().toUpperCase()}» ایجاد شد.`)
  Object.assign(form, { code: '', percent: '', maxUses: '', validFrom: '', validTo: '' })
  errors.value = {}
}
function toggleCoupon(i) {
  const c = cms.coupons[i]
  c.active = !c.active
  cms.toast(`کد «${c.code}» ${c.active ? 'فعال' : 'غیرفعال'} شد.`)
}
function removeCoupon(i) {
  const c = cms.coupons[i]
  if (!c) return
  const res = cms.removeCoupon(i)
  cms.toast(`کد «${c.code}» حذف شد`, false, { label: '↩ بازگردانی', onAction: () => cms.restoreCoupon(res.removed, res.index) })
}
async function copyCode(code) {
  const ok = await copyText(code)
  cms.toast(ok ? 'کد کپی شد.' : 'کپی نشد؛ دستی انتخاب کنید.', !ok)
}
function editProvince(id) { cms.openModal('ویرایش قیمت‌گذاری استانی', 'province', { provinceId: id }) }
</script>

<template>
  <section>
    <h2 class="section-title"><i class="fas fa-tags"></i> قیمت‌گذاری و تخفیفات پیشرفته</h2>

    <div class="data-card-3d" style="margin-bottom: 20px;">
      <h3 style="color: var(--primary); margin-bottom: 15px;"><i class="fas fa-gift"></i> تخفیفات ویژه (کوپن)<span v-if="!cms.canEdit('coupons')" class="role-note" style="font-size:.7rem;font-weight:400;margin-inline-start:10px;">فقط‌خواندنی برای نقش شما</span></h3>
      <form v-if="cms.canEdit('coupons')" @submit.prevent="createCoupon" novalidate>
        <div class="form-row">
          <div class="form-group-3d">
            <label for="coupon-code">کد تخفیف (Coupon)</label>
            <input id="coupon-code" v-model="form.code" type="text" class="cms-input" :class="{ invalid: errors.code }" placeholder="مثال: PANAHFIT10" />
            <span v-if="errors.code" class="field-error">{{ errors.code }}</span>
          </div>
          <div class="form-group-3d">
            <label for="coupon-percent">درصد تخفیف</label>
            <input id="coupon-percent" v-model="form.percent" type="number" class="cms-input" :class="{ invalid: errors.percent }" placeholder="مثال: ۱۵" min="1" max="100" />
            <span v-if="errors.percent" class="field-error">{{ errors.percent }}</span>
          </div>
          <div class="form-group-3d">
            <label for="coupon-uses">سقف استفاده (اختیاری)</label>
            <input id="coupon-uses" v-model="form.maxUses" type="number" class="cms-input" :class="{ invalid: errors.maxUses }" placeholder="مثال: ۱۰۰" min="1" />
            <span v-if="errors.maxUses" class="field-error">{{ errors.maxUses }}</span>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group-3d">
            <label for="coupon-from">اعتبار از (اختیاری)</label>
            <input id="coupon-from" v-model="form.validFrom" type="date" class="cms-input" dir="ltr" :class="{ invalid: errors.validFrom }" />
            <span v-if="errors.validFrom" class="field-error">{{ errors.validFrom }}</span>
          </div>
          <div class="form-group-3d">
            <label for="coupon-to">اعتبار تا (اختیاری)</label>
            <input id="coupon-to" v-model="form.validTo" type="date" class="cms-input" dir="ltr" :class="{ invalid: errors.validTo }" />
            <span v-if="errors.validTo" class="field-error">{{ errors.validTo }}</span>
          </div>
        </div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          <button type="submit" class="cms-btn" style="width: 200px; background: var(--accent-hot-red); margin-top: 5px;">
            <i class="fas fa-plus-circle"></i> ایجاد کوپن جدید
          </button>
          <span style="color: var(--text-muted); font-size: .8rem;">{{ cms.coupons.length ? toFa(cms.coupons.length) + ' کوپن ثبت‌شده' : '' }}</span>
        </div>
      </form>

      <div class="table-scroll-wrap">
        <table class="data-table-3d" style="font-size: 0.8rem; margin-top: 18px;">
          <thead>
            <tr><th scope="col">کد تخفیف</th><th scope="col">درصد</th><th scope="col">سقف</th><th scope="col">مصرف</th><th scope="col">وضعیت</th><th scope="col">عملیات</th></tr>
          </thead>
          <tbody>
            <tr v-for="(c, i) in cms.coupons" :key="c.code">
              <td>
                <strong style="color: var(--primary);">{{ c.code }}</strong>
                <button type="button" class="row-icon-btn" aria-label="کپی کد" title="کپی کد" @click="copyCode(c.code)"><i class="fas fa-copy"></i></button>
              </td>
              <td>{{ toFa(c.percent) }}٪</td>
              <td>{{ c.maxUses ? toFa(c.maxUses) : '∞' }}</td>
              <td>{{ toFa(c.used || 0) }}</td>
              <td>
                <template v-if="!c.active"><span class="status-chip chip-muted">غیرفعال</span></template>
                <template v-else-if="cms.couponState(c) === 'future'"><span class="status-chip chip-blue2" :title="'از ' + c.validFrom">شروع نشده</span></template>
                <template v-else-if="cms.couponState(c) === 'expired'"><span class="status-chip chip-red2" :title="'تا ' + c.validTo">منقضی</span></template>
                <template v-else-if="cms.couponState(c) === 'maxed'"><span class="status-chip chip-orange">سقف پر شده</span></template>
                <template v-else><span class="status-chip chip-green">فعال</span></template>
                <div v-if="(c.validFrom || c.validTo) && c.active" dir="ltr" style="font-size:.68rem;color:var(--text-muted);margin-top:3px;">{{ c.validFrom || '…' }} → {{ c.validTo || '…' }}</div>
              </td>
              <td style="white-space: nowrap;">
                <button v-if="cms.canEdit('coupons')" class="cms-btn" style="padding:5px 8px;margin:0;width:auto;background:#333;color:#fff;box-shadow:none;" @click="toggleCoupon(i)">{{ c.active ? 'غیرفعال' : 'فعال' }}</button>
                <button class="cms-btn" style="padding:5px 8px;margin:0;width:auto;background:var(--accent-hot-red);margin-right:5px;" @click="removeCoupon(i)">حذف</button>
              </td>
            </tr>
            <tr v-if="!cms.coupons.length"><td colspan="6" style="text-align:center;color:var(--text-muted);">هنوز کدی ساخته نشده است.</td></tr>
          </tbody>
        </table>
      </div>

      <div style="padding-top: 15px; border-top: 1px dashed var(--border-dark); margin-top: 20px;">
        <p style="color: var(--text-muted); display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem;">
          تخفیف محصولات جدید:
          <SwitchToggle v-model="cms.settings.newDiscount" aria-label="تخفیف محصولات جدید"
                        @change="v => cms.toast(`تخفیف محصولات جدید: ${v ? 'فعال' : 'غیرفعال'} شد.`)" />
        </p>
      </div>
    </div>

    <div id="coupon-test" class="data-card-3d" style="margin-bottom: 20px;">
      <h3 style="color: var(--accent-new); margin-bottom: 15px;"><i class="fas fa-flask"></i> تست کوپن (API عمومی سرور)</h3>
      <p v-if="!cms.online" style="color: var(--text-muted); font-size: .85rem;">این بخش نیازمند اتصال سرور است؛ در حالت آفلاین کوپن‌ها فقط در پنل قابل بررسی‌اند.</p>
      <form v-else class="field-row-2" @submit.prevent="verifyCoupon">
        <div class="form-group-3d"><label for="vt-code">کد تخفیف</label>
          <input id="vt-code" v-model="verifyForm.code" class="cms-input" placeholder="مثلاً WELCOME" style="direction:ltr;text-align:left;" /></div>
        <div class="form-group-3d"><label for="vt-amount">مبلغ سبد (تومان)</label>
          <input id="vt-amount" v-model="verifyForm.amount" type="number" min="1" class="cms-input" placeholder="100000" /></div>
        <div class="form-group-3d" style="display:flex;align-items:flex-end;">
          <button class="cms-btn" type="submit" style="width:100%;" :disabled="verifyBusy">
            <i class="fas" :class="verifyBusy ? 'fa-spinner fa-spin' : 'fa-check-double'"></i> {{ verifyBusy ? 'در حال بررسی…' : 'اعتبارسنجی' }}
          </button>
        </div>
      </form>
      <div v-if="verifyResult" style="font-size:.85rem;">
        <span v-if="verifyResult.valid" class="status-chip chip-green">
          معتبر — {{ verifyResult.percent }}٪ تخفیف: {{ verifyResult.discount.toLocaleString('fa-IR') }} تومان؛ قابل پرداخت: {{ verifyResult.payable.toLocaleString('fa-IR') }} تومان
        </span>
        <span v-else class="status-chip" style="background:rgba(248,113,113,.15);color:#f87171;">نامعتبر: {{ verifyResult.message }}</span>
      </div>
    </div>

    <div class="data-card-3d">
      <h3 style="color: var(--primary); margin-bottom: 15px;"><i class="fas fa-globe-asia"></i> قیمت‌گذاری مبتنی بر موقعیت جغرافیایی</h3>
      <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 15px;">امکان تعریف قیمت و هزینه ارسال متفاوت بر اساس استان (درصد اختلاف قیمت).</p>
      <div class="table-scroll-wrap">
        <table class="data-table-3d" style="font-size: 0.8rem;">
          <thead>
            <tr><th scope="col">استان</th><th scope="col">اختلاف قیمت محصول (٪)</th><th scope="col">هزینه ارسال ثابت</th><th scope="col">عملیات</th></tr>
          </thead>
          <tbody>
            <tr v-for="p in cms.provinces" :key="p.id">
              <td>{{ p.name }}</td>
              <td :style="{ color: p.delta === 0 ? 'var(--success)' : 'var(--accent-hot-red)' }">
                {{ p.delta === 0 ? '۰٪ (بومی)' : '+' + toFa(p.delta) + '٪' }}
              </td>
              <td>{{ formatPrice(p.ship) }} تومان</td>
              <td>
                <button class="cms-btn" style="padding:5px 8px;margin:0;width:auto;background:var(--accent-new);" @click="editProvince(p.id)">ویرایش</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.chip-green { color: var(--success); background: rgba(0, 255, 200, 0.12); border: 1px solid var(--success); }
.chip-muted { color: var(--text-muted); background: rgba(150, 150, 150, 0.12); border: 1px solid var(--text-muted); }
.row-icon-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 3px 7px; border-radius: 6px; font-size: .8rem; }
.row-icon-btn:hover { color: var(--primary); background: rgba(204, 255, 0, 0.08); }
</style>
