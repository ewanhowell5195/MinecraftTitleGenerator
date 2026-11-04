<script setup>
import { computed } from "vue"
import { usePanel } from "../../lib/panel.js"
import { wordKey } from "../../lib/settings.js"
import Panel from "../Panel.vue"
import Slider from "../Slider.vue"

const props = defineProps({
  word: { type: Boolean, default: false }
})

const { object, font, modified, reset } = usePanel(props.word ? "wordGeometry" : "geometry", props.word)

function setting(key) {
  const own = props.word ? wordKey(key) : key
  return computed({
    get: () => object.value[own] ?? object.value[key],
    set: value => (object.value[own] = value)
  })
}

const depth = setting("depth")
const border = setting("border")
</script>

<template>
  <Panel title="Depth and outline" :modified="modified" @reset="reset">
    <Slider label="Depth" v-model="depth" :min="0" :max="80" />
    <Slider v-if="!font?.autoBorder" label="Outline width" v-model="border" :min="0" :max="8" :step="0.1" />
  </Panel>
</template>
