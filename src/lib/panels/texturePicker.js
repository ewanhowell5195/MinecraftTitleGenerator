import { titleCase } from "../core/names.js"
import { credit } from "../font/credits.js"
import { thumbnail, thumbnailHeight } from "../font/thumbnailUrls.js"
import { tileableUrl } from "../texture/assets.js"
import { host } from "./host.js"
import { leastRows, variantRows } from "./pickFloor.js"
import { TILEABLE_SOURCES, label, variantBadge } from "./textureSource.js"

const PATTERN = "2 / 1"

const premade = get => get("textureSource") === "premade"
const tileable = get => get("textureSource") === "tileable"
const minecraft = (get, { state }) => state.usingMinecraft.value
const published = (get, { state }) => tileable(get) && !state.usingMinecraft.value
const searchingTextures = (get, { state }) => premade(get) && state.searchingTextures.value
const listingTextures = (get, { state }) => premade(get) && !state.searchingTextures.value
const searchingTileables = (get, context) => published(get, context) && context.state.searchingTileables.value
const listingTileables = (get, context) => published(get, context) && !context.state.searchingTileables.value
const variedTextures = (get, context) => listingTextures(get, context) && context.state.textureVariants.value.length > 0
const variedTileables = (get, context) => listingTileables(get, context) && context.state.tileableVariants.value.length > 0

function textureTile({ font, state }, id, data, values) {
  return {
    key: id,
    unit: thumbnailHeight(font),
    image: thumbnail(font, id, state.shownLayer.value),
    download: { label: "Download texture", path: `${data.folder ?? font?.sheetFolder}/textures/${id}.png`, name: `${id}.png` },
    ...values
  }
}

function foundTextures(get, context) {
  const { font, object, state } = context
  return state.foundTextures.value.map(({ id, variant, data, parent }) => textureTile(context, variant ?? id, variant ? { ...parent, ...data } : data, {
    key: `${id}/${variant ?? ""}`,
    label: data.name ?? titleCase(variant ?? id),
    author: variant ? credit(data, font?.id, host.library.fonts, parent) : credit(data, font?.id, host.library.fonts),
    selected: object.texture === id && (object.textureVariant ?? null) === variant,
    pick: () => state.pickTexture(id, variant)
  }))
}

function textures(get, context) {
  const { font, object, state } = context
  return state.textures.value.map(([id, data]) => textureTile(context, id, data, {
    label: label(id, data),
    author: credit(data, font?.id, host.library.fonts),
    badge: variantBadge(data),
    selected: object.texture === id,
    pick: () => state.pickTexture(id, null)
  }))
}

function textureVariants(get, context) {
  const { font, list, object, state } = context
  const parent = list.textures[object.texture]
  const base = textureTile(context, object.texture, parent, { key: "", label: parent.name ?? titleCase(object.texture), selected: !object.textureVariant, pick: () => state.pickVariant(null) })
  return [base].concat(state.textureVariants.value.map(([id, data]) => textureTile(context, id, { ...parent, ...data }, {
    label: data.name ?? titleCase(id),
    author: credit(data, font?.id, host.library.fonts, parent),
    selected: object.textureVariant === id,
    pick: () => state.pickVariant(id)
  })))
}

function blocks(get, { object, state }) {
  return state.shownBlocks.value.map(([id, data]) => ({
    key: id,
    label: data.name,
    aspect: PATTERN,
    pattern: data.url,
    author: data.authors,
    selected: object.minecraftTexture === id,
    download: { label: "Download texture", path: data.url, name: `${id}.png` },
    pick: () => state.pickBlock(id)
  }))
}

function tileableTile(id, variant, values) {
  const url = tileableUrl(host.library.tileables, id, variant)
  return { key: variant ?? id, aspect: PATTERN, pattern: url, download: { label: "Download tileable", path: url, name: `${variant ?? id}.png` }, ...values }
}

function foundTileables(get, { object, state }) {
  return state.foundTileables.value.map(({ id, variant, data, parent }) => tileableTile(id, variant, {
    key: `${id}/${variant ?? ""}`,
    label: data.name ?? titleCase(variant ?? id),
    author: data.authors ?? parent.authors,
    selected: object.tileable === id && (object.tileableVariant ?? null) === variant,
    pick: () => state.pickTileable(id, variant)
  }))
}

function tileables(get, { object, state }) {
  return state.tileables.value.map(([id, data]) => tileableTile(id, null, {
    label: label(id, data),
    author: data.authors,
    badge: variantBadge(data),
    selected: object.tileable === id,
    pick: () => state.pickTileable(id, null)
  }))
}

function tileableVariants(get, { object, state }) {
  const parent = host.library.tileables[object.tileable]
  const base = tileableTile(object.tileable, null, { key: "", label: parent.name, selected: !object.tileableVariant, pick: () => state.pickTileable(object.tileable, null) })
  return [base].concat(state.tileableVariants.value.map(([id, data]) => tileableTile(object.tileable, id, {
    label: data.name,
    author: data.authors ?? parent.authors,
    selected: object.tileableVariant === id,
    pick: () => state.pickTileable(object.tileable, id)
  })))
}

function search(entries, shown) {
  return { type: "search", placeholder: "Search textures", shown: (get, context) => shown(get, context) && context.state.searchable(context.state[entries].value) }
}

export const TEXTURE_PICKER = {
  type: "picker",
  pick: get => premade(get) || tileable(get),
  peek: tileable,
  watch: (get, { state }) => [get("textureSource"), state.usingMinecraft.value, state.textureVariants.value.length, state.tileableVariants.value.length, state.search.value],
  controls: [
    { type: "segments", options: (get, { state }) => state.sources.value, read: (get, { state }) => state.waiting.value?.textureSource ?? get("textureSource"), write: (value, { state }) => state.chooseSource(value), shown: (get, { state }) => state.sources.value.length > 1 },
    { type: "download", shown: (get, { state }) => !!state.waiting.value },
    search("textures", premade),
    { type: "tiles", scroll: true, items: foundTextures, shown: searchingTextures },
    { type: "tiles", scroll: true, kept: (get, { state }) => state.textureVariants.value.length > 0, least: (get, { state }) => leastRows(state.textures.value), items: textures, shown: listingTextures },
    { type: "heading", text: "Variants", shown: variedTextures },
    { type: "tiles", scroll: true, rows: (get, { state }) => variantRows(state.textureVariants.value), items: textureVariants, shown: variedTextures },
    { type: "segments", options: TILEABLE_SOURCES, read: (get, { state }) => state.waiting.value?.tileableSource ?? get("tileableSource"), write: (value, { state }) => state.chooseTileables(value), shown: tileable },
    { type: "version", read: get => get("minecraftVersion"), write: (version, { state }) => state.chooseVersion(version), shown: minecraft },
    { type: "notice", text: (get, { state }) => state.blocksError.value, shown: (get, context) => minecraft(get, context) && !!context.state.blocksError.value },
    { type: "hint", text: "This version has no block textures without transparency.", shown: (get, context) => minecraft(get, context) && !context.state.blocksError.value && !!context.state.blocks.value && !context.state.blockEntries.value.length },
    search("blockEntries", minecraft),
    { type: "tiles", scroll: true, items: blocks, shown: (get, context) => minecraft(get, context) && context.state.blockEntries.value.length > 0 },
    search("tileables", published),
    { type: "tiles", scroll: true, items: foundTileables, shown: searchingTileables },
    { type: "tiles", scroll: true, patterns: true, kept: (get, { state }) => state.tileableVariants.value.length > 0, least: (get, { state }) => leastRows(state.tileables.value), items: tileables, shown: listingTileables },
    { type: "heading", text: "Variants", shown: variedTileables },
    { type: "tiles", scroll: true, patterns: true, rows: (get, { state }) => variantRows(state.tileableVariants.value), items: tileableVariants, shown: variedTileables }
  ]
}
