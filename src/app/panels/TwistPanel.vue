<script setup>
  import { usePanel } from "./panel.js"
  import { holdCentre } from "../centreDot.js"
  import Panel from "../Panel.vue"
  import Slider from "../../components/Slider.vue"
  import Toggle from "../../components/Toggle.vue"

  const props = defineProps({
    kind: { type: String, required: true },
    word: { type: Boolean, default: false }
  })

  const TWISTS = {
    ribbon: { title: "Ribbon", hint: "Tips characters forwards or backwards, more the further they are from the centre.", amount: "twistRibbon", centre: "twistRibbonCentre", same: "twistRibbonMirror", sameLabel: "Mirror each side" },
    wrap: { title: "Wrap", hint: "Wraps characters round a curve, turning them more the further they are from the centre.", amount: "twistDoor", centre: "twistDoorCentre", same: "twistDoorSame", sameLabel: "Both sides turn the same way", roll: "twistDoorRoll", rollLabel: "Roll around one shared point", hinge: "twistDoorDepth", hingeLabel: "Hinge depth", hingeHint: "Where each character hinges on the next. 0 is the back and 100 is the front." },
    fan: { title: "Fan", hint: "Fans characters out sideways, tilting them more the further they are from the centre.", amount: "twistFan", centre: "twistFanCentre", roll: "twistFanRoll", rollLabel: "Fan around one shared point", hinge: "twistFanHeight", hingeLabel: "Hinge height", hingeHint: "Where each character hinges on the next. 0 is the bottom of the line and 100 is the top." }
  }

  const twist = TWISTS[props.kind]
  const { object, modified, reset, k } = usePanel(props.word ? `word${twist.title}` : props.kind, props.word)
</script>

<template>
  <Panel :title="twist.title" :modified="modified" @reset="reset">
    <p class="hint">{{ twist.hint }}</p>
    <Slider label="Amount" v-model="object[k(twist.amount)]" :min="-180" :max="180" />
    <template v-if="object[k(twist.amount)]">
      <Slider label="Centre" v-model="object[k(twist.centre)]" :min="0" :max="100" hint="0 is the left end and 100 is the right end." @pointerdown="holdCentre(kind, word)" />
      <Toggle v-if="twist.same" :label="twist.sameLabel" v-model="object[k(twist.same)]" />
      <Toggle v-if="twist.roll" :label="twist.rollLabel" v-model="object[k(twist.roll)]" />
      <Slider v-if="twist.hinge && object[k(twist.roll)]" :label="twist.hingeLabel" v-model="object[k(twist.hinge)]" :min="-100" :max="200" :hint="twist.hingeHint" @pointerdown="holdCentre(kind, word)" />
    </template>
  </Panel>
</template>
