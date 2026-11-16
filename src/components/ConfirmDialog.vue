<script setup>
  import { nextTick, ref, watch } from "vue"
  import { confirming } from "../lib/state/confirm.js"
  import Button from "./Button.vue"
  import Dialog from "./Dialog.vue"

  const main = ref(null)

  watch(confirming, request => {
    if (request) nextTick(() => main.value?.focus())
  })
</script>

<template>
  <Dialog v-if="confirming" :title="confirming.title" close-title="Cancel" dismissable @close="confirming.answer(false)">
    <div class="dialog-body">
      <p v-for="(paragraph, index) of confirming.paragraphs" :key="index">{{ paragraph }}</p>
      <div class="dialog-actions">
        <Button @click="confirming.answer(false)">Cancel</Button>
        <Button ref="main" :primary="!confirming.danger" :danger="confirming.danger" @click="confirming.answer(true)">{{ confirming.action }}</Button>
      </div>
    </div>
  </Dialog>
</template>
