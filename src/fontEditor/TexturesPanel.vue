<script setup>
  import { computed, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch } from "vue"
  import Badge from "../components/Badge.vue"
  import Button from "../components/Button.vue"
  import Field from "../components/Field.vue"
  import Icon from "../components/Icon.vue"
  import LiveTitle from "../components/LiveTitle.vue"
  import { image, stripRange } from "../lib/assets.js"
  import { loadFontList, stripsOf } from "../lib/font.js"
  import { loadStats, usage } from "../lib/stats.js"
  import { parsedSheet, stripProblems } from "../lib/fontEditor.js"
  import { titleCase } from "../lib/names.js"
  import { centredOffset, stripFolder, stripUse } from "../lib/strips.js"
  import Notice from "../components/Notice.vue"
  import NumberInput from "../components/NumberInput.vue"
  import Tile from "../components/Tile.vue"
  import TileGrid from "../components/TileGrid.vue"
  import { editorLine, useServedFont } from "./editorLine.js"
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
  const { entry, settled } = useServedFont("textures", () => chosenSet.value ? { font: font.value, strip: stripItem(chosenSet.value, chosenOffset(chosenSet.value)) } : null)
  const lines = computed(() => entry.value && text.value.trim() ? [editorLine(entry.value, text.value, { texture: chosenTexture.value, variant: chosenVariant.value })] : [])

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
            <span v-tooltip="'0 centres your letters on the strips, higher moves them up, lower moves them down'">Offset</span>
            <NumberInput :value="chosenOffset(set.id)" :min="fitting[set.id][0]" :max="fitting[set.id].at(-1)" v-tooltip="`Your letters fit from ${fitting[set.id][0]} to ${fitting[set.id].at(-1)}`" :aria-label="`Offset for ${titleCase(set.id)}`" @input="setOffset(set.id, $event)" @change="setOffset(set.id, $event)" />
          </template>
          <Button v-if="used(set.id)" @click.stop="toggle(set.id)">Stop using</Button>
          <Button :primary="fits(set.id)" v-else :disabled="!fits(set.id)" @click.stop="toggle(set.id)">Use</Button>
        </div>
      </div>
    </section>

    <section v-if="chosen" class="flow">
      <h3>Try {{ titleCase(chosen.id) }}</h3>
      <p class="hint">{{ used(chosen.id) ? "Your font uses these strips." : "Your font doesn't use these strips yet, so this is only a test." }}</p>
      <Field label="Text"><input v-model="text" type="text" aria-label="Test text"></Field>
      <LiveTitle class="view" :lines="lines" :fonts="[entry]" message="Nothing to show yet. Draw the characters in your text." @settled="settled" />
      <TileGrid :min="120">
        <Tile v-for="item of textures" :key="item.id" :label="item.name" :image="thumbs[item.id]" :selected="chosenTexture === item.id" :faded="!fits(chosen.id)" @pick="chosenTexture = item.id" />
      </TileGrid>
      <template v-if="variants.length">
        <h3>Variants</h3>
        <TileGrid :min="120">
          <Tile v-for="item of variants" :key="item.image" :label="item.name" :image="thumbs[item.image]" :selected="chosenVariant === item.id" :faded="!fits(chosen.id)" @pick="chosenVariant = item.id" />
        </TileGrid>
      </template>
    </section>
  </div>
</template>

<style scoped>
  .blank {
    align-self: flex-start;
  }

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

  .offset input {
    width: 64px;
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
