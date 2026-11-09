<script setup>
  import { computed, ref } from "vue"
  import { useWindowEvents } from "../lib/events.js"
  import { EXTENSION, isDefaultTitle, openTitle, resetTitle, saveTitle } from "../lib/file.js"
  import { history, redo, undo } from "../lib/history.js"
  import { startSavingPreset } from "../lib/presets.js"
  import { scene } from "../lib/scene.js"
  import MenuStrip from "./MenuStrip.vue"

  const picker = ref(null)

  const openPicker = () => picker.value.click()

  const menus = computed(() => ({
    File: [
      { label: "Open...", icon: "open", action: openPicker },
      { label: "Save", icon: "download", disabled: !scene.objects.length, action: saveTitle },
      { label: "Save preset", icon: "bookmark", disabled: !scene.objects.length, action: startSavingPreset }
    ],
    Edit: [
      { label: "Undo", icon: "undo", disabled: !history.undo.length, keepOpen: true, action: undo },
      { label: "Redo", icon: "redo", disabled: !history.redo.length, keepOpen: true, action: redo },
      { divider: true },
      { label: "Reset", icon: "reset", danger: true, disabled: isDefaultTitle(), action: reset }
    ]
  }))

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
  <MenuStrip :menus="menus">
    <input ref="picker" type="file" :accept="`.${EXTENSION},application/json`" @change="picked">
    <Teleport to="body">
      <div v-if="dragging" class="drop">Drop a .{{ EXTENSION }} file to open it</div>
    </Teleport>
  </MenuStrip>
</template>

<style scoped>
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
