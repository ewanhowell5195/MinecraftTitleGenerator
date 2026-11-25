<script setup>
  import { host } from "#lib/panels/host.js"
  import RenderProgress from "../RenderProgress.vue"
  import RenderResult from "../RenderResult.vue"

  const props = defineProps({
    panel: { type: Object, required: true },
    context: { type: Object, required: true }
  })

  const { cancel, layer, layerNames, progress, result } = props.context.state
</script>

<template>
  <RenderProgress v-if="progress !== null" :progress="progress" :layers="layerNames" :layer="layer" @close="cancel" />
  <RenderResult v-if="result" :image="result" :name="`${host.titleFileName()}.png`" @close="result = null" />
</template>
