import { toRad } from "#lib/core/maths.js"

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const SHADOW_QUALITY = { draft: { scale: 1, samples: 4, subrows: 1 }, preview: { scale: 4, samples: 8, subrows: 1 }, final: { scale: 8, samples: 64, subrows: 2 } }
let shadowQuality = "preview"
const PENUMBRA_SAMPLES = 2

export function shadowQualityName() {
  return shadowQuality
}

function withShadowQuality(name, work) {
  const before = shadowQuality
  shadowQuality = name
  try {
    return work()
  } finally {
    shadowQuality = before
  }
}

export function withFinalShadows(work) {
  return withShadowQuality("final", work)
}

export function withDraftShadows(work) {
  return withShadowQuality("draft", work)
}

function boxBlur(values, columns, rows, radius) {
  for (const [count, step, lines, along] of [[columns, 1, rows, columns], [rows, columns, columns, 1]]) {
    const from = values.slice()
    for (let line = 0; line < lines; line++) {
      const start = line * along
      let sum = 0
      for (let at = 0; at <= radius && at < count; at++) sum += from[start + at * step]
      for (let at = 0; at < count; at++) {
        values[start + at * step] = sum / (radius * 2 + 1)
        if (at - radius >= 0) sum -= from[start + (at - radius) * step]
        if (at + radius + 1 < count) sum += from[start + (at + radius + 1) * step]
      }
    }
  }
}

function patchBlur(values, open, columns, rows, radius) {
  const labels = new Int32Array(columns * rows).fill(-1)
  const queue = new Int32Array(columns * rows)
  const result = values.slice()
  let label = 0
  for (let seed = 0; seed < labels.length; seed++) {
    if (!open[seed] || labels[seed] >= 0) continue
    let head = 0
    let tail = 0
    let x0 = columns
    let y0 = rows
    let x1 = 0
    let y1 = 0
    labels[seed] = label
    queue[tail++] = seed
    while (head < tail) {
      const at = queue[head++]
      const x = at % columns
      const y = (at - x) / columns
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
      for (const next of [x > 0 ? at - 1 : -1, x < columns - 1 ? at + 1 : -1, y > 0 ? at - columns : -1, y < rows - 1 ? at + columns : -1]) {
        if (next < 0 || !open[next] || labels[next] >= 0) continue
        labels[next] = label
        queue[tail++] = next
      }
    }
    const reach = radius * 3
    const left = Math.max(0, x0 - reach)
    const top = Math.max(0, y0 - reach)
    const width = Math.min(columns - 1, x1 + reach) - left + 1
    const height = Math.min(rows - 1, y1 + reach) - top + 1
    const sums = new Float32Array(width * height)
    const weights = new Float32Array(width * height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const at = (top + y) * columns + left + x
        if (labels[at] !== label) continue
        sums[y * width + x] = values[at]
        weights[y * width + x] = 1
      }
    }
    for (let pass = 0; pass < 3; pass++) {
      boxBlur(sums, width, height, radius)
      boxBlur(weights, width, height, radius)
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const at = (top + y) * columns + left + x
        if (labels[at] === label) result[at] = sums[y * width + x] / weights[y * width + x]
      }
    }
    label++
  }
  values.set(result)
}

function base(glyph) {
  return (glyph.bottom ?? 0) + (glyph.lift ?? 0)
}

function sweep(field, columns, rows, runs, scale, dx, dy, subrows, weight) {
  const spans = []
  for (let py = 0; py < rows; py++) {
    for (let sub = 0; sub < subrows; sub++) {
      const y = py + (sub + 0.5) / subrows
      spans.length = 0
      for (const [from, to, top] of runs) {
        let low = 0
        let high = 1
        if (Math.abs(dy) < 1e-9) {
          if (y < top || y > top + scale) continue
        } else {
          const a = (y - top - scale) / dy
          const b = (y - top) / dy
          low = Math.max(0, Math.min(a, b))
          high = Math.min(1, Math.max(a, b))
          if (low > high) continue
        }
        spans.push([from + Math.min(low * dx, high * dx), to + Math.max(low * dx, high * dx)])
      }
      spans.sort((a, b) => a[0] - b[0])
      let start = -Infinity
      let end = -Infinity
      for (const span of spans.concat([[Infinity, Infinity]])) {
        if (span[0] <= end) {
          end = Math.max(end, span[1])
          continue
        }
        const a = Math.max(0, start)
        const b = Math.min(columns, end)
        for (let px = Math.floor(a); px < b; px++) field[py * columns + px] += (Math.min(px + 1, b) - Math.max(px, a)) * weight / subrows
        start = span[0]
        end = span[1]
      }
    }
  }
}

export function shadow(glyph, settings, target) {
  const { width, height, mask, caster } = glyph
  if (!caster) return new Float32Array(width * target * height * target)
  const light = settings.blur / 2
  const quality = SHADOW_QUALITY[shadowQuality]
  const samples = light > 0 ? Math.min(quality.samples, Math.max(8, Math.ceil(light * light * 16))) : 1
  const wanted = shadowQuality === "draft" ? quality.scale : Math.max(quality.scale, Math.ceil(PENUMBRA_SAMPLES / light))
  const scale = samples > 1 ? Math.min(target, wanted) : target
  const columns = width * scale
  const rows = height * scale
  const field = new Float32Array(columns * rows)
  const reach = Math.ceil(settings.distance + settings.blur) + 1
  const near = [glyph]
  if (glyph.placedX !== undefined) {
    for (let other = glyph.previous; other?.caster && other.placedX + other.width > glyph.placedX - reach; other = other.previous) near.push(other)
    for (let other = glyph.next; other?.caster && other.placedX < glyph.placedX + width + reach; other = other.next) near.push(other)
  }
  const runs = []
  for (const other of near) {
    const left = ((other.placedX ?? 0) - (glyph.placedX ?? 0)) * scale
    for (let row = 0; row < other.height; row++) {
      const top = (height - 1 - (row + base(other) - base(glyph))) * scale
      if (top + scale <= -reach * scale || top >= rows + reach * scale) continue
      for (let column = 0; column < other.width; column++) {
        if (!other.caster[row * other.width + column]) continue
        let end = column
        while (end + 1 < other.width && other.caster[row * other.width + end + 1]) end++
        runs.push([left + column * scale, left + (end + 1) * scale, top])
        column = end
      }
    }
  }
  const turn = toRad(settings.angle)
  for (let sample = 0; sample < samples; sample++) {
    const spread = samples > 1 ? light * Math.sqrt((sample + 0.5) / samples) : 0
    const around = sample * GOLDEN_ANGLE
    const dx = (Math.cos(turn) * settings.distance + Math.cos(around) * spread) * scale
    const dy = (Math.sin(turn) * settings.distance + Math.sin(around) * spread) * scale
    sweep(field, columns, rows, runs, scale, dx, dy, samples > 1 ? quality.subrows : 4, 1 / samples)
  }
  const open = new Uint8Array(columns * rows)
  for (let py = 0; py < rows; py++) {
    for (let px = 0; px < columns; px++) {
      const index = (height - 1 - Math.floor(py / scale)) * width + Math.floor(px / scale)
      if (mask[index] && !caster[index]) open[py * columns + px] = 1
    }
  }
  const smoothing = samples > 1 ? Math.round(light * Math.sqrt(Math.PI / samples) * scale / 2) : 0
  if (smoothing >= 1) patchBlur(field, open, columns, rows, smoothing)
  for (let index = 0; index < field.length; index++) if (!open[index]) field[index] = 0
  if (scale === target) return field
  const out = new Float32Array(width * target * height * target)
  const wide = width * target
  function tap(sx, sy) {
    return sx >= 0 && sy >= 0 && sx < columns && sy < rows && open[sy * columns + sx] ? sy * columns + sx : -1
  }
  for (let py = 0; py < height * target; py++) {
    const y = (py + 0.5) * scale / target - 0.5
    const y0 = Math.floor(y)
    const fy = y - y0
    const row = (height - 1 - Math.floor(py / target)) * width
    for (let px = 0; px < wide; px++) {
      const index = row + Math.floor(px / target)
      if (!mask[index] || caster[index]) continue
      const x = (px + 0.5) * scale / target - 0.5
      const x0 = Math.floor(x)
      const fx = x - x0
      const a = tap(x0, y0)
      const b = tap(x0 + 1, y0)
      const c = tap(x0, y0 + 1)
      const d = tap(x0 + 1, y0 + 1)
      const wa = a < 0 ? 0 : (1 - fx) * (1 - fy)
      const wb = b < 0 ? 0 : fx * (1 - fy)
      const wc = c < 0 ? 0 : (1 - fx) * fy
      const wd = d < 0 ? 0 : fx * fy
      const total = wa + wb + wc + wd
      out[py * wide + px] = total > 0 ? ((wa && field[a] * wa) + (wb && field[b] * wb) + (wc && field[c] * wc) + (wd && field[d] * wd)) / total : field[Math.min(rows - 1, Math.max(0, Math.round(y))) * columns + Math.min(columns - 1, Math.max(0, Math.round(x)))]
    }
  }
  return out
}
