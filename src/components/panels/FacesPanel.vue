<script setup>
  import { usePanel } from "../../lib/panel.js"
  import { active, current as object } from "../../lib/scene.js"
  import ColourToggle from "../ColourToggle.vue"
  import Panel from "../Panel.vue"
  import Slider from "../Slider.vue"
  import Toggle from "../Toggle.vue"

  const GROUPS = [
    { name: "faces", title: "Top and bottom faces", custom: "customEdge", colour: "edgeColour", average: "edge", brightness: "edgeBrightness", fading: "fade", fade: "outerFade" },
    { name: "inner", title: "Inner faces", enabled: "internalFaces", custom: "customInternal", colour: "internalColour", average: "edge", inherits: "customEdge", brightness: "internalBrightness", fading: "fadeInternal", fade: "internalFade" },
    { name: "sides", title: "Side faces", enabled: "sideFaces", custom: "customSide", colour: "sideColour", average: "side", brightness: "sideBrightness", fading: "fadeSides", fade: "sideFade" }
  ]

  const groups = GROUPS.map(group => ({ ...group, ...usePanel(group.name) }))

  function pickDefault(group) {
    const average = active.value.built?.averages[group.average]
    if (object.value[group.custom] && average) object.value[group.colour] = average
  }
</script>

<template>
  <Panel v-for="group of groups" :key="group.name" :title="group.title" :enabled="group.enabled ? object[group.enabled] : null" @update:enabled="object[group.enabled] = $event" :modified="group.modified.value" @reset="group.reset">
    <ColourToggle v-model:enabled="object[group.custom]" v-model:colour="object[group.colour]" @change="pickDefault(group)" />
    <p v-if="group.inherits && object[group.inherits] && !object[group.custom]" class="hint">Uses the custom colour of the top and bottom faces.</p>
    <Slider v-else-if="!object[group.custom]" label="Brightness" v-model="object[group.brightness]" :min="0" :max="100" />
    <Toggle label="Fade into the outline" v-model="object[group.fading]" />
    <Slider v-if="object[group.fading]" label="Fade" v-model="object[group.fade]" :min="0" :max="100" :step="5" />
  </Panel>
</template>
