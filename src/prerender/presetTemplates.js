import { DETAIL_SLOT, LIST_SLOT, SEARCH, TILES, VARIANTS, markerPreset, variantKey } from "../server/presetTemplates.js"

const CARD = "<div class=\"card\" data-v-"
const SEARCHED = `?search=${SEARCH}`

function element(html, start) {
  const tags = /<div\b|<\/div>/g
  tags.lastIndex = start
  let depth = 0
  for (let tag = tags.exec(html); tag; tag = tags.exec(html)) {
    depth += tag[0] === "</div>" ? -1 : 1
    if (!depth) return html.slice(start, tags.lastIndex)
  }
  throw new Error("a tile in the rendered presets page never closes")
}

function tileIn(html) {
  const start = html.indexOf(CARD)
  if (start < 0 || html.includes(CARD, start + 1)) throw new Error("a rendered presets page should hold exactly one tile")
  return element(html, start)
}

function withoutTile(html) {
  return html.replace(tileIn(html), () => TILES)
}

export async function presetTemplates(renderPage) {
  const modules = new Set()
  async function render(path, presets, preset = null, search = "") {
    const result = await renderPage(path, { page: { sort: "week", search, presets, more: false }, preset })
    for (const id of result.modules) modules.add(id)
    return result.html
  }
  const base = markerPreset(LIST_SLOT, VARIANTS[0])
  const tiles = {}
  const detail = {}
  for (const variant of VARIANTS) {
    tiles[variantKey(variant)] = tileIn(await render("/app/presets", [markerPreset(LIST_SLOT, variant)]))
    const selected = markerPreset(DETAIL_SLOT, variant)
    detail[variantKey(variant)] = withoutTile(await render(`/app/presets/${selected.id}${SEARCHED}`, [base], selected, SEARCH))
  }
  const list = withoutTile(await render(`/app/presets${SEARCHED}`, [base], null, SEARCH))
  const empty = await render("/app/presets", [])
  const emptySearch = await render(`/app/presets${SEARCHED}`, [], null, SEARCH)
  return { templates: { list, empty, emptySearch, detail, tiles }, modules: Array.from(modules) }
}
