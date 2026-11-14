<script setup>
  import { computed } from "vue"
  import { editingLayer, usedLayers } from "../../lib/panel.js"
  import { active, current } from "../../lib/scene.js"
  import { SEPARATE_KEYS, separateLayers } from "../../lib/settings.js"
  import { view } from "../../lib/view.js"
  import Panel from "../Panel.vue"
  import Segments from "../Segments.vue"
  import Toggle from "../Toggle.vue"

  const props = defineProps({ group: { type: String, required: true } })

  const tabs = computed(() => usedLayers.value.map(layer => ({ value: layer, label: `Layer ${layer + 1}` })))
  const key = computed(() => SEPARATE_KEYS[props.group])

  function toggle(on) {
    separateLayers(current.value, props.group, on, active.value.font?.layers?.length ?? 1)
    view.layer = usedLayers.value[0]
  }
</script>

<template>
  <Panel v-if="usedLayers.length > 1">
    <Toggle label="Separate layers" hint="Give each depth of this font its own look" :model-value="!!current[key]" @update:model-value="toggle" />
    <Segments v-if="current[key]" :options="tabs" :model-value="editingLayer" @update:model-value="view.layer = $event" />
  </Panel>
</template>
