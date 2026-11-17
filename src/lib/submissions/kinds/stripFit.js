import { stripRange } from "../../texture/assets.js"
import { independentLayers, layerSlices } from "../../font/flatSheet.js"
import { fontFolder, fullOrder, parseMask, sheetOwner } from "../../font/font.js"
import { titleCase } from "../../core/names.js"
import { defaultBorder, defaultDepth } from "../../settings/defaults.js"
import { stackedStrip, stripRows, stripTag, stripUse, stripY, withDefaultStrips } from "../../font/strips.js"
import { SUBMISSION_LIMITS } from "../submissions.js"
import { submissionFont } from "./fontAsset.js"
import { decodePng } from "./png.js"

export const STRIP_LIMITS = { depth: 64, height: 256, below: 64, snap: 64 }

export function stripTarget(target) {
  if (target === "new") return { kind: "new", id: "" }
  const match = /^(set|font):(.*)$/.exec(target ?? "")
  return match ? { kind: match[1], id: match[2] } : { kind: "font", id: target ?? "" }
}

export function setIdOf(name) {
  return String(name ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}

export function setName(id) {
  return titleCase(id)
}

export function stripOwners(fonts) {
  return fonts.filter(font => sheetOwner(font, fonts) === font)
}

export function setUsers(fonts, id) {
  return stripOwners(fonts).flatMap(font => withDefaultStrips(font.strips).map(stripUse).filter(use => use.id === id).map(use => ({ font, layer: use.layer ? use.layer - 1 : null })))
}

export function setIds(fonts) {
  return Array.from(new Set(stripOwners(fonts).flatMap(font => withDefaultStrips(font.strips).map(item => stripUse(item).id))))
}

export function layerDepth(depth, layers, layer, independent = false) {
  return layer === null || !layers ? depth : layerSlices(layers, depth, independent)[layer].rows
}

export function fontMeasure(ctx, font, layer = null) {
  return ctx.memo(`strip-measure:${font.id}:${layer}`, async () => {
    const image = await decodePng(await ctx.bytes(`/${fontFolder(font)}/font.png`))
    const { list, capHeight, layers } = parseMask(image.data, image.width, image.height, fullOrder(font, ctx.fonts), defaultBorder("top", font))
    const independent = independentLayers(font)
    const stacked = layer === null && layers?.length > 1 ? stackedStrip({ depth: defaultDepth(font) }, layers, 0, list, independent).total : null
    return { range: stripRange({ cells: list, capHeight, layerDepth: font.layerDepth }, layer), capHeight, depth: layerDepth(defaultDepth(font), layers, layer, independent), stacked }
  })
}

export function setShape(id, list) {
  const textures = Object.entries(list.textures ?? {})
  return { id, depth: list.depth, baseline: list.baseline ?? list.depth, height: list.height ?? null, stretched: textures.length > 0 && textures.every(([, entry]) => entry.stretch), names: textures.flatMap(([name, entry]) => [name].concat(Object.keys(entry.variants ?? {}))) }
}

export function stripSet(ctx, id) {
  return ctx.memo(`strip-set:${id}`, async () => setShape(id, await ctx.json(`/strips/${id}/textures.json`)))
}

function fontRows(measure) {
  return measure.stacked ?? measure.depth * 2 + measure.range.top - measure.range.bottom
}

export function stripHeights(rows) {
  let low = rows
  while (low % 2 === 0) low /= 2
  const heights = []
  for (let height = low; height <= SUBMISSION_LIMITS.side; height *= 2) heights.push(height)
  return heights
}

export function sharedHeights(rows) {
  const lists = rows.map(stripHeights)
  return lists[0]?.filter(height => lists.every(list => list.includes(height))) ?? []
}

export function heightList(heights) {
  return heights.length > 1 ? `${heights.slice(0, -1).join(", ")} or ${heights.at(-1)}` : String(heights[0])
}

export async function targetRows(ctx, target, details) {
  const { kind, id } = stripTarget(target)
  if (kind === "new") return [details.depth, details.baseline, details.height].every(Number.isInteger) ? [details.baseline + details.depth + details.height] : null
  if (kind === "font") {
    const font = submissionFont(ctx.fonts, id)
    return font ? [fontRows(await fontMeasure(ctx, font))] : null
  }
  if (!setIds(ctx.fonts).includes(id)) return null
  const set = await stripSet(ctx, id)
  if (!set.height) throw new Error(`the ${id} strips need a height`)
  return [set.baseline + set.depth + set.height]
}

function sameColumn({ width, height, data }, a, b) {
  for (let y = 0; y < height; y++) {
    const i = (y * width + a) * 4
    const j = (y * width + b) * 4
    if (!data[i + 3] && !data[j + 3]) continue
    if (data[i] !== data[j] || data[i + 1] !== data[j + 1] || data[i + 2] !== data[j + 2] || data[i + 3] !== data[j + 3]) return false
  }
  return true
}

export function stripSnap(bytes) {
  const image = decodePng(bytes)
  const columns = Array.from({ length: image.width }, (_, x) => x)
  if (columns.every(x => sameColumn(image, 0, x))) return 1
  for (let size = Math.min(STRIP_LIMITS.snap, image.width); size > 1; size--) {
    if (!(image.width % size) && columns.every(x => sameColumn(image, x, x - x % size))) return size
  }
  return 1
}

export function setEntry(set, stretch) {
  return { ...stripTag(set), ...(stretch && { stretch: true }) }
}

export function remapScale(image, entry, measure) {
  return Math.max(1, image.height / stripRows(entry, measure.range, measure.depth, measure.capHeight).rows)
}

export function remapStrip(image, entry, measure, scale = remapScale(image, entry, measure)) {
  const from = stripRows(entry, measure.range, measure.depth, measure.capHeight)
  const to = stripRows({}, measure.range, measure.depth)
  const density = image.height / from.rows
  const height = to.rows * scale
  const width = Math.round(image.width * scale / density)
  const columns = Int32Array.from({ length: width }, (_, x) => Math.floor((x + 0.5) * density / scale) % image.width)
  const face = to.depth + to.top - to.bottom
  const data = new Uint8ClampedArray(width * 4 * height)
  for (let y = 0; y < height; y++) {
    const row = (y + 0.5) / scale
    const whole = Math.floor(row)
    let source
    if (whole < to.depth) source = row * from.depth / to.depth
    else if (whole < face) source = from.depth + from.top - 1 - stripY(from, to.top - 1 - (whole - to.depth)) + row - whole
    else source = from.depth + from.top - from.bottom + (row - face) * from.depth / to.depth
    const at = (Math.floor(source * density) % image.height + image.height) % image.height
    for (let x = 0; x < width; x++) data.set(image.data.subarray((at * image.width + columns[x]) * 4, (at * image.width + columns[x] + 1) * 4), (y * width + x) * 4)
  }
  return { data, width, height }
}
