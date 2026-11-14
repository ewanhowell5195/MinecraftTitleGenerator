<script setup>
  import { computed, ref, toRaw, watch } from "vue"
  import { layerShown, usePanel, usedLayers } from "../../lib/panel.js"
  import { library } from "../../lib/scene.js"
  import { OVERLAY_KINDS, activeOverlays, defaultOverlays } from "../../lib/settings.js"
  import OverlayLayers from "../OverlayLayers.vue"
  import Panel from "../Panel.vue"
  import Segments from "../Segments.vue"
  import Toggle from "../Toggle.vue"

  const MODES = [{ value: "default", label: "Default" }, { value: "custom", label: "Custom" }]

  const props = defineProps({ edge: { type: Boolean, default: false } })

  const listKey = props.edge ? "edgeOverlays" : "overlays"
  const modeKey = OVERLAY_KINDS[listKey]
  const { object, font, list, modified, reset } = usePanel(listKey)
  const shownLayer = layerShown("overlays")
  const layerAbove = computed(() => shownLayer.value === null ? usedLayers.value.length > 1 : usedLayers.value.some(used => used < shownLayer.value))
  const available = computed(() => Object.fromEntries(Object.entries(list.value?.[listKey] ?? {}).filter(([, data]) => !data.layered || layerAbove.value)))
  const selected = ref(0)
  const defaults = computed(() => defaultOverlays(list.value, object.value, listKey))
  const layers = computed(() => activeOverlays(list.value, object.value, listKey))

  function custom() {
    if (object.value[modeKey] !== "custom") {
      object.value[listKey] = structuredClone(toRaw(defaults.value))
      object.value[modeKey] = "custom"
    }
    return object.value[listKey]
  }

  function pickMode(mode) {
    if (mode === "custom" && !object.value[listKey].length) object.value[listKey] = structuredClone(toRaw(defaults.value))
    object.value[modeKey] = mode
    selected.value = 0
  }

  function resetLayers() {
    reset()
    selected.value = 0
  }

  watch(() => [object.value.id, object.value.textureSource, object.value.texture, object.value.textureVariant], () => {
    selected.value = 0
  })
</script>

<template>
  <Panel :title="edge ? 'Edge overlays' : font?.model ? 'Overlays' : 'Face overlays'" :modified="modified" @reset="resetLayers">
    <Toggle v-if="!edge && object.textureSource !== 'premade' && font?.overlay" label="Hide the font's own overlay" v-model="object.disableFontOverlay" />
    <Segments :options="MODES" :model-value="object[modeKey]" @update:model-value="pickMode" />
    <p class="hint" v-if="edge">Paints the top and bottom faces around each letter.</p>
    <p class="hint" v-if="object[modeKey] === 'default'">The overlays this texture comes with. Editing switches to Custom.</p>
    <OverlayLayers v-model:selected="selected" :layers="layers" :edit="custom" :available="available" :font="font" :fonts="library.fonts" :shown-layer="shownLayer" :edge="edge" :side-faces="!!(object.internalFaces || object.sideFaces)" />
  </Panel>
</template>
