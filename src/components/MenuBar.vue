<script setup>
  import { computed, ref } from "vue"
  import { useWindowEvents } from "../lib/events.js"
  import { EXTENSION, isDefaultTitle, openTitle, resetTitle, saveTitle } from "../lib/file.js"
  import { history, redo, undo } from "../lib/history.js"
  import { scene } from "../lib/scene.js"
  import ContextMenu from "./ContextMenu.vue"

  const picker = ref(null)
  const open = ref(null)
  const at = ref(null)

  const openPicker = () => picker.value.click()

  const menus = computed(() => ({
    File: [
      { label: "Open...", icon: "open", action: openPicker },
      { label: "Save", icon: "download", disabled: !scene.objects.length, action: saveTitle }
    ],
    Edit: [
      { label: "Undo", icon: "undo", disabled: !history.undo.length, keepOpen: true, action: undo },
      { label: "Redo", icon: "redo", disabled: !history.redo.length, keepOpen: true, action: redo },
      { divider: true },
      { label: "Reset", icon: "reset", danger: true, disabled: isDefaultTitle(), action: reset }
    ]
  }))

  let closed = null

  function place(element, name) {
    const rect = element.getBoundingClientRect()
    open.value = name
    at.value = { x: rect.left, y: rect.bottom + 4 }
  }

  function show(event, name) {
    if (closed?.name === name && performance.now() - closed.time < 300) return
    place(event.currentTarget, name)
  }

  function hover(event, name) {
    if (open.value && open.value !== name) place(event.currentTarget, name)
  }

  function close() {
    closed = { name: open.value, time: performance.now() }
    open.value = null
    at.value = null
  }

  function reset() {
    if (confirm("Reset to the default title?")) resetTitle()
  }

  function request(file) {
    openTitle(file, () => isDefaultTitle() || confirm(`Replace your current title with ${file.name}?`))
  }

  function picked(event) {
    const file = event.target.files[0]
    event.target.value = ""
    if (file) request(file)
  }

  const dragging = ref(false)
  let depth = 0

  function carriesFiles(event) {
    return event.dataTransfer.types.includes("Files")
  }

  function enter(event) {
    if (!carriesFiles(event)) return
    depth++
    dragging.value = true
  }

  function leave(event) {
    if (!carriesFiles(event)) return
    depth = Math.max(0, depth - 1)
    if (!depth) dragging.value = false
  }

  function over(event) {
    if (carriesFiles(event)) event.preventDefault()
  }

  function drop(event) {
    if (!carriesFiles(event)) return
    event.preventDefault()
    depth = 0
    dragging.value = false
    const file = event.dataTransfer.files[0]
    if (file) request(file)
  }

  useWindowEvents(() => true, { dragenter: enter, dragleave: leave, dragover: over, drop })

  defineExpose({ openPicker })
</script>

<template>
  <nav class="menus">
    <button v-for="(items, name) of menus" :key="name" class="menu" :class="{ active: open === name }" @click="show($event, name)" @pointerenter="hover($event, name)">{{ name }}</button>
    <input ref="picker" type="file" :accept="`.${EXTENSION},application/json`" @change="picked">
    <ContextMenu :items="open ? menus[open] : []" :at="at" @close="close" />
    <Teleport to="body">
      <div v-if="dragging" class="drop">Drop a .{{ EXTENSION }} file to open it</div>
    </Teleport>
  </nav>
</template>

<style scoped>
  .menus {
    display: flex;
    gap: 2px;
    margin-left: 14px;
  }

  .menu {
    padding: 6px 10px;
    font-weight: 500;
    background: transparent;
  }

  .menu:hover,
  .menu.active {
    background: var(--card-hover);
  }

  .drop {
    position: fixed;
    inset: 12px;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-xl);
    font-weight: 600;
    background: #0009;
    border: 2px dashed var(--accent);
    pointer-events: none;
  }
</style>
