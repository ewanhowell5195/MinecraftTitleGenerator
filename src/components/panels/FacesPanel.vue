<script setup>
  import { usePanel } from "../../lib/panel.js"
  import { active } from "../../lib/scene.js"
  import { faceStops } from "../../lib/settings.js"
  import ColourPicker from "../ColourPicker.vue"
  import ColourToggle from "../ColourToggle.vue"
  import GradientEditor from "../GradientEditor.vue"
  import Panel from "../Panel.vue"
  import Segments from "../Segments.vue"
  import Slider from "../Slider.vue"
  import Toggle from "../Toggle.vue"
  import LayerPanel from "./LayerPanel.vue"

  const FILLS = [{ value: "solid", label: "Solid" }, { value: "gradient", label: "Gradient" }]
  const DIRECTIONS = [{ value: "up", label: "Up the letters" }, { value: "along", label: "Along the text" }]
  const END_ANGLES = { up: 180, along: 270 }

  const GROUPS = [
    { name: "faces", title: "Top and bottom faces", custom: "customEdge", colour: "edgeColour", average: "edge", brightness: "edgeBrightness", fading: "fade", fade: "outerFade", fill: "edgeFill", stops: "edgeStops", smooth: "edgeSmooth" },
    { name: "inner", title: "Inner faces", enabled: "internalFaces", custom: "customInternal", colour: "internalColour", average: "edge", inherits: "customEdge", brightness: "internalBrightness", fading: "fadeInternal", fade: "internalFade", fill: "internalFill", stops: "internalStops", smooth: "internalSmooth", direction: "internalDirection" },
    { name: "sides", title: "Side faces", enabled: "sideFaces", custom: "customSide", colour: "sideColour", average: "side", brightness: "sideBrightness", fading: "fadeSides", fade: "sideFade", fill: "sideFill", stops: "sideStops", smooth: "sideSmooth", direction: "sideDirection" }
  ]

  const groups = GROUPS.map(group => ({ ...group, ...usePanel(group.name) }))

  function hasBrightness(group) {
    const object = group.object.value
    return !object[group.custom] && (group.name !== "faces" || object.textureSource !== "premade")
  }

  function pickDefault(group) {
    const object = group.object.value
    const average = active.value.built?.averages[group.average]
    if (object[group.custom] && average) object[group.colour] = average
  }

  function pickFill(group, fill) {
    const object = group.object.value
    object[group.fill] = fill
    if (fill === "gradient" && JSON.stringify(object[group.stops]) === JSON.stringify(faceStops())) object[group.stops][0].colour = object[group.colour]
  }
</script>

<template>
  <LayerPanel group="faces" />
  <Panel v-for="group of groups" :key="group.name" :title="group.title" :enabled="group.enabled ? group.object.value[group.enabled] : null" @update:enabled="group.object.value[group.enabled] = $event" :modified="group.modified.value" @reset="group.reset">
    <ColourToggle v-model:enabled="group.object.value[group.custom]" v-model:colour="group.object.value[group.colour]" @change="pickDefault(group)">
      <Segments :options="FILLS" :model-value="group.object.value[group.fill]" @update:model-value="pickFill(group, $event)" />
      <ColourPicker v-if="group.object.value[group.fill] === 'solid'" v-model="group.object.value[group.colour]" />
      <template v-else>
        <GradientEditor v-model="group.object.value[group.stops]" :smooth="group.object.value[group.smooth]" :angle="group.direction ? END_ANGLES[group.object.value[group.direction]] : END_ANGLES.along" />
        <Toggle label="Smooth gradient" v-model="group.object.value[group.smooth]" />
        <Segments v-if="group.direction" label="Direction" :options="DIRECTIONS" v-model="group.object.value[group.direction]" />
      </template>
    </ColourToggle>
    <p v-if="group.inherits && group.object.value[group.inherits] && !group.object.value[group.custom]" class="hint">Uses the custom colour of the top and bottom faces.</p>
    <Slider v-else-if="hasBrightness(group)" label="Brightness" v-model="group.object.value[group.brightness]" :min="0" :max="100" />
    <Toggle label="Fade into the outline" v-model="group.object.value[group.fading]" />
    <Slider v-if="group.object.value[group.fading]" label="Fade" v-model="group.object.value[group.fade]" :min="0" :max="100" :step="5" />
  </Panel>
</template>
