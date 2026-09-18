<script setup>
import { ref, computed, onMounted } from 'vue'
import { useCms } from '../stores/cms'
import { copyText } from '../utils/clipboard'

const cms = useCms()
const productId = ref(null)
onMounted(() => { if (productId.value == null) productId.value = cms.products[0]?.id ?? null })
const tone = ref('energetic')
const busy = ref(false)
const output = ref(null)

const selectedProduct = computed(() => cms.products.find((p) => p.id === Number(productId.value)) || cms.products[0])

const TONES = {
  energetic: { label: 'پر انرژی و انگیزشی', text: (t) => `آماده‌اید برای شکستن رکورد؟ 💥 ${t}، ترکیبی از استایل و عملکرد بی‌نظیر. پارچه تنفسی، پشتیبانی عالی! همین حالا بهترین خودت باش.\n#فیتنس #PanahFit #لباس_ورزشی #ورزش_بانوان #انگیزشی` },
  formal: { label: 'رسمی و اطلاعاتی', text: (t) => `${t}؛ طراحی‌شده با متریال درجه‌یک برای تمرین‌های حرفه‌ای. برای مشاهده مشخصات فنی و ثبت سفارش به وب‌سایت PanahFit مراجعه کنید.\n#PanahFit #فیتنس_حرفه‌ای #مشخصات_فنی` },
  humorous: { label: 'طنز و دوستانه', text: (t) => `با ${t} آن‌قدر خفن می‌شی که آینه هم بهت حسودی می‌کنه! 😎 یک ورزش سبک، یک استایل سنگین.\n#فیتنس_با_حال #خفن_باش #PanahFit` },
}

async function generate() {
  if (busy.value || !selectedProduct.value) return
  busy.value = true
  const p = selectedProduct.value
  const tpl = TONES[tone.value] || TONES.energetic
  // آنلاین → سرور (OpenAI-compatible با فالبک قالب داخلی) | آفلاین → قالب محلی
  const remote = await cms.generateCaption(p.title, tone.value)
  output.value = {
    product: p.title,
    toneLabel: tpl.label,
    caption: remote ? remote.caption : tpl.text(p.title),
    source: remote ? remote.source : 'قالب محلی (آفلاین)',
    idea: `عکسی با کنتراست بالا در یک سالن ورزشی مدرن. مدل در حال انجام حرکت اسکوات با «${p.title}» و نورپردازی متمرکز روی رنگ سبز نئونی (Primary Color).`,
  }
  busy.value = false
  cms.toast('محتوای شبکه‌های اجتماعی با موفقیت تولید شد.')
}

async function copyCaption() {
  const ok = await copyText(output.value?.caption || '')
  cms.toast(ok ? 'کپشن در کلیپ‌بورد کپی شد.' : 'کپی نشد؛ متن را دستی انتخاب کنید.', !ok)
}
</script>

<template>
  <section>
    <h2 class="section-title"><i class="fas fa-brain"></i> تولید محتوای هوشمند برای شبکه‌های اجتماعی</h2>
    <div class="data-card-3d">
      <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 15px;">
        از هوش مصنوعی برای تولید محتوای جذاب شبکه‌های اجتماعی بر اساس محصولات موجود استفاده کنید.
      </p>

      <div class="field-row-2">
        <div class="form-group-3d">
          <label for="ai-product-select">محصول مورد نظر را انتخاب کنید</label>
          <select id="ai-product-select" v-model.number="productId" class="cms-input cms-select">
            <option v-for="p in cms.products" :key="p.id" :value="p.id">{{ p.title }}</option>
          </select>
        </div>
        <div class="form-group-3d">
          <label for="ai-tone-select">لحن محتوا</label>
          <select id="ai-tone-select" v-model="tone" class="cms-input cms-select">
            <option value="energetic">پر انرژی و انگیزشی</option>
            <option value="formal">رسمی و اطلاعاتی</option>
            <option value="humorous">طنز و دوستانه</option>
          </select>
        </div>
      </div>

      <button class="cms-btn" style="width: 250px;" :disabled="busy || !cms.products.length" @click="generate">
        <i class="fas" :class="busy ? 'fa-spinner fa-spin' : 'fa-cogs'"></i>
        {{ busy ? 'در حال تولید...' : 'تولید محتوای متنی و ایده تصویر' }}
      </button>
      <p v-if="!cms.products.length" class="field-error">ابتدا حداقل یک محصول بسازید.</p>

      <div v-if="output && !busy" class="ai-output">
        <h4><i class="fas fa-robot"></i> خروجی هوش مصنوعی (AI)
          <span class="status-chip chip-green" style="margin-inline-start: 8px; font-size: .65rem;">{{ output.source }}</span>
        </h4>
        <p class="ai-caption">
          <strong>متن پیشنهادی اینستاگرام (کپشن — لحن: {{ output.toneLabel }}):</strong><br>
          <span id="ai-caption-text" style="white-space: pre-line;">"{{ output.caption }}"</span>
        </p>
        <p><strong>ایده تصویری:</strong><br>{{ output.idea }}</p>
        <button type="button" class="cms-btn" style="width: auto; margin-top: 10px; padding: 8px 16px; background: #333; color: #fff; box-shadow: none;" @click="copyCaption">
          <i class="fas fa-clipboard"></i> کپی کپشن
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ai-output { margin-top: 25px; padding: 15px; background: #000; border: 1px solid var(--success); border-radius: 8px; font-size: 0.85rem; animation: fadeIn 0.4s ease-out; }
.ai-output h4 { color: var(--success); margin-bottom: 10px; }
.ai-output p { color: var(--text-main); margin-bottom: 10px; line-height: 1.8; }
.ai-caption { white-space: normal; }
</style>
