<script setup>
  import { OVERLAY_CONTROLS } from "../lib/panels/overlayControls.js"
  import { useOverlayLayers } from "../lib/panels/overlayLayers.js"
  import { controlState } from "../lib/panels/panel.js"
  import { popular } from "../lib/title/popularity.js"
  import DataControls from "../app/panels/DataControls.vue"

  const props = defineProps({
    layers: { type: Array, required: true },
    edit: { type: Function, required: true },
    available: { type: Object, required: true },
    font: { type: Object, default: null },
    statScope: { type: String, default: null },
    fonts: { type: Array, default: () => [] },
    shownLayer: { type: Number, default: null },
    edge: { type: Boolean, default: false },
    files: { type: Boolean, default: true },
    sideFaces: { type: Boolean, default: false },
    tileMin: { type: Number, default: null },
    reuse: { type: Array, default: () => [] },
    hideable: { type: Boolean, default: true }
  })

  const selected = defineModel("selected", { type: Number, default: 0 })
  const state = controlState({ state: { ...useOverlayLayers(props, selected, popular), props, selected } })
  const panel = { id: "overlays" }
</script>

<template>
  <DataControls :panel="panel" :state="state" :controls="OVERLAY_CONTROLS" />
</template>
