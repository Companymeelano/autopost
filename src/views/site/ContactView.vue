<script setup>
// فرم تماس عمومی → POST /api/public/requests (نمایش در MessagesView پنل)
import { reactive, ref } from 'vue'
import { useSite } from '../../stores/site'

const site = useSite()
const form = reactive({ user: '', subject: '', body: '' })
const errors = reactive({})
const sent = ref(0)
const busy = ref(false)
const msg = ref('')

async function submit() {
  for (const k of Object.keys(errors)) delete errors[k]
  msg.value = ''
  if (form.subject.trim().length < 3) errors.subject = 'موضوع کوتاه است.'
  if (form.body.trim().length < 5) errors.body = 'متن پیام کوتاه است.'
  if (form.user.trim().length < 2) errors.user = 'نام خود را وارد کنید.'
  if (Object.keys(errors).length) return
  busy.value = true
  try {
    const r = await fetch('/api/public/requests', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...form }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { Object.assign(errors, d.fields || {}); msg.value = d.error || 'ارسال ناموفق بود.'; return }
    sent.value = d.id || 1
  } catch { msg.value = 'ارتباط با سرور برقرار نشد — پساً از بالا آمدن سرور دوباره تلاش کنید.' } finally { busy.value = false }
}
</script>

<template>
  <section class="ct">
    <div class="ct-grid">
      <div>
        <h1>با ما در تماس باشید</h1>
        <p class="ct-lead">پشتیبانی سفارش، همکاری فروشگاهی یا سوال درباره سایز — پیام شما مستقیم در میز کار پنل پناه‌فیت ثبت می‌شود.</p>
        <ul class="ct-info">
          <li v-if="site.settings.phone"><i class="fas fa-phone"></i> {{ site.settings.phone }}</li>
          <li v-if="site.settings.telegramChannel"><i class="fab fa-telegram"></i> {{ site.settings.telegramChannel }}</li>
          <li v-if="site.settings.address"><i class="fas fa-location-dot"></i> {{ site.settings.address }}</li>
        </ul>
      </div>
      <form v-if="!sent" class="ct-card" @submit.prevent="submit">
        <h2>فرم تماس</h2>
        <p v-if="msg" class="ct-err">{{ msg }}</p>
        <label>نام شما
          <input v-model="form.user" id="ct-user" class="ct-in" :class="{ bad: errors.user }" />
        </label>
        <p v-if="errors.user" class="ct-ferr">{{ errors.user }}</p>
        <label>موضوع
          <input v-model="form.subject" id="ct-subject" class="ct-in" :class="{ bad: errors.subject }" />
        </label>
        <p v-if="errors.subject" class="ct-ferr">{{ errors.subject }}</p>
        <label>متن پیام
          <textarea v-model="form.body" id="ct-body" rows="5" class="ct-in" :class="{ bad: errors.body }"></textarea>
        </label>
        <p v-if="errors.body" class="ct-ferr">{{ errors.body }}</p>
        <button class="ct-send" type="submit" :disabled="busy">{{ busy ? 'در حال ارسال…' : 'ارسال پیام' }}</button>
      </form>
      <div v-else class="ct-card ct-done">
        <i class="fas fa-paper-plane"></i>
        <h2>پیام شما ثبت شد ✅</h2>
        <p>تیم پناه‌فیت معمولاً کمتر از ۲۴ ساعت پاسخ می‌دهد. درخواست با شماره <b>#{{ sent }}</b> در صف پشتیبانی است.</p>
        <button type="button" class="ct-send ghost" @click="sent = 0; form.user = form.subject = form.body = ''">ارسال پیام دیگر</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ct-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; align-items: start; }
@media (max-width: 840px) { .ct-grid { grid-template-columns: 1fr; } }
.ct h1 { font-size: 1.45rem; margin: 10px 0 8px; }
.ct-lead { color: #b9b9d0; line-height: 1.9; font-size: .88rem; }
.ct-info { list-style: none; padding: 0; margin: 18px 0 0; display: grid; gap: 10px; color: #9a9ab5; font-size: .84rem; }
.ct-info i { color: #00ffaa; margin-left: 8px; }
.ct-card { background: #12121f; border: 1px solid #22223a; border-radius: 18px; padding: 20px 22px; }
.ct-card h2 { margin: 0 0 14px; font-size: 1rem; }
.ct-card label { display: grid; gap: 6px; font-size: .8rem; color: #b9b9d0; margin-bottom: 12px; }
.ct-in { background: #0d0d18; border: 1px solid #2a2a44; color: #eaeaea; border-radius: 10px; padding: 10px 12px; font: inherit; font-size: .85rem; width: 100%; box-sizing: border-box; }
.ct-in:focus { outline: none; border-color: #00ffaa; }
.ct-in.bad { border-color: #ff0055; }
.ct-ferr { color: #ff5a7a; font-size: .72rem; margin: -8px 0 10px; }
.ct-err { background: #241019; border: 1px solid #ff005566; color: #ff8aa0; padding: 9px 12px; border-radius: 9px; font-size: .78rem; margin: 0 0 12px; }
.ct-send { width: 100%; background: #00ffaa; color: #04110b; border: 0; border-radius: 10px; padding: 11px; font: inherit; font-weight: 800; cursor: pointer; }
.ct-send:disabled { opacity: .55; }
.ct-send.ghost { background: transparent; color: #b9b9d0; border: 1px solid #2a2a44; width: auto; padding: 8px 18px; }
.ct-done { text-align: center; }
.ct-done i { font-size: 1.8rem; color: #00ffaa; }
.ct-done p { color: #b9b9d0; font-size: .84rem; line-height: 1.9; }
</style>
