import { clamp, toRad } from "#lib/core/maths.js"
import { random } from "./random.js"

const WAVE_START = -1024

function randomBands(from, to, settings) {
  const next = random(settings.seed)
  const vary = size => Math.max(0.5, size * (1 + settings.randomness / 100 * (next() * 2 - 1)))
  const list = []
  for (let at = -1024; at < to;) {
    const width = vary(settings.width)
    if (at + width > from) list.push([at, at + width])
    at += width + vary(settings.gap)
  }
  return list
}

export function shine(glyph, kind, settings, scale, fine) {
  const { width, height, mask } = glyph
  const columns = width * scale
  const rows = height * scale
  const out = new Float32Array(columns * rows)
  const arc = glyph.arc ?? { top: 0, bottom: 0 }
  const { capHeight, width: band } = settings
  const period = band + settings.gap
  const sin = Math.sin(toRad(settings.angle))
  const cos = Math.cos(toRad(settings.angle))
  const start = glyph.placedX * sin + 18.75 + settings.offset
  const position = (x, down) => start + x * sin - down * cos
  const corners = [[0, capHeight - glyph.top], [width, capHeight - glyph.top], [0, capHeight - glyph.bottom], [width, capHeight - glyph.bottom]].map(([x, down]) => position(x, down))
  const list = kind === "shine_random" ? randomBands(Math.min(...corners) - 1, Math.max(...corners) + 1, settings) : null
  const fade = settings.fade / 100
  for (let sy = 0; sy < rows; sy++) {
    const down = capHeight - (glyph.top - (sy + 0.5) / scale)
    const alpha = clamp(1 - fade * (down + arc.top) / (capHeight + arc.top + arc.bottom), 0, 1)
    const row = height - 1 - Math.floor(sy / scale)
    for (let sx = 0; sx < columns; sx++) {
      if (fine ? !fine[(rows - 1 - sy) * columns + sx] : !mask[row * width + Math.floor(sx / scale)]) continue
      const along = position((sx + 0.5) / scale, down)
      const inside = list ? list.some(([from, to]) => along >= from && along < to) : ((along % period) + period) % period < band
      if (inside) out[sy * columns + sx] = alpha
    }
  }
  return out
}

export function clippedTo(polygon, value) {
  const kept = []
  for (const [index, point] of polygon.entries()) {
    const next = polygon[(index + 1) % polygon.length]
    const [here, there] = [value(point), value(next)]
    if (here >= 0) kept.push(point)
    if (here >= 0 !== there >= 0) {
      const part = here / (here - there)
      kept.push([point[0] + (next[0] - point[0]) * part, point[1] + (next[1] - point[1]) * part])
    }
  }
  return kept
}

export function shineOutlines(glyph, kind, settings) {
  const { width, height } = glyph
  const arc = glyph.arc ?? { top: 0, bottom: 0 }
  const { capHeight, width: band } = settings
  const capTop = capHeight - glyph.top
  const period = band + settings.gap
  const sin = Math.sin(toRad(settings.angle))
  const cos = Math.cos(toRad(settings.angle))
  const start = glyph.placedX * sin + 18.75 + settings.offset
  const position = ([x, y]) => start + x * sin - (capTop + y) * cos
  const fade = settings.fade / 100
  const lowest = fade ? Math.min(height, (capHeight + arc.top + arc.bottom) / fade - arc.top - capTop) : height
  if (lowest <= 0) return []
  const area = [[0, 0], [width, 0], [width, lowest], [0, lowest]]
  const alongs = area.map(position)
  const [from, to] = [Math.min(...alongs) - 1, Math.max(...alongs) + 1]
  const bands = []
  if (kind === "shine_random") bands.push(...randomBands(from, to, settings))
  else for (let at = Math.floor(from / period) * period; at < to; at += period) bands.push([at, at + band])
  return bands.map(([low, high]) => clippedTo(clippedTo(area, point => position(point) - low), point => high - position(point))).filter(polygon => polygon.length > 2)
}

function wavePoints(from, to, settings) {
  const swing = settings.randomness / 100
  const next = random(settings.seed)
  const points = []
  let at = WAVE_START - next() * settings.length * 2 * swing
  for (let index = 0; !points.length || points.at(-1)[0] <= to; index++) {
    points.push([at, (index % 2 ? 1 : -1) * settings.amplitude * (1 - 0.5 * swing * next())])
    at += settings.length * (1 + 0.6 * swing * (next() * 2 - 1))
  }
  const back = random(settings.seed + 100)
  const before = []
  at = points[0][0]
  for (let index = -1; at > from; index--) {
    at -= settings.length * (1 + 0.6 * swing * (back() * 2 - 1))
    before.push([at, (index % 2 ? 1 : -1) * settings.amplitude * (1 - 0.5 * swing * back())])
  }
  return before.reverse().concat(points)
}

function waveSegment(points, along) {
  let low = 0
  let high = points.length - 1
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (points[middle][0] <= along) low = middle
    else high = middle
  }
  return low
}

function waveHeight(shape, [x0, y0], [x1, y1], along) {
  const part = (along - x0) / (x1 - x0)
  if (shape === "square") return part < 0.5 ? y0 : y1
  if (shape === "triangle") return y0 + (y1 - y0) * part
  return y0 + (y1 - y0) * (1 - Math.cos(Math.PI * part)) / 2
}

function stairCrossing(shape, share) {
  if (shape === "square") return 0.5
  if (shape === "triangle") return share
  return Math.acos(1 - 2 * share) / Math.PI
}

function stairRuns(shape, count, steps) {
  if (!steps) return [count]
  const bounds = [0]
  for (let step = 1; step <= steps; step++) bounds.push(Math.max(bounds.at(-1), Math.min(count, Math.round(count * stairCrossing(shape, (step - 0.5) / steps)))))
  const runs = bounds.map((bound, step) => (bounds[step + 1] ?? count) - bound)
  const slope = runs.slice(1, -1).sort((a, b) => b - a)
  const valley = new Array(slope.length)
  let left = 0
  let right = slope.length - 1
  slope.forEach((run, index) => index % 2 ? valley[right--] = run : valley[left++] = run)
  return [runs[0]].concat(valley, runs.at(-1))
}

function snappedBlocks(value, block) {
  return Math.sign(value) * Math.round(Math.abs(value) / block) * block
}

function waveStairs(points, shape, block) {
  const snapped = []
  for (const [x, y] of points) snapped.push([Math.max(Math.round(x / block) * block, snapped.length ? snapped.at(-1)[0] + block : -Infinity), snappedBlocks(y, block)])
  const heights = new Map()
  for (let index = 0; index + 1 < snapped.length; index++) {
    const [[x0, y0], [x1, y1]] = [snapped[index], snapped[index + 1]]
    const turn = Math.sign(y1 - y0) * block
    let column = Math.round(x0 / block)
    stairRuns(shape, Math.round((x1 - x0) / block), Math.round(Math.abs(y1 - y0) / block)).forEach((run, step) => {
      for (let count = 0; count < run; count++) heights.set(column++, y0 + turn * step)
    })
  }
  return heights
}

function cleanBlocks(grid, across, down) {
  const at = (x, y) => grid[clamp(y, 0, down - 1) * across + clamp(x, 0, across - 1)]
  return grid.map((value, index) => {
    const x = index % across
    const y = Math.floor(index / across)
    const agreeing = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].filter(other => other === value).length
    return agreeing <= 1 ? 1 - value : value
  })
}

const WAVE_SAMPLES = 32

function waveCurve(points, shape, from, to) {
  const curve = []
  for (let index = waveSegment(points, from); index + 1 < points.length && points[index][0] < to; index++) {
    const [start, end] = [points[index], points[index + 1]]
    const parts = shape === "sine" ? WAVE_SAMPLES : 1
    for (let step = 0; step < parts; step++) {
      const at = start[0] + (end[0] - start[0]) * step / parts
      if (shape === "square") curve.push([at, start[1]], [(start[0] + end[0]) / 2, start[1]], [(start[0] + end[0]) / 2, end[1]])
      else curve.push([at, waveHeight(shape, start, end, at)])
    }
  }
  const inside = curve.filter(([at]) => at > from && at < to)
  const height = at => waveHeight(shape, points[waveSegment(points, at)], points[waveSegment(points, at) + 1], at)
  return [[from, height(from)]].concat(inside, [[to, height(to)]])
}

function waveFrame(glyph, settings) {
  const { width, height } = glyph
  const capTop = settings.capHeight - glyph.top
  const middle = settings.capHeight / 2
  const turn = toRad(settings.angle)
  const cos = Math.round(Math.cos(turn) * 1e9) / 1e9
  const sin = Math.round(Math.sin(turn) * 1e9) / 1e9
  const [start, end] = glyph.lineSpan ?? [0, 0]
  const centre = (start + end) / 2
  const along = (x, down) => (x - settings.horizontalOffset - centre) * cos + (down - middle) * sin + centre - settings.offset
  const across = (x, down) => middle - (x - settings.horizontalOffset - centre) * sin + (down - middle) * cos
  const corners = [[glyph.placedX, capTop], [glyph.placedX + width, capTop], [glyph.placedX, capTop + height], [glyph.placedX + width, capTop + height]]
  return { capTop, middle, level: settings.level / 100 * settings.capHeight, cos, sin, centre, along, across, corners }
}

export function waveOutline(glyph, settings) {
  if (settings.pixelation) return null
  const { capTop, middle, level, cos, sin, centre, along, across, corners } = waveFrame(glyph, settings)
  function local([a, c]) {
    const shifted = a - centre + settings.offset
    const raised = c - middle
    return [shifted * cos - raised * sin + settings.horizontalOffset + centre - glyph.placedX, shifted * sin + raised * cos + middle - capTop]
  }
  const alongs = corners.map(([x, down]) => along(x, down))
  const acrosses = corners.map(([x, down]) => across(x, down))
  const from = Math.min(...alongs) - 1
  const to = Math.max(...alongs) + 1
  const points = wavePoints(from, to, settings)
  const curve = waveCurve(points, settings.waveShape, from, to).map(([at, rise]) => [at, level + rise])
  const beyond = Math.min(...acrosses, ...curve.map(([, rise]) => rise)) - 1
  return curve.concat([[to, beyond], [from, beyond]]).map(local)
}

export function waveFill(glyph, settings, scale, fine) {
  const { width, height, mask } = glyph
  const columns = width * scale
  const rows = height * scale
  const out = new Float32Array(columns * rows)
  const block = settings.pixelation
  const frame = waveFrame(glyph, settings)
  const { capTop, middle, level, sin, along, across } = frame
  const corners = frame.corners.map(([x, down]) => along(x, down))
  const solid = (sx, sy) => fine ? fine[(rows - 1 - sy) * columns + sx] : mask[(height - 1 - Math.floor(sy / scale)) * width + Math.floor(sx / scale)]
  if (!block) {
    const points = wavePoints(Math.min(...corners) - 1, Math.max(...corners) + 1, settings)
    function surface(x, down) {
      const at = along(x, down)
      const index = waveSegment(points, at)
      return level + waveHeight(settings.waveShape, points[index], points[index + 1], at)
    }
    const columnSurface = sin ? null : Array.from({ length: columns }, (_, sx) => surface(glyph.placedX + (sx + 0.5) / scale, middle))
    for (let sy = 0; sy < rows; sy++) {
      const down = capTop + (sy + 0.5) / scale
      for (let sx = 0; sx < columns; sx++) {
        if (!solid(sx, sy)) continue
        const x = glyph.placedX + (sx + 0.5) / scale
        out[sy * columns + sx] = clamp(((columnSurface ? columnSurface[sx] : surface(x, down)) - across(x, down)) * scale + 0.5, 0, 1)
      }
    }
    return out
  }
  const reach = 2 * block
  const points = wavePoints(Math.min(...corners) - reach - 1, Math.max(...corners) + reach + 1, { ...settings, length: Math.max(block, snappedBlocks(settings.length, block)) })
  const stairs = waveStairs(points, settings.waveShape, block)
  const surface = snappedBlocks(level, block)
  const firstRow = Math.floor(capTop / block) - 1
  const blocksAcross = Math.ceil(width / block) + 2
  const blocksDown = Math.floor((capTop + height) / block) + 2 - firstRow
  let grid = Array.from({ length: blocksAcross * blocksDown }, (_, index) => {
    const x = glyph.placedX + (index % blocksAcross - 0.5) * block
    const down = (firstRow + Math.floor(index / blocksAcross) + 0.5) * block
    return across(x, down) < surface + stairs.get(Math.floor(along(x, down) / block)) ? 1 : 0
  })
  if (settings.angle % 90) grid = cleanBlocks(grid, blocksAcross, blocksDown)
  for (let sy = 0; sy < rows; sy++) {
    const row = Math.floor((capTop + (sy + 0.5) / scale) / block) - firstRow
    for (let sx = 0; sx < columns; sx++) {
      if (solid(sx, sy)) out[sy * columns + sx] = grid[row * blocksAcross + Math.floor((sx + 0.5) / scale / block) + 1]
    }
  }
  return out
}
