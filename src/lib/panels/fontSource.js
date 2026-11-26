import { computed, ref, watch } from "vue"
import { PREVIEW_DETAIL, customFontEntry, customFontKind, customThumbnail, customThumbnails } from "../font/customFonts.js"
import { DEFAULT_FONT } from "../settings/defaults.js"
import { fullName } from "../font/catalog.js"
import { loadImage } from "../font/font.js"
import { isCustomFont } from "../settings/settings.js"
import { readDataUrl } from "../core/files.js"
import { googleFontSource } from "../font/googleFonts.js"
import { fontCredit } from "../font/credits.js"
import { fontThumbnail } from "../font/thumbnailUrls.js"
import { GOOGLE_FONTS } from "./googleFontList.js"
import { host } from "./host.js"
import { SEARCH_ABOVE, useOpened } from "./opened.js"
import { usePanel } from "./panel.js"
import { leastRows, variantRows } from "./pickFloor.js"
import { usedFonts } from "./uploads.js"

const FONT_TABS = [{ value: "published", label: "All fonts" }, { value: "google", label: "Google Fonts" }, { value: "custom", label: "Custom" }]
const IMPORT_HEIGHT = 40
export const BUILDS = [{ value: false, label: "Cubes" }, { value: true, label: "Mesh" }]
const publishedFonts = new Map()

function useFontSource() {
  const browsing = ref(false)
  const browsedPicks = ref(0)
  const { object, font, modified, reset } = usePanel("font")
  const tab = ref(tabOf(object.value))
  const googleLoading = ref(null)
  const customName = ref("")
  const customImage = ref(null)
  const customUnit = ref(null)
  const customError = ref("")
  const customNote = ref(null)
  const loading = ref(false)
  const usingCustom = computed(() => isCustomFont(object.value.font) && !!object.value.customFont)
  const shownFont = computed(() => tab.value !== "google" ? object.value.font : usingCustom.value ? object.value.customFont.google : null)
  const uploaded = computed(() => !!object.value.customFont && !object.value.customFont.google)
  const imported = computed(() => uploaded.value && object.value.customFont.kind !== "json")
  const squares = computed(() => object.value.customFont?.kind === "outline" && !object.value.customFont.mesh)
  const entry = computed(() => host.library.fonts.find(item => item.id === object.value.font))
  const baseId = computed(() => entry.value?.variant ?? object.value.font)
  const opened = useOpened(() => ({ base: baseId.value, font: object.value.font, google: object.value.customFont?.google ?? null }), [() => tab.value, () => object.value.id, () => browsedPicks.value])
  const baseFonts = computed(() => host.popular(host.library.fonts.filter(item => !item.variant), item => item.id, item => item.name, [opened.value.base, DEFAULT_FONT]))
  const variants = computed(() => host.popular(host.library.fonts.filter(item => item.variant === baseId.value), item => item.id, item => item.name, [opened.value.font]))
  const search = ref("")
  const searchable = computed(() => baseFonts.value.length > SEARCH_ABOVE)
  const searching = computed(() => searchable.value && !!search.value.trim())
  const foundFonts = computed(() => {
    if (!searching.value) return []
    const term = search.value.trim().toLowerCase()
    return baseFonts.value.flatMap(base => [base].concat(host.popular(host.library.fonts.filter(item => item.variant === base.id), item => item.id, item => item.name))).filter(item => [item.id, fullName(item, host.library.fonts)].some(text => text.toLowerCase().includes(term)))
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

  async function upload(files) {
    if (!files.length) return
    customError.value = ""
    try {
      const [{ minecraftFontFiles }, { minecraftNotes }] = await Promise.all([import("../font/minecraftFiles.js"), import("../font/minecraftFont.js")])
      const minecraft = await minecraftFontFiles(files)
      if (minecraft) {
        customNote.value = { data: minecraft.data, text: minecraftNotes(minecraft.source) }
        await applyCustom({ kind: "minecraft", fileName: minecraft.name, data: minecraft.data, height: IMPORT_HEIGHT })
        return
      }
    } catch (err) {
      customError.value = `Couldn't use this font: ${err.message}`
      return
    }
    const file = files[0]
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

  watch([() => object.value.id, () => isCustomFont(object.value.font)], ([id], [previous]) => {
    customError.value = ""
    if (id === previous && tab.value === "custom" && !object.value.customFont) return
    tab.value = tabOf(object.value)
  })

  const variantBadges = computed(() => {
    const badges = {}
    for (const item of host.library.fonts) {
      if (item.variant) badges[item.variant] = (badges[item.variant] ?? 1) + 1
    }
    return badges
  })

  return { applyCustom, baseFonts, baseId, browsed, browsing, changeImport, chooseTab, clearCustom, customError, customImage, customName, customNote, customUnit, entry, font, foundFonts, googleLoading, imported, loading, modified, object, opened, pickGoogle, reset, reusable, search, searchable, searching, shownFont, squares, tab, upload, uploaded, usingCustom, variantBadges, variants }
}

const FILES = ".json,.png,.ttf,.otf,.woff,.woff2,application/json,image/png,font/ttf,font/otf,font/woff,font/woff2"

const inTab = tab => (get, { state }) => state.tab.value === tab
const published = inTab("published")
const google = inTab("google")
const custom = inTab("custom")
const importing = (get, context) => custom(get, context) && context.state.imported.value && context.state.usingCustom.value
const listing = (get, context) => published(get, context) && !context.state.searching.value
const varied = (get, context) => listing(get, context) && context.state.variants.value.length > 0
const squared = (get, context) => importing(get, context) && context.state.squares.value

function fontTile({ object }, data, values) {
  return { key: data.id, image: fontThumbnail(data), author: fontCredit(data, host.library.fonts), selected: object.font === data.id, pick: () => (object.font = data.id), ...values }
}

function foundTiles(get, context) {
  return context.state.foundFonts.value.map(data => fontTile(context, data, { label: fullName(data, host.library.fonts) }))
}

function baseTiles(get, context) {
  const { baseFonts, baseId, variantBadges } = context.state
  return baseFonts.value.map(data => fontTile(context, data, { label: data.name, badge: variantBadges.value[data.id], selected: baseId.value === data.id }))
}

function variantTiles(get, context) {
  const { baseId, variants } = context.state
  const base = host.library.fonts.find(item => item.id === baseId.value) ?? { id: baseId.value }
  return [fontTile(context, base, { label: "Default", author: undefined })].concat(variants.value.map(data => fontTile(context, data, { label: data.name })))
}

function browse(title) {
  return { title, open: ({ state }) => (state.browsing.value = true) }
}

function size(key, label, shown) {
  return { type: "number", id: key, label, min: 1, read: get => get("customFont")[key] ?? 1, write: (value, { state }) => state.changeImport(key, value), disabled: (get, { state }) => state.loading.value, shown }
}

export const FONT_PANEL = {
  id: "font",
  title: "Font",
  setup: useFontSource,
  controls: [
    {
      type: "picker",
      pick: (get, context) => !custom(get, context),
      peek: (get, context) => !custom(get, context),
      floor: published,
      watch: (get, { state }) => [state.tab.value, state.variants.value.length, state.search.value],
      controls: [
        { type: "segments", options: FONT_TABS, read: (get, { state }) => state.tab.value, write: (tab, { state }) => state.chooseTab(tab) },
        {
          type: "upload",
          accept: FILES,
          multiple: true,
          view(get, { state }) {
            const { customImage, customName, customUnit, loading, reusable, uploaded } = state
            return { label: loading.value ? "Loading..." : uploaded.value ? "Replace font" : "Choose a font file", empty: "No font uploaded", disabled: loading.value, clearable: uploaded.value, back: reusable.value.length > 0, preview: uploaded.value ? { image: customImage.value, unit: customUnit.value, name: customName.value || get("customFont").fileName } : null }
          },
          files: (files, { state }) => state.upload(files),
          clear: ({ state }) => state.clearCustom(),
          shown: custom
        },
        { type: "notice", text: (get, { state }) => state.customError.value, shown: (get, context) => custom(get, context) && !!context.state.customError.value },
        { type: "hint", text: "A JSON from the font editor, a Minecraft ascii.png, a resource pack font JSON chosen together with its PNGs, or a .ttf, .otf, .woff or .woff2 font.", shown: (get, context) => custom(get, context) && !context.state.customError.value },
        { type: "hint", text: (get, { state }) => state.customNote.value.text, shown: (get, context) => custom(get, context) && !context.state.customError.value && !!context.state.customNote.value?.text && context.state.customNote.value.data === get("customFont")?.data },
        { type: "segments", label: "Build from", options: BUILDS, hint: get => get("customFont").mesh ? "Smooth edges that follow the font's own curves." : "Pixel cubes, like the other fonts.", read: get => !!get("customFont").mesh, write: (mesh, { state }) => state.changeImport("mesh", mesh), shown: (get, context) => importing(get, context) && get("customFont").kind === "outline" },
        { type: "row", grid: true, controls: [size("height", "Height in pixels"), size("density", "Square size", squared)], shown: importing },
        { type: "hint", text: "Square size is how many pixels each square is. 4 gives chunky squares like Minecraft Ten. Fonts drawn on a pixel grid keep their own.", shown: squared },
        { type: "reuse", items: (get, { state }) => state.reusable.value, pick: (source, { state }) => state.applyCustom(source), shown: custom },
        { type: "search", placeholder: "Search Google Fonts", browse: browse("Browse Google Fonts"), shown: google },
        { type: "notice", text: (get, { state }) => state.customError.value, shown: (get, context) => google(get, context) && !!context.state.customError.value },
        { ...GOOGLE_FONTS, shown: google },
        { type: "search", placeholder: "Search fonts", browse: browse("Browse fonts"), hidden: (get, { state }) => !state.searchable.value, shown: published },
        { type: "tiles", scroll: true, items: foundTiles, shown: (get, context) => published(get, context) && context.state.searching.value },
        { type: "tiles", scroll: true, kept: (get, { state }) => state.variants.value.length > 0, least: (get, { state }) => leastRows(state.baseFonts.value), items: baseTiles, shown: listing },
        { type: "heading", text: "Variants", shown: varied },
        { type: "tiles", scroll: true, rows: (get, { state }) => variantRows(state.variants.value), items: variantTiles, shown: varied }
      ]
    }
  ]
}
