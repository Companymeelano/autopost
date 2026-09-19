<script setup>
import { computed, ref } from 'vue'
import { useCms } from '../../stores/cms'

const props = defineProps({ messageId: { type: Number, required: true } })
const emit = defineEmits(['done'])
const cms = useCms()
const msg = computed(() => cms.messages.find((m) => m.id === props.messageId))
const canReply = computed(() => msg.value?.status === 'new')
const reply = ref('')
const error = ref('')

function send() {
  if (!reply.value.trim()) { error.value = 'متن پاسخ را وارد کنید.'; return }
  cms.replyMessage(props.messageId, reply.value.trim())
  cms.toast(`پاسخ به «${msg.value.customer}» ارسال شد. (نمایشی)`)
  emit('done')
}
</script>

<template>
  <div v-if="msg">
    <dl class="detail-list">
      <dt>مشتری</dt><dd>{{ msg.customer }}</dd>
      <dt>موضوع</dt><dd>{{ msg.subject }}</dd>
      <dt>تاریخ</dt><dd>{{ msg.date }}</dd>
      <dt>متن</dt><dd>{{ msg.body || '—' }}</dd>
      <template v-if="msg.reply">
        <dt>پاسخ شما</dt><dd style="color: var(--success);">{{ msg.reply }}</dd>
      </template>
    </dl>
    <template v-if="canReply">
      <div class="form-group-3d">
        <label for="msg-reply">پاسخ شما</label>
        <textarea id="msg-reply" v-model="reply" class="cms-textarea" :class="{ invalid: error }" rows="4" placeholder="متن پاسخ..."></textarea>
        <span v-if="error" class="field-error">{{ error }}</span>
      </div>
      <div class="modal-actions">
        <button type="button" class="cms-btn" style="width:auto;margin:0;padding:10px 18px;" @click="send">
          <i class="fas fa-paper-plane"></i> ارسال پاسخ
        </button>
        <button type="button" class="cms-btn" style="width:auto;margin:0;padding:10px 18px;background:#333;color:#fff;box-shadow:none;" @click="emit('done')">بستن</button>
      </div>
    </template>
  </div>
</template>
