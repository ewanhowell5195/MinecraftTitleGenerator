<script setup>
  import { computed } from "vue"
  import { leadsTo, problems } from "../../lib/match.js"
  import { previews } from "../../lib/previews.js"
  import { TRANSFORM_GROUPS, TRANSFORM_LIMITS, TYPES, isModified, resetTransform, transformKeys, wordKey } from "../../lib/settings.js"
  import { hasMarks } from "../../lib/font.js"
  import { active, current, currentWord, lineText, scene, selection, setScale, words } from "../../lib/scene.js"
  import Dropdown from "../Dropdown.vue"
  import Icon from "../Icon.vue"
  import Panel from "../Panel.vue"
  import Slider from "../Slider.vue"
  import Toggle from "../Toggle.vue"

  const props = defineProps({
    word: { type: Boolean, default: false }
  })

  const AXIS_PANELS = [["rotation", "Rotation"], ["translation", "Position"]]

  const object = computed(() => props.word ? currentWord.value : current.value)
  const k = key => props.word ? wordKey(key) : key
  const matching = computed(() => !props.word && object.value.matchWidth !== null)

  const modified = computed(() => Object.fromEntries(Object.keys(TRANSFORM_GROUPS).map(group => [group, isModified(object.value, props.word ? "wordTransform" : "transform", {}, transformKeys(group, props.word))])))
  const own = computed(() => words(selection.value[0]))
  const references = computed(() => scene.objects.filter(other => !own.value.includes(other) && words(other)[0] === other && !own.value.some(word => leadsTo(other, word))))
  const matchOptions = computed(() => [{ value: null, label: "None", hint: "Scale X by hand" }].concat(references.value.map(other => ({ value: other.id, label: lineText(other) || "(empty)", hint: TYPES[other.type].name, image: previews[other.id] }))))
  const linked = computed(() => object.value[k("linkScale")] !== null)
  const marked = computed(() => hasMarks(active.value.font))

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
    else if (matching.value) {
      object.value.linkScale = 1
      object.value.scaleY = object.value.scaleX
    } else object.value[k("linkScale")] = object.value[k("scaleY")] / object.value[k("scaleX")]
  }
</script>

<template>
  <Panel title="Scale" :modified="modified.scale" @reset="resetTransform(object, 'scale', word)">
    <template v-if="!word">
      <Dropdown v-if="references.length || object.matchWidth !== null" label="Match width to" :options="matchOptions" v-model="object.matchWidth" />
      <p v-if="object.matchWidth !== null && problems[object.id]" class="hint">{{ problems[object.id] }}</p>
    </template>
    <div class="linked">
      <div class="sliders">
        <Slider v-if="!matching" inline label="X" v-model="scaleX" :min="TRANSFORM_LIMITS.scale[0]" :max="TRANSFORM_LIMITS.scale[1]" :step="0.05" />
        <Slider inline label="Y" v-model="scaleY" :min="TRANSFORM_LIMITS.scale[0]" :max="TRANSFORM_LIMITS.scale[1]" :step="0.05" :disabled="linked && matching" />
      </div>
      <span class="bracket" :class="{ active: linked, hidden: matching }"></span>
      <button class="icon-button small" :class="{ active: linked }" @click="toggleLink" :title="linked ? 'Unlink X and Y' : 'Link X and Y so the text keeps its shape'" :aria-pressed="linked"><Icon name="link" :size="14" /></button>
    </div>
    <div class="linked">
      <Slider class="grow" inline label="Z" v-model="object[k('scaleZ')]" :min="TRANSFORM_LIMITS.scale[0]" :max="TRANSFORM_LIMITS.scale[1]" :step="0.05" />
      <span class="spare"></span>
    </div>
    <Toggle v-if="marked" label="Only stretch the stretchable parts" v-model="object[k('scaleMarked')]" />
    <Toggle label="Scale the outline too" v-model="object[k('scaleOutline')]" />
  </Panel>
  <Panel v-for="[group, title] of AXIS_PANELS" :key="group" :title="title" :modified="modified[group]" @reset="resetTransform(object, group, word)">
    <Slider v-for="(key, index) of TRANSFORM_GROUPS[group]" :key="key" inline :label="'XYZ'[index]" v-model="object[k(key)]" :min="TRANSFORM_LIMITS[group][0]" :max="TRANSFORM_LIMITS[group][1]" />
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

  .bracket.hidden {
    visibility: hidden;
  }

  .spare {
    width: 38px;
  }
</style>
