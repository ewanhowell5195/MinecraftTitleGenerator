import { stripRange } from "../assets.js"
import { layerSlices } from "../flatSheet.js"
import { fontFolder, fullOrder, parseMask, sheetOwner } from "../font.js"
import { characterName } from "../fontEditor.js"
import { clamp } from "../maths.js"
import { titleCase } from "../names.js"
import { defaultBorder, defaultDepth } from "../settings.js"
import { centredOffset, stripRows, stripTag, stripUse, stripY } from "../strips.js"
import { SUBMISSION_LIMITS } from "../submissions.js"
import { submissionFont } from "./fontAsset.js"
import { decodePng } from "./png.js"

export const STRIP_LIMITS = { depth: 64, height: 256, below: 64 }

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
  return stripOwners(fonts).flatMap(font => (font.strips ?? []).map(stripUse).filter(use => use.id === id).map(use => ({ font, offset: use.offset, layer: use.layer ? use.layer - 1 : null })))
}

export function setIds(fonts) {
  return Array.from(new Set(stripOwners(fonts).flatMap(font => (font.strips ?? []).map(item => stripUse(item).id))))
}

export function layerDepth(depth, layers, layer) {
  return layer === null || !layers ? depth : layerSlices(layers, depth)[layer].rows
}

export function fontMeasure(ctx, font, layer = null) {
  return ctx.memo(`strip-measure:${font.id}:${layer}`, async () => {
    const image = await decodePng(await ctx.bytes(`/${fontFolder(font)}/font.png`))
    const { list, capHeight, layers } = parseMask(image.data, image.width, image.height, fullOrder(font, ctx.fonts), defaultBorder("top", font))
    return { range: stripRange({ cells: list, capHeight }, layer), capHeight, depth: layerDepth(defaultDepth(font), layers, layer) }
  })
}

export function setShape(id, list) {
  const textures = Object.entries(list.textures ?? {})
  return { id, depth: list.depth, baseline: list.baseline ?? list.depth, height: list.height ?? null, stretched: textures.length > 0 && textures.every(([, entry]) => entry.stretch), names: textures.flatMap(([name, entry]) => [name].concat(Object.keys(entry.variants ?? {}))) }
}

export function stripSet(ctx, id) {
  return ctx.memo(`strip-set:${id}`, async () => setShape(id, await ctx.json(`/strips/${id}/textures.json`)))
}

export function fontRows(measure) {
  return measure.depth * 2 + measure.range.top - measure.range.bottom
}

export function setRows(set, measure, offset) {
  return set.baseline + set.depth + (set.height ?? measure.range.top + offset)
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
  if (set.height) return [setRows(set, null, 0)]
  return Promise.all(setUsers(ctx.fonts, id).map(async ({ font, offset, layer }) => setRows(set, await fontMeasure(ctx, font, layer), offset)))
}

export function stripFit(set, measure, offset, { stretched = false, heights = [] } = {}) {
  const centred = centredOffset(set.height, measure.capHeight)
  const base = set.baseline + set.depth + measure.range.top
  const low = -measure.range.bottom - (set.baseline - set.depth) - centred
  const high = set.height && !stretched ? set.height - measure.range.top - centred : Infinity
  const problems = []
  if (measure.depth > set.depth) problems.push("depth")
  if (offset < low) problems.push("below")
  if (offset > high) problems.push("above")
  if (!set.height && heights.some(height => !Number.isInteger(Math.log2(height / (base + offset))))) problems.push("height")
  const range = measure.depth <= set.depth && low <= high ? { low, high } : null
  return { problems, range, offsets: range && !set.height && heights.length ? sharedHeights(heights).map(rows => rows - base).filter(value => value >= low) : null }
}

export function nearestOffset({ range, offsets }, wanted) {
  if (!range) return null
  if (!offsets) return clamp(wanted, range.low, range.high)
  return offsets.reduce((best, value) => best === null || Math.abs(value - wanted) < Math.abs(best - wanted) ? value : best, null)
}

export function offsetRange(set, measure, stretched) {
  return stripFit(set, measure, 0, { stretched }).range
}

export function fitOffset(set, measure, stretched) {
  return nearestOffset(stripFit(set, measure, 0, { stretched }), 0)
}

export function fitProblems(set, measure, offset, stretched) {
  const shift = centredOffset(set.height, measure.capHeight) + offset
  const [highest, lowest] = [measure.range.highest, measure.range.lowest].map(char => char && characterName(char, null))
  const words = {
    depth: `it's ${measure.depth} deep and the strips only cover ${set.depth}`,
    below: `${lowest ? `its "${lowest}" goes` : "its letters go"} ${-measure.range.bottom} below the baseline and the strips only cover ${Math.max(0, set.baseline - set.depth + shift)}`,
    above: `${highest ? `its "${highest}" reaches` : "its letters reach"} ${measure.range.top + shift} above the baseline and the strips only go up to ${set.height}`
  }
  return stripFit(set, measure, offset, { stretched }).problems.map(code => words[code])
}

export function setEntry(set, offset, stretch) {
  return { ...stripTag(set, offset), ...(stretch && { stretch: true }) }
}

export function remapStrip(image, entry, measure) {
  const from = stripRows(entry, measure.range, measure.depth, measure.capHeight)
  const to = stripRows({}, measure.range, measure.depth)
  const density = image.height / from.rows
  const scale = Math.max(1, density)
  const height = to.rows * scale
  const face = to.depth + to.top - to.bottom
  const line = image.width * 4
  const data = new Uint8ClampedArray(line * height)
  for (let y = 0; y < height; y++) {
    const row = (y + 0.5) / scale
    const whole = Math.floor(row)
    let source
    if (whole < to.depth) source = row * from.depth / to.depth
    else if (whole < face) source = from.depth + from.top - 1 - stripY(from, to.top - 1 - (whole - to.depth)) + row - whole
    else source = from.depth + from.top - from.bottom + (row - face) * from.depth / to.depth
    const at = (Math.floor(source * density) % image.height + image.height) % image.height
    data.set(image.data.subarray(at * line, (at + 1) * line), y * line)
  }
  return { data, width: image.width, height }
}
