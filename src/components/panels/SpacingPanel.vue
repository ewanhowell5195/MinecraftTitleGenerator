<script setup>
import { computed } from "vue"
import { usePanel } from "../../lib/panel.js"
import Panel from "../Panel.vue"
import Slider from "../Slider.vue"
import Toggle from "../Toggle.vue"

const { object, font, modified, reset } = usePanel("spacing")
const hasKerning = computed(() => Object.keys(font.value?.kerning ?? {}).length > 0)
</script>

<template>
  <Panel title="Spacing" :modified="modified" @reset="reset">
    <Slider label="Character spacing" v-model="object.spacing" :min="-6" :max="20" :step="0.1" />
    <Toggle v-if="hasKerning" label="Kerning" v-model="object.kerning" />
  </Panel>
</template>
