<script setup>
  import Button from "./Button.vue"
  import Icon from "./Icon.vue"

  defineProps({
    accept: { type: String, required: true },
    label: { type: String, required: true },
    empty: { type: String, default: "" },
    image: { type: String, default: null },
    disabled: { type: Boolean, default: false }
  })

  const emit = defineEmits(["change"])
</script>

<template>
  <div class="upload-field">
    <slot name="preview">
      <div class="upload-preview">
        <img v-if="image" :src="image" alt="">
        <div v-else class="empty-state">{{ empty }}</div>
      </div>
    </slot>
    <Button file wide :accept="accept" :disabled="disabled" @change="emit('change', $event)"><template #icon><Icon name="open" :size="16" /></template><span>{{ label }}</span></Button>
  </div>
</template>

<style scoped>
  .upload-field {
    display: contents;
  }

  .upload-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 88px;
    padding: 8px;
    background: var(--field);
    border: 2px dashed var(--line-strong);
  }

  .upload-preview img {
    min-width: 48px;
    min-height: 48px;
    max-width: 100%;
    max-height: 140px;
    image-rendering: pixelated;
  }
</style>
