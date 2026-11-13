<script setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch } from "vue"
  import Badge from "../components/Badge.vue"
  import Button from "../components/Button.vue"
  import Dropdown from "../components/Dropdown.vue"
  import Field from "../components/Field.vue"
  import LiveTitle from "../components/LiveTitle.vue"
  import Notice from "../components/Notice.vue"
  import NumberInput from "../components/NumberInput.vue"
  import Tile from "../components/Tile.vue"
  import TileGrid from "../components/TileGrid.vue"
  import { image, stripRange } from "../lib/assets.js"
  import { loadFontList, stripsOf } from "../lib/font.js"
  import { parsedSheet } from "../lib/fontEditor.js"
  import { titleCase } from "../lib/names.js"
  import { loadStats, usage } from "../lib/stats.js"
  import { centredOffset, stripFolder, stripItem, stripTag, stripUse } from "../lib/strips.js"
  import { nearestOffset, setShape, stripFit } from "../lib/submissionKinds/stripFit.js"
  import { editorLine, useServedFont } from "./editorLine.js"
  import { typedNumber } from "./fields.js"
  import { stripThumbnail, thumbnailScene } from "./stripThumbs.js"

  const CHECK_DELAY = 300
  const WORDS = {
    font: { yours: "your font", parts: "your letters", them: "them", fit: "Your letters fit", goes: "its letters go", reaches: "its letters reach", is: "its letters are", empty: "Nothing to show yet. Draw the characters in your text." },
    shape: { yours: "your shape", parts: "your shape", them: "it", fit: "Your shape fits", goes: "it goes", reaches: "it reaches", is: "it is", empty: "Nothing to show yet." }
  }

  const props = defineProps({
    font: { type: Object, required: true },
    strips: { type: Array, required: true },
    subject: { type: String, default: "font" },
    served: { type: String, default: "textures" },
    sample: { type: String, default: null },
    titled: { type: Boolean, default: true },
    preview: { type: Boolean, default: true },
    selected: { type: Object, default: undefined },
    maxSets: { type: Number, default: null },
    maxOffset: { type: Number, default: null }
  })

  const emit = defineEmits(["update:strips", "select"])
  const text = defineModel("text", { type: String, default: "" })

  const sets = shallowRef([])
  const failed = shallowRef([])
  const problems = ref({})
  const fitting = shallowRef({})
  const loadError = ref("")
  const chosenSet = ref(null)
  const chosenTexture = ref(null)
  const chosenVariant = ref(null)
  const thumbs = ref({})
  const trialOffsets = ref({})
  const setUsers = shallowRef(new Map())
  let checkTimer = null
  let thumbsToken = 0

  const words = computed(() => WORDS[props.subject])
  const shown = computed(() => props.sample ?? text.value)
  const chosen = computed(() => sets.value.find(set => set.id === chosenSet.value) ?? null)
  const textures = computed(() => {
    if (!chosen.value) return []
    const users = setUsers.value.get(chosen.value.id) ?? []
    const items = Object.entries(chosen.value.textures).map(([id, entry]) => ({ id, name: entry.name ?? titleCase(id), uses: usage(users.map(user => `${user}.${id}`)) }))
    return items.sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name))
  })
  const uses = computed(() => props.strips.map(stripUse))
  const layerCount = computed(() => props.subject === "font" ? parsedSheet(toRaw(props.font), 0).layers?.length ?? 1 : 1)
  const layerOptions = computed(() => [{ value: null, label: "All layers" }].concat(Array.from({ length: layerCount.value }, (_, index) => ({ value: index + 1, label: `Layer ${index + 1}` }))))
  const missing = computed(() => failed.value.filter(item => used(item.id)))
  const full = computed(() => props.maxSets !== null && uses.value.length >= props.maxSets)
  const variants = computed(() => {
    const entry = chosen.value?.textures[chosenTexture.value]
    if (!entry?.variants) return []
    return [{ id: null, image: chosenTexture.value, name: entry.name ?? titleCase(chosenTexture.value) }].concat(Object.entries(entry.variants).map(([id, variant]) => ({ id, image: id, name: variant.name ?? titleCase(id) })))
  })
  const { entry, settled } = useServedFont(props.served, () => props.preview && chosenSet.value ? { font: props.font, strip: stripItem(chosenSet.value, chosenOffset(chosenSet.value), layerOf(chosenSet.value)) } : null)
  const lines = computed(() => entry.value && shown.value.trim() ? [editorLine(entry.value, shown.value, { texture: chosenTexture.value, variant: chosenVariant.value, layer: chosenSet.value && layerOf(chosenSet.value) ? layerOf(chosenSet.value) - 1 : null, layers: layerCount.value })] : [])

  function used(id) {
    return uses.value.some(use => use.id === id)
  }

  function chosenOffset(id) {
    if (used(id)) return uses.value.find(use => use.id === id).offset
    const wanted = trialOffsets.value[id] ?? 0
    return nearestFitting(id, wanted) ?? wanted
  }

  function layerOf(id) {
    const layer = uses.value.find(use => use.id === id)?.layer ?? null
    return layer && layer <= layerCount.value ? layer : null
  }

  function setLayer(id, layer) {
    emit("update:strips", uses.value.map(use => stripItem(use.id, use.offset, use.id === id ? layer : use.layer)), `strips.${id}`)
  }

  function nearestFitting(id, wanted) {
    return fitting.value[id] ? nearestOffset(fitting.value[id], wanted) : null
  }

  function bounds(id) {
    const { range, offsets } = fitting.value[id]
    const { low, high } = offsets ? { low: offsets[0], high: offsets.at(-1) } : range
    const limit = props.maxOffset ?? Infinity
    return { low: Math.max(low, -limit), high: Number.isFinite(Math.min(high, limit)) ? Math.min(high, limit) : null }
  }

  function boundsNote(id) {
    const { low, high } = bounds(id)
    return high === null ? `${words.value.fit} from ${low} up` : `${words.value.fit} from ${low} to ${high}`
  }

  function setOffset(id, event) {
    const typed = typedNumber(event, chosenOffset(id), Number.isInteger)
    if (typed === null) return
    const value = nearestFitting(id, typed)
    if (value === null || (event.type === "input" && value !== typed) || Math.abs(value) > (props.maxOffset ?? Infinity)) return
    event.target.value = value
    if (used(id)) emit("update:strips", uses.value.map(use => stripItem(use.id, use.id === id ? value : use.offset, use.layer)), `strips.${id}`)
    else {
      trialOffsets.value = { ...trialOffsets.value, [id]: value }
      scheduleCheck()
    }
    if (id === chosenSet.value) nextTick(announce)
  }

  function announce() {
    emit("select", chosenTexture.value ? { strip: stripItem(chosenSet.value, chosenOffset(chosenSet.value), layerOf(chosenSet.value)), texture: chosenTexture.value, variant: chosenVariant.value } : null)
  }

  function pickTexture(id) {
    chosenTexture.value = id
    chosenVariant.value = null
    announce()
  }

  function pickVariant(id) {
    chosenVariant.value = id
    announce()
  }

  async function drawThumbs() {
    const set = chosen.value
    if (!set) return
    const token = ++thumbsToken
    const layer = layerOf(set.id)
    const scene = thumbnailScene(toRaw(props.font), null, props.sample ?? undefined, layer ? layer - 1 : null)
    if (!scene) {
      thumbs.value = {}
      return
    }
    const drawn = {}
    const tag = stripTag(set, chosenOffset(set.id))
    for (const [id, data] of Object.entries(set.textures)) {
      for (const [name, variant] of [[id, {}]].concat(Object.entries(data.variants ?? {}))) {
        const strip = await image(`${stripFolder(set.id)}/textures/${name}.png`)
        if (token !== thumbsToken) return
        drawn[name] = stripThumbnail(scene, { ...data, ...variant, ...tag }, strip)
      }
      thumbs.value = { ...drawn }
    }
  }

  function fits(id) {
    return problems.value[id]?.length === 0
  }

  function canFit(id) {
    return nearestFitting(id, 0) !== null
  }

  function statusOf(id) {
    return fits(id) ? { kind: "good", label: "Compatible" } : { kind: "bad", label: "Won't fit" }
  }

  async function loadSet(id) {
    const folder = stripFolder(id)
    const response = await fetch(`${folder}/textures.json`)
    if (!response.ok) throw new Error(`there are no strips called ${id}`)
    const set = await response.json()
    const shape = setShape(id, set)
    const heights = shape.height ? [] : await Promise.all(shape.names.map(async name => (await image(`${folder}/textures/${name}.png`)).height))
    return { ...set, id, shape, heights }
  }

  function fitOf(set, measure, offset) {
    return stripFit(set.shape, measure, offset, { stretched: set.shape.stretched, heights: set.heights })
  }

  function problemText(code, set, { range, depth, capHeight }, offset) {
    const shift = centredOffset(set.height, capHeight) + offset
    if (code === "depth") return `its depth of ${depth} is over the strips' maximum of ${set.depth}`
    if (code === "below") return `${words.value.goes} ${-range.bottom} below the baseline, and the strips only cover ${set.baseline - set.depth + shift}`
    if (code === "above") return `${words.value.reaches} ${range.top + shift} above the strips' baseline, and the strips only go up to ${set.height}`
    return `${words.value.is} ${range.top} tall above the baseline${shift ? ` with an offset of ${shift}` : ""}, which doesn't line up with the strips`
  }

  function check() {
    const { list: cells, capHeight } = parsedSheet(toRaw(props.font), 0)
    const measure = { range: stripRange({ cells, capHeight }), capHeight, depth: props.font.depth }
    fitting.value = Object.fromEntries(sets.value.map(set => [set.id, fitOf(set, measure, 0)]))
    problems.value = Object.fromEntries(sets.value.map(set => [set.id, fitOf(set, measure, chosenOffset(set.id)).problems.map(code => problemText(code, set.shape, measure, chosenOffset(set.id)))]))
    if (!chosenSet.value && sets.value.length) choose((sets.value.find(set => fits(set.id)) ?? sets.value[0]).id)
    drawThumbs()
  }

  function scheduleCheck() {
    clearTimeout(checkTimer)
    checkTimer = setTimeout(check, CHECK_DELAY)
  }

  function choose(id) {
    if (chosenSet.value === id) return
    chosenSet.value = id
    chosenTexture.value = props.preview ? Object.keys(sets.value.find(set => set.id === id).textures)[0] : null
    chosenVariant.value = null
  }

  function follow(picked) {
    if (picked === undefined) return
    const set = picked && sets.value.find(item => item.id === stripUse(picked.strip).id)
    if (set) chosenSet.value = set.id
    chosenTexture.value = set ? picked.texture : null
    chosenVariant.value = set ? picked.variant ?? null : null
  }

  function toggle(id) {
    const offset = chosenOffset(id)
    if (used(id)) trialOffsets.value = { ...trialOffsets.value, [id]: offset }
    emit("update:strips", used(id) ? props.strips.filter(item => stripUse(item).id !== id) : props.strips.concat(stripItem(id, offset)))
  }

  onMounted(async () => {
    loadStats().catch(console.error)
    try {
      const fonts = await loadFontList()
      const users = new Map()
      for (const item of fonts) {
        for (const strip of stripsOf(item, fonts)) {
          const { id } = stripUse(strip)
          users.set(id, (users.get(id) ?? []).concat(item.id))
        }
      }
      setUsers.value = users
      const published = Array.from(new Set(fonts.flatMap(item => item.strips ?? []).map(item => stripUse(item).id)))
      const own = uses.value.map(use => use.id).filter(id => !published.includes(id))
      const [shared, extra] = await Promise.all([Promise.all(published.map(loadSet)), Promise.all(own.map(id => loadSet(id).catch(err => ({ id, error: err.message }))))])
      const loaded = shared.concat(extra).sort((a, b) => a.id < b.id ? -1 : 1)
      sets.value = loaded.filter(set => !set.error)
      failed.value = loaded.filter(set => set.error)
      check()
      follow(props.selected)
    } catch (err) {
      loadError.value = err.message
    }
  })

  onBeforeUnmount(() => clearTimeout(checkTimer))

  watch(() => [props.font, props.strips], scheduleCheck)
  watch(() => props.selected, follow)
  watch(chosenSet, drawThumbs)
  watch(() => chosenSet.value && layerOf(chosenSet.value), drawThumbs)
</script>

<template>
  <section class="flow">
    <h3 v-if="titled">Shared strips</h3>
    <p class="hint">Strip textures that several fonts share. A set works with {{ words.yours }} when {{ subject === "shape" ? "its height and depth fit" : "its letters and depth fit" }} the strips.</p>
    <Notice v-if="loadError">Couldn't load the strip sets: {{ loadError }}</Notice>
    <div v-for="set of sets" :key="set.id" class="set card card-row" :class="{ selected: chosenSet === set.id }" tabindex="0" @click="choose(set.id)" @keydown.enter.self="choose(set.id)">
      <div class="set-text">
        <span class="set-name">{{ titleCase(set.id) }}</span>
        <Badge v-if="problems[set.id]" :tone="statusOf(set.id).kind">{{ statusOf(set.id).label }}</Badge>
        <small v-if="problems[set.id]?.length">{{ problems[set.id].join(", ") }}</small>
        <small v-else>{{ Object.keys(set.textures).length }} textures</small>
      </div>
      <div class="input-row offset" @click.stop>
        <template v-if="canFit(set.id)">
          <span v-tooltip="`0 centres ${words.parts} on the strips, higher moves ${words.them} up, lower moves ${words.them} down`">Offset</span>
          <NumberInput :value="chosenOffset(set.id)" :min="bounds(set.id).low" :max="bounds(set.id).high" v-tooltip="boundsNote(set.id)" :aria-label="`Offset for ${titleCase(set.id)}`" @input="setOffset(set.id, $event)" @change="setOffset(set.id, $event)" />
        </template>
        <Dropdown v-if="used(set.id) && layerCount > 1" class="layer" :options="layerOptions" :model-value="layerOf(set.id)" v-tooltip="'Which layers of the font get these strips'" :aria-label="`Layers for ${titleCase(set.id)}`" @update:model-value="setLayer(set.id, $event)" />
        <Button v-if="used(set.id)" @click.stop="toggle(set.id)">Stop using</Button>
        <Button :primary="fits(set.id)" v-else :disabled="!fits(set.id) || full" @click.stop="toggle(set.id)">Use</Button>
      </div>
    </div>
    <div v-for="item of missing" :key="item.id" class="card card-row">
      <div class="set-text">
        <span class="set-name">{{ titleCase(item.id) }}</span>
        <Badge tone="bad">Missing</Badge>
        <small>{{ words.yours[0].toUpperCase() }}{{ words.yours.slice(1) }} uses these strips, and they couldn't be loaded: {{ item.error }}</small>
      </div>
      <Button @click="toggle(item.id)">Stop using</Button>
    </div>
  </section>

  <section v-if="chosen" class="flow">
    <h3>Try {{ titleCase(chosen.id) }}</h3>
    <p class="hint">{{ words.yours[0].toUpperCase() }}{{ words.yours.slice(1) }} {{ used(chosen.id) ? "uses these strips." : "doesn't use these strips yet, so this is only a test." }}<template v-if="!preview"> Pick a texture to see it on the preview.</template></p>
    <template v-if="preview">
      <Field v-if="sample === null" label="Text"><input v-model="text" type="text" aria-label="Test text"></Field>
      <LiveTitle class="view" :lines="lines" :fonts="[entry]" :message="words.empty" @settled="settled" />
    </template>
    <TileGrid :min="120">
      <Tile v-for="item of textures" :key="item.id" :label="item.name" :image="thumbs[item.id]" :selected="chosenTexture === item.id" :faded="!fits(chosen.id)" @pick="pickTexture(item.id)" />
    </TileGrid>
    <template v-if="variants.length">
      <h3>Variants</h3>
      <TileGrid :min="120">
        <Tile v-for="item of variants" :key="item.image" :label="item.name" :image="thumbs[item.image]" :selected="chosenVariant === item.id" :faded="!fits(chosen.id)" @pick="pickVariant(item.id)" />
      </TileGrid>
    </template>
  </section>
</template>

<style scoped>
  .set {
    user-select: none;
  }

  .set-text {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
    min-width: 0;
  }

  .set-name {
    font-size: var(--font-md);
    font-weight: 600;
  }

  .set-text small {
    flex-basis: 100%;
    font-size: var(--font-sm);
    color: var(--faint);
  }

  .offset {
    font-size: var(--font-sm);
    color: var(--muted);
    cursor: default;
  }

  .view {
    height: 260px;
    aspect-ratio: auto;
  }

  @media (max-width: 520px) {
    .set {
      flex-wrap: wrap;
    }

    .offset {
      flex: 1 1 100%;
      justify-content: flex-end;
    }

    .view {
      height: 180px;
    }
  }
</style>
