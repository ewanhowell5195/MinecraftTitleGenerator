<script setup>
  import { usePanel } from "../../lib/panel.js"
  import { active, current as object } from "../../lib/scene.js"
  import { faceStops } from "../../lib/settings.js"
  import ColourPicker from "../ColourPicker.vue"
  import ColourToggle from "../ColourToggle.vue"
  import GradientEditor from "../GradientEditor.vue"
  import Panel from "../Panel.vue"
  import Segments from "../Segments.vue"
  import Slider from "../Slider.vue"
  import Toggle from "../Toggle.vue"

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
    return !object.value[group.custom] && (group.name !== "faces" || object.value.textureSource !== "premade")
  }

  function pickDefault(group) {
    const average = active.value.built?.averages[group.average]
    if (object.value[group.custom] && average) object.value[group.colour] = average
  }

  function pickFill(group, fill) {
    object.value[group.fill] = fill
    if (fill === "gradient" && JSON.stringify(object.value[group.stops]) === JSON.stringify(faceStops())) object.value[group.stops][0].colour = object.value[group.colour]
  }
</script>

<template>
  <Panel v-for="group of groups" :key="group.name" :title="group.title" :enabled="group.enabled ? object[group.enabled] : null" @update:enabled="object[group.enabled] = $event" :modified="group.modified.value" @reset="group.reset">
    <ColourToggle v-model:enabled="object[group.custom]" v-model:colour="object[group.colour]" @change="pickDefault(group)">
      <Segments :options="FILLS" :model-value="object[group.fill]" @update:model-value="pickFill(group, $event)" />
      <ColourPicker v-if="object[group.fill] === 'solid'" v-model="object[group.colour]" />
      <template v-else>
        <GradientEditor v-model="object[group.stops]" :smooth="object[group.smooth]" :angle="group.direction ? END_ANGLES[object[group.direction]] : END_ANGLES.along" />
        <Toggle label="Smooth gradient" v-model="object[group.smooth]" />
        <div v-if="group.direction" class="field">
          <span class="label">Direction</span>
          <Segments :options="DIRECTIONS" v-model="object[group.direction]" />
        </div>
      </template>
    </ColourToggle>
    <p v-if="group.inherits && object[group.inherits] && !object[group.custom]" class="hint">Uses the custom colour of the top and bottom faces.</p>
    <Slider v-else-if="hasBrightness(group)" label="Brightness" v-model="object[group.brightness]" :min="0" :max="100" />
    <Toggle label="Fade into the outline" v-model="object[group.fading]" />
    <Slider v-if="object[group.fading]" label="Fade" v-model="object[group.fade]" :min="0" :max="100" :step="5" />
  </Panel>
</template>
