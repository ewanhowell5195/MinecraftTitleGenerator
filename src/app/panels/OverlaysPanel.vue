<script>
  const remembered = reactive(new Map())
</script>

<script setup>
  import { computed, reactive, toRaw, watch } from "vue"
  import { overlayFits } from "../../lib/settings/layers.js"
  import { layerShown, usePanel, usedLayers } from "./panel.js"
  import { library } from "../../lib/state/scene.js"
  import { OVERLAY_KINDS, activeOverlays, defaultOverlays } from "../../lib/settings/settings.js"
  import { usedOverlayFiles } from "./uploads.js"
  import OverlayLayers from "../../components/OverlayLayers.vue"
  import Panel from "../Panel.vue"
  import Segments from "../../components/Segments.vue"
  import Toggle from "../../components/Toggle.vue"

  const MODES = [{ value: "default", label: "Default" }, { value: "custom", label: "Custom" }]

  const props = defineProps({ edge: { type: Boolean, default: false } })

  const listKey = props.edge ? "edgeOverlays" : "overlays"
  const modeKey = OVERLAY_KINDS[listKey]
  const { object, font, list, layer, modified, reset } = usePanel(listKey)
  const shownLayer = layerShown("overlays")
  const available = computed(() => Object.fromEntries(Object.entries(list.value?.[listKey] ?? {}).filter(([, data]) => overlayFits(data, shownLayer.value, usedLayers.value))))
  const defaults = computed(() => defaultOverlays(list.value, object.value, listKey, layer.value))
  const layers = computed(() => activeOverlays(list.value, object.value, listKey, layer.value))
  const memoryKey = computed(() => `${object.value.id}:${listKey}:${layer.value}:${object.value[modeKey]}`)
  const selected = computed({
    get: () => {
      const value = remembered.has(memoryKey.value) ? remembered.get(memoryKey.value) : 0
      return value === null ? null : Math.max(0, Math.min(value, layers.value.length - 1))
    },
    set: value => remembered.set(memoryKey.value, value)
  })

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
    <OverlayLayers v-model:selected="selected" :layers="layers" :edit="custom" :available="available" :font="font" :fonts="library.fonts" :shown-layer="shownLayer" :edge="edge" :side-faces="!!(object.internalFaces || object.sideFaces)" :reuse="usedOverlayFiles()" />
  </Panel>
</template>
