import { stripRange } from "../assets.js"
import { fontFolder, fullOrder, parseMask, sheetOwner } from "../font.js"
import { titleCase } from "../names.js"
import { defaultBorder, defaultDepth } from "../settings.js"
import { centredOffset, stripRows, stripUse, stripY } from "../strips.js"
import { SUBMISSION_LIMITS } from "../submissions.js"
import { decodePng } from "./stripPng.js"

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
  return stripOwners(fonts).flatMap(font => (font.strips ?? []).map(stripUse).filter(use => use.id === id).map(use => ({ font, offset: use.offset })))
}

export function setIds(fonts) {
  return Array.from(new Set(stripOwners(fonts).flatMap(font => (font.strips ?? []).map(item => stripUse(item).id))))
}

export function fontMeasure(ctx, font) {
  return ctx.memo(`strip-measure:${font.id}`, async () => {
    const image = await decodePng(await ctx.bytes(`/${fontFolder(font)}/font.png`))
    const { list, capHeight } = parseMask(image.data, image.width, image.height, fullOrder(font, ctx.fonts), defaultBorder("top", font))
    return { range: stripRange({ cells: list, capHeight }), capHeight, depth: defaultDepth(font) }
  })
}

export function stripSet(ctx, id) {
  return ctx.memo(`strip-set:${id}`, async () => {
    const list = await ctx.json(`/strips/${id}/textures.json`)
    const textures = Object.values(list.textures ?? {})
    return { id, depth: list.depth, baseline: list.baseline ?? list.depth, height: list.height ?? null, stretched: textures.length > 0 && textures.every(entry => entry.stretch) }
  })
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

export function heightList(heights) {
  return heights.length > 1 ? `${heights.slice(0, -1).join(", ")} or ${heights.at(-1)}` : String(heights[0])
}

export function offsetRange(set, measure, stretched) {
  const centred = centredOffset(set.height, measure.capHeight)
  const low = -measure.range.bottom - (set.baseline - set.depth) - centred
  const high = set.height && !stretched ? set.height - measure.range.top - centred : Infinity
  return measure.depth <= set.depth && low <= high ? { low, high } : null
}

export function fitOffset(set, measure, stretched) {
  const range = offsetRange(set, measure, stretched)
  return range ? Math.min(Math.max(0, range.low), range.high) : null
}

export function fitProblems(set, measure, offset, stretched) {
  const shift = centredOffset(set.height, measure.capHeight) + offset
  const below = set.baseline - set.depth + shift
  const problems = []
  if (measure.depth > set.depth) problems.push(`it's ${measure.depth} deep and the strips only cover ${set.depth}`)
  if (-measure.range.bottom > below) problems.push(`its letters go ${-measure.range.bottom} below the baseline and the strips only cover ${Math.max(0, below)}`)
  if (set.height && !stretched && measure.range.top + shift > set.height) problems.push(`its letters reach ${measure.range.top + shift} above the baseline and the strips only go up to ${set.height}`)
  return problems
}

export function setEntry(set, offset, stretch) {
  return { stripSet: set.id, stripDepth: set.depth, stripBaseline: set.baseline, stripOffset: offset, stripHeight: set.height, ...(stretch && { stretch: true }) }
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
