<script setup>
defineProps({
  modelValue: { type: Boolean, required: true },
  ariaLabel: { type: String, default: '' },
})
defineEmits(['update:modelValue', 'change'])
</script>

<template>
  <label class="switch">
    <input type="checkbox" :checked="modelValue" :aria-label="ariaLabel || undefined"
           @change="$emit('update:modelValue', $event.target.checked); $emit('change', $event.target.checked)" />
    <span class="slider"></span>
  </label>
</template>
