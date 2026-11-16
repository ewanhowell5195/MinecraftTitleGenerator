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

<style scoped>
  .toggle-switch {
    position: relative;
    flex: none;
    display: inline-block;
    width: 40px;
    height: 24px;
    cursor: pointer;
    user-select: none;
  }

  .toggle-switch input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .toggle-switch span {
    position: absolute;
    inset: 0;
    background: var(--line-strong);
    transition: background var(--duration);
  }

  .toggle-switch span::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    background: var(--knob);
    transition: transform var(--duration);
  }

  .toggle-switch input:checked + span {
    background: var(--accent);
  }

  .toggle-switch input:checked + span::after {
    transform: translateX(16px);
  }

  .toggle-switch:has(input:focus-visible) span {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .toggle-switch:has(input:disabled) {
    opacity: 0.35;
    cursor: not-allowed;
  }
</style>
