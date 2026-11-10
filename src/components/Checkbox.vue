<script setup>
  defineProps({
    label: { type: String, default: "" },
    hint: { type: String, default: "" },
    disabled: { type: Boolean, default: false }
  })

  const model = defineModel({ type: Boolean, default: false })
</script>

<template>
  <label class="checkbox" :class="{ disabled }">
    <input type="checkbox" :checked="model" :disabled="disabled" @change="model = $event.target.checked">
    <span class="text">
      <span class="label"><slot>{{ label }}</slot></span>
      <span v-if="hint" class="hint">{{ hint }}</span>
    </span>
  </label>
</template>

<style scoped>
  .checkbox {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    cursor: pointer;
    user-select: none;
  }

  .checkbox.disabled {
    cursor: not-allowed;
  }

  input {
    margin-top: 1px;
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .label {
    font-size: var(--font-md);
    font-weight: 500;
    line-height: 1.45;
    color: var(--muted);
  }

  .label :deep(a) {
    color: var(--accent);
  }
</style>
