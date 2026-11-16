<script setup>
  defineProps({
    tag: { type: String, default: "span" },
    label: { type: String, default: null }
  })

  defineEmits(["change"])

  const value = defineModel({ type: Boolean, required: true })
</script>

<template>
  <component :is="tag" class="toggle-switch">
    <input type="checkbox" v-model="value" :aria-label="label" @change="$emit('change')">
    <span></span>
  </component>
</template>
