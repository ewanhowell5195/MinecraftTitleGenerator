<script setup>
  import { computed, ref, watch } from "vue"
  import Button from "../../components/Button.vue"
  import ColourPicker from "../../components/ColourPicker.vue"
  import Dropdown from "../../components/Dropdown.vue"
  import NumberInput from "../../components/NumberInput.vue"
  import Segments from "../../components/Segments.vue"
  import { fullName, sheetOwner } from "../../lib/font.js"
  import { popular } from "../../lib/stats.js"
  import { submissionContext } from "../../lib/submissionKinds/index.js"
  import { STRIP_LIMITS, fitOffset, fitProblems, fontMeasure, fontRows, heightList, setIdOf, setIds, setName, setRows, setUsers, stripHeights, stripOwners, stripSet, stripTarget } from "../../lib/submissionKinds/stripFit.js"
  import { SUBMISSION_LIMITS, pngProblem, pngSize } from "../../lib/submissions.js"
  import { fontThumbnail } from "../../lib/ui.js"

  const DEFAULT_FONT = "minecraft-ten"
  const DEFAULT_SET = "minecraft-ten"
  const NEW_SHAPE = { depth: 22, baseline: 30, height: 40 }
  const MODES = [{ value: "set", label: "Strip type" }, { value: "font", label: "Font" }, { value: "new", label: "New strip type" }]

  const props = defineProps({
    fonts: { type: Array, required: true },
    kind: { type: String, required: true },
    target: { type: String, default: "" },
    details: { type: Object, required: true },
    file: { type: Object, default: null },
    problems: { type: Object, required: true },
    tried: { type: Boolean, default: false }
  })

  const emit = defineEmits(["update:target", "update:details", "problem", "preview"])

  const ctx = submissionContext(props.fonts, path => fetch(path))
  const owners = computed(() => stripOwners(props.fonts))
  const sets = computed(() => setIds(props.fonts))
  const chosen = computed(() => stripTarget(props.target))
  const fontOptions = computed(() => popular(owners.value, font => font.id, font => fullName(font, props.fonts), [DEFAULT_FONT]).map(font => ({ value: font.id, label: fullName(font, props.fonts), image: fontThumbnail(props.fonts, font.id) })))
  const setOptions = computed(() => sets.value.map(id => ({ value: id, label: setName(id) })))
  const users = computed(() => chosen.value.kind === "set" ? setUsers(props.fonts, chosen.value.id).map(use => fullName(use.font, props.fonts)) : [])
  const heights = ref(null)
  const fits = ref([])
  const suggestions = ref([])

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
    return `font:${owners.value.find(item => item.id === DEFAULT_FONT)?.id ?? owners.value[0]?.id ?? ""}`
  }

  function toggleFont(id, on) {
    change({ fonts: on ? picked.value.concat(id) : picked.value.filter(item => item !== id) })
    if (on) emit("preview", id)
  }

  function pickFitting() {
    change({ fonts: picked.value.concat(fits.value.filter(item => item.offset !== null && !picked.value.includes(item.id)).map(item => item.id)) })
  }

  function fitNote(item) {
    if (item.offset === null) return "Won't fit"
    if (!item.offset) return "Fits"
    return `Fits, ${Math.abs(item.offset)} ${Math.abs(item.offset) === 1 ? "row" : "rows"} ${item.offset > 0 ? "higher" : "lower"}`
  }

  function label(target) {
    const { kind, id } = stripTarget(target)
    return kind === "set" ? `${setName(id)} strip type` : fullName(owners.value.find(item => item.id === id), props.fonts)
  }

  async function rowsOf(target) {
    const { kind, id } = stripTarget(target)
    if (kind === "font") {
      const entry = owners.value.find(item => item.id === id)
      return entry ? [fontRows(await fontMeasure(ctx, entry))] : null
    }
    if (kind === "set") {
      if (!sets.value.includes(id)) return null
      const shape = await stripSet(ctx, id)
      if (shape.height) return [setRows(shape, null, 0)]
      return Promise.all(setUsers(props.fonts, id).map(async use => setRows(shape, await fontMeasure(ctx, use.font), use.offset)))
    }
    const { depth, baseline, height } = props.details
    return [depth, baseline, height].every(Number.isInteger) ? [depth + baseline + height] : null
  }

  async function heightsOf(target) {
    const rows = await rowsOf(target)
    if (!rows) return null
    const lists = rows.map(stripHeights)
    return lists[0].filter(height => lists.every(list => list.includes(height)))
  }

  async function findFits() {
    const shape = { id: "new", depth: props.details.depth, baseline: props.details.baseline, height: props.details.height }
    if (![shape.depth, shape.baseline, shape.height].every(Number.isInteger)) return []
    const found = await Promise.all(owners.value.map(async item => {
      const measure = await fontMeasure(ctx, item)
      const offset = fitOffset(shape, measure, stretch.value)
      return { id: item.id, name: fullName(item, props.fonts), offset, problems: offset === null ? fitProblems(shape, measure, 0, stretch.value) : [] }
    }))
    return found.sort((a, b) => (a.offset === null) - (b.offset === null))
  }

  async function findSuggestions(size) {
    const targets = sets.value.map(id => `set:${id}`).concat(owners.value.map(item => `font:${item.id}`))
    const found = await Promise.all(targets.map(async target => (await heightsOf(target))?.includes(size.height) ? target : null))
    return found.filter(Boolean)
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

  watch(() => [props.target, props.kind], () => {
    const missing = {}
    if (!props.details.border) missing.border = "#000000"
    if (chosen.value.kind === "new") {
      for (const [key, value] of Object.entries(NEW_SHAPE)) if (props.details[key] === undefined) missing[key] = value
      if (!Array.isArray(props.details.fonts)) missing.fonts = []
    }
    if (Object.keys(missing).length) change(missing)
  }, { immediate: true })

  watch(() => [props.target, props.details.depth, props.details.baseline, props.details.height, props.details.stretch], async () => {
    const target = props.target
    try {
      const found = await heightsOf(target)
      const fitting = chosen.value.kind === "new" ? await findFits() : []
      if (target !== props.target) return
      heights.value = found
      fits.value = fitting
    } catch (err) {
      console.error(err)
      heights.value = null
    }
  }, { immediate: true })

  watch(() => props.file, async file => {
    emit("problem", null)
    suggestions.value = []
    if (!file?.bytes || pngProblem(file.bytes, "strip")) return
    const found = await findSuggestions(pngSize(file.bytes))
    if (file !== props.file) return
    suggestions.value = found
    if (chosen.value.kind !== "new" && found.length && !found.includes(props.target)) emit("update:target", found[0])
  })
</script>

<template>
  <div class="field">
    <Segments v-model="mode" :options="MODES" label="Strip for" />
    <p class="hint">A strip is read from top to bottom: the top edge of the letters, their front, then the bottom edge. It repeats along the line, so it can be any width.</p>
  </div>
  <div v-if="mode === 'set'" class="field">
    <Dropdown v-model="set" :options="setOptions" label="Strip type" />
    <p v-if="users.length" class="hint">Shared by {{ users.join(", ") }}.</p>
    <span v-if="tried && problems.target" class="hint bad">{{ problems.target }}</span>
  </div>
  <div v-else-if="mode === 'font'" class="field">
    <Dropdown v-model="font" :options="fontOptions" label="Font" searchable />
    <p class="hint">Only this font gets the strip.</p>
    <span v-if="tried && problems.target" class="hint bad">{{ problems.target }}</span>
  </div>
  <template v-else>
    <label class="field">
      <span class="label">Strip type name</span>
      <input type="text" :value="details.set ?? ''" :maxlength="SUBMISSION_LIMITS.name" spellcheck="false" @input="change({ set: $event.target.value })">
      <span v-if="problems.set && (tried || details.set)" class="hint bad">{{ problems.set }}</span>
      <span v-else-if="newId" class="hint">Saved as {{ newId }}.</span>
    </label>
    <div class="field">
      <span class="label">Shape</span>
      <div class="shape">
        <label><span class="hint">Depth</span><NumberInput min="1" :max="STRIP_LIMITS.depth" :value="details.depth" @input="number('depth', $event.target.value)" /></label>
        <label><span class="hint">Baseline</span><NumberInput :min="details.depth" :value="details.baseline" @input="number('baseline', $event.target.value)" /></label>
        <label><span class="hint">Height</span><NumberInput min="1" :max="STRIP_LIMITS.height" :value="details.height" @input="number('height', $event.target.value)" /></label>
      </div>
      <p class="hint">The depth is how many rows each edge takes. The height is how many rows the front has above the baseline. The baseline counts the rows from the bottom of the strip up to the baseline, including the bottom edge. Minecraft Ten's strips are 22, 30 and 40.</p>
      <span v-for="key of ['depth', 'baseline', 'height']" v-show="problems[key]" :key="key" class="hint bad">{{ problems[key] }}</span>
    </div>
    <div class="field wide">
      <div class="fonts-head">
        <span class="label">Fonts ({{ picked.length }} picked)</span>
        <button type="button" class="link-button" @click="pickFitting">Pick all that fit</button>
      </div>
      <ul class="fonts">
        <li v-for="item of fits" :key="item.id">
          <label class="font" :class="{ on: picked.includes(item.id), off: item.offset === null && !picked.includes(item.id) }" :title="item.offset === null ? `Won't fit: ${item.problems.join(', and ')}.` : null">
            <input type="checkbox" :checked="picked.includes(item.id)" :disabled="item.offset === null && !picked.includes(item.id)" @change="toggleFont(item.id, $event.target.checked)">
            <img :src="fontThumbnail(fonts, item.id)" alt="" loading="lazy">
            <span class="font-text">
              <span class="ellipsis">{{ item.name }}</span>
              <span class="note">{{ fitNote(item) }}</span>
            </span>
          </label>
        </li>
      </ul>
      <p class="hint">Rows higher or lower are how far the strip sits from the middle of that font's letters.</p>
      <span v-if="problems.fonts && (tried || picked.length)" class="hint bad">{{ problems.fonts }}</span>
    </div>
  </template>
  <label v-if="mode !== 'font'" class="check">
    <input type="checkbox" v-model="stretch">
    <span>Stretch the front between each font's baseline and top, instead of lining it up row by row</span>
  </label>
  <span v-if="problems.stretch" class="hint bad">{{ problems.stretch }}</span>
  <div class="field">
    <span class="label">Border colour</span>
    <ColourPicker v-model="border" />
    <span v-if="problems.border" class="hint bad">{{ problems.border }}</span>
  </div>
  <p v-if="required" class="hint">{{ required }}</p>
  <div v-if="suggestions.length" class="field wide">
    <span class="label">Its height fits</span>
    <div class="suggestions">
      <Button :primary="item === target" v-for="item of suggestions" :key="item" @click="emit('update:target', item)">{{ label(item) }}</Button>
    </div>
  </div>
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
    display: flex;
    align-items: center;
    gap: 10px;
    height: 100%;
    padding: 8px 10px;
    background: var(--card);
    border: 1px solid transparent;
    cursor: pointer;
    user-select: none;
  }

  .font:not(.off, .on):hover {
    background: var(--card-hover);
  }

  .font.on {
    background: var(--accent-soft);
    border-color: var(--accent);
  }

  .font.off {
    cursor: not-allowed;
    opacity: 0.45;
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
    display: flex;
    flex-direction: column;
    min-width: 0;
    font-size: var(--font-md);
  }

  .note {
    font-size: var(--font-xs);
    color: var(--faint);
  }

  .suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .suggestions button {
    user-select: none;
  }
</style>
