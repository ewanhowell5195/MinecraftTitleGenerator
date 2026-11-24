<script setup>
  import { usedOverlayFiles } from "../../lib/panels/uploads.js"
  import { statScope } from "../../lib/title/statIds.js"
  import { library } from "../../lib/state/scene.js"
  import OverlayLayers from "../../components/OverlayLayers.vue"

  const props = defineProps({
    panel: { type: Object, required: true },
    context: { type: Object, required: true }
  })

  const { available, edit, layers, selected, shownLayer } = props.context.state
</script>

<template>
  <OverlayLayers v-model:selected="selected" :layers="layers" :edit="edit" :available="available" :font="context.font" :stat-scope="statScope(context.object, context.font?.id)" :fonts="library.fonts" :shown-layer="shownLayer" :edge="panel.id === 'edgeOverlays'" :side-faces="!!(context.object.internalFaces || context.object.sideFaces)" :reuse="usedOverlayFiles()" />
</template>
