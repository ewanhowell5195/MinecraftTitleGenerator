<script setup>
  import { ref } from "vue"
  import { reopenGuard } from "../lib/popover.js"
  import Button from "./Button.vue"
  import ContextMenu from "./ContextMenu.vue"

  const props = defineProps({
    items: { type: Array, required: true },
    end: { type: Boolean, default: false }
  })

  const at = ref(null)
  const guard = reopenGuard()

  function show(event) {
    if (guard.recent()) return
    const rect = event.currentTarget.getBoundingClientRect()
    at.value = { x: props.end ? rect.right : rect.left, y: rect.bottom + 4 }
  }

  function close() {
    guard.note()
    at.value = null
  }
</script>

<template>
  <Button @click="show">
    <slot></slot>
    <ContextMenu :items="at ? items : []" :at="at" @close="close" />
  </Button>
</template>
