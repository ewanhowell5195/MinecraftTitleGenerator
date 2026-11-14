<script setup>
  import { vFileDrop } from "../lib/fileDrop.js"
  import Icon from "./Icon.vue"

  defineProps({
    accept: { type: String, required: true },
    label: { type: String, required: true },
    empty: { type: String, default: "" },
    image: { type: String, default: null },
    disabled: { type: Boolean, default: false },
    multiple: { type: Boolean, default: false }
  })

  const emit = defineEmits(["change"])
</script>

<template>
  <label v-file-drop class="upload-field" :class="{ disabled }">
    <slot name="preview">
      <img v-if="image" class="upload-image" :src="image" alt="">
      <span v-else class="empty-state">{{ empty }}</span>
    </slot>
    <span class="button" :class="{ disabled }"><Icon name="open" :size="16" /><span>{{ label }}</span></span>
    <input type="file" :accept="accept" :multiple="multiple" :disabled="disabled" @change="emit('change', $event)">
  </label>
</template>

<style scoped>
  .upload-field {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 12px;
    background: var(--field);
    border: 2px dashed var(--line-strong);
    cursor: pointer;
    user-select: none;
  }

  .upload-field:hover:not(.disabled),
  .upload-field.file-over {
    border-color: var(--accent);
  }

  .upload-field.disabled {
    cursor: not-allowed;
  }

  .upload-image {
    min-width: 48px;
    min-height: 48px;
    max-width: 100%;
    max-height: 140px;
    image-rendering: pixelated;
  }
</style>
