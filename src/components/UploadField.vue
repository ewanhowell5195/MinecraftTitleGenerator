<script setup>
  import { vFileDrop } from "./composables/fileDrop.js"
  import Button from "./Button.vue"
  import Icon from "./Icon.vue"

  defineProps({
    accept: { type: String, required: true },
    label: { type: String, required: true },
    empty: { type: String, default: "" },
    image: { type: String, default: null },
    disabled: { type: Boolean, default: false },
    multiple: { type: Boolean, default: false },
    clearable: { type: Boolean, default: false }
  })

  const emit = defineEmits(["change", "clear"])
</script>

<template>
  <label v-file-drop class="upload-field" :class="{ disabled }">
    <slot name="preview">
      <img v-if="image" class="upload-image" :src="image" alt="">
      <span v-else class="empty-state">{{ empty }}</span>
    </slot>
    <span class="button" :class="{ disabled }"><Icon name="open" :size="16" /><span>{{ label }}</span></span>
    <Button v-if="clearable" ghost class="upload-clear" icon="trash" title="Remove" :disabled="disabled" @click.prevent="emit('clear')" />
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

  .upload-field :deep(*) {
    pointer-events: none;
  }

  .upload-field:hover:not(.disabled) > span.button {
    color: var(--button-text);
    filter: brightness(1.1);
  }

  .upload-field:active:not(.disabled) > span.button {
    --button-top: var(--button-dark);
    --button-bottom: var(--button-light);
    transition: none;
  }

  .upload-clear {
    position: absolute;
    top: 4px;
    right: 4px;
    pointer-events: auto;
  }

  .upload-image {
    min-width: 48px;
    min-height: 48px;
    max-width: 100%;
    max-height: 140px;
    image-rendering: pixelated;
  }
</style>
