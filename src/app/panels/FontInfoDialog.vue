<script setup>
  import { computed } from "vue"
  import Dialog from "../../components/Dialog.vue"

  const props = defineProps({
    font: { type: Object, required: true },
    title: { type: String, required: true }
  })

  defineEmits(["close"])

  const characters = computed(() => {
    const rank = char => /[a-z]/i.test(char) ? 0 : /\d/.test(char) ? 1 : 2
    return Object.keys(props.font.glyphs).filter(char => !/[\u{1F629}\u{1F633}]/u.test(char)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).join(" ")
  })
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
