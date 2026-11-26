import { computed, ref, shallowRef, watch } from "vue"
import { blockName, blockTextures, latestRelease } from "../minecraft/minecraft.js"
import { keepVersions } from "../minecraft/minecraftModels.js"
import { EulaDeclined, eulaDeclined } from "../minecraft/eula.js"
import { titleCase } from "../core/names.js"
import { stripCovers } from "../font/strips.js"
import { pinnedTextures, setTexture, untouchedTileable } from "../settings/textureDefaults.js"
import { viewed } from "../settings/layers.js"
import { minecraftStatId, statScope } from "../title/statIds.js"
import { host } from "./host.js"
import { SEARCH_ABOVE, openedFirst, useOpened } from "./opened.js"
import { layerShown } from "./panel.js"

const SOURCES = [{ value: "premade", label: "Textures" }, { value: "tileable", label: "Tileables" }, { value: "gradient", label: "Gradient" }, { value: "custom", label: "Custom" }]
export const TILEABLE_SOURCES = [{ value: "minecraft", label: "Minecraft textures" }, { value: "premade", label: "Premade" }]
const WHITE = "#ffffff"

export function useTextureSource(context) {
  const object = computed(() => context.object)
  const font = computed(() => context.font)
  const list = computed(() => context.list)
  const shownLayer = layerShown("texture")
  const sources = computed(() => font.value?.model ? SOURCES.filter(source => source.value === "premade") : SOURCES)
  const search = ref("")
  const blocks = shallowRef(null)
  const blocksError = ref("")
  const pending = shallowRef(null)
  let blocksRequest = 0

  const opened = useOpened(() => ({ ...object.value }), [() => object.value.id, () => font.value?.id, () => object.value.textureSource, () => object.value.tileableSource])
  const usingMinecraft = computed(() => object.value.textureSource === "tileable" && object.value.tileableSource === "minecraft")
  const waiting = computed(() => pending.value?.target === viewed(object.value) ? pending.value.values : null)
  const textures = computed(() => {
    const entries = Object.entries(list.value?.textures ?? {}).filter(([, data]) => stripCovers(data, shownLayer.value, font.value?.layers?.length ?? 1))
    const statId = id => `${statScope(object.value, font.value?.id)}.${id}`
    return host.popular(entries, ([id]) => statId(id), ([id, data]) => label(id, data), [opened.value.texture].concat(list.value ? pinnedTextures(list.value) : []).map(statId))
  })
  const tileables = computed(() => host.popular(Object.entries(host.library.tileables), ([id]) => `tileable.${id}`, ([id, data]) => label(id, data), [`tileable.${opened.value.tileable}`]))
  const blockEntries = computed(() => host.popular(Array.from(blocks.value ?? []).filter(([id, { opaque }]) => opaque || id === object.value.minecraftTexture).map(([id, { preview }]) => [id, { name: blockName(id), url: preview }]), ([id]) => minecraftStatId(id), ([, data]) => data.name, [minecraftStatId(opened.value.minecraftTexture)]))
  const textureVariants = computed(() => openedFirst(Object.entries(list.value?.textures[object.value.texture]?.variants ?? {}), ([id]) => id === opened.value.textureVariant))
  const tileableVariants = computed(() => openedFirst(Object.entries(host.library.tileables[object.value.tileable]?.variants ?? {}), ([id]) => id === opened.value.tileableVariant))

  function searchable(entries) {
    return entries.length > SEARCH_ABOVE
  }

  function searched(entries) {
    const term = search.value.trim().toLowerCase()
    if (!searchable(entries) || !term) return entries
    return entries.filter(([id, data]) => id.includes(term) || (data.name ?? "").toLowerCase().includes(term) || (data.category ?? "").toLowerCase().includes(term))
  }

  function flattened(entries) {
    const term = search.value.trim().toLowerCase()
    const words = (id, data) => [id, data.name ?? "", data.category ?? ""].map(text => text.toLowerCase())
    return entries.flatMap(([id, data]) => [{ id, variant: null, data, parent: data }].concat(Object.entries(data.variants ?? {}).map(([key, own]) => ({ id, variant: key, data: own, parent: data })))).filter(item => words(item.variant ?? item.id, item.data).concat(words(item.id, item.parent)).some(text => text.includes(term)))
  }

  const searchingTextures = computed(() => searchable(textures.value) && !!search.value.trim())
  const searchingTileables = computed(() => searchable(tileables.value) && !!search.value.trim())
  const foundTextures = computed(() => searchingTextures.value ? flattened(textures.value) : [])
  const foundTileables = computed(() => searchingTileables.value ? flattened(tileables.value) : [])
  const shownBlocks = computed(() => searched(blockEntries.value))

  function blockTint(id) {
    return blocks.value?.get(id)?.tint ?? null
  }

  function retint(next, target = object.value) {
    const current = target.textureSource === "tileable" && target.tileableSource === "minecraft" ? blockTint(target.minecraftTexture) : null
    if (target.colour.toLowerCase() === WHITE || target.colour.toLowerCase() === current) target.colour = next ?? WHITE
  }

  function pickBlock(id, target = object.value) {
    retint(blockTint(id), target)
    target.minecraftTexture = id
  }

  async function minecraftTint(target) {
    let version = target.minecraftVersion
    try {
      version ??= await latestRelease()
    } catch (err) {
      blocksError.value = `Could not load the Minecraft versions: ${err.message}`
      return { version, tint: null }
    }
    try {
      return { version, tint: (await blockTextures(version)).get(target.minecraftTexture)?.tint ?? null }
    } catch (err) {
      if (err instanceof EulaDeclined) throw err
      blocksError.value = `Could not load Minecraft ${version}: ${err.message}`
      return { version, tint: null }
    }
  }

  async function switchToMinecraft(target, values = {}) {
    const request = { target: viewed(target), values: { ...values, tileableSource: "minecraft" } }
    const before = list.value
    pending.value = request
    blocksError.value = ""
    try {
      const { version, tint } = await minecraftTint(target)
      if (pending.value !== request) return
      retint(tint, target)
      setTexture(target, { ...request.values, minecraftVersion: version }, { before })
    } catch (err) {
      if (!(err instanceof EulaDeclined)) throw err
      if (pending.value === request) setTexture(target, { ...request.values, tileableSource: "premade", tileable: "checkerboard", tileableVariant: null }, { before })
    } finally {
      if (pending.value === request) pending.value = null
    }
  }

  function chooseSource(source) {
    search.value = ""
    const target = object.value
    if (source === "tileable" && (target.tileableSource === "minecraft" || untouchedTileable(target) && !eulaDeclined())) return switchToMinecraft(target, { textureSource: source })
    pending.value = null
    if (source !== "tileable") retint(null)
    const meshCustom = source === "custom" && font.value?.mesh && target.customTextureMode === "standard"
    setTexture(target, meshCustom ? { textureSource: source, customTextureMode: "tileable" } : { textureSource: source }, { before: list.value })
  }

  function chooseTileables(source) {
    search.value = ""
    if (source === "minecraft") return switchToMinecraft(object.value)
    pending.value = null
    retint(null)
    object.value.tileableSource = source
  }

  function resetSource() {
    pending.value = null
    retint(null)
    context.reset()
  }

  async function chooseVersion(version) {
    const target = object.value
    blocksError.value = ""
    try {
      const textures = await blockTextures(version)
      const solid = Array.from(textures.keys()).filter(id => textures.get(id).opaque)
      if (!solid.length) throw new Error(`Minecraft ${version} has no block textures without transparency`)
      target.minecraftVersion = version
      if (!textures.has(target.minecraftTexture)) pickBlock(["cobblestone", "stone"].find(id => solid.includes(id)) ?? solid[0], target)
    } catch (err) {
      blocksError.value = err.message
    }
  }

  watch([usingMinecraft, () => object.value.minecraftVersion], async () => {
    if (!usingMinecraft.value || !object.value.minecraftVersion) return
    const request = ++blocksRequest
    blocks.value = null
    blocksError.value = ""
    try {
      const textures = await blockTextures(object.value.minecraftVersion)
      if (request !== blocksRequest) return
      blocks.value = textures
      keepVersions(host.gameVersions())
    } catch (err) {
      if (request === blocksRequest) blocksError.value = `Could not load Minecraft ${object.value.minecraftVersion}: ${err.message}`
    }
  }, { immediate: true })

  function pickTexture(id, variant) {
    setTexture(object.value, { texture: id, textureVariant: variant }, { before: list.value })
  }

  function pickVariant(variant) {
    setTexture(object.value, { textureVariant: variant }, { before: list.value })
  }

  function pickTileable(id, variant) {
    object.value.tileable = id
    object.value.tileableVariant = variant
  }

  return { blockEntries, blocks, blocksError, chooseSource, chooseTileables, chooseVersion, font, foundTextures, foundTileables, list, object, pickBlock, pickTexture, pickTileable, pickVariant, resetSource, search, searchable, searchingTextures, searchingTileables, shownBlocks, shownLayer, sources, textureVariants, textures, tileableVariants, tileables, usingMinecraft, waiting }
}

export function label(id, data) {
  return data.category ?? data.name ?? titleCase(id)
}

export function variantBadge(data) {
  return data.variants ? Object.keys(data.variants).length + 1 : 0
}
