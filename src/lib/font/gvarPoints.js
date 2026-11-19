const SHARED_POINT_NUMBERS = 0x8000
const COUNT_MASK = 0x0fff
const EMBEDDED_PEAK_TUPLE = 0x8000
const INTERMEDIATE_REGION = 0x4000
const PRIVATE_POINT_NUMBERS = 0x2000
const POINTS_ARE_WORDS = 0x80
const POINT_RUN_COUNT_MASK = 0x7f
const PHANTOM_POINTS = 4

function tagAt(view, at) {
  return String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3))
}

export function sfntTable(buffer, tag) {
  const view = new DataView(buffer)
  const count = view.getUint16(4)
  for (let table = 0; table < count; table++) {
    const at = 12 + table * 16
    if (tagAt(view, at) === tag) return new Uint8Array(buffer, view.getUint32(at + 8), view.getUint32(at + 12))
  }
  return null
}

async function inflate(stored, tag) {
  try {
    return new Uint8Array(await new Response(new Response(stored).body.pipeThrough(new DecompressionStream("deflate"))).arrayBuffer())
  } catch (err) {
    throw new Error(`the woff ${tag} table isn't valid zlib data (${err.cause?.message || err.message})`)
  }
}

export async function woffTable(buffer, tag) {
  const view = new DataView(buffer)
  const count = view.getUint16(12)
  for (let table = 0; table < count; table++) {
    const at = 44 + table * 20
    if (tagAt(view, at) !== tag) continue
    const stored = new Uint8Array(buffer, view.getUint32(at + 4), view.getUint32(at + 8))
    const length = view.getUint32(at + 12)
    if (stored.length === length) return stored
    if (stored.length > length) throw new Error(`the woff ${tag} table is stored larger than its ${length} byte original`)
    const inflated = await inflate(stored, tag)
    if (inflated.length !== length) throw new Error(`the woff ${tag} table inflated to ${inflated.length} bytes instead of ${length}`)
    return inflated
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
export function fixEveryPointTuples(font, table) {
  const gvar = font.tables.gvar
  if (!gvar) return font
  if (!table) throw new Error("this font has gvar data but no gvar table in its file")
  const view = new DataView(table.buffer, table.byteOffset, table.byteLength)
  const axisCount = view.getUint16(4)
  const glyphCount = view.getUint16(12)
  const long = view.getUint16(14) & 1
  const dataStart = view.getUint32(16)
  const offsetOf = index => long ? view.getUint32(20 + index * 4) : view.getUint16(20 + index * 2) * 2
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
