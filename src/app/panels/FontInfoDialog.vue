<script setup>
  import { computed } from "vue"
  import { fontCharacters } from "#lib/panels/fontInfo.js"
  import Dialog from "#c/Dialog.vue"

  const props = defineProps({
    font: { type: Object, required: true },
    title: { type: String, required: true }
  })

  defineEmits(["close"])

  const characters = computed(() => fontCharacters(props.font))
</script>

<template>
  <Dialog :title="title" close-title="Close" wide dismissable @close="$emit('close')">
    <div class="dialog-body">
      <p v-if="font.description">{{ font.description }}</p>
      <span class="label">Characters</span>
      <div class="code">{{ characters }}</div>
    </div>
  </Dialog>
</template>

<style scoped>
  .code {
    padding: 10px;
    font-family: var(--mono);
    font-size: var(--font-md);
    line-height: 1.7;
    word-break: break-all;
    color: var(--text);
    background: var(--field);
  }
</style>
