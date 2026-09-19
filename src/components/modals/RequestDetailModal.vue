<script setup>
import { computed } from 'vue'
import { useCms } from '../../stores/cms'

const props = defineProps({ requestId: { type: Number, required: true } })
const emit = defineEmits(['done'])
const cms = useCms()
const req = computed(() => cms.requests.find((r) => r.id === props.requestId))
const isNew = computed(() => req.value?.status === 'new')

function resolve() {
  cms.resolveRequest(props.requestId)
  cms.toast('وضعیت درخواست به «رسیدگی شد» تغییر کرد.')
  emit('done')
}
</script>

<template>
  <div v-if="req">
    <dl class="detail-list">
      <dt>نوع</dt><dd>{{ req.type }}</dd>
      <dt>موضوع</dt><dd>{{ req.subject }}</dd>
      <dt>کاربر</dt><dd>{{ req.user }}</dd>
      <dt>تاریخ</dt><dd>{{ req.date }}</dd>
      <dt>شرح</dt><dd>{{ req.body || '—' }}</dd>
    </dl>
    <div class="modal-actions">
      <button v-if="isNew" type="button" class="cms-btn" style="width:auto;margin:0;padding:10px 18px;" @click="resolve">
        <i class="fas fa-check"></i> رسیدگی شد
      </button>
      <button v-else type="button" class="cms-btn" style="width:auto;margin:0;padding:10px 18px;" @click="emit('done')">
        بستن
      </button>
    </div>
  </div>
</template>
