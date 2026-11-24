<script setup>
  import { holdCentre } from "../centreDot.js"
  import Button from "../../components/Button.vue"
  import ColourPicker from "../../components/ColourPicker.vue"
  import Dropdown from "../../components/Dropdown.vue"
  import GradientEditor from "../GradientEditor.vue"
  import Segments from "../../components/Segments.vue"
  import Slider from "../../components/Slider.vue"
  import Toggle from "../../components/Toggle.vue"
  import CustomTexture from "./CustomTexture.vue"
  import FrameSize from "./FrameSize.vue"
  import OverlayStack from "./OverlayStack.vue"
  import PlacementTiles from "./PlacementTiles.vue"
  import RenderButtons from "./RenderButtons.vue"
  import TextureSource from "./TextureSource.vue"

  const BLOCKS = { customTexture: CustomTexture, frameSize: FrameSize, overlays: OverlayStack, placement: PlacementTiles, renderButtons: RenderButtons, textureSource: TextureSource }
  const CONTROLS = new Set(["block", "button", "colour", "dropdown", "gradient", "heading", "hint", "row", "segments", "slider", "stack", "toggle"])

  const props = defineProps({
    panel: { type: Object, required: true },
    state: { type: Object, required: true },
    controls: { type: Array, required: true }
  })

  const unknown = props.controls.find(control => !CONTROLS.has(control.type) || control.type === "block" && !BLOCKS[control.name])
  if (unknown) throw new Error(`the ${props.panel.id} panel has a ${unknown.name ?? unknown.type} control, which can't be drawn`)

  const { change, context, isShown, resolved, valueOf } = props.state

  function press(control) {
    if (control.guide === "centre") holdCentre(props.panel.id, context.word)
  }
</script>

<template>
  <template v-for="(control, index) of controls" :key="index">
    <template v-if="isShown(control)">
      <p v-if="control.type === 'hint'" class="hint">{{ resolved(control.text) }}</p>
      <h3 v-else-if="control.type === 'heading'">{{ resolved(control.text) }}</h3>
      <Slider v-else-if="control.type === 'slider'" :label="control.label" :model-value="valueOf(control)" @update:model-value="change(control, $event)" :min="resolved(control.min)" :max="resolved(control.max)" :step="control.step" :steps="control.steps" :log="control.log" :hint="resolved(control.hint)" @pointerdown="press(control)" />
      <Toggle v-else-if="control.type === 'toggle'" :label="control.label" :hint="resolved(control.hint)" :model-value="!!valueOf(control)" @update:model-value="change(control, $event)" />
      <Segments v-else-if="control.type === 'segments'" :label="control.label" :radio="control.radio" :options="resolved(control.options)" :model-value="valueOf(control)" @update:model-value="change(control, $event)" />
      <Dropdown v-else-if="control.type === 'dropdown'" :class="{ grow: control.grow }" :label="control.label" :options="resolved(control.options)" :model-value="valueOf(control)" @update:model-value="change(control, $event)" v-tooltip="control.tooltip" />
      <ColourPicker v-else-if="control.type === 'colour'" :class="{ grow: control.grow }" :model-value="valueOf(control)" @update:model-value="change(control, $event)" />
      <GradientEditor v-else-if="control.type === 'gradient'" :key="control.perObject ? context.object.id : 0" :model-value="valueOf(control)" @update:model-value="change(control, $event)" :smooth="resolved(control.smooth)" :mix="resolved(control.mix)" :angle="resolved(control.angle)" :min="control.min" />
      <Button v-else-if="control.type === 'button'" :wide="!control.narrow" :class="{ narrow: control.narrow }" v-tooltip="control.tooltip" @click="control.press(context)">{{ control.label }}</Button>
      <component v-else-if="control.type === 'block'" :is="BLOCKS[control.name]" :panel="panel" :context="context" />
      <div v-else :class="control.type">
        <DataControls :panel="panel" :state="state" :controls="control.controls" />
      </div>
    </template>
  </template>
</template>

<style scoped>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .narrow {
    align-self: flex-start;
  }
</style>
