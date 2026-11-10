<script setup>
  import Button from "./Button.vue"
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
      <Button primary @click="emit('close')">OK</Button>
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
