<script setup>
  import { ref } from "vue"
  import { reopenGuard } from "../lib/popover.js"
  import ContextMenu from "./ContextMenu.vue"

  const props = defineProps({
    menus: { type: Object, required: true }
  })

  const open = ref(null)
  const at = ref(null)

  const guard = reopenGuard()

  function place(element, name) {
    const rect = element.getBoundingClientRect()
    open.value = name
    at.value = { x: rect.left, y: rect.bottom + 4 }
  }

  function show(event, name) {
    if (guard.recent(name)) return
    place(event.currentTarget, name)
  }

  function hover(event, name) {
    if (open.value && open.value !== name) place(event.currentTarget, name)
  }

  function close() {
    guard.note(open.value)
    open.value = null
    at.value = null
  }
</script>

<template>
  <nav class="menus">
    <button v-for="(items, name) of props.menus" :key="name" class="menu" :class="{ active: open === name }" aria-haspopup="menu" :aria-expanded="open === name" @click="show($event, name)" @pointerenter="hover($event, name)">{{ name }}</button>
    <ContextMenu :items="open ? props.menus[open] : []" :at="at" @close="close" />
    <slot></slot>
  </nav>
</template>

<style scoped>
  .menus {
    display: flex;
    gap: 2px;
    margin-left: 14px;
  }

  .menu {
    min-height: var(--control);
    padding: 0 10px;
    font-weight: 500;
    background: transparent;
  }

  .menu:hover,
  .menu.active {
    background: var(--card-hover);
  }
</style>
