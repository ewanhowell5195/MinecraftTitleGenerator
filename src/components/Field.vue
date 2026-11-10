<script setup>
  defineProps({
    label: { type: String, default: "" },
    hint: { type: String, default: "" },
    error: { type: String, default: "" },
    required: { type: Boolean, default: false },
    group: { type: Boolean, default: false },
    labelFor: { type: String, default: null }
  })
</script>

<template>
  <component :is="group ? 'div' : 'label'" class="field">
    <component :is="group && labelFor ? 'label' : 'span'" v-if="label" class="label" :for="group ? labelFor : null">{{ label }}<span v-if="required" class="required" aria-hidden="true"> *</span></component>
    <slot></slot>
    <span v-if="error" class="hint bad">{{ error }}</span>
    <span v-else-if="hint || $slots.hint" class="hint"><slot name="hint">{{ hint }}</slot></span>
  </component>
</template>

<style scoped>
  .required {
    color: var(--danger);
  }

  .hint {
    line-height: 1.4;
  }
</style>
