<script setup>
  import { ref } from "vue"
  import ContextMenu from "./ContextMenu.vue"

  const REOPEN_DELAY = 300

  const props = defineProps({
    items: { type: Array, required: true },
    end: { type: Boolean, default: false }
  })

  const at = ref(null)
  let closedAt = -Infinity

  function show(event) {
    if (performance.now() - closedAt < REOPEN_DELAY) return
    const rect = event.currentTarget.getBoundingClientRect()
    at.value = { x: props.end ? rect.right : rect.left, y: rect.bottom + 4 }
  }

  function close() {
    closedAt = performance.now()
    at.value = null
  }
</script>

<template>
  <button type="button" @click="show">
    <slot></slot>
    <ContextMenu :items="at ? items : []" :at="at" @close="close" />
  </button>
</template>
