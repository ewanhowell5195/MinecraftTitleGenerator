<script setup>
  import { usePanel } from "../../lib/panel.js"
  import { BLEND_OPTIONS } from "../../lib/settings.js"
  import ColourPicker from "../ColourPicker.vue"
  import ColourToggle from "../ColourToggle.vue"
  import Dropdown from "../Dropdown.vue"
  import FacesPanel from "./FacesPanel.vue"
  import Panel from "../Panel.vue"
  import Slider from "../Slider.vue"

  const { object, font, modified, reset } = usePanel("colour")
  const outline = usePanel("outline")
</script>

<template>
  <Panel title="Filters" :modified="modified" @reset="reset">
    <Slider label="Hue" v-model="object.hue" :min="0" :max="359" />
    <Slider label="Saturation" v-model="object.saturation" :min="0" :max="200" />
    <Slider label="Brightness" v-model="object.brightness" :min="0" :max="200" />
    <Slider label="Contrast" v-model="object.contrast" :min="0" :max="200" />

    <h3>Tint</h3>
    <div class="row">
      <ColourPicker class="grow" v-model="object.colour" />
      <Dropdown class="grow" :options="BLEND_OPTIONS" v-model="object.blend" v-tooltip="'Blend mode'" />
    </div>
    <Slider label="Opacity" v-model="object.colourOpacity" :min="0" :max="100" />
  </Panel>
  <FacesPanel v-if="!font?.model" />
  <Panel title="Outline colour" :modified="outline.modified.value" @reset="outline.reset">
    <ColourToggle v-model:enabled="object.customBorder" v-model:colour="object.borderColour" />
  </Panel>
</template>
