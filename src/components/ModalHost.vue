<script setup>
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useCms } from '../stores/cms'
import PostEditorModal from './modals/PostEditorModal.vue'
import RequestDetailModal from './modals/RequestDetailModal.vue'
import MessageReplyModal from './modals/MessageReplyModal.vue'
import ProvinceEditModal from './modals/ProvinceEditModal.vue'
import CsvModal from './modals/CsvModal.vue'

const cms = useCms()
const MAP = { post: PostEditorModal, request: RequestDetailModal, message: MessageReplyModal, province: ProvinceEditModal, csv: CsvModal }
const cardRef = ref(null)

async function onOpen(open) {
  if (open) { await nextTick(); cardRef.value?.focus() }
}
watch(() => cms.modal.open, onOpen)

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
function onGlobalKey(e) {
  if (!cms.modal.open) return
  if (e.key === 'Escape') { e.preventDefault(); cms.closeModal(); return }
  if (e.key === 'Tab' && cardRef.value) {
    const f = Array.from(cardRef.value.querySelectorAll(FOCUSABLE)).filter((el) => !el.disabled && el.offsetParent !== null)
    if (!f.length) return
    const first = f[0]; const last = f[f.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
}
onMounted(() => document.addEventListener('keydown', onGlobalKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onGlobalKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="cms.modal.open" class="modal-host" @click.self="cms.closeModal()">
      <div class="modal-card" ref="cardRef" role="dialog" aria-modal="true"
           :aria-label="cms.modal.title" tabindex="-1">
        <div class="modal-head">
          <h3 id="modal-title">{{ cms.modal.title }}</h3>
          <button type="button" class="modal-close" aria-label="بستن پنجره" @click="cms.closeModal()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <component :is="MAP[cms.modal.view]" v-bind="cms.modal.props" @done="cms.closeModal()" />
      </div>
    </div>
  </Teleport>
</template>
