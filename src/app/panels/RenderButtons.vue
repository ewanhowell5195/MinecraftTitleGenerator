<script setup>
  import { host } from "#lib/panels/host.js"
  import { useRenderTask } from "#lib/panels/renderTask.js"
  import { framing } from "#render/framing.js"
  import Button from "#c/Button.vue"
  import Field from "#c/Field.vue"
  import Icon from "#c/Icon.vue"
  import Notice from "#c/Notice.vue"
  import RenderProgress from "../RenderProgress.vue"
  import RenderResult from "../RenderResult.vue"

  defineProps({
    panel: { type: Object, required: true },
    context: { type: Object, required: true }
  })

  const { cancel, downloadLayers, failed, layer, layerNames, progress, render, result, saveVector, saving } = useRenderTask()
</script>

<template>
  <Button primary wide :disabled="progress !== null" @click="render"><template #icon><Icon name="camera" :size="16" /></template>
    <span>Render image</span>
  </Button>
  <Button wide v-if="framing.tab !== 'minecraft'" :disabled="progress !== null || saving" @click="saveVector"><template #icon><Icon name="download" :size="16" /></template>
    <span>Save SVG</span>
  </Button>
  <Field group hint="A zip with each line as its own image">
    <Button wide :disabled="progress !== null" @click="downloadLayers"><template #icon><Icon name="layers" :size="16" /></template>
      <span>Render layers</span>
    </Button>
  </Field>
  <Notice v-if="failed">{{ failed }}</Notice>
  <RenderProgress v-if="progress !== null" :progress="progress" :layers="layerNames" :layer="layer" @close="cancel" />
  <RenderResult v-if="result" :image="result" :name="`${host.titleFileName()}.png`" @close="result = null" />
</template>
