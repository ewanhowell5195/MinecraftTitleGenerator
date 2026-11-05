<script setup>
  import { computed } from "vue"
  import { usePanel } from "../../lib/panel.js"
  import { words } from "../../lib/scene.js"
  import { wordKey } from "../../lib/settings.js"
  import Panel from "../Panel.vue"
  import Slider from "../Slider.vue"
  import Toggle from "../Toggle.vue"

  const props = defineProps({
    word: { type: Boolean, default: false }
  })

  const { object, font, modified, reset } = usePanel(props.word ? "wordGeometry" : "geometry", props.word)

  function setting(key) {
    const own = props.word ? wordKey(key) : key
    return computed({
      get: () => object.value[own] ?? object.value[key],
      set: value => (object.value[own] = value)
    })
  }

  const depth = setting("depth")
  const border = setting("border")
  const severalWords = computed(() => words(object.value).length > 1)
</script>

<template>
  <Panel title="Depth and outline" :modified="modified" @reset="reset">
    <Slider label="Depth" v-model="depth" :min="0" :max="80" />
    <Slider v-if="!font?.autoBorder" label="Outline width" v-model="border" :min="0" :max="8" :step="0.1" />
    <Toggle v-if="!word" label="See through holes" hint="Cuts away anything behind a gap that is fully closed in" v-model="object.clipHoles" />
    <Toggle v-if="!word && severalWords" label="Layer words separately" hint="Each word's outline sits on top of the words around it, instead of behind the whole line" v-model="object.layerWords" />
  </Panel>
</template>
