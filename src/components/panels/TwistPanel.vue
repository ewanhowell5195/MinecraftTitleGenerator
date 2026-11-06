<script setup>
  import { usePanel } from "../../lib/panel.js"
  import Panel from "../Panel.vue"
  import Segments from "../Segments.vue"
  import Slider from "../Slider.vue"
  import Toggle from "../Toggle.vue"

  const ANCHORS = [{ value: "left", label: "Left" }, { value: "centre", label: "Centre" }, { value: "right", label: "Right" }]
  const TWISTS = [
    { label: "Ribbon", hint: "Tips characters forwards or backwards, more the further they are from the anchor.", amount: "twistRibbon", anchor: "twistRibbonAnchor", same: "twistRibbonMirror", sameLabel: "Mirror each side" },
    { label: "Door", hint: "Turns characters left or right, more the further they are from the anchor.", amount: "twistDoor", anchor: "twistDoorAnchor", same: "twistDoorSame", sameLabel: "Both sides turn the same way" }
  ]

  const { object, modified, reset } = usePanel("twist")
</script>

<template>
  <Panel title="Twist" :modified="modified" @reset="reset">
    <template v-for="twist in TWISTS" :key="twist.label">
      <p class="hint">{{ twist.hint }}</p>
      <Slider :label="twist.label" v-model="object[twist.amount]" :min="-180" :max="180" />
      <div class="field">
        <span class="label">{{ twist.label }} anchor</span>
        <Segments :options="ANCHORS" v-model="object[twist.anchor]" />
      </div>
      <Toggle v-if="object[twist.anchor] === 'centre'" :label="twist.sameLabel" v-model="object[twist.same]" />
    </template>
  </Panel>
</template>
