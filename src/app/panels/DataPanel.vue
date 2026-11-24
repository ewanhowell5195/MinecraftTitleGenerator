<script setup>
  import { computed } from "vue"
  import { wordKey } from "../../lib/settings/settings.js"
  import { holdCentre } from "../centreDot.js"
  import { usePanel } from "./panel.js"
  import Panel from "../Panel.vue"
  import Slider from "../../components/Slider.vue"
  import Toggle from "../../components/Toggle.vue"

  const CONTROLS = new Set(["hint", "slider", "toggle"])

  const props = defineProps({
    panel: { type: Object, required: true },
    word: { type: Boolean, default: false }
  })

  const unknown = props.panel.controls.find(control => !CONTROLS.has(control.type))
  if (unknown) throw new Error(`the ${props.panel.id} panel has a ${unknown.type} control, which can't be drawn`)

  const { object, modified, reset, k } = usePanel(props.word ? wordKey(props.panel.id) : props.panel.id, props.word)

  const controls = computed(() => props.panel.controls.filter(control => !control.shown || control.shown(key => object.value[k(key)])))

  function press(control) {
    if (control.guide === "centre") holdCentre(props.panel.id, props.word)
  }
</script>

<template>
  <Panel :title="panel.title" :modified="modified" @reset="reset">
    <template v-for="control of controls" :key="control.key ?? control.text">
      <p v-if="control.type === 'hint'" class="hint">{{ control.text }}</p>
      <Slider v-else-if="control.type === 'slider'" :label="control.label" v-model="object[k(control.key)]" :min="control.min" :max="control.max" :step="control.step" :hint="control.hint" @pointerdown="press(control)" />
      <Toggle v-else :label="control.label" :hint="control.hint" v-model="object[k(control.key)]" />
    </template>
  </Panel>
</template>
