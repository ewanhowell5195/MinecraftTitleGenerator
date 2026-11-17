<script>
  const layerTab = ref(1)
</script>

<script setup>
  import { computed, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch } from "vue"
  import Badge from "./Badge.vue"
  import Button from "./Button.vue"
  import Field from "./Field.vue"
  import LiveTitle from "./LiveTitle.vue"
  import Notice from "./Notice.vue"
  import Segments from "./Segments.vue"
  import Tile from "./Tile.vue"
  import TileGrid from "./TileGrid.vue"
  import { image } from "../lib/texture/assets.js"
  import { loadFontList, stripsOf } from "../lib/font/font.js"
  import { parsedSheet } from "../lib/font/editor/sheet.js"
  import { titleCase } from "../lib/core/names.js"
  import { loadStats, usage } from "../lib/state/stats.js"
  import { DEFAULT_STRIPS, placedStrips, stripFolder, stripItem, stripPlacements, stripTag, stripUse, withDefaultStrips } from "../lib/font/strips.js"
  import { editorLine, useServedFont } from "../fontEditor/editorLine.js"
  import { stripGuides, stripThumbnail, thumbnailScene } from "../lib/font/stripThumbs.js"

  const DRAW_DELAY = 300
  const VIEWS = [{ value: "2d", label: "2D" }, { value: "3d", label: "3D" }]
  const WORDS = {
    font: { yours: "your font", empty: "Nothing to show yet. Draw the characters in your text." },
    shape: { yours: "your shape", empty: "Nothing to show yet." }
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
    maxSets: { type: Number, default: null }
  })

  const emit = defineEmits(["update:strips", "select"])
  const text = defineModel("text", { type: String, default: "" })

  const sets = shallowRef([])
  const failed = shallowRef([])
  const loadError = ref("")
  const chosenSet = ref(null)
  const chosenTexture = ref(null)
  const chosenVariant = ref(null)
  const thumbs = ref({})
  const thumbUnit = ref(null)
  const setUsers = shallowRef(new Map())
  const view = ref("2d")
  const flat = shallowRef(null)
  let drawTimer = null
  let thumbsToken = 0
  let flatToken = 0

  const words = computed(() => WORDS[props.subject])
  const shown = computed(() => props.sample ?? text.value)
  const chosen = computed(() => sets.value.find(set => set.id === chosenSet.value) ?? null)
  const textures = computed(() => {
    if (!chosen.value) return []
    const users = setUsers.value.get(chosen.value.id) ?? []
    const items = Object.entries(chosen.value.textures).map(([id, entry]) => ({ id, name: entry.name ?? titleCase(id), uses: usage(users.map(user => `${user}.${id}`)), badge: entry.variants ? Object.keys(entry.variants).length + 1 : 0 }))
    return items.sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name))
  })
  const uses = computed(() => props.strips.map(stripUse))
  const layerCount = computed(() => props.subject === "font" ? parsedSheet(toRaw(props.font), 0).layers?.length ?? 1 : 1)
  const layered = computed(() => layerCount.value > 1)
  const layerTabs = computed(() => Array.from({ length: layerCount.value }, (_, index) => ({ value: index + 1, label: `Layer ${index + 1}` })))
  const tab = layerTab
  const missing = computed(() => failed.value.filter(item => used(item.id)))
  const full = computed(() => props.maxSets !== null && new Set(uses.value.map(use => use.id)).size >= props.maxSets)
  const worst = computed(() => {
    const { list, capHeight } = parsedSheet(toRaw(props.font), 0)
    const cells = list.filter(cell => cell.width)
    const top = Math.max(capHeight, ...cells.map(cell => cell.top))
    const bottom = Math.min(0, ...cells.map(cell => cell.bottom))
    return Array.from(new Set(cells.filter(cell => (top > capHeight && cell.top === top) || (bottom < 0 && cell.bottom === bottom)).map(cell => cell.char))).join("")
  })
  const variants = computed(() => {
    const entry = chosen.value?.textures[chosenTexture.value]
    if (!entry?.variants) return []
    return [{ id: null, image: chosenTexture.value, name: entry.name ?? titleCase(chosenTexture.value) }].concat(Object.entries(entry.variants).map(([id, variant]) => ({ id, image: id, name: variant.name ?? titleCase(id) })))
  })
  const { entry, settled } = useServedFont(props.served, () => props.preview && view.value === "3d" && chosenSet.value ? { font: props.font, strip: stripItem(chosenSet.value, layerOf()) } : null)
  const lines = computed(() => entry.value && shown.value.trim() ? [editorLine(entry.value, shown.value, { texture: chosenTexture.value, variant: chosenVariant.value, layer: chosenSet.value && layerOf() ? layerOf() - 1 : null, layers: layerCount.value })] : [])

  function used(id) {
    return id === DEFAULT_STRIPS || uses.value.some(use => use.id === id)
  }

  function here() {
    return layered.value ? tab.value : 1
  }

  function placements(id) {
    return stripPlacements(props.strips, id, layerCount.value)
  }

  function usedHere(id) {
    return placements(id).has(here())
  }

  function layerOf() {
    return layered.value ? tab.value : null
  }

  function toggle(id) {
    const placed = placements(id)
    if (placed.has(here())) placed.delete(here())
    else placed.add(here())
    emit("update:strips", placedStrips(props.strips, id, placed, layerCount.value), `strips.${id}`)
  }

  function elsewhere(id) {
    return Array.from(placements(id)).filter(layer => layer !== here())
  }

  function announce() {
    emit("select", chosenTexture.value ? { strip: stripItem(chosenSet.value, layerOf()), texture: chosenTexture.value, variant: chosenVariant.value } : null)
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

  function tagOf(set) {
    const layer = layerOf()
    return { ...stripTag(set), stripLayer: layer ? layer - 1 : null }
  }

  async function drawThumbs() {
    const set = chosen.value
    if (!set) return
    const token = ++thumbsToken
    const layer = layerOf()
    const scene = thumbnailScene(toRaw(props.font), null, props.sample ?? undefined, layer ? layer - 1 : null)
    if (!scene) {
      thumbs.value = {}
      return
    }
    const drawn = {}
    thumbUnit.value = scene.frame.height
    for (const [id, data] of Object.entries(set.textures)) {
      for (const [name, variant] of [[id, {}]].concat(Object.entries(data.variants ?? {}))) {
        const strip = await image(`${stripFolder(set.id)}/textures/${name}.png`)
        if (token !== thumbsToken) return
        drawn[name] = stripThumbnail(scene, { ...data, ...variant, ...tagOf(set) }, strip)
      }
      thumbs.value = { ...drawn }
    }
  }

  function scheduleThumbs() {
    clearTimeout(drawTimer)
    drawTimer = setTimeout(drawThumbs, DRAW_DELAY)
  }

  async function drawFlat() {
    const token = ++flatToken
    const set = chosen.value
    const data = set?.textures[chosenTexture.value]
    const layer = layerOf()
    const scene = data && props.preview && view.value === "2d" && shown.value.trim() ? thumbnailScene(toRaw(props.font), null, shown.value, layer ? layer - 1 : null) : null
    if (!scene) {
      flat.value = null
      return
    }
    const entry = { ...data, ...data.variants?.[chosenVariant.value], ...tagOf(set) }
    const strip = await image(`${stripFolder(set.id)}/textures/${chosenVariant.value ?? chosenTexture.value}.png`)
    if (token !== flatToken) return
    const { top, bottom } = stripGuides(scene, entry, strip)
    flat.value = { url: stripThumbnail(scene, entry, strip), ratio: scene.frame.width / scene.frame.height, guides: [top, bottom].filter(at => at > 0 && at < 1) }
  }

  async function loadSet(id) {
    const response = await fetch(`${stripFolder(id)}/textures.json`)
    if (!response.ok) throw new Error(`there are no strips called ${id}`)
    return { ...await response.json(), id }
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
      const published = Array.from(new Set(fonts.flatMap(item => withDefaultStrips(item.strips)).map(item => stripUse(item).id)))
      const own = uses.value.map(use => use.id).filter(id => !published.includes(id))
      const [shared, extra] = await Promise.all([Promise.all(published.map(loadSet)), Promise.all(own.map(id => loadSet(id).catch(err => ({ id, error: err.message }))))])
      const loaded = shared.concat(extra).sort((a, b) => a.id < b.id ? -1 : 1)
      sets.value = loaded.filter(set => !set.error)
      failed.value = loaded.filter(set => set.error)
      if (sets.value.length) choose((sets.value.find(set => set.id !== DEFAULT_STRIPS) ?? sets.value[0]).id)
      follow(props.selected)
    } catch (err) {
      loadError.value = err.message
    }
  })

  onBeforeUnmount(() => clearTimeout(drawTimer))

  watch(() => props.font, scheduleThumbs)
  watch(() => props.selected, follow)
  watch(chosenSet, drawThumbs)
  watch(() => [chosen.value, chosenTexture.value, chosenVariant.value, shown.value, view.value, props.font, tab.value], drawFlat)
  watch(layerCount, count => {
    if (tab.value > count) tab.value = 1
  }, { immediate: true })
  watch(tab, () => {
    drawThumbs()
    announce()
  })
</script>

<template>
  <section class="flow">
    <h3 v-if="titled">Shared strips</h3>
    <p class="hint">Strip textures that several fonts share. Each strip lines up with the top, middle or base of {{ words.yours }}.</p>
    <Notice v-if="loadError">Couldn't load the strip sets: {{ loadError }}</Notice>
    <Segments v-if="layered" v-model="tab" :options="layerTabs" />
    <div v-for="set of sets" :key="set.id" class="set card card-row" :class="{ selected: chosenSet === set.id }" tabindex="0" @click="choose(set.id)" @keydown.enter.self="choose(set.id)">
      <div class="set-text">
        <span class="set-name">{{ titleCase(set.id) }}</span>
        <small>{{ Object.keys(set.textures).length }} textures</small>
        <small v-if="layered && elsewhere(set.id).length">Also used on layer {{ elsewhere(set.id).join(" and ") }}</small>
      </div>
      <div class="input-row actions" @click.stop>
        <span v-if="set.id === DEFAULT_STRIPS">Always used</span>
        <Button v-else-if="usedHere(set.id)" @click.stop="toggle(set.id)">Stop using</Button>
        <Button v-else primary :disabled="full && !used(set.id)" @click.stop="toggle(set.id)">Use</Button>
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
      <Field v-if="sample === null" label="Text">
        <div class="input-row">
          <input v-model="text" type="text" aria-label="Test text">
          <Button v-if="worst" v-tooltip="`The characters that reach furthest above the topline or below the baseline: ${worst}`" @click="text = worst">Worst characters</Button>
          <Segments v-model="view" :options="VIEWS" />
        </div>
      </Field>
      <Segments v-else v-model="view" :options="VIEWS" />
      <div v-if="view === '2d'" class="view flat">
        <div v-if="flat" class="flat-image" :style="{ '--ratio': flat.ratio }">
          <img :src="flat.url" alt="">
          <div v-for="at of flat.guides" :key="at" class="guide" :style="{ top: `${at * 100}%` }"></div>
        </div>
        <p v-else class="hint">{{ words.empty }}</p>
      </div>
      <LiveTitle v-else class="view" :lines="lines" :fonts="[entry]" :message="words.empty" @settled="settled" />
      <p v-if="view === '2d' && flat?.guides.length" class="hint">The dashed lines mark where the strip's own rows end. Past them, letters repeat its top or bottom row.</p>
    </template>
    <TileGrid :min="120">
      <Tile v-for="item of textures" :key="item.id" :label="item.name" :image="thumbs[item.id]" :unit="thumbUnit" :badge="item.badge" :selected="chosenTexture === item.id" @pick="pickTexture(item.id)" />
    </TileGrid>
    <template v-if="variants.length">
      <h3>Variants</h3>
      <TileGrid :min="120">
        <Tile v-for="item of variants" :key="item.image" :label="item.name" :image="thumbs[item.image]" :unit="thumbUnit" :selected="chosenVariant === item.id" @pick="pickVariant(item.id)" />
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

  .actions {
    font-size: var(--font-sm);
    color: var(--muted);
    cursor: default;
  }

  .view {
    height: 260px;
    aspect-ratio: auto;
  }

  .flat {
    display: grid;
    place-items: center;
    padding: 16px;
    overflow: hidden;
    container-type: size;
    background: var(--checker);
  }

  .flat-image {
    position: relative;
    width: min(100cqw, calc(100cqh * var(--ratio)));
    aspect-ratio: var(--ratio);
  }

  .flat-image img {
    display: block;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }

  .guide {
    position: absolute;
    left: -100vw;
    right: -100vw;
    border-top: 1px dashed rgba(255, 255, 255, 0.85);
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.6);
    pointer-events: none;
  }

  @media (max-width: 520px) {
    .set {
      flex-wrap: wrap;
    }

    .actions {
      flex: 1 1 100%;
      justify-content: flex-end;
    }

    .view {
      height: 180px;
    }
  }
</style>
