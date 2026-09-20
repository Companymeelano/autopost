<script setup>
import { useCms } from '../stores/cms'
const cms = useCms()
</script>

<template>
  <div id="toast-stack" role="status" aria-live="polite">
    <div v-for="t in cms.toasts" :key="t.id" class="toast-item" :class="{ error: t.error }">
      <span>{{ t.text }}</span>
      <button v-if="t.action" type="button" @click="cms.runToastAction(t)">{{ t.action.label }}</button>
    </div>
  </div>
</template>
