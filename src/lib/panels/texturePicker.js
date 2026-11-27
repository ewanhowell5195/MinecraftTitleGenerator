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

const TEXTURES = {
  key: "texture",
  list: "textures",
  found: "foundTextures",
  searching: "searchingTextures",
  tile: ({ font, state }, id, variant, data, parent, values) => {
    const name = variant ?? id
    const folder = (variant ? { ...parent, ...data } : data).folder ?? font?.sheetFolder
    return { key: name, unit: thumbnailHeight(font), image: thumbnail(font, name, state.shownLayer.value), download: { label: "Download texture", path: `${folder}/textures/${name}.png`, name: `${name}.png` }, ...values }
  },
  author: ({ font }, data, parent) => credit(data, font?.id, host.library.fonts, parent),
  parent: ({ list, object }) => list.textures[object.texture],
  pick: ({ state }, id, variant) => state.pickTexture(id, variant),
  pickVariant: ({ state }, variant) => state.pickVariant(variant)
}

const TILEABLES = {
  key: "tileable",
  list: "tileables",
  found: "foundTileables",
  searching: "searchingTileables",
  patterns: true,
  tile: (context, id, variant, data, parent, values) => {
    const url = tileableUrl(host.library.tileables, id, variant)
    return { key: variant ?? id, aspect: PATTERN, pattern: url, download: { label: "Download tileable", path: url, name: `${variant ?? id}.png` }, ...values }
  },
  author: (context, data, parent) => data.authors ?? parent?.authors,
  parent: ({ object }) => host.library.tileables[object.tileable],
  pick: ({ state }, id, variant) => state.pickTileable(id, variant),
  pickVariant: ({ state, object }, variant) => state.pickTileable(object.tileable, variant)
}

function found(kind) {
  return (get, context) => context.state[kind.found].value.map(({ id, variant, data, parent }) => kind.tile(context, id, variant, data, parent, {
    key: `${id}/${variant ?? ""}`,
    label: data.name ?? titleCase(variant ?? id),
    author: kind.author(context, data, variant ? parent : null),
    selected: context.object[kind.key] === id && (context.object[`${kind.key}Variant`] ?? null) === variant,
    pick: () => kind.pick(context, id, variant)
  }))
}

function listed(kind) {
  return (get, context) => context.state[kind.list].value.map(([id, data]) => kind.tile(context, id, null, data, null, {
    label: label(id, data),
    author: kind.author(context, data, null),
    badge: variantBadge(data),
    selected: context.object[kind.key] === id,
    pick: () => kind.pick(context, id, null)
  }))
}

function variants(kind) {
  return (get, context) => {
    const id = context.object[kind.key]
    const parent = kind.parent(context)
    const base = kind.tile(context, id, null, parent, null, { key: "", label: parent.name ?? titleCase(id), selected: !context.object[`${kind.key}Variant`], pick: () => kind.pickVariant(context, null) })
    return [base].concat(context.state[`${kind.key}Variants`].value.map(([variant, data]) => kind.tile(context, id, variant, data, parent, {
      label: data.name ?? titleCase(variant),
      author: kind.author(context, data, parent),
      selected: context.object[`${kind.key}Variant`] === variant,
      pick: () => kind.pickVariant(context, variant)
    })))
  }
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

function search(entries, shown) {
  return { type: "search", placeholder: "Search textures", shown: (get, context) => shown(get, context) && context.state.searchable(context.state[entries].value) }
}

function kindRows(kind, shown) {
  const variantList = `${kind.key}Variants`
  const searching = (get, context) => shown(get, context) && context.state[kind.searching].value
  const listing = (get, context) => shown(get, context) && !context.state[kind.searching].value
  const varied = (get, context) => listing(get, context) && context.state[variantList].value.length > 0
  return [
    search(kind.list, shown),
    { type: "tiles", scroll: true, items: found(kind), shown: searching },
    { type: "tiles", scroll: true, patterns: kind.patterns, kept: (get, { state }) => state[variantList].value.length > 0, least: (get, { state }) => leastRows(state[kind.list].value), items: listed(kind), shown: listing },
    { type: "heading", text: "Variants", shown: varied },
    { type: "tiles", scroll: true, patterns: kind.patterns, rows: (get, { state }) => variantRows(state[variantList].value), items: variants(kind), shown: varied }
  ]
}

export const TEXTURE_PICKER = {
  type: "picker",
  pick: get => premade(get) || tileable(get),
  peek: tileable,
  watch: (get, { state }) => [get("textureSource"), state.usingMinecraft.value, state.textureVariants.value.length, state.tileableVariants.value.length, state.search.value],
  controls: [
    { type: "segments", options: (get, { state }) => state.sources.value, read: (get, { state }) => state.waiting.value?.textureSource ?? get("textureSource"), write: (value, { state }) => state.chooseSource(value), shown: (get, { state }) => state.sources.value.length > 1 },
    { type: "download", shown: (get, { state }) => !!state.waiting.value }
  ].concat(kindRows(TEXTURES, premade), [
    { type: "segments", options: TILEABLE_SOURCES, read: (get, { state }) => state.waiting.value?.tileableSource ?? get("tileableSource"), write: (value, { state }) => state.chooseTileables(value), shown: tileable },
    { type: "version", read: get => get("minecraftVersion"), write: (version, { state }) => state.chooseVersion(version), shown: minecraft },
    { type: "notice", text: (get, { state }) => state.blocksError.value, shown: (get, context) => minecraft(get, context) && !!context.state.blocksError.value },
    { type: "hint", text: "This version has no block textures without transparency.", shown: (get, context) => minecraft(get, context) && !context.state.blocksError.value && !!context.state.blocks.value && !context.state.blockEntries.value.length },
    search("blockEntries", minecraft),
    { type: "tiles", scroll: true, items: blocks, shown: (get, context) => minecraft(get, context) && context.state.blockEntries.value.length > 0 }
  ], kindRows(TILEABLES, published))
}
