<script>
  const publishedFonts = new Map()
</script>

<script setup>
  import { computed, ref, watch } from "vue"
  import { fontCredit } from "../../lib/font/credits.js"
  import { PREVIEW_DETAIL, customFontEntry, customFontKind, customThumbnail, customThumbnails } from "../../lib/font/customFonts.js"
  import { DEFAULT_FONT } from "../../lib/settings/defaults.js"
  import { fullName } from "../../lib/font/catalog.js"
  import { loadImage } from "../../lib/font/font.js"
  import { usePanel } from "./panel.js"
  import { useOpened } from "../../components/composables/opened.js"
  import { SEARCH_ABOVE, leastRows, usePickFloor, variantRows } from "./pickFloor.js"
  import { library } from "../../lib/state/scene.js"
  import { isCustomFont } from "../../lib/settings/settings.js"
  import { popular } from "../../lib/state/stats.js"
  import { fontThumbnail } from "../../lib/font/thumbnailUrls.js"
  import { readDataUrl, takeFile } from "../../lib/core/files.js"
  import { usedFonts } from "./uploads.js"
  import { googleFontSource } from "../../lib/font/googleFonts.js"
  import FontBrowser from "./FontBrowser.vue"
  import GoogleFontList from "./GoogleFontList.vue"
  import Button from "../../components/Button.vue"
  import Field from "../../components/Field.vue"
  import FontInfoDialog from "./FontInfoDialog.vue"
  import Notice from "../../components/Notice.vue"
  import NumberInput from "../../components/NumberInput.vue"
  import Panel from "../Panel.vue"
  import Segments from "../../components/Segments.vue"
  import Slider from "../../components/Slider.vue"
  import Tile from "../../components/Tile.vue"
  import TileGrid from "../../components/TileGrid.vue"
  import UploadField from "../../components/UploadField.vue"
  import UploadReuse from "../../components/UploadReuse.vue"
  import Toggle from "../../components/Toggle.vue"

  const TABS = [{ value: "published", label: "All fonts" }, { value: "google", label: "Google Fonts" }, { value: "custom", label: "Custom" }]
  const IMPORT_HEIGHT = 40
  const BUILDS = [{ value: false, label: "Cubes" }, { value: true, label: "Mesh" }]

  const info = ref(false)
  const browsing = ref(false)
  const browsedPicks = ref(0)
  const { object, font, modified, reset } = usePanel("font")
  const tab = ref(tabOf(object.value))
  const googleLoading = ref(null)
  const customName = ref("")
  const customImage = ref(null)
  const customUnit = ref(null)
  const customError = ref("")
  const loading = ref(false)
  const usingCustom = computed(() => isCustomFont(object.value.font) && !!object.value.customFont)
  const uploaded = computed(() => !!object.value.customFont && !object.value.customFont.google)
  const imported = computed(() => uploaded.value && object.value.customFont.kind !== "json")
  const squares = computed(() => object.value.customFont?.kind === "outline" && !object.value.customFont.mesh)
  const terminators = usePanel("terminators")
  const curves = usePanel("curves")
  const creeper = usePanel("creeper")
  const hasTerminators = computed(() => font.value && font.value.glyphs["┫"] && font.value.glyphs["┣"] && !font.value.forcedTerminators)
  const hasCreeper = computed(() => !!font.value?.glyphs["\u{1F633}"])
  const entry = computed(() => library.fonts.find(item => item.id === object.value.font))
  const baseId = computed(() => entry.value?.variant ?? object.value.font)
  const opened = useOpened(() => ({ base: baseId.value, font: object.value.font, google: object.value.customFont?.google ?? null }), () => [tab.value, object.value.id, browsedPicks.value])
  const baseFonts = computed(() => popular(library.fonts.filter(item => !item.variant), item => item.id, item => item.name, [opened.value.base, DEFAULT_FONT]))
  const variants = computed(() => popular(library.fonts.filter(item => item.variant === baseId.value), item => item.id, item => item.name, [opened.value.font]))
  const search = ref("")
  const { picker, floor } = usePickFloor(() => [tab.value, variants.value.length, search.value])
  const searchable = computed(() => baseFonts.value.length > SEARCH_ABOVE)
  const searching = computed(() => searchable.value && !!search.value.trim())
  const foundFonts = computed(() => {
    if (!searching.value) return []
    const term = search.value.trim().toLowerCase()
    return baseFonts.value.flatMap(base => [base].concat(popular(library.fonts.filter(item => item.variant === base.id), item => item.id, item => item.name))).filter(item => [item.id, fullName(item, library.fonts)].some(text => text.toLowerCase().includes(term)))
  })

  function tabOf(target) {
    if (!isCustomFont(target.font)) return "published"
    return target.customFont?.google ? "google" : "custom"
  }

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
    if (value !== "published") {
      if (!isCustomFont(object.value.font)) publishedFonts.set(object.value.id, object.value.font)
      if (object.value.customFont && !usingCustom.value && !!object.value.customFont.google === (value === "google")) applyCustom(object.value.customFont)
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

  async function pickGoogle(font) {
    googleLoading.value = font.family
    await applyCustom(googleFontSource(font.family, font.style))
    googleLoading.value = null
  }

  async function browsed(picked) {
    if (tab.value === "google") await pickGoogle(picked)
    else object.value.font = picked.id
    browsedPicks.value++
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
      await customThumbnails(entry.id)
      if (stale) return
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
      await customThumbnails(entry.id)
      return { ...item, label: entry.name, image: entryThumbnail(entry).image }
    }))
    if (token === reuseToken) reusable.value = shown
  }, { immediate: true })

  watch(() => [object.value.id, isCustomFont(object.value.font)], ([id], [previous]) => {
    customError.value = ""
    if (id === previous && tab.value === "custom" && !object.value.customFont) return
    tab.value = tabOf(object.value)
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
    <FontInfoDialog v-if="info && font" :font="font" :title="entry?.name || customName || 'Font'" @close="info = false" />
    <FontBrowser v-if="browsing" v-model:search="search" :kind="tab" :current="tab === 'google' ? (usingCustom ? object.customFont.google : null) : object.font" @pick="browsed" @close="browsing = false" />
    <Segments v-if="tab === 'custom'" :options="TABS" :model-value="tab" @update:model-value="chooseTab" />
    <template v-if="tab === 'custom'">
      <UploadField accept=".json,.png,.ttf,.otf,.woff,.woff2,application/json,image/png,font/ttf,font/otf,font/woff,font/woff2" :label="loading ? 'Loading...' : uploaded ? 'Replace font' : 'Choose a font file'" empty="No font uploaded" :disabled="loading" :clearable="uploaded" @change="upload" @clear="clearCustom">
        <template v-if="uploaded" #preview>
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
    <div v-if="tab === 'google'" class="flow pick peek">
      <Segments :options="TABS" :model-value="tab" @update:model-value="chooseTab" />
      <div class="row">
        <input type="text" v-model="search" placeholder="Search Google Fonts" aria-label="Search Google Fonts" spellcheck="false">
        <Button icon="rows" title="Browse Google Fonts" @click="browsing = true" />
      </div>
      <Notice v-if="customError">{{ customError }}</Notice>
      <GoogleFontList :search="search" :current="usingCustom && object.customFont.google ? object.customFont : null" :opened="opened.google" :loading="googleLoading" @pick="pickGoogle" />
    </div>
    <div v-if="tab === 'published'" ref="picker" class="flow pick peek" :style="{ minHeight: `${floor}px` }">
      <Segments :options="TABS" :model-value="tab" @update:model-value="chooseTab" />
      <div class="row">
        <input v-if="searchable" type="text" v-model="search" placeholder="Search fonts" aria-label="Search fonts">
        <div v-else class="grow"></div>
        <Button icon="rows" title="Browse fonts" @click="browsing = true" />
      </div>
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
  <Panel v-if="usingCustom && object.customFont.kind === 'outline'" title="Curved faces" :modified="curves.modified.value" @reset="curves.reset">
    <Slider label="Face angle" v-model="object.curveAngle" :min="0" :max="90" hint="How steep a curve can get and still count as a top or bottom face." />
    <Slider label="Face height" v-model="object.curveHeight" :min="0" :max="50" hint="How far a top or bottom face can reach into the letter, as a percentage of the cap height." />
    <Toggle v-if="object.customFont.mesh" label="Fade curved edges" hint="Top and bottom faces fade out round curves instead of stopping sharply, into the sides when they are on" v-model="object.fadeCurves" />
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
</style>
