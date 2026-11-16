<script>
  const publishedFonts = new Map()
</script>

<script setup>
  import { computed, ref, watch } from "vue"
  import { fontCredit } from "../../lib/font/credits.js"
  import { PREVIEW_DETAIL, customFontEntry, customFontKind, customThumbnail } from "../../lib/font/customFonts.js"
  import { DEFAULT_FONT } from "../../lib/settings/defaults.js"
  import { fullName, loadImage } from "../../lib/font/font.js"
  import { usePanel } from "./panel.js"
  import { leastRows, usePickFloor, variantRows } from "./pickFloor.js"
  import { library } from "../../lib/state/scene.js"
  import { isCustomFont } from "../../lib/settings/settings.js"
  import { popular } from "../../lib/state/stats.js"
  import { SEARCH_ABOVE, fontThumbnail, readDataUrl, takeFile } from "../../lib/state/ui.js"
  import { usedFonts } from "./uploads.js"
  import Button from "../../components/Button.vue"
  import Field from "../../components/Field.vue"
  import Notice from "../../components/Notice.vue"
  import NumberInput from "../../components/NumberInput.vue"
  import Panel from "../Panel.vue"
  import Dialog from "../../components/Dialog.vue"
  import Segments from "../../components/Segments.vue"
  import Tile from "../../components/Tile.vue"
  import TileGrid from "../../components/TileGrid.vue"
  import UploadField from "../../components/UploadField.vue"
  import UploadReuse from "../../components/UploadReuse.vue"
  import Toggle from "../../components/Toggle.vue"

  const TABS = [{ value: "published", label: "All fonts" }, { value: "custom", label: "Custom" }]
  const IMPORT_HEIGHT = 40
  const BUILDS = [{ value: false, label: "Cubes" }, { value: true, label: "Mesh" }]

  const info = ref(false)
  const { object, font, modified, reset } = usePanel("font")
  const tab = ref(isCustomFont(object.value.font) ? "custom" : "published")
  const customName = ref("")
  const customImage = ref(null)
  const customUnit = ref(null)
  const customError = ref("")
  const loading = ref(false)
  const usingCustom = computed(() => isCustomFont(object.value.font) && !!object.value.customFont)
  const imported = computed(() => object.value.customFont && object.value.customFont.kind !== "json")
  const squares = computed(() => object.value.customFont?.kind === "outline" && !object.value.customFont.mesh)
  const terminators = usePanel("terminators")
  const creeper = usePanel("creeper")
  const hasTerminators = computed(() => font.value && font.value.glyphs["┫"] && font.value.glyphs["┣"] && !font.value.forcedTerminators)
  const hasCreeper = computed(() => !!font.value?.glyphs["\u{1F633}"])
  const entry = computed(() => library.fonts.find(item => item.id === object.value.font))
  const baseId = computed(() => entry.value?.variant ?? object.value.font)
  const baseFonts = computed(() => popular(library.fonts.filter(item => !item.variant), item => item.id, item => item.name, [DEFAULT_FONT]))
  const variants = computed(() => popular(library.fonts.filter(item => item.variant === baseId.value), item => item.id, item => item.name))
  const search = ref("")
  const { picker, floor } = usePickFloor(() => [tab.value, variants.value.length, search.value])
  const searchable = computed(() => baseFonts.value.length > SEARCH_ABOVE)
  const searching = computed(() => searchable.value && !!search.value.trim())
  const foundFonts = computed(() => {
    if (!searching.value) return []
    const term = search.value.trim().toLowerCase()
    return baseFonts.value.flatMap(base => [base].concat(popular(library.fonts.filter(item => item.variant === base.id), item => item.id, item => item.name))).filter(item => [item.id, fullName(item, library.fonts)].some(text => text.toLowerCase().includes(term)))
  })

  const characters = computed(() => {
    if (!font.value) return ""
    const rank = char => /[a-z]/i.test(char) ? 0 : /\d/.test(char) ? 1 : 2
    return Object.keys(font.value.glyphs).filter(char => !/[\u{1F629}\u{1F633}]/u.test(char)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).join(" ")
  })

  function entryThumbnail(entry) {
    const detailed = customThumbnail(entry.id, "preview")
    return { image: detailed ?? customThumbnail(entry.id, "flat"), detailed: !!detailed }
  }

  async function applyCustom(source) {
    const target = object.value
    loading.value = true
    customError.value = ""
    try {
      const entry = await customFontEntry(source)
      target.customFont = source
      target.font = entry.id
    } catch (err) {
      customError.value = `Couldn't use this font: ${err.message}`
    } finally {
      loading.value = false
    }
  }

  function chooseTab(value) {
    tab.value = value
    search.value = ""
    if (value === "custom") {
      if (!isCustomFont(object.value.font)) publishedFonts.set(object.value.id, object.value.font)
      if (object.value.customFont && !usingCustom.value) applyCustom(object.value.customFont)
    } else if (isCustomFont(object.value.font)) {
      object.value.font = publishedFonts.get(object.value.id) ?? DEFAULT_FONT
    }
  }

  function clearCustom() {
    customError.value = ""
    Object.assign(object.value, { font: publishedFonts.get(object.value.id) ?? DEFAULT_FONT, customFont: null })
  }

  function upload(event) {
    const file = takeFile(event)
    if (!file) return
    const kind = customFontKind(file.name)
    if (!kind) {
      customError.value = "Choose a .json, .png, .ttf, .otf, .woff or .woff2 file."
      return
    }
    readDataUrl(file, data => applyCustom({ kind, fileName: file.name, data, height: IMPORT_HEIGHT }))
  }

  function changeImport(key, value) {
    if (value === object.value.customFont[key]) return
    applyCustom({ ...object.value.customFont, [key]: value })
  }

  function setSize(event, key, fallback) {
    const value = event.target.valueAsNumber
    if (Number.isInteger(value) && value >= 1) changeImport(key, value)
    else event.target.value = object.value.customFont[key] ?? fallback
  }

  watch(() => object.value.customFont, async (source, _, onCleanup) => {
    let stale = false
    onCleanup(() => (stale = true))
    customName.value = ""
    customImage.value = null
    customUnit.value = null
    if (!source) return
    try {
      const entry = await customFontEntry(source)
      if (stale) return
      customName.value = entry.name
      const { image, detailed } = entryThumbnail(entry)
      const unit = image && (await loadImage(image)).height * (detailed ? 1 : PREVIEW_DETAIL)
      if (stale) return
      customUnit.value = unit
      customImage.value = image
    } catch (err) {
      if (!stale) customError.value = `Couldn't use this font: ${err.message}`
    }
  }, { immediate: true })

  const reusable = ref([])
  const otherFonts = computed(() => usedFonts().filter(item => item.key !== object.value.customFont?.data))
  let reuseToken = 0
  let reuseKeys = null

  watch(otherFonts, async items => {
    if (reuseKeys && items.length === reuseKeys.length && items.every((item, index) => item.key === reuseKeys[index])) return
    reuseKeys = items.map(item => item.key)
    const token = ++reuseToken
    const shown = await Promise.all(items.map(async item => {
      const entry = await customFontEntry(item.value)
      return { ...item, label: entry.name, image: entryThumbnail(entry).image }
    }))
    if (token === reuseToken) reusable.value = shown
  }, { immediate: true })

  watch(() => [object.value.id, isCustomFont(object.value.font)], () => {
    tab.value = isCustomFont(object.value.font) ? "custom" : "published"
    customError.value = ""
  })

  const variantBadges = computed(() => {
    const badges = {}
    for (const item of library.fonts) {
      if (item.variant) badges[item.variant] = (badges[item.variant] ?? 1) + 1
    }
    return badges
  })
</script>

<template>
  <Panel title="Font" :modified="modified" @reset="reset">
    <template #actions>
      <Button ghost icon="info" title="Font info and characters" :disabled="!font" @click="info = true" />
    </template>
    <Dialog v-if="info && font" :title="entry?.name || customName || 'Font'" close-title="Close" wide dismissable @close="info = false">
      <div class="dialog-body">
        <p v-if="font.description">{{ font.description }}</p>
        <span class="label">Characters</span>
        <div class="code">{{ characters }}</div>
      </div>
    </Dialog>
    <Segments v-if="tab === 'custom'" :options="TABS" :model-value="tab" @update:model-value="chooseTab" />
    <template v-if="tab === 'custom'">
      <UploadField accept=".json,.png,.ttf,.otf,.woff,.woff2,application/json,image/png,font/ttf,font/otf,font/woff,font/woff2" :label="loading ? 'Loading...' : object.customFont ? 'Replace font' : 'Choose a font file'" empty="No font uploaded" :disabled="loading" :clearable="!!object.customFont" @change="upload" @clear="clearCustom">
        <template v-if="object.customFont" #preview>
          <div class="custom-font">
            <div class="preview picture"><img v-if="customImage" :src="customImage" alt="" :style="customUnit ? { height: `${customUnit}px` } : null"></div>
            <span class="name ellipsis">{{ customName || object.customFont.fileName }}</span>
          </div>
        </template>
      </UploadField>
      <Notice v-if="customError">{{ customError }}</Notice>
      <p v-else class="hint">A JSON from the font editor, a Minecraft ascii.png, or a .ttf, .otf, .woff or .woff2 font.</p>
      <template v-if="imported && usingCustom">
        <template v-if="object.customFont.kind === 'outline'">
          <Segments label="Build from" :options="BUILDS" :model-value="!!object.customFont.mesh" :hint="object.customFont.mesh ? `Smooth edges that follow the font's own curves.` : 'Pixel cubes, like the other fonts.'" @update:model-value="changeImport('mesh', $event)" />
        </template>
        <div class="sizes">
          <Field label="Height in pixels">
            <NumberInput min="1" :value="object.customFont.height" :disabled="loading" @change="setSize($event, 'height')" />
          </Field>
          <Field v-if="squares" label="Square size">
            <NumberInput min="1" :value="object.customFont.density ?? 1" :disabled="loading" @change="setSize($event, 'density', 1)" />
          </Field>
        </div>
        <p v-if="squares" class="hint">Square size is how many pixels each square is. 4 gives chunky squares like Minecraft Ten. Fonts drawn on a pixel grid keep their own.</p>
      </template>
      <UploadReuse :items="reusable" @pick="applyCustom" />
    </template>
    <div v-if="tab === 'published'" ref="picker" class="flow pick peek" :style="{ minHeight: `${floor}px` }">
      <Segments :options="TABS" :model-value="tab" @update:model-value="chooseTab" />
      <input v-if="searchable" type="text" v-model="search" placeholder="Search fonts" aria-label="Search fonts">
      <TileGrid v-if="searching" class="scroll">
        <Tile v-for="data of foundFonts" :key="data.id" :label="fullName(data, library.fonts)" :image="fontThumbnail(data)" :author="fontCredit(data, library.fonts)" :selected="object.font === data.id" @pick="object.font = data.id" />
      </TileGrid>
      <TileGrid v-else class="scroll" :class="{ kept: variants.length }" :style="{ '--least': leastRows(baseFonts) }">
        <Tile v-for="data of baseFonts" :key="data.id" :label="data.name" :image="fontThumbnail(data)" :author="fontCredit(data, library.fonts)" :badge="variantBadges[data.id]" :selected="baseId === data.id" @pick="object.font = data.id" />
      </TileGrid>
      <template v-if="variants.length && !searching">
        <h3>Variants</h3>
        <TileGrid class="scroll variants" :style="{ '--rows': variantRows(variants) }">
          <Tile label="Default" :image="fontThumbnail(library.fonts.find(item => item.id === baseId) ?? { id: baseId })" :selected="object.font === baseId" @pick="object.font = baseId" />
          <Tile v-for="data of variants" :key="data.id" :label="data.name" :image="fontThumbnail(data)" :author="fontCredit(data, library.fonts)" :selected="object.font === data.id" @pick="object.font = data.id" />
        </TileGrid>
      </template>
    </div>
  </Panel>
  <Panel v-if="hasCreeper" title="Creeper face" :modified="creeper.modified.value" @reset="creeper.reset">
    <Toggle label="Creeper face on A" :hint="`${font.multicase ? 'Every capital A' : 'Every a'} gets the creeper face. Split a word off to set it for just part of the text`" v-model="object.creeperFace" />
  </Panel>
  <Panel v-if="hasTerminators" title="Terminators" :modified="terminators.modified.value" @reset="terminators.reset">
    <Toggle label="Line terminators" hint="Adds the end pieces either side of the text" v-model="object.terminators" />
  </Panel>
</template>

<style scoped>
  .sizes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .custom-font {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px 10px 10px;
    background: var(--field);
  }

  .preview {
    width: 100%;
    min-height: 48px;
  }

  .name {
    max-width: 100%;
    font-size: var(--font-sm);
    font-weight: 600;
    color: var(--text);
  }

  .code {
    padding: 10px;
    font-family: var(--mono);
    font-size: var(--font-md);
    line-height: 1.7;
    word-break: break-all;
    color: var(--text);
    background: var(--field);
  }
</style>
