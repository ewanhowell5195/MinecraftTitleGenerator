const CURVE_STEPS = 16

function sourceChars(char, lowercase) {
  if (char === "\u{1F629}") return ["\u2018", "'"]
  const letter = char === "\u{1F633}" ? "a" : char
  if (/^[a-z]$/.test(letter)) return lowercase ? [letter, letter.toUpperCase()] : [letter.toUpperCase(), letter]
  return [char]
}

export function glyphFor(font, char, lowercase) {
  for (const candidate of sourceChars(char, lowercase)) {
    const glyph = font.charToGlyph(candidate)
    if (glyph && glyph.index !== 0) return glyph
  }
  return null
}

function flatten(glyph) {
  const contours = []
  let points = []
  let at = [0, 0]
  for (const command of glyph.path.commands) {
    if (command.type === "M") {
      if (points.length) contours.push(points)
      points = [[command.x, command.y]]
    } else if (command.type === "L") {
      points.push([command.x, command.y])
    } else if (command.type === "Q") {
      for (let step = 1; step <= CURVE_STEPS; step++) {
        const t = step / CURVE_STEPS
        const u = 1 - t
        points.push([u * u * at[0] + 2 * u * t * command.x1 + t * t * command.x, u * u * at[1] + 2 * u * t * command.y1 + t * t * command.y])
      }
    } else if (command.type === "C") {
      for (let step = 1; step <= CURVE_STEPS; step++) {
        const t = step / CURVE_STEPS
        const u = 1 - t
        points.push([u * u * u * at[0] + 3 * u * u * t * command.x1 + 3 * u * t * t * command.x2 + t * t * t * command.x, u * u * u * at[1] + 3 * u * u * t * command.y1 + 3 * u * t * t * command.y2 + t * t * t * command.y])
      }
    } else if (command.type === "Z") {
      if (points.length) contours.push(points)
      points = []
    }
    if (command.x !== undefined) at = [command.x, command.y]
  }
  if (points.length) contours.push(points)
  return contours
}

export function pixelGrid(glyphs, cap) {
  const values = []
  for (const glyph of glyphs) {
    const points = glyph.path.commands.filter(command => command.x !== undefined)
    if (!points.length) continue
    if (glyph.path.commands.some(command => command.type === "Q" || command.type === "C")) return null
    const left = Math.min(...points.map(command => command.x))
    for (const command of points) values.push(command.x - left, command.y)
  }
  for (let count = 3; count <= 64; count++) {
    const unit = cap / count
    if (values.every(value => Math.abs(value - Math.round(value / unit) * unit) <= 1)) return unit
  }
  return null
}

export function gridShift(glyph, unit) {
  const points = glyph.path.commands.filter(command => command.x !== undefined)
  if (!unit || !points.length) return 0
  const left = Math.min(...points.map(command => command.x))
  return Math.round(left / unit) * unit - left
}

export function capUnits(font) {
  const height = font.tables.os2?.sCapHeight
  if (height > 0) return height
  const glyph = font.charToGlyph("H")
  if (glyph && glyph.index !== 0) return glyph.getBoundingBox().y2
  return font.unitsPerEm * 0.7
}

export function rasterise(glyph, scale, shift) {
  const edges = flatten(glyph).flatMap(points => points.map((point, index) => [point, points[(index + 1) % points.length]])).map(([a, b]) => [(a[0] + shift) * scale, a[1] * scale, (b[0] + shift) * scale, b[1] * scale]).filter(([, y0, , y1]) => y0 !== y1)
  if (!edges.length) return null
  const ys = edges.flatMap(edge => [edge[1], edge[3]])
  const minY = Math.floor(Math.min(...ys))
  const maxY = Math.ceil(Math.max(...ys))
  const rows = []
  for (let y = minY; y < maxY; y++) {
    const centre = y + 0.5
    const crossings = []
    for (const [x0, y0, x1, y1] of edges) {
      if (centre < Math.min(y0, y1) || centre >= Math.max(y0, y1)) continue
      crossings.push([x0 + (centre - y0) / (y1 - y0) * (x1 - x0), y1 > y0 ? 1 : -1])
    }
    crossings.sort((a, b) => a[0] - b[0])
    const filled = new Set()
    let winding = 0
    for (let i = 0; i < crossings.length - 1; i++) {
      winding += crossings[i][1]
      if (!winding) continue
      for (let x = Math.ceil(crossings[i][0] - 0.5); x + 0.5 < crossings[i + 1][0]; x++) filled.add(x)
    }
    rows.push(filled)
  }
  let top = -Infinity
  let bottom = Infinity
  let left = Infinity
  let right = -Infinity
  for (const [index, filled] of rows.entries()) {
    if (!filled.size) continue
    top = Math.max(top, minY + index + 1)
    bottom = Math.min(bottom, minY + index)
    left = Math.min(left, ...filled)
    right = Math.max(right, ...filled)
  }
  if (top === -Infinity) return null
  const width = right - left + 1
  const height = top - bottom
  const mask = new Uint8Array(width * height)
  for (let y = bottom; y < top; y++) {
    for (const x of rows[y - minY]) mask[(top - 1 - y) * width + x - left] = 1
  }
  return { left, bottom, top, width, height, mask }
}
