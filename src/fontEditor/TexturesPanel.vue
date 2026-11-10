<script setup>
  import { computed, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch } from "vue"
  import Button from "../components/Button.vue"
  import Icon from "../components/Icon.vue"
  import { image, stripRange } from "../lib/assets.js"
  import { loadFontList, stripsOf } from "../lib/font.js"
  import { loadStats, usage } from "../lib/stats.js"
  import { parsedSheet, stripProblems } from "../lib/fontEditor.js"
  import { titleCase } from "../lib/names.js"
  import { centredOffset, stripFolder, stripUse } from "../lib/strips.js"
  import NumberInput from "../components/NumberInput.vue"
  import RenderView from "./RenderView.vue"
  import { stripThumbnail, thumbnailScene } from "./stripThumbs.js"
  import { downloadFlatTexture, font, update } from "./store.js"

  const CHECK_DELAY = 300

  const sets = shallowRef([])
  const problems = ref({})
  const fitting = ref({})
  const loadError = ref("")
  const chosenSet = ref(null)
  const chosenTexture = ref(null)
  const chosenVariant = ref(null)
  const text = ref("minecraft")
  const thumbs = ref({})
  const trialOffsets = ref({})
  const setUsers = shallowRef(new Map())
  let checkTimer = null
  let thumbsToken = 0

  const chosen = computed(() => sets.value.find(set => set.id === chosenSet.value) ?? null)
  const textures = computed(() => {
    if (!chosen.value) return []
    const users = setUsers.value.get(chosen.value.id) ?? []
    const items = Object.entries(chosen.value.textures).map(([id, entry]) => ({ id, name: entry.name ?? titleCase(id), uses: usage(users.map(user => `${user}.${id}`)) }))
    return items.sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name))
  })
  const uses = computed(() => font.value.strips.map(stripUse))
  const variants = computed(() => {
    const entry = chosen.value?.textures[chosenTexture.value]
    if (!entry?.variants) return []
    return [{ id: null, image: chosenTexture.value, name: entry.name ?? titleCase(chosenTexture.value) }].concat(Object.entries(entry.variants).map(([id, variant]) => ({ id, image: id, name: variant.name ?? titleCase(id) })))
  })
  const request = computed(() => chosenSet.value ? { font: toRaw(font.value), text: text.value, slot: "textures", strip: stripItem(chosenSet.value, chosenOffset(chosenSet.value)), texture: chosenTexture.value, variant: chosenVariant.value } : null)

  function used(id) {
    return uses.value.some(use => use.id === id)
  }

  function chosenOffset(id) {
    if (used(id)) return uses.value.find(use => use.id === id).offset
    const wanted = trialOffsets.value[id] ?? 0
    return nearestFitting(id, wanted) ?? wanted
  }

  function offsetOf(id) {
    return centredOffset(sets.value.find(set => set.id === id)?.height, font.value.height * font.value.density) + chosenOffset(id)
  }

  function stripItem(id, offset) {
    return offset ? { id, offset } : id
  }

  function nearestFitting(id, wanted) {
    return (fitting.value[id] ?? []).reduce((best, offset) => best === null || Math.abs(offset - wanted) < Math.abs(best - wanted) ? offset : best, null)
  }

  function setOffset(id, event) {
    const typed = event.target.value === "" ? 0 : event.target.valueAsNumber
    if (!Number.isInteger(typed)) return
    const value = nearestFitting(id, typed)
    if (value === null || (event.type === "input" && value !== typed)) return
    event.target.value = value
    if (used(id)) update({ ...font.value, strips: uses.value.map(use => use.id === id ? stripItem(id, value) : stripItem(use.id, use.offset)) }, `strips.${id}`)
    else {
      trialOffsets.value = { ...trialOffsets.value, [id]: value }
      scheduleCheck()
    }
  }

  async function drawThumbs() {
    const set = chosen.value
    if (!set) return
    const token = ++thumbsToken
    const scene = thumbnailScene(toRaw(font.value))
    if (!scene) {
      thumbs.value = {}
      return
    }
    const drawn = {}
    const tag = { stripSet: set.id, stripDepth: set.depth, stripBaseline: set.baseline ?? set.depth, stripOffset: chosenOffset(set.id), stripHeight: set.height ?? null }
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
    return fitting.value[id]?.length > 0
  }

  function statusOf(id) {
    return fits(id) ? { kind: "good", label: "Compatible" } : { kind: "bad", label: "Won't fit" }
  }

  async function loadSet(id) {
    const folder = stripFolder(id)
    const response = await fetch(`${folder}/textures.json`)
    if (!response.ok) throw new Error(`there are no strips called ${id}`)
    const set = await response.json()
    const first = Object.keys(set.textures)[0]
    const strip = await image(`${folder}/textures/${first}.png`)
    return { ...set, id, stripHeight: strip.height }
  }

  function check() {
    const { list: cells, capHeight } = parsedSheet(toRaw(font.value), 0)
    const range = stripRange({ cells, capHeight })
    fitting.value = Object.fromEntries(sets.value.map(set => [set.id, fittingOffsets(range, set)]))
    problems.value = Object.fromEntries(sets.value.map(set => [set.id, stripProblems(range, font.value.depth, set, set.stripHeight, offsetOf(set.id))]))
    if (!chosenSet.value && sets.value.length) choose((sets.value.find(set => fits(set.id)) ?? sets.value[0]).id)
    drawThumbs()
  }

  function fittingOffsets(range, set) {
    const centred = centredOffset(set.height, font.value.height * font.value.density)
    const reach = set.stripHeight + range.top - range.bottom
    return Array.from({ length: reach * 2 + 1 }, (_, index) => index - reach).filter(offset => !stripProblems(range, font.value.depth, set, set.stripHeight, centred + offset).length)
  }

  function scheduleCheck() {
    clearTimeout(checkTimer)
    checkTimer = setTimeout(check, CHECK_DELAY)
  }

  function choose(id) {
    if (chosenSet.value === id) return
    chosenSet.value = id
    chosenTexture.value = Object.keys(sets.value.find(set => set.id === id).textures)[0]
  }

  function toggle(id) {
    const offset = chosenOffset(id)
    const strips = used(id) ? font.value.strips.filter(item => stripUse(item).id !== id) : font.value.strips.concat(stripItem(id, offset))
    if (used(id)) trialOffsets.value = { ...trialOffsets.value, [id]: offset }
    update({ ...font.value, strips })
  }

  onMounted(async () => {
    loadStats().catch(console.error)
    try {
      const fonts = await loadFontList()
      const users = new Map()
      for (const entry of fonts) {
        for (const item of stripsOf(entry, fonts)) {
          const { id } = stripUse(item)
          users.set(id, (users.get(id) ?? []).concat(entry.id))
        }
      }
      setUsers.value = users
      const ids = Array.from(new Set(fonts.flatMap(entry => entry.strips ?? []).concat(font.value.strips).map(item => stripUse(item).id))).sort()
      sets.value = await Promise.all(ids.map(loadSet))
      check()
    } catch (err) {
      loadError.value = err.message
    }
  })

  onBeforeUnmount(() => clearTimeout(checkTimer))

  watch(font, scheduleCheck)
  watch(chosenTexture, () => {
    chosenVariant.value = null
  })
  watch(chosenSet, drawThumbs)
</script>

<template>
  <div class="settings">
    <section class="flow">
      <h3>Your own textures</h3>
      <p class="hint">Textures made for your font alone are painted onto a copy of its letters, like the ones every published font has. They're made outside the font editor, starting from this blank texture.</p>
      <Button class="blank" @click="downloadFlatTexture"><template #icon><Icon name="download" :size="14" /></template>Download a blank texture</Button>
    </section>

    <section class="flow">
      <h3>Shared strips</h3>
      <p class="hint">Strip textures that several fonts share. A set works with your font when its letters and depth fit the strips.</p>
      <p v-if="loadError" class="hint bad">Couldn't load the strip sets: {{ loadError }}</p>
      <div v-for="set of sets" :key="set.id" class="set" :class="{ chosen: chosenSet === set.id }" @click="choose(set.id)">
        <div class="set-text">
          <span class="set-name">{{ titleCase(set.id) }}</span>
          <span v-if="problems[set.id]" class="status" :class="statusOf(set.id).kind">{{ statusOf(set.id).label }}</span>
          <small v-if="problems[set.id]?.length">{{ problems[set.id].join(", ") }}</small>
          <small v-else>{{ Object.keys(set.textures).length }} textures</small>
        </div>
        <div class="input-row offset" @click.stop>
          <template v-if="canFit(set.id)">
            <span title="0 centres your letters on the strips, higher moves them up, lower moves them down">Offset</span>
            <NumberInput :value="chosenOffset(set.id)" :min="fitting[set.id][0]" :max="fitting[set.id].at(-1)" :title="`Your letters fit from ${fitting[set.id][0]} to ${fitting[set.id].at(-1)}`" :aria-label="`Offset for ${titleCase(set.id)}`" @input="setOffset(set.id, $event)" @change="setOffset(set.id, $event)" />
          </template>
          <Button v-if="used(set.id)" @click.stop="toggle(set.id)">Stop using</Button>
          <Button :primary="fits(set.id)" v-else :disabled="!fits(set.id)" @click.stop="toggle(set.id)">Use</Button>
        </div>
      </div>
    </section>

    <section v-if="chosen" class="flow">
      <h3>Try {{ titleCase(chosen.id) }}</h3>
      <p class="hint">{{ used(chosen.id) ? "Your font uses these strips." : "Your font doesn't use these strips yet, so this is only a test." }}</p>
      <label class="field"><span class="label">Text</span><input v-model="text" type="text" aria-label="Test text"></label>
      <RenderView class="view" :request="request" empty="Nothing to show yet. Draw the characters in your text." />
      <div class="textures">
        <button v-for="item of textures" :key="item.id" class="texture" :class="{ active: chosenTexture === item.id, unfit: !fits(chosen.id) }" :title="item.name" @click="chosenTexture = item.id">
          <span class="swatch"><img v-if="thumbs[item.id]" :src="thumbs[item.id]" alt=""></span>
          <span class="texture-name ellipsis">{{ item.name }}</span>
        </button>
      </div>
      <template v-if="variants.length">
        <h3>Variants</h3>
        <div class="textures">
          <button v-for="item of variants" :key="item.image" class="texture" :class="{ active: chosenVariant === item.id, unfit: !fits(chosen.id) }" :title="item.name" @click="chosenVariant = item.id">
            <span class="swatch"><img v-if="thumbs[item.image]" :src="thumbs[item.image]" alt=""></span>
            <span class="texture-name ellipsis">{{ item.name }}</span>
          </button>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
  .blank {
    align-self: flex-start;
  }

  .set {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: var(--card);
    border: 1px solid transparent;
    cursor: pointer;
    user-select: none;
  }

  .set:hover {
    background: var(--card-hover);
  }

  .set.chosen {
    background: var(--accent-soft);
    border-color: var(--accent);
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

  .offset input {
    width: 64px;
  }

  .status {
    padding: 1px 6px;
    font-size: var(--font-xs);
    font-weight: 600;
  }

  .status.good {
    color: var(--accent-text);
    background: var(--accent);
  }

  .status.bad {
    color: #1d0a08;
    background: var(--danger);
  }

  .view {
    height: 260px;
  }

  .textures {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 6px;
  }

  .texture {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    padding: 4px;
    background: var(--card);
    border: 1px solid transparent;
    box-shadow: none;
  }

  .texture:hover {
    background: var(--card-hover);
    filter: none;
  }

  .texture.active {
    background: var(--accent-soft);
    border-color: var(--accent);
  }

  .texture.unfit {
    opacity: 0.45;
  }

  .swatch {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 56px;
  }

  .swatch img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    image-rendering: pixelated;
  }

  .texture-name {
    font-size: var(--font-xs);
    color: var(--muted);
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

    .textures {
      grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    }
  }
</style>
