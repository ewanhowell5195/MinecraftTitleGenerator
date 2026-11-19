const SHARED_POINT_NUMBERS = 0x8000
const COUNT_MASK = 0x0fff
const EMBEDDED_PEAK_TUPLE = 0x8000
const INTERMEDIATE_REGION = 0x4000
const PRIVATE_POINT_NUMBERS = 0x2000
const POINTS_ARE_WORDS = 0x80
const POINT_RUN_COUNT_MASK = 0x7f
const PHANTOM_POINTS = 4

function tableStart(view, tag) {
  const count = view.getUint16(4)
  for (let table = 0; table < count; table++) {
    const at = 12 + table * 16
    if (String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3)) === tag) return view.getUint32(at + 8)
  }
  return null
}

function pointCount(view, at) {
  const first = view.getUint8(at)
  return first & POINTS_ARE_WORDS ? (first & POINT_RUN_COUNT_MASK) << 8 | view.getUint8(at + 1) : first
}

function afterPoints(view, at) {
  const total = pointCount(view, at)
  at += view.getUint8(at) & POINTS_ARE_WORDS ? 2 : 1
  for (let read = 0; read < total;) {
    const control = view.getUint8(at++)
    const run = (control & POINT_RUN_COUNT_MASK) + 1
    at += run * (control & POINTS_ARE_WORDS ? 2 : 1)
    read += run
  }
  return at
}

function everyPoint(glyph) {
  const outline = glyph.isComposite ? glyph.components.length : glyph.points.length
  return Array.from({ length: outline + PHANTOM_POINTS }, (_, index) => index)
}

// opentype.js reads a private point list of count 0 ("every point") as no private list and uses the shared points instead
export function fixEveryPointTuples(font, buffer) {
  const gvar = font.tables.gvar
  if (!gvar) return font
  const view = new DataView(buffer)
  const start = tableStart(view, "gvar")
  if (start === null) throw new Error("this font has gvar data but no gvar table in its file")
  const axisCount = view.getUint16(start + 4)
  const glyphCount = view.getUint16(start + 12)
  const long = view.getUint16(start + 14) & 1
  const dataStart = start + view.getUint32(start + 16)
  const offsetOf = index => long ? view.getUint32(start + 20 + index * 4) : view.getUint16(start + 20 + index * 2) * 2
  for (let index = 0; index < glyphCount; index++) {
    const variations = gvar.glyphVariations[index]
    const begin = offsetOf(index)
    if (!variations || begin === offsetOf(index + 1)) continue
    const glyphData = dataStart + begin
    const flags = view.getUint16(glyphData)
    if (!(flags & SHARED_POINT_NUMBERS)) continue
    let at = glyphData + 4
    const tuples = []
    for (let tuple = 0; tuple < (flags & COUNT_MASK); tuple++) {
      const tupleIndex = view.getUint16(at + 2)
      tuples.push({ size: view.getUint16(at), privatePoints: !!(tupleIndex & PRIVATE_POINT_NUMBERS) })
      at += 4 + (tupleIndex & EMBEDDED_PEAK_TUPLE ? axisCount * 2 : 0) + (tupleIndex & INTERMEDIATE_REGION ? axisCount * 4 : 0)
    }
    let data = afterPoints(view, glyphData + view.getUint16(glyphData + 2))
    for (const [tuple, { size, privatePoints }] of tuples.entries()) {
      if (privatePoints && pointCount(view, data) === 0) {
        const glyph = font.glyphs.get(index)
        glyph.path
        variations.headers[tuple].privatePoints = everyPoint(glyph)
      }
      data += size
    }
  }
  return font
}
