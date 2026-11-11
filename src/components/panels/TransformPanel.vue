<script setup>
  import { computed } from "vue"
  import { leadsTo, problems } from "../../lib/match.js"
  import { previews } from "../../lib/previews.js"
  import { TRANSFORM_GROUPS, TRANSFORM_LIMITS, TYPES, isModified, resetTransform, transformKeys, wordKey } from "../../lib/settings.js"
  import { hasMarks } from "../../lib/font.js"
  import { active, bakeMatch, chooseMatch, current, currentWord, lineText, scene, selection, setScale, words } from "../../lib/scene.js"
  import Button from "../Button.vue"
  import Dropdown from "../Dropdown.vue"
  import Icon from "../Icon.vue"
  import Panel from "../Panel.vue"
  import Segments from "../Segments.vue"
  import Slider from "../Slider.vue"
  import Toggle from "../Toggle.vue"

  const props = defineProps({
    word: { type: Boolean, default: false }
  })

  const AXIS_PANELS = [["translation", "Position"], ["rotation", "Rotation"]]
  const MATCH_MODES = [{ value: false, label: "Row width", title: "The widest point in the row" }, { value: true, label: "Row bottom width", title: "The widest point in the bottom of the row" }]

  const object = computed(() => props.word ? currentWord.value : current.value)
  const k = key => props.word ? wordKey(key) : key

  const modified = computed(() => Object.fromEntries(Object.keys(TRANSFORM_GROUPS).map(group => [group, isModified(object.value, props.word ? "wordTransform" : "transform", {}, transformKeys(group, props.word))])))
  const own = computed(() => words(selection.value[0]))
  const references = computed(() => scene.objects.filter(other => !own.value.includes(other) && words(other)[0] === other && !own.value.some(word => leadsTo(other, word))))
  const matchOptions = computed(() => [{ value: null, label: "None" }].concat(references.value.map(other => ({ value: other.id, label: lineText(other) || "(empty)", hint: TYPES[other.type].name, image: previews[other.id] }))))
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
    else object.value[k("linkScale")] = object.value[k("scaleY")] / object.value[k("scaleX")]
  }
</script>

<template>
  <Panel v-if="!word && (references.length || object.matchWidth !== null)" title="Match width to" :modified="modified.match" @reset="resetTransform(object, 'match')">
    <Dropdown :options="matchOptions" :model-value="object.matchWidth" @update:model-value="chooseMatch(selection[0], $event)" />
    <template v-if="object.matchWidth !== null">
      <Segments :options="MATCH_MODES" v-model="object.matchBottom" />
      <Toggle label="Scale Y to match too" v-model="object.matchScaleY" />
      <p v-if="problems[object.id]" class="hint">{{ problems[object.id] }}</p>
      <Button class="bake" v-tooltip="'Stop matching and move its scale and position into the sliders'" @click="bakeMatch(selection[0])">Bake match</Button>
    </template>
  </Panel>
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
      <Button ghost :active="linked" @click="toggleLink" v-tooltip="linked ? 'Unlink X and Y' : 'Link X and Y so the text keeps its shape'" :aria-label="linked ? 'Unlink X and Y' : 'Link X and Y'" :aria-pressed="linked"><template #icon><Icon name="link" :size="16" /></template></Button>
    </div>
    <div class="linked">
      <Slider class="grow" inline label="Z" v-model="object[k('scaleZ')]" :min="TRANSFORM_LIMITS.scale[0]" :max="TRANSFORM_LIMITS.scale[1]" :typed-max="null" :step="0.05" />
      <span class="spare"></span>
    </div>
    <Toggle v-if="marked" label="Only stretch the stretchable parts" v-model="object[k('scaleMarked')]" />
    <Toggle label="Scale the outline too" v-model="object[k('scaleOutline')]" />
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

  .bake {
    align-self: flex-start;
  }

  .spare {
    width: 38px;
  }
</style>
