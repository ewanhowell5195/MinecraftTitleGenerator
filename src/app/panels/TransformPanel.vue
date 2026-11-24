<script setup>
  import { computed } from "vue"
  import { MATCH_PANEL, SCALING_PANEL } from "../../lib/panels/transform.js"
  import { usePanelState } from "../../lib/panels/panel.js"
  import { TRANSFORM_GROUPS, TRANSFORM_LIMITS, isModified, resetTransform, transformKeys, wordKey } from "../../lib/settings/settings.js"
  import { current, currentWord, setScale } from "../../lib/state/scene.js"
  import Button from "../../components/Button.vue"
  import DataControls from "./DataControls.vue"
  import DataPanel from "./DataPanel.vue"
  import Panel from "../Panel.vue"
  import Slider from "../../components/Slider.vue"

  const props = defineProps({
    word: { type: Boolean, default: false }
  })

  const AXIS_PANELS = [["translation", "Position"], ["rotation", "Rotation"]]

  const object = computed(() => props.word ? currentWord.value : current.value)
  const k = key => props.word ? wordKey(key) : key

  const modified = computed(() => Object.fromEntries(Object.keys(TRANSFORM_GROUPS).map(group => [group, isModified(object.value, props.word ? "wordTransform" : "transform", {}, transformKeys(group, props.word))])))
  const linked = computed(() => object.value[k("linkScale")] !== null)
  const scaling = usePanelState(SCALING_PANEL, props.word)

  function setting(key) {
    return computed({
      get: () => object.value[k(key)],
      set: value => setScale(object.value, k(key), value)
    })
  }

  const scaleX = setting("scaleX")
  const scaleY = setting("scaleY")

  function toggleLink() {
    if (linked.value) object.value[k("linkScale")] = null
    else object.value[k("linkScale")] = object.value[k("scaleY")] / object.value[k("scaleX")]
  }
</script>

<template>
  <DataPanel :panel="MATCH_PANEL" :word="word" />
  <Panel v-for="[group, title] of AXIS_PANELS" :key="group" :title="title" :modified="modified[group]" @reset="resetTransform(object, group, word)">
    <Slider v-for="(key, index) of TRANSFORM_GROUPS[group]" :key="key" inline :label="'XYZ'[index]" v-model="object[k(key)]" :min="TRANSFORM_LIMITS[group][0]" :max="TRANSFORM_LIMITS[group][1]" v-bind="group === 'translation' ? { typedMin: null, typedMax: null } : {}" />
  </Panel>
  <Panel title="Scale" :modified="modified.scale" @reset="resetTransform(object, 'scale', word)">
    <div class="linked">
      <div class="sliders">
        <Slider inline label="X" v-model="scaleX" :min="TRANSFORM_LIMITS.scale[0]" :max="TRANSFORM_LIMITS.scale[1]" :typed-max="null" :step="0.05" />
        <Slider inline label="Y" v-model="scaleY" :min="TRANSFORM_LIMITS.scale[0]" :max="TRANSFORM_LIMITS.scale[1]" :typed-max="null" :step="0.05" />
      </div>
      <span class="bracket" :class="{ active: linked }"></span>
      <Button ghost icon="link" :title="linked ? 'Unlink X and Y' : 'Link X and Y so the text keeps its shape'" :active="linked" @click="toggleLink" :aria-label="linked ? 'Unlink X and Y' : 'Link X and Y'" :aria-pressed="linked" />
    </div>
    <div class="linked">
      <Slider class="grow" inline label="Z" v-model="object[k('scaleZ')]" :min="TRANSFORM_LIMITS.scale[0]" :max="TRANSFORM_LIMITS.scale[1]" :typed-max="null" :step="0.05" />
      <span class="spare"></span>
    </div>
    <DataControls :panel="SCALING_PANEL" :state="scaling" :controls="SCALING_PANEL.controls" />
  </Panel>
</template>

<style scoped>
  .linked {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .sliders {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .bracket {
    align-self: stretch;
    width: 6px;
    margin: 13px 0;
    border: 2px solid var(--line-strong);
    border-left: none;
  }

  .bracket.active {
    border-color: var(--accent);
  }

  .spare {
    width: 38px;
  }
</style>
