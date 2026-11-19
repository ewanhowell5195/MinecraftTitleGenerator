<script setup>
  import { computed, ref, watch } from "vue"
  import Checkbox from "../../components/Checkbox.vue"
  import ColourPicker from "../../components/ColourPicker.vue"
  import Dropdown from "../../components/Dropdown.vue"
  import Field from "../../components/Field.vue"
  import NumberInput from "../../components/NumberInput.vue"
  import Segments from "../../components/Segments.vue"
  import { fetched } from "../../lib/submissions/api.js"
  import { fontFolder, fullName, sheetOwner } from "../../lib/font/font.js"
  import { texturesList } from "../../lib/submissions/kinds/fontAsset.js"
  import { submissionContext } from "../../lib/submissions/kinds/index.js"
  import { DEFAULT_FONT } from "../../lib/settings/defaults.js"
  import { DEFAULT_STRIPS } from "../../lib/font/strips.js"
  import { STRIP_LIMITS, heightList, setIdOf, setIds, setName, setUsers, sharedHeights, stripOwners, stripSnap, stripTarget, targetRows } from "../../lib/submissions/kinds/stripFit.js"
  import { SUBMISSION_LIMITS, pngProblem } from "../../lib/submissions/submissions.js"
  import { fontThumbnail } from "../../lib/font/thumbnailUrls.js"
  import { popularFontOptions } from "./fontOptions.js"
  import VariantOf from "./VariantOf.vue"

  const DEFAULT_SET = "minecraft-ten"
  const NEW_SHAPE = { depth: 22, baseline: 30, height: 40 }
  const MODES = [{ value: "set", label: "Strip type" }, { value: "font", label: "Font" }, { value: "new", label: "New strip type" }]
  const ANCHORS = [{ value: "top", label: "Top" }, { value: "center", label: "Centre" }, { value: "base", label: "Base" }]

  defineOptions({ inheritAttrs: false })

  const props = defineProps({
    fonts: { type: Array, required: true },
    kind: { type: String, required: true },
    target: { type: String, default: "" },
    details: { type: Object, required: true },
    file: { type: Object, default: null },
    problems: { type: Object, required: true },
    tried: { type: Boolean, default: false },
    context: { type: Object, default: null },
    defaultFont: { type: String, default: "" }
  })

  const emit = defineEmits(["update:target", "update:details", "preview"])

  const ctx = props.context ?? submissionContext(props.fonts, path => fetched(path, path))
  const owners = computed(() => stripOwners(props.fonts))
  const sets = computed(() => setIds(props.fonts))
  const chosen = computed(() => stripTarget(props.target))
  const forDefault = computed(() => chosen.value.kind === "set" && chosen.value.id === DEFAULT_STRIPS)
  const fontOptions = computed(() => popularFontOptions(owners.value, props.fonts))
  const setOptions = computed(() => sets.value.map(id => ({ value: id, label: setName(id) })))
  const users = computed(() => chosen.value.kind === "set" ? setUsers(props.fonts, chosen.value.id).map(use => fullName(use.font, props.fonts)) : [])
  const shownOn = computed(() => chosen.value.kind === "set" ? setUsers(props.fonts, chosen.value.id)[0]?.font : owners.value.find(item => item.id === chosen.value.id))
  const variantList = computed(() => chosen.value.kind === "set" ? `/strips/${chosen.value.id}/textures.json` : shownOn.value ? texturesList(shownOn.value) : null)
  const heights = ref(null)
  const fontList = computed(() => owners.value.map(item => ({ id: item.id, font: item, name: fullName(item, props.fonts) })))

  const mode = computed({
    get: () => chosen.value.kind,
    set: value => emit("update:target", fallback(value))
  })
  const font = computed({
    get: () => chosen.value.kind === "font" ? chosen.value.id : "",
    set: value => emit("update:target", `font:${value}`)
  })
  const set = computed({
    get: () => chosen.value.kind === "set" ? chosen.value.id : "",
    set: value => emit("update:target", `set:${value}`)
  })
  const border = computed({
    get: () => props.details.border ?? "#000000",
    set: value => change({ border: value })
  })
  const stretch = computed({
    get: () => props.details.stretch === true,
    set: value => change({ stretch: value || undefined })
  })
  const anchor = computed({
    get: () => props.details.anchor ?? "center",
    set: value => change({ anchor: value === "center" ? undefined : value })
  })
  const perCharacter = computed({
    get: () => props.details.tiling === "character",
    set: value => change({ tiling: value ? "character" : undefined })
  })
  const newId = computed(() => setIdOf(props.details.set))
  const picked = computed(() => Array.isArray(props.details.fonts) ? props.details.fonts : [])
  const required = computed(() => {
    if (!heights.value) return ""
    const what = chosen.value.kind === "new" ? "this strip type" : chosen.value.kind === "set" ? `the ${setName(chosen.value.id)} strip type` : fullName(owners.value.find(item => item.id === chosen.value.id), props.fonts)
    return `Strips for ${what} can be ${heightList(heights.value)} pixels tall.`
  })

  function change(values) {
    emit("update:details", { ...props.details, ...values })
  }

  function number(key, value) {
    change({ [key]: value === "" ? null : Number(value) })
  }

  function fallback(kind) {
    if (kind === "new") return "new"
    if (kind === "set") return `set:${sets.value.includes(DEFAULT_SET) ? DEFAULT_SET : sets.value[0] ?? ""}`
    const owner = props.fonts.find(item => item.id === props.defaultFont)
    const wanted = owner ? sheetOwner(owner, props.fonts).id : DEFAULT_FONT
    return `font:${owners.value.find(item => item.id === wanted)?.id ?? owners.value.find(item => item.id === DEFAULT_FONT)?.id ?? owners.value[0]?.id ?? ""}`
  }

  function toggleFont(id, on) {
    change({ fonts: on ? picked.value.concat(id) : picked.value.filter(item => item !== id) })
    if (on) emit("preview", id)
  }

  function pickAll() {
    change({ fonts: picked.value.concat(owners.value.map(item => item.id).filter(id => !picked.value.includes(id))) })
  }

  async function heightsOf(target) {
    const rows = await targetRows(ctx, target, props.details)
    return rows && sharedHeights(rows)
  }

  watch(() => props.target, () => {
    const { kind, id } = chosen.value
    if (kind === "new") return
    if (!props.target) emit("update:target", fallback("set"))
    else if (kind === "set" && !sets.value.includes(id)) emit("update:target", fallback("set"))
    else if (kind === "font" && !props.target.startsWith("font:")) {
      const entry = props.fonts.find(item => item.id === id)
      emit("update:target", entry ? `font:${sheetOwner(entry, props.fonts).id}` : fallback("font"))
    } else if (kind === "font" && !owners.value.some(item => item.id === id)) emit("update:target", fallback("font"))
  }, { immediate: true })

  watch(() => props.file?.bytes, bytes => {
    if (!bytes || pngProblem(bytes, "strip")) return
    const snap = stripSnap(bytes)
    change({ snap: snap > 1 ? snap : undefined })
  })

  watch(() => [props.target, props.kind], () => {
    const missing = {}
    if (!props.details.border) missing.border = "#000000"
    if (chosen.value.kind === "new") {
      for (const [key, value] of Object.entries(NEW_SHAPE)) if (props.details[key] === undefined) missing[key] = value
      if (!Array.isArray(props.details.fonts)) missing.fonts = []
    }
    if (forDefault.value && props.details.stretch !== true) missing.stretch = true
    if (Object.keys(missing).length) change(missing)
  }, { immediate: true })

  watch(() => [props.target, props.details.depth, props.details.baseline, props.details.height], async () => {
    const target = props.target
    try {
      const found = await heightsOf(target)
      if (target !== props.target) return
      heights.value = found
    } catch (err) {
      console.error(err)
      heights.value = null
    }
  }, { immediate: true })
</script>

<template>
  <Segments v-model="mode" :options="MODES" label="Strip for" hint="A strip is read from top to bottom: the top edge of the letters, their front, then the bottom edge. It repeats along the line, so it can be any width." />
  <Field group v-if="mode === 'set'" label="Strip type" :error="tried ? problems.target : ''" :hint="forDefault ? 'Every font uses this strip type, so its strips have to stretch.' : users.length ? `Shared by ${users.join(', ')}.` : ''">
    <Dropdown v-model="set" :options="setOptions" />
  </Field>
  <Field group v-else-if="mode === 'font'" label="Font" :error="tried ? problems.target : ''" hint="Only this font gets the strip.">
    <Dropdown v-model="font" :options="fontOptions" searchable />
  </Field>
  <template v-else>
    <Field label="Strip type name" :error="tried || details.set ? problems.set : ''" :hint="newId ? `Saved as ${newId}.` : ''">
      <input type="text" :value="details.set ?? ''" :maxlength="SUBMISSION_LIMITS.name" spellcheck="false" @input="change({ set: $event.target.value })">
    </Field>
    <Field group label="Shape" :error="['depth', 'baseline', 'height'].map(key => problems[key]).find(Boolean)" hint="The depth is how many rows each edge takes. The height is how many rows the front has above the baseline. The baseline counts the rows from the bottom of the strip up to the baseline, including the bottom edge. Minecraft Ten's strips are 22, 30 and 40.">
      <div class="shape">
        <label><span class="hint">Depth</span><NumberInput min="1" :max="STRIP_LIMITS.depth" :value="details.depth" @input="number('depth', $event.target.value)" /></label>
        <label><span class="hint">Baseline</span><NumberInput :min="details.depth" :value="details.baseline" @input="number('baseline', $event.target.value)" /></label>
        <label><span class="hint">Height</span><NumberInput min="1" :max="STRIP_LIMITS.height" :value="details.height" @input="number('height', $event.target.value)" /></label>
      </div>
    </Field>
    <div class="field wide">
      <div class="fonts-head">
        <span class="label">Fonts ({{ picked.length }} picked)</span>
        <button type="button" class="link-button" @click="pickAll">Pick all</button>
      </div>
      <ul class="fonts">
        <li v-for="item of fontList" :key="item.id">
          <label class="font card card-row" :class="{ selected: picked.includes(item.id) }">
            <input type="checkbox" :checked="picked.includes(item.id)" @change="toggleFont(item.id, $event.target.checked)">
            <img :src="fontThumbnail(item.font)" alt="" loading="lazy">
            <span class="font-text ellipsis">{{ item.name }}</span>
          </label>
        </li>
      </ul>
      <span v-if="problems.fonts && (tried || picked.length)" class="hint bad">{{ problems.fonts }}</span>
    </div>
  </template>
  <VariantOf v-if="mode !== 'new'" noun="strip" :details="details" :list="variantList" :folder="shownOn ? fontFolder(shownOn) : null" :problem="tried ? problems.variantOf ?? '' : ''" @update:details="emit('update:details', $event)" />
  <Checkbox v-if="mode !== 'font' && !forDefault" v-model="stretch" label="Stretch the front between each font's baseline and top, instead of lining it up row by row" />
  <span v-if="problems.stretch" class="hint bad">{{ problems.stretch }}</span>
  <Segments v-if="mode !== 'font' && !stretch" v-model="anchor" :options="ANCHORS" label="Anchor" :hint="problems.anchor || 'Where the strip sits on fonts shorter or taller than it: their top on its top, their middle on its middle, or their baseline on its baseline.'" />
  <Checkbox v-model="perCharacter" label="Restart on each character" :hint="problems.tiling || 'Starts the strip again from the left of every character, instead of running it along the whole line.'" />
  <Field group label="Snap" :error="problems.snap" hint="How many pixels wide each of the strip's own pixels are. Letters that don't touch start their strip on a whole one of these, so the pattern lines up from letter to letter.">
    <NumberInput min="1" :max="STRIP_LIMITS.snap" :value="details.snap ?? 1" @input="number('snap', $event.target.value)" />
  </Field>
  <Field group label="Border colour">
    <ColourPicker v-model="border" />
    <span v-if="problems.border" class="hint bad">{{ problems.border }}</span>
  </Field>
  <p v-if="required" class="hint">{{ required }}</p>
</template>

<style scoped>
  .shape {
    display: flex;
    gap: 12px;
  }

  .shape label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    user-select: none;
  }

  .fonts-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .fonts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 6px;
    max-height: 320px;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }

  .font {
    height: 100%;
    user-select: none;
  }

  .font input {
    display: none;
  }

  .font img {
    flex: none;
    width: 44px;
    height: 20px;
    object-fit: contain;
    image-rendering: pixelated;
  }

  .font-text {
    min-width: 0;
    font-size: var(--font-md);
  }
</style>
