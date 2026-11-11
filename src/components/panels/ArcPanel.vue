<script setup>
  import { computed } from "vue"
  import { hasMarks } from "../../lib/font.js"
  import { usePanel } from "../../lib/panel.js"
  import Panel from "../Panel.vue"
  import Segments from "../Segments.vue"
  import Slider from "../Slider.vue"
  import Toggle from "../Toggle.vue"

  const props = defineProps({
    word: { type: Boolean, default: false }
  })

  const MODES = [{ value: "stretch", label: "Stretch" }, { value: "move", label: "Move" }]

  const { object, font, modified, reset, k } = usePanel(props.word ? "wordArc" : "arc", props.word)
  const marked = computed(() => hasMarks(font.value))
</script>

<template>
  <Panel title="Arc" :modified="modified" @reset="reset">
    <Segments :options="MODES" v-model="object[k('arcMode')]" />
    <template v-if="object[k('arcMode')] === 'stretch'">
      <p class="hint">Stretches the outer characters more than the inner ones.</p>
      <Slider label="Top" v-model="object[k('arcTop')]" :min="-100" :max="100" />
      <Slider label="Bottom" v-model="object[k('arcBottom')]" :min="-100" :max="100" />
      <Toggle v-if="marked" label="Only stretch the stretchable parts" v-model="object[k('arcMarked')]" />
      <Toggle v-if="!word && object.textureSource === 'gradient'" label="Gradient follows the curve" v-model="object.arcGradient" />
    </template>
    <template v-else>
      <p class="hint">Moves the outer characters more than the inner ones.</p>
      <Slider label="Curve" v-model="object[k('arcMove')]" :min="-100" :max="100" />
    </template>
    <Slider label="Centre" v-model="object[k('arcCentre')]" :min="0" :max="100" hint="0 is the left end and 100 is the right end." />
  </Panel>
</template>
