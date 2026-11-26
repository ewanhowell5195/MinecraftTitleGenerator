import { MULTICASE_CHARACTERS } from "./editor/characters.js"
import { DEFAULT_SPACE_WIDTH } from "./editor/defaults.js"
import { fontFromShapes } from "./editor/import.js"
import { flatten, glyphFor, gridShift, lineUnits, pixelGrid, rasterise } from "./fontOutline.js"
import { readFont } from "./readFont.js"

const SAMPLE_LETTERS = Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz")
const MOST_PIXEL_ROWS = 32
const PIXEL_SLACK = 0.1
const SUGGESTED_PIXELS = 40
const STROKE_ROWS = 120
const MESH_STEP = 0.5
const prepared = new WeakMap()

export function englishName(source, key) {
  const names = source.names.unicode ?? source.names.macintosh ?? source.names.windows
  return names?.[key]?.en?.trim() ?? ""
}

export async function parseFontFile(buffer) {
  if (buffer.byteLength < 4) throw new Error("that file is empty or too short to be a font")
  const start = String.fromCharCode(...new Uint8Array(buffer, 0, 4))
  if (start === "ttcf") throw new Error("font collections (.ttc) can't be imported, use a single .ttf or .otf")
  if (start !== "wOF2") {
    try {
      return readFont(buffer)
    } catch (err) {
      throw new Error(`that file isn't a font this editor can read (${err.message})`)
    }
  }
  const { default: decompress } = await import("woff2-encoder/decompress")
  const font = await decompress(buffer)
  return readFont(font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength))
}

export function atVariation(source, coords) {
  const glyphAt = source.charToGlyph.bind(source)
  source.charToGlyph = char => source.variation.getTransform(glyphAt(char), coords)
  return source
}

function scaled(source, { height = 40, density = 1 }) {
  const key = `${height}:${density}`
  const known = prepared.get(source) ?? new Map()
  prepared.set(source, known)
  if (known.has(key)) return known.get(key)
  const glyphs = MULTICASE_CHARACTERS.map(char => glyphFor(source, char))
  const { top, base } = lineUnits(source)
  const units = top - base
  const unit = pixelGrid(glyphs.filter(Boolean), units, base)
  const block = unit ? Math.max(1, Math.round(height / (units / unit))) : density > 1 ? density : null
  const square = unit ? 1 : density
  const scale = unit ? block / unit : Math.max(1, Math.round(height / square)) / units
  const capHeight = Math.round(units * scale) * square
  if (!Number.isFinite(scale) || capHeight < 1) throw new Error("this font has no usable cap height")
  const placed = []
  function placedAt(index) {
    const glyph = glyphs[index]
    if (!glyph) return null
    if (!placed[index]) {
      const shift = gridShift(glyph, unit, scale)
      placed[index] = { shift, shape: rasterise(glyph, scale, shift, base) }
    }
    return placed[index]
  }
  const found = { glyphs, unit, block, scale, square, capHeight, base, placedAt }
  known.set(key, found)
  return found
}

function enlarged(shape, square) {
  if (!shape || square === 1) return shape
  const width = shape.width * square
  const mask = new Uint8Array(width * shape.height * square)
  for (let y = 0; y < mask.length / width; y++) {
    for (let x = 0; x < width; x++) mask[y * width + x] = shape.mask[Math.floor(y / square) * shape.width + Math.floor(x / square)]
  }
  return { left: shape.left * square, bottom: shape.bottom * square, top: shape.top * square, width, height: shape.height * square, mask }
}

function strokeRuns(shape) {
  const runs = []
  const at = (x, y) => shape.mask[y * shape.width + x]
  for (const [across, along, cell] of [[shape.height, shape.width, (a, b) => at(b, a)], [shape.width, shape.height, (a, b) => at(a, b)]]) {
    for (let a = 0; a < across; a++) {
      let run = 0
      for (let b = 0; b <= along; b++) {
        if (b < along && cell(a, b)) run++
        else if (run) {
          runs.push(run)
          run = 0
        }
      }
    }
  }
  return runs
}

function letterRows(glyphs, units, base) {
  const values = []
  for (const glyph of glyphs) {
    const points = glyph.path.commands.filter(command => command.x !== undefined)
    if (!points.length) continue
    if (glyph.path.commands.some(command => command.type === "Q" || command.type === "C")) return null
    const left = Math.min(...points.map(command => command.x))
    for (const command of points) values.push(command.x - left, command.y - base)
  }
  for (let count = 3; count <= MOST_PIXEL_ROWS; count++) {
    const unit = units / count
    if (values.every(value => Math.abs(value - Math.round(value / unit) * unit) <= unit * PIXEL_SLACK)) return count
  }
  return null
}

function nearestSquare(rows) {
  return Math.max(1, Math.ceil(SUGGESTED_PIXELS / rows - 0.5))
}

export function suggestedSize(source) {
  const { top, base } = lineUnits(source)
  const units = top - base
  const glyphs = SAMPLE_LETTERS.map(char => glyphFor(source, char)).filter(Boolean)
  const rows = letterRows(glyphs, units, base)
  if (rows) return { rows, square: nearestSquare(rows), pixel: true }
  const scale = STROKE_ROWS / units
  const capitals = SAMPLE_LETTERS.filter(char => char === char.toUpperCase()).map(char => glyphFor(source, char)).filter(Boolean)
  const runs = capitals.flatMap(glyph => {
    const shape = rasterise(glyph, scale, gridShift(glyph, null, scale), base)
    return shape ? strokeRuns(shape) : []
  }).sort((a, b) => a - b)
  if (!runs.length) return { rows: 10, square: 4, pixel: false }
  const thin = runs[Math.floor(runs.length * 0.2)]
  const needed = Math.min(64, Math.max(8, Math.round(STROKE_ROWS * 2 / thin)))
  const square = Math.max(1, Math.floor(SUGGESTED_PIXELS / needed))
  return { rows: Math.max(needed, Math.round(SUGGESTED_PIXELS / square)), square, pixel: false }
}

export function outlineShape(source, char, options = {}) {
  const { unit, scale, square, capHeight, base } = scaled(source, options)
  const glyph = glyphFor(source, char)
  const shape = glyph && rasterise(glyph, scale, gridShift(glyph, unit, scale), base)
  return shape ? { shape: enlarged(shape, square), capHeight } : null
}

export function meshOutlines(source, options = {}) {
  const { glyphs, scale, square, base, placedAt } = scaled(source, options)
  return Object.fromEntries(MULTICASE_CHARACTERS.flatMap((char, index) => {
    const placed = placedAt(index)
    if (!placed?.shape) return []
    const { shift, shape } = placed
    return [[char, flatten(glyphs[index], MESH_STEP / scale).map(points => points.map(([x, y]) => [((x + shift) * scale - shape.left) * square, (y - base) * scale * square]))]]
  }))
}

export function fontFromOutlines(source, options = {}) {
  const { glyphs, block, scale, square, capHeight, placedAt } = scaled(source, options)
  const shapes = new Map(MULTICASE_CHARACTERS.map((char, index) => [char, glyphs[index] ? enlarged(placedAt(index).shape, square) : null]))
  const space = source.charToGlyph(" ")
  const spaceWidth = space && space.index !== 0 ? Math.round(space.advanceWidth * scale) * square : Math.round(capHeight / 4) || DEFAULT_SPACE_WIDTH
  const font = fontFromShapes(shapes, { name: englishName(source, "fullName") || "Imported Font", authors: englishName(source, "designer"), capHeight, grid: block, spaceWidth })
  return { ...font, kerning: fontKerning(source, glyphs, scale, square) }
}

function fontKerning(source, glyphs, scale, square) {
  const kerning = {}
  for (const [first, before] of glyphs.entries()) {
    if (!before) continue
    for (const [second, after] of glyphs.entries()) {
      const amount = after && -Math.round(source.getKerningValue(before, after) * scale) * square
      if (amount) kerning[MULTICASE_CHARACTERS[first] + MULTICASE_CHARACTERS[second]] = amount
    }
  }
  return kerning
}
