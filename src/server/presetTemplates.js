import { PROVIDERS } from "../lib/core/providers.js"
import { escaped } from "../lib/core/html.js"
import { pictureUrl } from "../lib/core/pictures.js"
import { SORTS, ratingText, sharedText, toGoText, usesText, votesText } from "../app/presets/presetText.js"

export const TEMPLATES = "/app/presets/templates.json"
export const TILES = "<!--preset-tiles-->"
export const SEARCH = "Markersearch"
export const LIST_SLOT = 2
export const DETAIL_SLOT = 1

const DEFAULT_LABEL = SORTS[0].label
const AUTHORS = [null].concat(PROVIDERS.map(provider => provider.id))

export const VARIANTS = [true, false].flatMap(rated => AUTHORS.map(provider => ({ rated, provider })))

export function variantKey({ rated, provider }) {
  return `${rated ? "rated" : "unrated"}-${provider ?? "community"}`
}

export function variantOf(preset) {
  return { rated: preset.rating !== null, provider: preset.author ? preset.authorProvider : null }
}

export function markerPreset(slot, { rated, provider }) {
  const base = 987000 + slot * 10
  return { id: base + 1, code: `markercode${slot}`, fingerprint: `markerprint${slot}`, name: `Markername${slot}`, text: "", downloads: base + 2, week: base + 3, votes: rated ? base + 4 : -(base + 4), rating: rated ? 900 + slot + 0.5 : null, createdAt: Date.UTC(1999, 0, slot), author: provider ? `Markerauthor${slot}` : null, authorProvider: provider }
}

function swaps(marker, preset) {
  const list = [
    [pictureUrl(marker), pictureUrl(preset)],
    [usesText(marker), usesText(preset)],
    [sharedText(marker.createdAt), sharedText(preset.createdAt)],
    [String(marker.id), String(preset.id)],
    [marker.name, escaped(preset.name)]
  ]
  if (marker.author) list.push([marker.author, escaped(preset.author)])
  if (marker.rating === null) return list.concat([[toGoText(marker.votes), toGoText(preset.votes)]])
  return list.concat([[votesText(marker.votes), votesText(preset.votes)], [ratingText(marker.rating), ratingText(preset.rating)]])
}

function literal(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function filled(template, marker, preset) {
  const values = new Map(swaps(marker, preset))
  const pattern = new RegExp(Array.from(values.keys()).sort((a, b) => b.length - a.length).map(literal).join("|"), "g")
  return template.replace(pattern, found => values.get(found))
}

function pageTemplate(templates, { presets, selected, search }) {
  if (selected) return templates.detail[variantKey(variantOf(selected))]
  if (presets.length) return templates.list
  return search ? templates.emptySearch : templates.empty
}

export function presetsHtml(templates, { presets, selected, sort, search }) {
  const label = SORTS.find(option => option.value === sort)?.label ?? DEFAULT_LABEL
  const page = pageTemplate(templates, { presets, selected, search }).replace(`>${DEFAULT_LABEL}<`, () => `>${label}<`).replaceAll(SEARCH, () => escaped(search))
  const detailed = selected ? filled(page, markerPreset(DETAIL_SLOT, variantOf(selected)), selected) : page
  const tiles = presets.map(preset => {
    const variant = variantOf(preset)
    const tile = filled(templates.tiles[variantKey(variant)], markerPreset(LIST_SLOT, variant), preset)
    return preset.id === selected?.id ? tile.replace("<div class=\"card\"", "<div class=\"card selected\"") : tile
  })
  return detailed.replace(TILES, () => tiles.join(""))
}
