<script setup>
  import { computed, ref } from "vue"
  import { useWindowEvents } from "../components/composables/events.js"
  import { EXTENSION, isDefaultTitle, openTitle, resetTitle, saveTitle } from "../lib/state/titleFile.js"
  import { history, redo, undo } from "../lib/state/history.js"
  import { startSavingPreset } from "../lib/state/presets.js"
  import { scene } from "../lib/state/scene.js"
  import { droppedOnField } from "../components/composables/fileDrop.js"
  import { takeFile } from "../lib/state/ui.js"
  import MenuStrip from "../components/MenuStrip.vue"

  const picker = ref(null)

  const openPicker = () => picker.value.click()

  const menus = computed(() => ({
    File: [
      { label: "New title", icon: "plus", disabled: isDefaultTitle(), action: startNew },
      { divider: true },
      { label: "Open...", icon: "open", action: openPicker },
      { label: "Save", icon: "download", disabled: !scene.objects.length, action: saveTitle },
      { divider: true },
      { label: "Save preset", icon: "bookmark", disabled: !scene.objects.length, action: startSavingPreset }
    ],
    Edit: [
      { label: "Undo", icon: "undo", disabled: !history.undo.length, keepOpen: true, action: undo },
      { label: "Redo", icon: "redo", disabled: !history.redo.length, keepOpen: true, action: redo }
    ]
  }))

  function startNew() {
    if (confirm("Start a new title? This replaces your current one.")) resetTitle()
  }

  function request(file) {
    openTitle(file, () => isDefaultTitle() || confirm(`Replace your current title with ${file.name}?`))
  }

  function picked(event) {
    const file = takeFile(event)
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
    if (!carriesFiles(event)) return
    event.preventDefault()
    dragging.value = depth > 0 && !droppedOnField(event)
  }

  function drop(event) {
    if (!carriesFiles(event)) return
    event.preventDefault()
    depth = 0
    dragging.value = false
    if (droppedOnField(event)) return
    const file = event.dataTransfer.files[0]
    if (file) request(file)
  }

  useWindowEvents(() => true, { dragenter: enter, dragleave: leave, dragover: over, drop })

  defineExpose({ openPicker })
</script>

<template>
  <MenuStrip :menus="menus">
    <input ref="picker" type="file" tabindex="-1" :accept="`.${EXTENSION},application/json`" @change="picked">
    <Teleport to="body">
      <div v-if="dragging" class="drop">Drop a .{{ EXTENSION }} file to open it</div>
    </Teleport>
  </MenuStrip>
</template>

<style scoped>
  .drop {
    position: fixed;
    inset: 0;
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
