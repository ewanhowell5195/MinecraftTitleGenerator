import { clamp } from "../../core/maths.js"
import { R } from "../paint/draw.js"

export const SWATCH = 1

const GAP = 4
const WIDTH_STEPS = 48

function blockSize(block, depth, scales) {
  return { width: Math.ceil(block.own.width * Math.max(scales.front.along, scales.edge.along)), height: depth * scales.edge.deep * 2 + block.own.height * scales.front.along }
}

function runSize(run, scales) {
  const { along, deep } = scales[run.region]
  const [sx, sy] = run.kind === "side" ? [deep, along] : [along, deep]
  return { width: Math.ceil((run.length ?? run.width) * sx), height: Math.ceil(run.height * sy), sx, sy }
}

function arrange(items, width) {
  let x = 0
  let y = 0
  let row = 0
  let wide = 0
  for (const item of items) {
    if (x > 0 && x + item.width > width) {
      x = 0
      y += row + GAP
      row = 0
    }
    item.x = x
    item.y = y
    x += item.width + GAP
    row = Math.max(row, item.height)
    wide = Math.max(wide, x - GAP)
  }
  return { width: Math.max(1, wide), height: Math.max(1, y + row) }
}

function itemsOf(plan, indexes, scales) {
  const chosen = new Set(indexes)
  const swatch = { swatch: true, width: SWATCH * R, height: SWATCH * R }
  const blocks = plan.blocks.filter(block => chosen.has(block.glyph)).map(block => ({ block, ...blockSize(block, plan.depth, scales) }))
  const runs = plan.runs.filter(run => chosen.has(run.glyph)).map(run => ({ run, ...runSize(run, scales) }))
  return blocks.concat(runs.concat(swatch).sort((a, b) => b.height - a.height || b.width - a.width))
}

function squarest(items, limit) {
  const widest = Math.max(...items.map(item => item.width))
  const area = items.reduce((sum, item) => sum + (item.width + GAP) * (item.height + GAP), 0)
  const most = Math.max(widest, Math.min(limit, items.reduce((sum, item) => sum + item.width + GAP, 0)))
  const tried = new Set([widest, most])
  for (let step = 0; step <= WIDTH_STEPS; step++) tried.add(Math.round(clamp(Math.sqrt(area) * (0.5 + step * 2 / WIDTH_STEPS), widest, most)))
  let best = null
  for (const width of tried) {
    const size = arrange(items, width)
    const side = Math.max(size.width, size.height)
    if (!best || side < best.side || side === best.side && size.width * size.height < best.width * best.height) best = { ...size, side, shelf: width }
  }
  return best
}

function fits(plan, indexes, scales, limit) {
  const best = squarest(itemsOf(plan, indexes, scales), limit)
  return best.width <= limit && best.height <= limit
}

export function pageGroups(plan, scales, limit) {
  const order = plan.glyphs
  const groups = []
  let start = 0
  while (start < order.length) {
    let low = 0
    let high = order.length - start
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (fits(plan, order.slice(start, start + middle), scales, limit)) low = middle
      else high = middle - 1
    }
    if (!low) {
      const { width, height } = squarest(itemsOf(plan, [order[start]], scales), limit)
      throw new Error(`one character's texture would be ${width}x${height}, over the ${limit} limit`)
    }
    let count = low
    if (start + count < order.length) {
      const word = Array.from({ length: count }, (_, at) => count - at).find(at => at > count / 2 && plan.spaces[order[start + at]] > 0)
      if (word) count = word
    }
    groups.push(order.slice(start, start + count))
    start += count
  }
  return groups.length ? groups : [[]]
}

function layoutPage(plan, indexes, scales, sheet, limit = Infinity) {
  const items = itemsOf(plan, indexes, scales)
  const size = arrange(items, squarest(items, limit).shelf)
  const glyphs = {}
  const regions = new Map()
  const swatchItem = items.find(item => item.swatch)
  const swatch = { x: swatchItem.x, y: swatchItem.y, scale: R }
  const placedBlocks = new Map(items.filter(item => item.block).map(item => [item.block, item]))
  for (const block of plan.blocks) {
    const item = placedBlocks.get(block)
    if (!item) continue
    const edge = { sx: scales.edge.along, sy: scales.edge.deep }
    const up = { x: item.x, y: item.y, ...edge }
    const front = { x: item.x, y: item.y + plan.depth * edge.sy, sx: scales.front.along, sy: scales.front.along }
    const down = { x: item.x, y: front.y + block.own.height * front.sy, ...edge }
    regions.set(block.glyph, { up, front, down })
    const entry = sheet.glyphs[block.char]
    if (!entry) continue
    const u0 = entry.x + block.own.minX - block.rect.minX
    glyphs[block.char] = { ...entry, regions: { front: { ...front, u0, v0: entry.top + block.rect.maxY - block.own.maxY }, up: { ...up, u0, v0: entry.up }, down: { ...down, u0, v0: entry.down } } }
  }
  const placed = new Map(items.filter(item => item.run).map(item => [item.run, { x: item.x, y: item.y, width: item.width, height: item.height, sx: item.sx, sy: item.sy }]))
  const key = JSON.stringify([size.width, size.height, swatch, Object.values(glyphs).map(entry => [entry.char, entry.regions])])
  return { width: size.width, height: size.height, glyphs, regions, runs: placed, swatch, tallest: sheet.tallest, wordWidth: sheet.wordWidth, key, indexes }
}

export function layoutPages(plan, groups, scales, sheet, limit) {
  return groups.map(indexes => layoutPage(plan, indexes, scales, sheet, limit))
}
