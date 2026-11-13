<script setup>
  import { computed } from "vue"
  import { editingLayer, usedLayers } from "../../lib/panel.js"
  import { active, current } from "../../lib/scene.js"
  import { separateLayers } from "../../lib/settings.js"
  import { view } from "../../lib/view.js"
  import Panel from "../Panel.vue"
  import Segments from "../Segments.vue"
  import Toggle from "../Toggle.vue"

  const tabs = computed(() => usedLayers.value.map(layer => ({ value: layer, label: `Layer ${layer + 1}` })))

  function toggle(on) {
    separateLayers(current.value, on, active.value.font?.layers?.length ?? 1)
    view.layer = usedLayers.value[0]
  }
</script>

<template>
  <Panel v-if="usedLayers.length > 1">
    <Toggle label="Separate layers" hint="Give each depth of this font its own look" :model-value="current.separateLayers" @update:model-value="toggle" />
    <Segments v-if="current.separateLayers" :options="tabs" :model-value="editingLayer" @update:model-value="view.layer = $event" />
  </Panel>
</template>
