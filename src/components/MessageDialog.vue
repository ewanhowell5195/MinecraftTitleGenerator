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
    <div class="dialog-body">
      <p><slot></slot></p>
      <div class="dialog-actions">
        <Button primary @click="emit('close')">OK</Button>
      </div>
    </div>
  </RenderDialog>
</template>
