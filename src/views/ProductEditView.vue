<script setup>
import { reactive, ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useCms } from '../stores/cms'
import { validateProduct } from '../utils/validation'
import { CATEGORY_LABELS } from '../utils/format'
import { validateImageFile, readAsDataURL, processImage } from '../utils/image'

const cms = useCms()
const router = useRouter()
const route = useRoute()

const editId = computed(() => (route.name === 'product-edit' ? Number(route.params.id) : null))
const product = computed(() => (editId.value != null ? cms.products.find((p) => p.id === editId.value) : null))

const form = reactive({
  title: '', cat: '', price: '', stock: '', desc: '', metaDesc: '', hashtags: '',
  features: [
    { label: 'پارچه تنفسی', on: false },
    { label: 'آنتی‌سلولیت', on: false },
    { label: 'قابلیت کشسانی بالا', on: false },
    { label: 'مناسب بدنسازی', on: false },
  ],
  cropSquare: true,
  image: '',
})
const errors = ref({})
const seoBusy = ref('')
const uploadBusy = ref(false)
const fileInput = ref(null)
const notFound = ref(false)

onMounted(() => {
  if (product.value) {
    const p = product.value
    Object.assign(form, { title: p.title, cat: p.cat, price: p.price, stock: p.stock, desc: p.desc || '', image: p.image || '' })
  } else if (editId.value != null) {
    notFound.value = true
  }
})

function save() {
  if (notFound.value) return
  errors.value = validateProduct({ title: form.title, cat: form.cat, price: form.price, stock: form.stock })
  if (Object.keys(errors.value).length) {
    const first = Object.keys(errors.value)[0]
    document.getElementById('p-' + first)?.focus()
    return
  }
  const res = cms.saveProduct({
    title: form.title.trim(), cat: form.cat, price: Number(form.price),
    stock: Number(form.stock), desc: form.desc.trim(), image: form.image || undefined,
    features: form.features.filter((f) => f.on).map((f) => f.label),
    meta: { desc: form.metaDesc, hashtags: form.hashtags },
  }, editId.value)
  cms.toast(`${res.actionType} محصول «${form.title.trim()}» با موفقیت ذخیره شد.`)
  router.push('/products')
}

async function generateSeo(field) {
  if (seoBusy.value) return
  seoBusy.value = field
  await new Promise((r) => setTimeout(r, 600))
  if (field !== 'hashtags') form.metaDesc = 'بهترین لباس‌های ورزشی PanahFit با تخفیف ویژه! کیفیت و زیبایی را همزمان تجربه کنید.'
  if (field !== 'meta') form.hashtags = '#لگ_ورزشی #فیتنس_بانوان #ورزش #تخفیف_لباس_ورزشی'
  seoBusy.value = ''
  cms.toast('محتوای سئو توسط هوش مصنوعی تولید شد.')
}

async function onFileChange(ev) {
  const file = ev.target.files?.[0]
  ev.target.value = ''
  if (!file) return
  const err = validateImageFile(file)
  if (err) { cms.toast(err, true); return }
  uploadBusy.value = true
  try {
    const raw = await readAsDataURL(file)
    form.image = await processImage(raw, { square: form.cropSquare })
    cms.toast(`تصویر «${file.name}» پردازش و آماده ذخیره شد.`)
  } catch {
    cms.toast('خطا در پردازش تصویر.', true)
  } finally {
    uploadBusy.value = false
  }
}
</script>

<template>
  <section>
    <h2 class="section-title">
      <i class="fas" :class="editId != null ? 'fa-edit' : 'fa-plus-circle'"></i>
      <span v-if="notFound">محصول یافت نشد</span>
      <span v-else>{{ product ? 'ویرایش محصول: ' + product.title : 'افزودن محصول جدید' }}</span>
    </h2>

    <div v-if="notFound" class="data-card-3d" style="text-align:center;">
      <p style="color: var(--accent-hot-red); margin-bottom: 15px;"><i class="fas fa-unlink"></i> محصول درخواستی وجود ندارد یا حذف شده است.</p>
      <button class="cms-btn" style="width:auto;" @click="router.push('/products')">بازگشت به فهرست</button>
    </div>

    <div v-else class="data-card-3d">
      <form @submit.prevent="save" novalidate>
        <h3 style="color: var(--primary); margin-bottom: 15px;"><i class="fas fa-info-circle"></i> اطلاعات پایه محصول</h3>
        <div class="form-row">
          <div class="form-group-3d">
            <label for="p-title">عنوان محصول</label>
            <input id="p-title" v-model="form.title" type="text" class="cms-input" :class="{ invalid: errors.title }" />
            <span v-if="errors.title" class="field-error">{{ errors.title }}</span>
          </div>
          <div class="form-group-3d">
            <label for="p-cat">دسته‌بندی</label>
            <select id="p-cat" v-model="form.cat" class="cms-input cms-select" :class="{ invalid: errors.cat }">
              <option value="">انتخاب کنید</option>
              <option v-for="(label, key) in CATEGORY_LABELS" :key="key" :value="key">{{ label }}</option>
            </select>
            <span v-if="errors.cat" class="field-error">{{ errors.cat }}</span>
          </div>
          <div class="form-group-3d">
            <label for="p-price">قیمت (تومان)</label>
            <input id="p-price" v-model="form.price" type="number" min="0" step="500" class="cms-input" placeholder="مثلاً 490000" :class="{ invalid: errors.price }" />
            <span v-if="errors.price" class="field-error">{{ errors.price }}</span>
          </div>
          <div class="form-group-3d">
            <label for="p-stock">موجودی انبار</label>
            <input id="p-stock" v-model="form.stock" type="number" min="0" class="cms-input" :class="{ invalid: errors.stock }" />
            <span v-if="errors.stock" class="field-error">{{ errors.stock }}</span>
          </div>
        </div>

        <div class="form-group-3d">
          <label>توضیحات محصول پیشرفته (قابلیت‌های گزینه‌ای)</label>
          <textarea id="p-desc" v-model="form.desc" class="cms-textarea" rows="4" placeholder="توضیحات کامل محصول..."></textarea>
          <div class="checkbox-group">
            <div v-for="f in form.features" :key="f.label" class="fancy-checkbox-3d" role="checkbox" tabindex="0"
                 :aria-checked="String(f.on)" :class="{ checked: f.on }"
                 @click="f.on = !f.on"
                 @keydown.enter.prevent="f.on = !f.on" @keydown.space.prevent="f.on = !f.on">
              <i class="fas fa-check"></i> {{ f.label }}
            </div>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group-3d">
            <label for="p-image">بارگذاری تصویر</label>
            <div class="image-upload-box-3d" role="button" tabindex="0" aria-label="انتخاب فایل تصویر"
                 @click="fileInput?.click()" @keydown.enter.prevent="fileInput?.click()" @keydown.space.prevent="fileInput?.click()">
              <i class="fas fa-spinner fa-spin" v-if="uploadBusy"></i>
              <i v-else class="fas fa-cloud-upload-alt"></i>
              <img v-if="form.image" :src="form.image" alt="پیش‌نمایش تصویر محصول" style="max-width:90%;max-height:140px;border-radius:8px;margin-bottom:8px;" />
              <p>{{ uploadBusy ? 'در حال پردازش...' : `برای بارگذاری کلیک کنید (حداکثر ${'۲'} مگابایت${form.cropSquare ? '، برش مربع' : ''})` }}</p>
            </div>
            <input ref="fileInput" id="p-image" type="file" accept="image/*" style="display:none;" @change="onFileChange" />
            <label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:.8rem;color:var(--text-muted);cursor:pointer;">
              <input type="checkbox" v-model="form.cropSquare" style="width:auto;accent-color:var(--primary);" />
              برش خودکار به مربع + فشرده‌سازی تا ۸۰۰ پیکسل
            </label>
            <button v-if="form.image && !uploadBusy" type="button" class="cms-btn"
                    style="width:auto;padding:5px 12px;margin-top:6px;background:#333;color:#fff;box-shadow:none;"
                    @click="form.image=''">
              <i class="fas fa-trash"></i> حذف تصویر
            </button>
          </div>

          <div class="form-group-3d">
            <h3 style="color: var(--accent-hot-red); margin-bottom: 15px;"><i class="fas fa-search-dollar"></i> قابلیت‌های سئو هوشمند</h3>
            <div class="form-group-3d">
              <label for="p-meta-desc">تولید خودکار متا تگ و توضیحات سئو</label>
              <div class="input-with-icon">
                <input id="p-meta-desc" v-model="form.metaDesc" type="text" class="cms-input" placeholder="Meta Description" />
                <button type="button" class="seo-btn" title="تولید توسط هوش مصنوعی" :disabled="!!seoBusy" @click="generateSeo('meta')">
                  <i class="fas" :class="seoBusy === 'meta' ? 'fa-spinner fa-spin' : 'fa-magic'"></i>
                </button>
              </div>
            </div>
            <div class="form-group-3d">
              <label for="p-hashtags">تولید خودکار هشتگ‌های مرتبط</label>
              <div class="input-with-icon">
                <input id="p-hashtags" v-model="form.hashtags" type="text" class="cms-input" placeholder="#فیتنس #لگ_ورزشی #..." />
                <button type="button" class="seo-btn" title="تولید توسط هوش مصنوعی" :disabled="!!seoBusy" @click="generateSeo('hashtags')">
                  <i class="fas" :class="seoBusy === 'hashtags' ? 'fa-spinner fa-spin' : 'fa-hashtag'"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="action-bar" style="justify-content: flex-start; margin-top: 30px;">
          <button type="submit" class="cms-btn" style="width: 200px;">
            <i class="fas fa-save"></i> ذخیره و انتشار
          </button>
          <button type="button" class="cms-btn" style="width: 150px; background: var(--border-light); color: var(--text-main); box-shadow: none;" @click="router.push('/products')">
            <i class="fas fa-times"></i> انصراف
          </button>
        </div>
      </form>
    </div>
  </section>
</template>

<style scoped>
.seo-btn { position: absolute; left: 5px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--success); cursor: pointer; padding: 5px; font-size: .9rem; transition: .15s; }
.seo-btn:hover:not(:disabled) { color: #fff; text-shadow: 0 0 5px var(--success); }
.seo-btn:disabled { opacity: .5; cursor: default; }
</style>
