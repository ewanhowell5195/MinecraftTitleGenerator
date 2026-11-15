import { stripRange } from "../assets.js"
import { layerSlices } from "../flatSheet.js"
import { fontFolder, fullOrder, parseMask, sheetOwner } from "../font.js"
import { characterName } from "../fontEditor.js"
import { clamp } from "../maths.js"
import { titleCase } from "../names.js"
import { defaultBorder, defaultDepth } from "../settings.js"
import { centredOffset, stackedStrip, stripRows, stripTag, stripUse, stripY } from "../strips.js"
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
    const stacked = layer === null && layers?.length > 1 ? stackedStrip({ depth: defaultDepth(font) }, layers, 0, list).total : null
    return { range: stripRange({ cells: list, capHeight }, layer), capHeight, depth: layerDepth(defaultDepth(font), layers, layer), stacked }
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
  return measure.stacked ?? measure.depth * 2 + measure.range.top - measure.range.bottom
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

function lowestRow(measure, stretched) {
  return measure.range.bottom - (stretched ? measure.range.lines?.base ?? 0 : 0)
}

export function stripFit(set, measure, offset, { stretched = false, heights = [] } = {}) {
  const centred = centredOffset(set.height, measure.capHeight)
  const base = set.baseline + set.depth + measure.range.top
  const low = -lowestRow(measure, stretched) - (set.baseline - set.depth) - centred
  const high = set.height && !stretched ? set.height - measure.range.top - centred : Infinity
  const problems = []
  if (offset < low) problems.push("below")
  if (offset > high) problems.push("above")
  if (!set.height && heights.some(height => !Number.isInteger(Math.log2(height / (base + offset))))) problems.push("height")
  const range = low <= high ? { low, high } : null
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

function pixels(count) {
  return `${count} pixel${count === 1 ? "" : "s"}`
}

export function reachProblems(set, measure, offset, codes, { named = char => `"${characterName(char, null)}"`, plain = "its letters go", stretched = false } = {}) {
  const shift = centredOffset(set.height, measure.capHeight) + offset
  const parts = []
  if (codes.includes("below")) parts.push({ char: measure.range.lowest, text: `${pixels(-lowestRow(measure, stretched) - (set.baseline - set.depth + shift))} too low` })
  if (codes.includes("above")) parts.push({ char: measure.range.highest, text: `${pixels(measure.range.top + shift - set.height)} too high` })
  function lead(char) {
    const name = char && named(char)
    return name ? `${name} goes` : plain
  }
  if (parts.length === 2 && parts[0].char === parts[1].char) return [`${lead(parts[0].char)} ${parts[0].text} and ${parts[1].text}`]
  return parts.map(part => `${lead(part.char)} ${part.text}`)
}

export function fitProblems(set, measure, offset, stretched) {
  const { problems } = stripFit(set, measure, offset, { stretched })
  return reachProblems(set, measure, offset, problems, { named: char => `its "${characterName(char, null)}"`, stretched })
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

export function setEntry(set, offset, stretch) {
  return { ...stripTag(set, offset), ...(stretch && { stretch: true }) }
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
