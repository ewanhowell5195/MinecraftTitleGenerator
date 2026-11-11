<script setup>
  import { computed } from "vue"
  import { usePanel } from "../../lib/panel.js"
  import { words } from "../../lib/scene.js"
  import { defaultBorder, isModified } from "../../lib/settings.js"
  import Panel from "../Panel.vue"
  import Slider from "../Slider.vue"
  import Toggle from "../Toggle.vue"

  const props = defineProps({
    word: { type: Boolean, default: false }
  })

  const { object, font, modified, reset, k } = usePanel(props.word ? "wordGeometry" : "geometry", props.word)

  function setting(key) {
    const own = k(key)
    return computed({
      get: () => object.value[own] ?? object.value[key],
      set: value => (object.value[own] = value)
    })
  }

  const depth = setting("depth")
  const border = setting("border")
  const severalWords = computed(() => words(object.value).length > 1)
  const changed = computed(() => font.value?.model ? isModified(object.value, "geometry", { font: font.value }, ["border"]) : modified.value)

  function resetShown() {
    if (font.value?.model) border.value = defaultBorder(object.value.type, font.value)
    else reset()
  }
</script>

<template>
  <Panel :title="font?.model ? 'Outline' : 'Depth and outline'" :modified="changed" @reset="resetShown">
    <Slider v-if="!font?.model" label="Depth" v-model="depth" :min="0" :max="80" />
    <Slider label="Outline width" v-model="border" :min="0" :max="8" :step="0.1" />
    <Toggle v-if="!word && !font?.model" label="See through holes" hint="Cuts away anything behind a gap that is fully closed in" v-model="object.clipHoles" />
    <Toggle v-if="!word && severalWords" label="Layer words separately" hint="Each word's outline sits on top of the words around it, instead of behind the whole line" v-model="object.layerWords" />
  </Panel>
</template>
