<script setup>
  defineProps({
    label: { type: String, required: true },
    hint: { type: String, default: "" }
  })

  defineEmits(["change"])

  const value = defineModel({ type: Boolean, required: true })
</script>

<template>
  <label class="toggle">
    <span class="text">
      <span class="label">{{ label }}</span>
      <span v-if="hint" class="hint">{{ hint }}</span>
    </span>
    <span class="toggle-switch">
      <input type="checkbox" v-model="value" @change="$emit('change')">
      <span></span>
    </span>
  </label>
</template>

<style scoped>
  .toggle {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 36px;
    cursor: pointer;
  }

  .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
</style>
