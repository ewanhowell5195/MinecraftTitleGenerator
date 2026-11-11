<script setup>
  import { usePanel } from "../../lib/panel.js"
  import Panel from "../Panel.vue"
  import Slider from "../Slider.vue"
  import Toggle from "../Toggle.vue"

  const TWISTS = [
    { label: "Ribbon", hint: "Tips characters forwards or backwards, more the further they are from the centre.", amount: "twistRibbon", centre: "twistRibbonCentre", same: "twistRibbonMirror", sameLabel: "Mirror each side" },
    { label: "Wrap", hint: "Wraps characters round a curve, turning them more the further they are from the centre.", amount: "twistDoor", centre: "twistDoorCentre", same: "twistDoorSame", sameLabel: "Both sides turn the same way", roll: "twistDoorRoll", rollLabel: "Roll around one shared point" }
  ]

  const { object, modified, reset } = usePanel("twist")
</script>

<template>
  <Panel title="Twist" :modified="modified" @reset="reset">
    <template v-for="twist of TWISTS" :key="twist.label">
      <p class="hint">{{ twist.hint }}</p>
      <Slider :label="twist.label" v-model="object[twist.amount]" :min="-180" :max="180" />
      <template v-if="object[twist.amount]">
        <Slider :label="`${twist.label} centre`" v-model="object[twist.centre]" :min="0" :max="100" hint="0 is the left end and 100 is the right end." />
        <Toggle :label="twist.sameLabel" v-model="object[twist.same]" />
        <Toggle v-if="twist.roll" :label="twist.rollLabel" v-model="object[twist.roll]" />
      </template>
    </template>
  </Panel>
</template>
