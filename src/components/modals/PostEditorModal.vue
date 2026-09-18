<script setup>
import { reactive, ref } from 'vue'
import { useCms } from '../../stores/cms'
import { validatePost } from '../../utils/validation'
import { dateJalali } from '../../utils/format'

const props = defineProps({ postId: { type: Number, default: null } })
const emit = defineEmits(['done'])
const cms = useCms()
const existing = props.postId != null ? cms.posts.find((p) => p.id === props.postId) : null

const form = reactive({
  title: existing?.title || '',
  author: existing?.author || 'مدیر',
  status: existing?.status || 'published',
  body: existing?.body || '',
  publishAt: existing?.publishAt ? existing.publishAt.slice(0, 16) : '',
})
const errors = ref({})

function save() {
  errors.value = validatePost(form)
  if (Object.keys(errors.value).length) return
  const payload = { ...form, publishAt: form.status === 'scheduled' ? new Date(form.publishAt).toISOString() : undefined }
  if (form.status !== 'scheduled') delete payload.publishAt
  if (existing) payload.date = existing.date
  else payload.date = dateJalali()
  cms.savePost(payload, existing ? existing.id : null)
  cms.toast(`پست «${payload.title}» ${existing ? 'به‌روزرسانی شد' : 'با تاریخ ' + payload.date + ' ساخته شد'}.`)
  emit('done')
}
</script>

<template>
  <form @submit.prevent="save">
    <div class="form-group-3d">
      <label for="f-post-title">عنوان پست</label>
      <input id="f-post-title" v-model="form.title" type="text" class="cms-input" :class="{ invalid: errors.title }" />
      <span v-if="errors.title" class="field-error">{{ errors.title }}</span>
    </div>
    <div class="field-row-2">
      <div class="form-group-3d">
        <label for="f-post-author">نویسنده</label>
        <input id="f-post-author" v-model="form.author" type="text" class="cms-input" :class="{ invalid: errors.author }" />
        <span v-if="errors.author" class="field-error">{{ errors.author }}</span>
      </div>
      <div class="form-group-3d">
        <label for="f-post-status">وضعیت</label>
        <select id="f-post-status" v-model="form.status" class="cms-input cms-select">
          <option value="published">منتشر شده</option>
          <option value="draft">پیش‌نویس</option>
          <option value="scheduled">زمان‌بندی‌شده (Autopost)</option>
        </select>
      </div>
    </div>
    <div v-if="form.status === 'scheduled'" class="form-group-3d">
      <label for="f-post-publishAt">زمان انتشار (سرور هر ۳۰ ثانیه صف را بررسی می‌کند)</label>
      <input id="f-post-publishAt" v-model="form.publishAt" type="datetime-local" class="cms-input" dir="ltr"
             :class="{ invalid: errors.publishAt }" />
      <span v-if="errors.publishAt" class="field-error">{{ errors.publishAt }}</span>
    </div>
    <div class="form-group-3d">
      <label for="f-post-body">متن پست</label>
      <textarea id="f-post-body" v-model="form.body" class="cms-textarea" rows="5" placeholder="متن کامل پست..."></textarea>
    </div>
    <div class="modal-actions">
      <button type="submit" class="cms-btn" style="width:auto;margin:0;padding:10px 18px;">
        <i class="fas fa-save"></i> ذخیره پست
      </button>
      <button type="button" class="cms-btn" style="width:auto;margin:0;padding:10px 18px;background:#333;color:#fff;box-shadow:none;" @click="emit('done')">انصراف</button>
    </div>
  </form>
</template>
