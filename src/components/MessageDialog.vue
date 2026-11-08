<script setup>
  import RenderDialog from "./RenderDialog.vue"

  defineProps({
    title: { type: String, required: true }
  })

  const emit = defineEmits(["close"])
</script>

<template>
  <RenderDialog :title="title" close-title="Close" dismissable @close="emit('close')">
    <div class="message dialog-body">
      <p><slot></slot></p>
      <button class="primary" @click="emit('close')">OK</button>
    </div>
  </RenderDialog>
</template>

<style scoped>
  .message {
    align-items: flex-end;
    gap: 16px;
  }

  .message p {
    align-self: stretch;
    font-size: var(--font-base);
  }
</style>
