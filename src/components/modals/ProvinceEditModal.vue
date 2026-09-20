<script setup>
import { computed, reactive } from 'vue'
import { useCms } from '../../stores/cms'

const props = defineProps({ provinceId: { type: Number, required: true } })
const emit = defineEmits(['done'])
const cms = useCms()
const prov = computed(() => cms.provinces.find((p) => p.id === props.provinceId))
const form = reactive({ delta: prov.value?.delta ?? 0, ship: prov.value?.ship ?? 0 })
const error = computed(() => {
  if (!Number.isFinite(Number(form.delta)) || form.delta < 0 || form.delta > 50) return 'درصد اختلاف باید بین ۰ تا ۵۰ باشد.'
  if (!Number.isFinite(Number(form.ship)) || form.ship < 0) return 'هزینه ارسال باید عددی نامنفی باشد.'
  return ''
})

function save() {
  if (error.value) return
  cms.saveProvince(props.provinceId, { delta: Number(form.delta), ship: Number(form.ship) })
  cms.toast(`قیمت‌گذاری «${prov.value.name}» به‌روزرسانی شد.`)
  emit('done')
}
</script>

<template>
  <form v-if="prov" @submit.prevent="save">
    <div class="form-group-3d">
      <label for="prov-delta">اختلاف قیمت (٪) — استان «{{ prov.name }}»</label>
      <input id="prov-delta" v-model.number="form.delta" type="number" min="0" max="50" class="cms-input" :class="{ invalid: error }" />
    </div>
    <div class="form-group-3d">
      <label for="prov-ship">هزینه ارسال ثابت (تومان)</label>
      <input id="prov-ship" v-model.number="form.ship" type="number" min="0" step="1000" class="cms-input" />
      <span v-if="error" class="field-error">{{ error }}</span>
    </div>
    <div class="modal-actions">
      <button type="submit" class="cms-btn" style="width:auto;margin:0;padding:10px 18px;"><i class="fas fa-save"></i> ذخیره</button>
      <button type="button" class="cms-btn" style="width:auto;margin:0;padding:10px 18px;background:#333;color:#fff;box-shadow:none;" @click="emit('done')">انصراف</button>
    </div>
  </form>
</template>
