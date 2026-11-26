import { inflateSync } from "three/addons/libs/fflate.module.js"
import { CFF_EXPERT, CFF_EXPERT_SUBSET, CFF_ISO_ADOBE, CFF_STANDARD_ENCODING, CFF_STANDARD_STRINGS, MAC_ENCODINGS, MAC_ENGLISH, MAC_LANGUAGE_ENCODINGS, MAC_LANGUAGES, MAC_SCRIPT_ENCODINGS, NAME_PROPERTIES, WINDOWS_ENGLISH, WINDOWS_LANGUAGES } from "./fontTables.js"

const MAX_CALL_DEPTH = 10
const PHANTOM_POINTS = 4
const TRUETYPE = "\0\u0001\0\0"
const UTF16 = "utf-16"

function tagAt(view, at) {
  let tag = ""
  for (let i = at; i < at + 4; i++) tag += String.fromCharCode(view.getInt8(i))
  return tag
}

function fixedAt(view, at) {
  return view.getInt16(at) + view.getUint16(at + 2) / 65535
}

function f2dot14(view, at) {
  return view.getInt16(at) / 16384
}

function bytesOf(view, from, to) {
  return new Uint8Array(view.buffer, view.byteOffset + from, to - from)
}

class Bounds {
  constructor() {
    this.x1 = NaN
    this.y1 = NaN
    this.x2 = NaN
    this.y2 = NaN
  }

  add(x, y) {
    if (typeof x === "number") {
      if (isNaN(this.x1) || isNaN(this.x2)) this.x1 = this.x2 = x
      if (x < this.x1) this.x1 = x
      if (x > this.x2) this.x2 = x
    }
    if (typeof y === "number") {
      if (isNaN(this.y1) || isNaN(this.y2)) this.y1 = this.y2 = y
      if (y < this.y1) this.y1 = y
      if (y > this.y2) this.y2 = y
    }
  }

  addBezier(x0, y0, x1, y1, x2, y2, x, y) {
    const p0 = [x0, y0]
    const p1 = [x1, y1]
    const p2 = [x2, y2]
    const p3 = [x, y]
    this.add(x0, y0)
    this.add(x, y)
    const derive = (axis, t) => Math.pow(1 - t, 3) * p0[axis] + 3 * Math.pow(1 - t, 2) * t * p1[axis] + 3 * (1 - t) * Math.pow(t, 2) * p2[axis] + Math.pow(t, 3) * p3[axis]
    const extreme = (axis, t) => axis === 0 ? this.add(derive(axis, t), null) : this.add(null, derive(axis, t))
    for (let axis = 0; axis <= 1; axis++) {
      const b = 6 * p0[axis] - 12 * p1[axis] + 6 * p2[axis]
      const a = -3 * p0[axis] + 9 * p1[axis] - 9 * p2[axis] + 3 * p3[axis]
      const c = 3 * p1[axis] - 3 * p0[axis]
      if (a === 0) {
        if (b === 0) continue
        const t = -c / b
        if (0 < t && t < 1) extreme(axis, t)
        continue
      }
      const b2ac = Math.pow(b, 2) - 4 * c * a
      if (b2ac < 0) continue
      const t1 = (-b + Math.sqrt(b2ac)) / (2 * a)
      if (0 < t1 && t1 < 1) extreme(axis, t1)
      const t2 = (-b - Math.sqrt(b2ac)) / (2 * a)
      if (0 < t2 && t2 < 1) extreme(axis, t2)
    }
  }

  addQuad(x0, y0, x1, y1, x, y) {
    const cp1x = x0 + 2 / 3 * (x1 - x0)
    const cp1y = y0 + 2 / 3 * (y1 - y0)
    const cp2x = cp1x + 1 / 3 * (x - x0)
    const cp2y = cp1y + 1 / 3 * (y - y0)
    this.addBezier(x0, y0, cp1x, cp1y, cp2x, cp2y, x, y)
  }
}

class Path {
  constructor() {
    this.commands = []
  }

  moveTo(x, y) {
    this.commands.push({ type: "M", x, y })
  }

  lineTo(x, y) {
    this.commands.push({ type: "L", x, y })
  }

  quadTo(x1, y1, x, y) {
    this.commands.push({ type: "Q", x1, y1, x, y })
  }

  curveTo(x1, y1, x2, y2, x, y) {
    this.commands.push({ type: "C", x1, y1, x2, y2, x, y })
  }

  close() {
    this.commands.push({ type: "Z" })
  }

  getBoundingBox() {
    const box = new Bounds()
    let startX = 0
    let startY = 0
    let prevX = 0
    let prevY = 0
    for (const command of this.commands) {
      if (command.type === "M") {
        box.add(command.x, command.y)
        startX = prevX = command.x
        startY = prevY = command.y
      } else if (command.type === "L") {
        box.add(command.x, command.y)
        prevX = command.x
        prevY = command.y
      } else if (command.type === "Q") {
        box.addQuad(prevX, prevY, command.x1, command.y1, command.x, command.y)
        prevX = command.x
        prevY = command.y
      } else if (command.type === "C") {
        box.addBezier(prevX, prevY, command.x1, command.y1, command.x2, command.y2, command.x, command.y)
        prevX = command.x
        prevY = command.y
      } else if (command.type === "Z") {
        prevX = startX
        prevY = startY
      } else {
        throw new Error(`Unexpected path command ${command.type}`)
      }
    }
    if (isNaN(box.x1) || isNaN(box.y1) || isNaN(box.x2) || isNaN(box.y2)) box.add(0, 0)
    return box
  }
}

class Glyph {
  constructor(index, build = null, outlinePoints = false) {
    this.index = index
    this.unicodes = []
    this._build = build
    this._outlinePoints = outlinePoints
    this._path = build ? null : new Path()
  }

  get path() {
    if (!this._path) this._path = this._build()
    return this._path
  }

  get points() {
    if (this._outlinePoints && this._points === undefined) this.path
    return this._points
  }

  set points(points) {
    this._points = points
  }

  getBoundingBox() {
    return this.path.getBoundingBox()
  }
}

function copyPoint(point) {
  return { x: point.x, y: point.y, onCurve: point.onCurve, lastPointOfContour: point.lastPointOfContour }
}

function transformPoints(points, transform) {
  return points.map(point => ({ x: transform.xScale * point.x + transform.scale10 * point.y + transform.dx, y: transform.scale01 * point.x + transform.yScale * point.y + transform.dy, onCurve: point.onCurve, lastPointOfContour: point.lastPointOfContour }))
}

function outlinePath(points) {
  const path = new Path()
  if (!points) return path
  const contours = []
  let contour = []
  for (const point of points) {
    contour.push(point)
    if (point.lastPointOfContour) {
      contours.push(contour)
      contour = []
    }
  }
  if (contour.length) throw new Error("There are still points left in the current contour.")
  for (const shape of contours) {
    let current = shape[shape.length - 1]
    let next = shape[0]
    if (current.onCurve) path.moveTo(current.x, current.y)
    else if (next.onCurve) path.moveTo(next.x, next.y)
    else path.moveTo((current.x + next.x) * 0.5, (current.y + next.y) * 0.5)
    for (let i = 0; i < shape.length; i++) {
      current = next
      next = shape[(i + 1) % shape.length]
      if (current.onCurve) path.lineTo(current.x, current.y)
      else {
        const end = next.onCurve ? next : { x: (current.x + next.x) * 0.5, y: (current.y + next.y) * 0.5 }
        path.quadTo(current.x, current.y, end.x, end.y)
      }
    }
    path.close()
  }
  return path
}

function coordinate(view, cursor, flag, previous, shortBit, sameBit) {
  if (flag & shortBit) {
    const value = view.getUint8(cursor.at++)
    return previous + (flag & sameBit ? value : -value)
  }
  if (flag & sameBit) return previous
  const value = view.getInt16(cursor.at)
  cursor.at += 2
  return previous + value
}

function readGlyf(glyph, view, start) {
  glyph.numberOfContours = view.getInt16(start)
  const cursor = { at: start + 10 }
  if (glyph.numberOfContours > 0) {
    const ends = []
    for (let i = 0; i < glyph.numberOfContours; i++) {
      ends.push(view.getUint16(cursor.at))
      cursor.at += 2
    }
    cursor.at += 2 + view.getUint16(cursor.at)
    const count = ends[ends.length - 1] + 1
    const flags = []
    for (let i = 0; i < count; i++) {
      const flag = view.getUint8(cursor.at++)
      flags.push(flag)
      if (flag & 8) {
        const repeat = view.getUint8(cursor.at++)
        for (let j = 0; j < repeat; j++) {
          flags.push(flag)
          i++
        }
      }
    }
    if (flags.length !== count) throw new Error("Bad flags.")
    const points = flags.map((flag, i) => ({ onCurve: !!(flag & 1), lastPointOfContour: ends.indexOf(i) >= 0 }))
    let x = 0
    for (const [i, point] of points.entries()) x = point.x = coordinate(view, cursor, flags[i], x, 2, 16)
    let y = 0
    for (const [i, point] of points.entries()) y = point.y = coordinate(view, cursor, flags[i], y, 4, 32)
    glyph.points = points
  } else if (glyph.numberOfContours === 0) {
    glyph.points = []
  } else {
    glyph.isComposite = true
    glyph.points = []
    glyph.components = []
    let more = true
    while (more) {
      const flags = view.getUint16(cursor.at)
      const component = { glyphIndex: view.getUint16(cursor.at + 2), xScale: 1, scale01: 0, scale10: 0, yScale: 1, dx: 0, dy: 0 }
      cursor.at += 4
      if (flags & 1) {
        if (flags & 2) {
          component.dx = view.getInt16(cursor.at)
          component.dy = view.getInt16(cursor.at + 2)
        } else {
          component.matchedPoints = [view.getUint16(cursor.at), view.getUint16(cursor.at + 2)]
        }
        cursor.at += 4
      } else {
        if (flags & 2) {
          component.dx = view.getInt8(cursor.at)
          component.dy = view.getInt8(cursor.at + 1)
        } else {
          component.matchedPoints = [view.getUint8(cursor.at), view.getUint8(cursor.at + 1)]
        }
        cursor.at += 2
      }
      if (flags & 8) {
        component.xScale = component.yScale = f2dot14(view, cursor.at)
        cursor.at += 2
      } else if (flags & 64) {
        component.xScale = f2dot14(view, cursor.at)
        component.yScale = f2dot14(view, cursor.at + 2)
        cursor.at += 4
      } else if (flags & 128) {
        component.xScale = f2dot14(view, cursor.at)
        component.scale01 = f2dot14(view, cursor.at + 2)
        component.scale10 = f2dot14(view, cursor.at + 4)
        component.yScale = f2dot14(view, cursor.at + 6)
        cursor.at += 8
      }
      glyph.components.push(component)
      more = !!(flags & 32)
    }
  }
}

function compositePath(font, glyph) {
  if (glyph.isComposite) {
    font.resolving.add(glyph.index)
    try {
      for (const component of glyph.components) {
        if (font.resolving.has(component.glyphIndex)) continue
        const part = font.glyphs.get(component.glyphIndex)
        part.path
        if (!part.points) continue
        let transform = component
        if (component.matchedPoints !== undefined) {
          if (component.matchedPoints[0] > glyph.points.length - 1 || component.matchedPoints[1] > part.points.length - 1) throw new Error(`Matched points out of range in ${glyph.name}`)
          const first = glyph.points[component.matchedPoints[0]]
          transform = { xScale: component.xScale, scale01: component.scale01, scale10: component.scale10, yScale: component.yScale, dx: 0, dy: 0 }
          const second = transformPoints([part.points[component.matchedPoints[1]]], transform)[0]
          transform.dx = first.x - second.x
          transform.dy = first.y - second.y
        }
        glyph.points = glyph.points.concat(transformPoints(part.points, transform))
      }
    } finally {
      font.resolving.delete(glyph.index)
    }
  }
  return outlinePath(glyph.points)
}

function readGlyphs(font, view, start, loca) {
  const glyphs = []
  for (let i = 0; i < loca.length - 1; i++) {
    if (loca[i] === loca[i + 1]) glyphs.push(new Glyph(i))
    else {
      const glyph = new Glyph(i, () => {
        readGlyf(glyph, view, start + loca[i])
        return compositePath(font, glyph)
      }, true)
      glyphs.push(glyph)
    }
  }
  return glyphs
}

function readLoca(view, start, count, short) {
  return Array.from({ length: count + 1 }, (_, i) => short ? view.getUint16(start + i * 2) * 2 : view.getUint32(start + i * 4))
}

function readCmap(view, start) {
  if (view.getUint16(start) !== 0) throw new Error("cmap table version should be 0.")
  const count = view.getUint16(start + 2)
  let offset = -1
  let platformId = null
  let encodingId = null
  let format14 = false
  for (let i = count - 1; i >= 0; i--) {
    platformId = view.getUint16(start + 4 + i * 8)
    encodingId = view.getUint16(start + 6 + i * 8)
    if (platformId === 3 && [0, 1, 10].includes(encodingId) || platformId === 0 && [0, 1, 2, 3, 4, 6].includes(encodingId) || platformId === 1 && encodingId === 0) {
      if (offset > 0) continue
      offset = view.getUint32(start + 8 + i * 8)
      if (format14) break
    } else if (platformId === 0 && encodingId === 5) {
      format14 = view.getUint16(start + view.getUint32(start + 8 + i * 8)) === 14
      if (format14 && offset > 0) break
    }
  }
  if (offset === -1) throw new Error("No valid cmap sub-tables found.")
  const at = start + offset
  const format = view.getUint16(at)
  const map = {}
  if (format === 0) {
    const length = view.getUint16(at + 2)
    const language = view.getUint16(at + 4) - 1
    const bytes = Array.from(bytesOf(view, at + 6, at + 6 + length))
    Object.assign(map, bytes)
    const table = MAC_ENCODINGS[platformId === 0 ? UTF16 : platformId === 1 ? MAC_LANGUAGE_ENCODINGS[language] || MAC_SCRIPT_ENCODINGS[encodingId] : platformId === 3 && (encodingId === 1 || encodingId === 10) ? UTF16 : undefined]
    for (let i = 0; i < table.length; i++) map[table.charCodeAt(i)] = bytes[128 + i]
  } else if (format === 12 || format === 13) {
    const groups = view.getUint32(at + 12)
    for (let group = 0; group < groups; group++) {
      const from = view.getUint32(at + 16 + group * 12)
      const to = view.getUint32(at + 20 + group * 12)
      let glyph = view.getUint32(at + 24 + group * 12)
      for (let code = from; code <= to; code++) {
        map[code] = glyph
        if (format === 12) glyph++
      }
    }
  } else if (format === 4) {
    const segments = view.getUint16(at + 6) >> 1
    for (let i = 0; i < segments - 1; i++) {
      const end = view.getUint16(at + 14 + i * 2)
      const begin = view.getUint16(at + 16 + segments * 2 + i * 2)
      const delta = view.getInt16(at + 16 + segments * 4 + i * 2)
      const rangeAt = at + 16 + segments * 6 + i * 2
      const range = view.getUint16(rangeAt)
      for (let code = begin; code <= end; code++) {
        if (range) {
          const glyph = view.getUint16(rangeAt + range + (code - begin) * 2)
          map[code] = glyph !== 0 ? glyph + delta & 65535 : glyph
        } else {
          map[code] = code + delta & 65535
        }
      }
    }
  } else {
    throw new Error(`Only format 0 (platformId 1, encodingId 0), 4, 12 and 14 cmap tables are supported (found format ${format}, platformId ${platformId}, encodingId ${encodingId}).`)
  }
  return map
}

function textEncoding(platformID, encodingID, languageID) {
  if (platformID === 0) return UTF16
  if (platformID === 1) return MAC_LANGUAGE_ENCODINGS[languageID] || MAC_SCRIPT_ENCODINGS[encodingID]
  if (platformID === 3 && (encodingID === 1 || encodingID === 10)) return UTF16
  return undefined
}

function languageCode(platformID, languageID, ltag) {
  if (platformID === 0) return languageID === 65535 ? "und" : ltag ? ltag[languageID] : undefined
  if (platformID === 1) return MAC_LANGUAGES.has(languageID) ? languageID === MAC_ENGLISH ? "en" : `1:${languageID}` : undefined
  if (platformID === 3) return WINDOWS_LANGUAGES.has(languageID) ? languageID === WINDOWS_ENGLISH ? "en" : `3:${languageID}` : undefined
  return undefined
}

function readNames(view, start, ltag) {
  const names = {}
  const count = view.getUint16(start + 2)
  const strings = start + view.getUint16(start + 4)
  for (let i = 0; i < count; i++) {
    const at = start + 6 + i * 12
    const platformID = view.getUint16(at)
    const encodingID = view.getUint16(at + 2)
    const languageID = view.getUint16(at + 4)
    const nameID = view.getUint16(at + 6)
    const property = NAME_PROPERTIES[nameID] || nameID
    const length = view.getUint16(at + 8)
    const offset = strings + view.getUint16(at + 10)
    const language = languageCode(platformID, languageID, ltag)
    const encoding = textEncoding(platformID, encodingID, languageID)
    const platform = ["unicode", "macintosh", "reserved", "windows"][platformID]
    if (encoding === undefined || language === undefined || platform === undefined) continue
    let text
    if (encoding === UTF16) {
      const units = []
      for (let j = 0; j < length / 2; j++) units[j] = view.getUint16(offset + j * 2)
      text = String.fromCharCode.apply(null, units)
    } else if (MAC_ENCODINGS[encoding] !== undefined) {
      text = ""
      for (let j = 0; j < length; j++) {
        const byte = view.getUint8(offset + j)
        text += byte <= 127 ? String.fromCharCode(byte) : MAC_ENCODINGS[encoding][byte & 127]
      }
    }
    if (!text) continue
    names[platform] ??= {}
    names[platform][property] ??= {}
    names[platform][property][language] = text
  }
  return names
}

function readLtag(view, start) {
  if (view.getUint32(start) !== 1) throw new Error("Unsupported ltag table version.")
  const count = view.getUint32(start + 8)
  return Array.from({ length: count }, (_, i) => {
    const offset = start + view.getUint16(start + 12 + i * 4)
    const length = view.getUint16(start + 14 + i * 4)
    let tag = ""
    for (let j = offset; j < offset + length; j++) tag += String.fromCharCode(view.getInt8(j))
    return tag
  })
}

function nameById(names, id, allowed = []) {
  if (id < 256 && id in NAME_PROPERTIES) {
    if (allowed.length && !allowed.includes(id)) return undefined
    id = NAME_PROPERTIES[id]
  }
  for (const platform in names) {
    for (const key in names[platform]) {
      if (key === id || parseInt(key) === id) return names[platform][key]
    }
  }
  return undefined
}

function readFvar(view, start, names) {
  if (view.getUint32(start) !== 65536) throw new Error("Unsupported fvar table version.")
  const offset = view.getUint16(start + 4)
  const axisCount = view.getUint16(start + 8)
  const axisSize = view.getUint16(start + 10)
  const instanceCount = view.getUint16(start + 12)
  const instanceSize = view.getUint16(start + 14)
  const axes = Array.from({ length: axisCount }, (_, i) => {
    const at = start + offset + i * axisSize
    return { tag: tagAt(view, at), minValue: fixedAt(view, at + 4), defaultValue: fixedAt(view, at + 8), maxValue: fixedAt(view, at + 12) }
  })
  const instances = Array.from({ length: instanceCount }, (_, i) => {
    const at = start + offset + axisCount * axisSize + i * instanceSize
    const coordinates = {}
    for (const [index, axis] of axes.entries()) coordinates[axis.tag] = fixedAt(view, at + 4 + index * 4)
    return { name: nameById(names, view.getUint16(at), [2, 17]), coordinates }
  })
  return { axes, instances }
}

function readAvar(view, start, fvar) {
  const axisCount = view.getUint16(start + 6)
  if (axisCount !== fvar.axes.length) throw new Error("avar axis count must correspond to fvar axis count")
  let at = start + 8
  return {
    axisSegmentMaps: Array.from({ length: axisCount }, () => {
      const count = view.getUint16(at)
      at += 2
      const axisValueMaps = Array.from({ length: count }, (_, i) => ({ fromCoordinate: f2dot14(view, at + i * 4), toCoordinate: f2dot14(view, at + i * 4 + 2) }))
      at += count * 4
      return { axisValueMaps }
    })
  }
}

function packedPoints(view, cursor) {
  const first = view.getUint8(cursor.at++)
  const total = first >= 128 ? (first & 127) << 8 | view.getUint8(cursor.at++) : first
  const points = []
  let last = 0
  while (points.length < total) {
    const control = view.getUint8(cursor.at++)
    const words = control & 128
    const run = (control & 127) + 1
    for (let i = 0; i < run && points.length < total; i++) {
      last += words ? view.getUint16(cursor.at) : view.getUint8(cursor.at)
      cursor.at += words ? 2 : 1
      points.push(last)
    }
  }
  return points
}

function packedDeltas(view, cursor, expected) {
  const deltas = []
  while (deltas.length < expected) {
    const control = view.getUint8(cursor.at++)
    const run = (control & 63) + 1
    for (let i = 0; i < run && deltas.length < expected; i++) {
      if (control & 128) deltas.push(0)
      else if (control & 64) {
        deltas.push(view.getInt16(cursor.at))
        cursor.at += 2
      } else {
        deltas.push(view.getInt8(cursor.at++))
      }
    }
  }
  return deltas
}

function tuple(view, at, axisCount) {
  return Array.from({ length: axisCount }, (_, i) => f2dot14(view, at + i * 2))
}

function everyPoint(glyph) {
  return Array.from({ length: (glyph.isComposite ? glyph.components.length : glyph.points.length) + PHANTOM_POINTS }, (_, index) => index)
}

function readGlyphVariations(view, start, axisCount, glyph) {
  const flags = view.getUint16(start)
  const shared = !!(flags & 32768)
  const count = flags & 4095
  let at = start + 4
  const headers = []
  for (let h = 0; h < count; h++) {
    const size = view.getUint16(at)
    const index = view.getUint16(at + 2)
    at += 4
    const header = { size, privateFlag: !!(index & 8192) }
    if (index & 32768) {
      header.peakTuple = tuple(view, at, axisCount)
      at += axisCount * 2
    } else {
      header.sharedTupleRecordsIndex = index & 4095
    }
    if (index & 16384) {
      header.intermediateStartTuple = tuple(view, at, axisCount)
      header.intermediateEndTuple = tuple(view, at + axisCount * 2, axisCount)
      at += axisCount * 4
    }
    headers.push(header)
  }
  const cursor = { at: start + view.getUint16(start + 2) }
  const sharedPoints = shared ? packedPoints(view, cursor) : []
  let data = cursor.at
  for (const header of headers) {
    const point = { at: data }
    header.privatePoints = []
    if (header.privateFlag) {
      header.privatePoints = packedPoints(view, point)
      if (shared && !header.privatePoints.length) header.privatePoints = everyPoint(glyph)
    }
    const deltasAt = point.at
    let deltas = null
    function read() {
      let total = header.privatePoints.length || sharedPoints.length
      if (!total) total = glyph.points.length + PHANTOM_POINTS
      const reader = { at: deltasAt }
      deltas = [packedDeltas(view, reader, total), packedDeltas(view, reader, total)]
    }
    Object.defineProperty(header, "deltas", { get: () => (deltas ?? (read(), deltas))[0] })
    Object.defineProperty(header, "deltasY", { get: () => (deltas ?? (read(), deltas))[1] })
    data += header.size
    delete header.size
    delete header.privateFlag
  }
  return { headers, sharedPoints }
}

function readGvar(view, start, fvar, glyphs) {
  const axisCount = view.getUint16(start + 4)
  const sharedCount = view.getUint16(start + 6)
  const sharedAt = view.getUint32(start + 8)
  const sharedTuples = sharedAt ? Array.from({ length: sharedCount }, (_, i) => tuple(view, start + sharedAt + i * axisCount * 2, axisCount)) : undefined
  const glyphCount = view.getUint16(start + 12)
  const long = view.getUint16(start + 14) & 1
  const dataAt = view.getUint32(start + 16)
  const offsetOf = index => long ? view.getUint32(start + 20 + index * 4) : view.getUint16(start + 20 + index * 2) * 2
  const glyphVariations = {}
  for (let i = 0; i < glyphCount; i++) {
    const begin = offsetOf(i)
    glyphVariations[i] = offsetOf(i + 1) - begin ? readGlyphVariations(view, start + dataAt + begin, axisCount, glyphs.get(i)) : undefined
  }
  return { sharedTuples, glyphVariations }
}

function readItemStore(view, start) {
  const regionAt = start + view.getUint32(start + 2)
  const subtableCount = view.getUint16(start + 6)
  const axisCount = view.getUint16(regionAt)
  const regionCount = view.getUint16(regionAt + 2)
  const variationRegions = Array.from({ length: regionCount }, (_, region) => ({ regionAxes: Array.from({ length: axisCount }, (_, axis) => {
    const at = regionAt + 4 + (region * axisCount + axis) * 6
    return { startCoord: f2dot14(view, at), peakCoord: f2dot14(view, at + 2), endCoord: f2dot14(view, at + 4) }
  }) }))
  const itemVariationSubtables = Array.from({ length: subtableCount }, (_, i) => {
    const at = start + view.getUint32(start + 8 + i * 4)
    const itemCount = view.getUint16(at)
    const wordDeltaCount = view.getUint16(at + 2)
    const regionIndexCount = view.getUint16(at + 4)
    const regionIndexes = Array.from({ length: regionIndexCount }, (_, j) => view.getUint16(at + 6 + j * 2))
    if (!itemCount || !regionIndexCount) return { regionIndexes, deltaSets: [] }
    const long = wordDeltaCount & 32768
    const wordCount = wordDeltaCount & 32767
    if (wordCount > regionIndexCount) throw new Error("wordCount must be less than or equal to regionIndexCount")
    let cursor = at + 6 + regionIndexCount * 2
    const deltaSets = Array.from({ length: itemCount }, () => Array.from({ length: regionIndexCount }, (_, j) => {
      let value
      if (j < wordCount) {
        value = long ? view.getInt32(cursor) : view.getInt16(cursor)
        cursor += long ? 4 : 2
      } else {
        value = long ? view.getInt16(cursor) : view.getInt8(cursor)
        cursor += long ? 2 : 1
      }
      return value
    }))
    return { regionIndexes, deltaSets }
  })
  return { variationRegions, itemVariationSubtables }
}

function readDeltaMap(view, start) {
  const format = view.getUint8(start)
  const entryFormat = view.getUint8(start + 1)
  const count = format === 0 ? view.getUint16(start + 2) : format === 1 ? view.getUint32(start + 2) : 0
  if (!count) return {}
  const bitCount = (entryFormat & 15) + 1
  const size = ((entryFormat & 48) >> 4) + 1
  let at = start + (format === 0 ? 4 : 6)
  return {
    map: Array.from({ length: count }, () => {
      const entry = size === 1 ? view.getUint8(at) : size === 2 ? view.getUint16(at) : size === 3 ? view.getUint16(at) << 8 | view.getUint8(at + 2) : view.getUint32(at)
      at += size
      return { outerIndex: entry >> bitCount, innerIndex: entry & (1 << bitCount) - 1 }
    })
  }
}

function readHvar(view, start) {
  const storeAt = view.getUint32(start + 4)
  const widthAt = view.getUint32(start + 8)
  return { itemVariationStore: storeAt ? readItemStore(view, start + storeAt) : undefined, advanceWidth: widthAt ? readDeltaMap(view, start + widthAt) : undefined }
}

class Variation {
  constructor(font) {
    this.font = font
    const defaults = Object.fromEntries(font.tables.fvar.axes.map(axis => [axis.tag, axis.defaultValue]))
    const instances = font.tables.fvar.instances
    let instance = instances.findIndex(entry => Object.keys(defaults).every(axis => entry.coordinates[axis] === defaults[axis]))
    if (instance < 0) instance = instances.findIndex(entry => entry.name && entry.name.en === "Regular")
    this.defaults = instance > -1 ? { ...instances[instance].coordinates } : this.padded(defaults)
  }

  padded(coords) {
    for (const tag in coords) {
      if (tag.length < 4) {
        const full = tag.padEnd(4, " ")
        if (coords[full] === undefined) coords[full] = coords[tag]
        delete coords[tag]
      }
    }
    return coords
  }

  normalized(coords) {
    this.padded(coords)
    const normal = this.font.tables.fvar.axes.map(axis => {
      const value = coords[axis.tag] === undefined ? axis.defaultValue : coords[axis.tag]
      return value < axis.defaultValue ? (value - axis.defaultValue + Number.EPSILON) / (axis.defaultValue - axis.minValue + Number.EPSILON) : (value - axis.defaultValue + Number.EPSILON) / (axis.maxValue - axis.defaultValue + Number.EPSILON)
    })
    const avar = this.font.tables.avar
    if (avar) {
      for (const [i, segment] of avar.axisSegmentMaps.entries()) {
        for (let j = 0; j < segment.axisValueMaps.length; j++) {
          const pair = segment.axisValueMaps[j]
          if (j >= 1 && normal[i] < pair.fromCoordinate) {
            const previous = segment.axisValueMaps[j - 1]
            normal[i] = ((normal[i] - previous.fromCoordinate) * (pair.toCoordinate - previous.toCoordinate) + Number.EPSILON) / (pair.fromCoordinate - previous.fromCoordinate + Number.EPSILON) + previous.toCoordinate
            break
          }
        }
      }
    }
    return normal
  }

  interpolate(points, original, touched) {
    if (!points.length) return
    let index = 0
    while (index < points.length) {
      const first = index
      let end = index
      while (!points[end].lastPointOfContour) end++
      while (index <= end && !touched[index]) index++
      if (index > end) continue
      const firstDelta = index
      let current = index
      index++
      while (index <= end) {
        if (touched[index]) {
          this.shiftBetween(current + 1, index - 1, current, index, original, points)
          current = index
        }
        index++
      }
      if (current === firstDelta) this.shiftAll(first, end, current, original, points)
      else {
        this.shiftBetween(current + 1, end, current, firstDelta, original, points)
        if (firstDelta > 0) this.shiftBetween(first, firstDelta - 1, current, firstDelta, original, points)
      }
      index = end + 1
    }
  }

  shiftBetween(p1, p2, ref1, ref2, original, points) {
    if (p1 > p2) return
    for (const key of ["x", "y"]) {
      if (original[ref1][key] > original[ref2][key]) [ref1, ref2] = [ref2, ref1]
      const in1 = original[ref1][key]
      const in2 = original[ref2][key]
      const out1 = points[ref1][key]
      const out2 = points[ref2][key]
      if (in1 !== in2 || out1 === out2) {
        const scale = in1 === in2 ? 0 : (out2 - out1) / (in2 - in1)
        for (let p = p1; p <= p2; p++) {
          let out = original[p][key]
          if (out <= in1) out += out1 - in1
          else if (out >= in2) out += out2 - in2
          else out = out1 + (out - in1) * scale
          points[p][key] = out
        }
      }
    }
  }

  shiftAll(p1, p2, ref, original, points) {
    const dx = points[ref].x - original[ref].x
    const dy = points[ref].y - original[ref].y
    if (dx === 0 && dy === 0) return
    for (let p = p1; p <= p2; p++) {
      if (p !== ref) {
        points[p].x += dx
        points[p].y += dy
      }
    }
  }

  moveComponents(glyph, moved, coords, points, header, factor) {
    let at = 0
    for (const [c, component] of glyph.components.entries()) {
      const part = this.font.glyphs.get(component.glyphIndex)
      const transform = { glyphIndex: component.glyphIndex, xScale: component.xScale, scale01: component.scale01, scale10: component.scale10, yScale: component.yScale, dx: component.dx, dy: component.dy }
      const delta = points.indexOf(c)
      if (delta > -1) {
        transform.dx += Math.round(header.deltas[delta] * factor)
        transform.dy += Math.round(header.deltasY[delta] * factor)
      }
      const placed = transformPoints(this.getTransform(part, coords).points, transform)
      moved.splice(at, placed.length, ...placed)
      at += part.points.length
    }
  }

  applyTuples(variations, original, coords, glyph) {
    const normal = this.normalized(coords)
    const axisCount = this.font.tables.fvar.axes.length
    const moved = original.map(copyPoint)
    for (const header of variations.headers) {
      let factor = 1
      for (let a = 0; a < axisCount; a++) {
        const peak = header.peakTuple ? header.peakTuple : this.font.tables.gvar.sharedTuples[header.sharedTupleRecordsIndex]
        if (peak[a] === 0) continue
        if (normal[a] === 0) {
          factor = 0
          break
        }
        if (!header.intermediateStartTuple) {
          if (normal[a] < Math.min(0, peak[a]) || normal[a] > Math.max(0, peak[a])) {
            factor = 0
            break
          }
          factor = (factor * normal[a] + Number.EPSILON) / (peak[a] + Number.EPSILON)
        } else if (normal[a] < header.intermediateStartTuple[a] || normal[a] > header.intermediateEndTuple[a]) {
          factor = 0
          break
        } else if (normal[a] < peak[a]) {
          factor = factor * (normal[a] - header.intermediateStartTuple[a] + Number.EPSILON) / (peak[a] - header.intermediateStartTuple[a] + Number.EPSILON)
        } else {
          factor = factor * (header.intermediateEndTuple[a] - normal[a] + Number.EPSILON) / (header.intermediateEndTuple[a] - peak[a] + Number.EPSILON)
        }
      }
      if (factor === 0) continue
      const points = header.privatePoints.length ? header.privatePoints : variations.sharedPoints
      if (glyph.isComposite) this.moveComponents(glyph, moved, coords, points, header, factor)
      else if (points.length === 0) {
        for (const [i, point] of moved.entries()) moved[i] = { x: Math.round(point.x + header.deltas[i] * factor), y: Math.round(point.y + header.deltasY[i] * factor), onCurve: point.onCurve, lastPointOfContour: point.lastPointOfContour }
      } else {
        const shifted = moved.map(copyPoint)
        const touched = Array(original.length).fill(false)
        for (const [i, index] of points.entries()) {
          if (index < original.length) {
            touched[index] = true
            shifted[index].x += header.deltas[i] * factor
            shifted[index].y += header.deltasY[i] * factor
          }
        }
        this.interpolate(shifted, moved, touched)
        for (let i = 0; i < original.length; i++) {
          moved[i].x = Math.round(moved[i].x + (shifted[i].x - moved[i].x))
          moved[i].y = Math.round(moved[i].y + (shifted[i].y - moved[i].y))
        }
      }
    }
    return moved
  }

  getTransform(glyph, coords) {
    if (Number.isInteger(glyph)) glyph = this.font.glyphs.get(glyph)
    const blend = glyph.getBlendPath
    const hasPoints = !!(glyph.points && glyph.points.length)
    let result = glyph
    if (blend || hasPoints) {
      coords ??= { ...this.defaults }
      if (hasPoints) {
        const variations = this.font.tables.gvar && this.font.tables.gvar.glyphVariations[glyph.index]
        if (variations) {
          const points = this.applyTuples(variations, glyph.points, coords, glyph)
          result = variant(glyph, points, outlinePath(points))
        }
      } else if (blend) {
        result = variant(glyph, undefined, glyph.getBlendPath(coords))
      }
    }
    if (this.font.tables.hvar) {
      glyph._advanceWidth ??= glyph.advanceWidth
      glyph.advanceWidth = result.advanceWidth = Math.round(glyph._advanceWidth + this.adjustment(result.index, coords))
    }
    return result
  }

  adjustment(index, coords) {
    coords ??= { ...this.defaults }
    const table = this.font.tables.hvar
    if (!table.itemVariationStore) throw new Error(`trying to get variation adjustment from table "${table}" which does not have an itemVariationStore`)
    const size = table.advanceWidth && table.advanceWidth.map.length
    const { outerIndex, innerIndex } = size ? table.advanceWidth.map[Math.min(index, size - 1)] : { outerIndex: 0, innerIndex: index }
    return this.delta(table.itemVariationStore, outerIndex, innerIndex, coords)
  }

  delta(store, outer, inner, coords) {
    if (outer >= store.itemVariationSubtables.length) return 0
    const data = store.itemVariationSubtables[outer]
    if (inner >= data.deltaSets.length) return 0
    const blend = this.blendVector(store, outer, coords)
    let total = 0
    for (let master = 0; master < data.regionIndexes.length; master++) total += data.deltaSets[inner][master] * blend[master]
    return total
  }

  blendVector(store, index, coords) {
    coords ??= { ...this.defaults }
    const data = store.itemVariationSubtables[index]
    const normal = this.normalized(coords)
    return data.regionIndexes.map(region => {
      let scalar = 1
      for (const [j, axis] of store.variationRegions[region].regionAxes.entries()) {
        let axisScalar
        if (axis.startCoord > axis.peakCoord || axis.peakCoord > axis.endCoord) axisScalar = 1
        else if (axis.startCoord < 0 && axis.endCoord > 0 && axis.peakCoord !== 0) axisScalar = 1
        else if (axis.peakCoord === 0) axisScalar = 1
        else if (normal[j] < axis.startCoord || normal[j] > axis.endCoord) axisScalar = 0
        else if (normal[j] === axis.peakCoord) axisScalar = 1
        else if (normal[j] < axis.peakCoord) axisScalar = (normal[j] - axis.startCoord + Number.EPSILON) / (axis.peakCoord - axis.startCoord + Number.EPSILON)
        else axisScalar = (axis.endCoord - normal[j] + Number.EPSILON) / (axis.endCoord - axis.peakCoord + Number.EPSILON)
        scalar *= axisScalar
      }
      return scalar
    })
  }
}

function variant(glyph, points, path) {
  const copy = new Glyph(glyph.index)
  copy._path = path
  if ("advanceWidth" in glyph) copy.advanceWidth = glyph.advanceWidth
  copy.points = points === undefined ? glyph.points : points
  return copy
}

function cffIndex(view, start, version = 1) {
  const count = version > 1 ? view.getUint32(start) : view.getUint16(start)
  const countLength = version > 1 ? 4 : 2
  if (count === 0) return { objects: [], endOffset: start + countLength }
  const size = view.getUint8(start + countLength)
  const objectOffset = start + (count + 1) * size + countLength
  const offsets = []
  let at = start + countLength + 1
  for (let i = 0; i <= count; i++) {
    let value = 0
    for (let j = 0; j < size; j++) value = (value << 8) + view.getUint8(at + j)
    offsets.push(value)
    at += size
  }
  return { objects: offsets.slice(0, -1).map((offset, i) => bytesOf(view, objectOffset + offset, objectOffset + offsets[i + 1])), endOffset: objectOffset + offsets[count] }
}

function asText(bytes) {
  return String.fromCharCode(...bytes)
}

function subroutineBias(subrs) {
  return subrs.length < 1240 ? 107 : subrs.length < 33900 ? 1131 : 32768
}

function cffDict(view, start, size, version) {
  const entries = {}
  let operands = []
  let at = start
  const operandStart = version < 2 ? 22 : 28
  while (at - start < size) {
    let op = view.getUint8(at++)
    if (op < operandStart) {
      if (op === 12) op = 1200 + view.getUint8(at++)
      if (version > 1 && op === 23) {
        const blends = operands.pop()
        while (operands.length > blends) operands.pop()
        continue
      }
      if (Object.prototype.hasOwnProperty.call(entries, op) && !isNaN(entries[op])) throw new Error(`Object [object Object] already has key ${op}`)
      entries[op] = operands.length === 1 ? operands[0] : operands
      operands = []
    } else if (op === 28) {
      operands.push(view.getUint8(at) << 8 | view.getUint8(at + 1))
      at += 2
    } else if (op === 29) {
      operands.push(view.getUint8(at) << 24 | view.getUint8(at + 1) << 16 | view.getUint8(at + 2) << 8 | view.getUint8(at + 3))
      at += 4
    } else if (op === 30) {
      let text = ""
      const nibbles = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "E", "E-", null, "-"]
      for (;;) {
        const byte = view.getUint8(at++)
        if (byte >> 4 === 15) break
        text += nibbles[byte >> 4]
        if ((byte & 15) === 15) break
        text += nibbles[byte & 15]
      }
      operands.push(parseFloat(text))
    } else if (op >= 32 && op <= 246) {
      operands.push(op - 139)
    } else if (op >= 247 && op <= 250) {
      operands.push((op - 247) * 256 + view.getUint8(at++) + 108)
    } else if (op >= 251 && op <= 254) {
      operands.push(-(op - 251) * 256 - view.getUint8(at++) - 108)
    } else {
      throw new Error(`Invalid b0 ${op}`)
    }
  }
  return entries
}

function cffString(strings, index) {
  return index <= 390 ? CFF_STANDARD_STRINGS[index] : strings ? strings[index - 391] : undefined
}

function dictValue(dict, op, fallback) {
  return dict[op] !== undefined ? dict[op] : fallback !== undefined ? fallback : null
}

function dictPair(dict, op, fallback) {
  return [0, 1].map(j => {
    const value = dict[op] !== undefined ? dict[op][j] : undefined
    return value !== undefined ? value : fallback[j] !== undefined ? fallback[j] : null
  })
}

function topDicts(view, start, objects, strings, version) {
  return objects.map(bytes => {
    const data = new DataView(new Uint8Array(bytes).buffer)
    const raw = cffDict(data, 0, data.byteLength, version)
    const top = { _subrs: [], _subrsBias: 0, _defaultWidthX: 0, _nominalWidthX: 0 }
    top.charStrings = dictValue(raw, 17, version > 1 ? undefined : 0)
    top.fdArray = dictValue(raw, 1236)
    top.fdSelect = dictValue(raw, 1237)
    if (version > 1) {
      top.vstore = dictValue(raw, 24)
      return top
    }
    top.paintType = dictValue(raw, 1205, 0)
    top.strokeWidth = dictValue(raw, 1208, 0)
    top.charset = dictValue(raw, 15, 0)
    top.private = dictPair(raw, 18, [0, 0])
    top.ros = [0, 1].map(j => {
      const value = raw[1230] !== undefined ? raw[1230][j] : undefined
      return cffString(strings, value !== undefined ? value : null)
    })
    const [privateSize, privateOffset] = top.private
    if (privateSize !== 0 && privateOffset !== 0) {
      const own = cffDict(view, privateOffset + start, privateSize, version)
      top._defaultWidthX = dictValue(own, 20, 0)
      top._nominalWidthX = dictValue(own, 21, 0)
      const subrs = dictValue(own, 19, 0)
      if (subrs !== 0) {
        top._subrs = cffIndex(view, privateOffset + subrs + start, version).objects
        top._subrsBias = subroutineBias(top._subrs)
      }
      top._privateDict = { subrs }
    }
    return top
  })
}

function fontDicts(view, start, objects) {
  return objects.map(bytes => {
    const data = new DataView(new Uint8Array(bytes).buffer)
    const [size, offset] = dictPair(cffDict(data, 0, data.byteLength, 2), 18, [0, 0])
    const dict = {}
    if (size !== 0 && offset !== 0) {
      const own = cffDict(view, offset + start, size, 2)
      const subrs = dictValue(own, 19)
      if (subrs) {
        dict._subrs = cffIndex(view, offset + subrs + start, 2).objects
        dict._subrsBias = subroutineBias(dict._subrs)
      }
      dict._privateDict = { vsindex: dictValue(own, 22, 0) }
    }
    return dict
  })
}

function readCharset(view, start, glyphCount, strings, cid) {
  const charset = [".notdef"]
  const format = view.getUint8(start)
  let at = start + 1
  const last = glyphCount - 1
  if (format === 0) {
    for (let i = 0; i < last; i++) {
      const sid = view.getUint16(at)
      at += 2
      charset.push(cid ? sid : cffString(strings, sid) || sid)
    }
  } else if (format === 1 || format === 2) {
    while (charset.length <= last) {
      let sid = view.getUint16(at)
      const count = format === 1 ? view.getUint8(at + 2) : view.getUint16(at + 2)
      at += format === 1 ? 3 : 4
      for (let i = 0; i <= count; i++) {
        charset.push(cid ? `cid${`00000${sid}`.slice(-5)}` : cffString(strings, sid) || sid)
        sid++
      }
    }
  } else {
    throw new Error(`Unknown charset format ${format}`)
  }
  return charset
}

function readFdSelect(view, start, glyphCount, fdCount, version) {
  const select = []
  const format = view.getUint8(start)
  if (format === 0) {
    for (let i = 0; i < glyphCount; i++) {
      const index = view.getUint8(start + 1 + i)
      if (index >= fdCount) throw new Error(`CFF table CID Font FDSelect has bad FD index value ${index} (FD count ${fdCount})`)
      select.push(index)
    }
  } else if (format === 3 || version > 1 && format === 4) {
    const wide = format === 4
    let at = start + 1
    const read = long => {
      const value = long ? view.getUint32(at) : view.getUint16(at)
      at += long ? 4 : 2
      return value
    }
    const ranges = read(wide)
    let first = read(wide)
    if (first !== 0) throw new Error(`CFF Table CID Font FDSelect format ${format} range has bad initial GID ${first}`)
    let next
    for (let range = 0; range < ranges; range++) {
      const index = wide ? read(false) : view.getUint8(at++)
      next = read(wide)
      if (index >= fdCount) throw new Error(`CFF table CID Font FDSelect has bad FD index value ${index} (FD count ${fdCount})`)
      if (next > glyphCount) throw new Error(`CFF Table CID Font FDSelect format ${version} range has bad GID ${next}`)
      for (; first < next; first++) select.push(index)
      first = next
    }
    if (next !== glyphCount) throw new Error(`CFF Table CID Font FDSelect format 3 range has bad final (Sentinal) GID ${next}`)
  } else {
    throw new Error(`CFF Table CID Font FDSelect table has unsupported format ${format}`)
  }
  return select
}

function charstringPath(font, glyph, code, version, coords) {
  const cff = font.tables.cff2 || font.tables.cff
  const path = new Path()
  const stack = []
  let stems = 0
  let haveWidth = false
  let open = false
  let x = 0
  let y = 0
  let depth = 0
  let defaultWidth = cff.topDict._defaultWidthX
  let nominalWidth = cff.topDict._nominalWidthX
  let subrs
  let subrsBias
  let vsindex = 0
  let vstore = []
  let blendVector
  coords = coords || font.variation && { ...font.variation.defaults }
  glyph.getBlendPath ??= variationCoords => charstringPath(font, glyph, code, version, variationCoords)
  if (font.isCIDFont || version > 1) {
    const fd = cff.topDict._fdArray[cff.topDict._fdSelect ? cff.topDict._fdSelect[glyph.index] : 0]
    subrs = fd._subrs
    subrsBias = fd._subrsBias
    if (version > 1) {
      vstore = cff.topDict._vstore
      vsindex = fd._privateDict.vsindex
    } else {
      defaultWidth = fd._defaultWidthX
      nominalWidth = fd._nominalWidthX
    }
  } else {
    subrs = cff.topDict._subrs
    subrsBias = cff.topDict._subrsBias
  }
  const stroked = (font.tables.cff && font.tables.cff.topDict && font.tables.cff.topDict.paintType || 0) === 2
  let width = defaultWidth
  function contour(toX, toY) {
    if (open && !stroked) path.close()
    path.moveTo(toX, toY)
    open = true
  }
  function hints() {
    if ((stack.length & 1) !== 0 && !haveWidth) width = stack.shift() + nominalWidth
    stems += stack.length >> 1
    stack.length = 0
    haveWidth = true
  }
  function curve(c1x, c1y, c2x, c2y, toX, toY) {
    path.curveTo(c1x, c1y, c2x, c2y, toX, toY)
  }
  function run(bytes) {
    let i = 0
    while (i < bytes.length) {
      let v = bytes[i++]
      if (v === 1 || v === 3 || v === 18 || v === 23) hints()
      else if (v === 4) {
        if (stack.length > 1 && !haveWidth) {
          width = stack.shift() + nominalWidth
          haveWidth = true
        }
        y += stack.pop()
        contour(x, y)
      } else if (v === 5) {
        while (stack.length > 0) {
          x += stack.shift()
          y += stack.shift()
          path.lineTo(x, y)
        }
      } else if (v === 6 || v === 7) {
        let horizontal = v === 6
        while (stack.length > 0) {
          if (horizontal) x += stack.shift()
          else y += stack.shift()
          path.lineTo(x, y)
          horizontal = !horizontal
        }
      } else if (v === 8) {
        while (stack.length > 0) {
          const c1x = x + stack.shift()
          const c1y = y + stack.shift()
          const c2x = c1x + stack.shift()
          const c2y = c1y + stack.shift()
          x = c2x + stack.shift()
          y = c2y + stack.shift()
          curve(c1x, c1y, c2x, c2y, x, y)
        }
      } else if (v === 10 || v === 29) {
        const global = v === 29
        const subr = global ? font.gsubrs[stack.pop() + font.gsubrsBias] : subrs[stack.pop() + subrsBias]
        if (subr && depth < MAX_CALL_DEPTH) {
          depth++
          run(subr)
          depth--
        }
      } else if (v === 11) {
        if (version <= 1) return
      } else if (v === 12) {
        v = bytes[i++]
        if (v === 35) {
          const c1x = x + stack.shift()
          const c1y = y + stack.shift()
          const c2x = c1x + stack.shift()
          const c2y = c1y + stack.shift()
          const jx = c2x + stack.shift()
          const jy = c2y + stack.shift()
          const c3x = jx + stack.shift()
          const c3y = jy + stack.shift()
          const c4x = c3x + stack.shift()
          const c4y = c3y + stack.shift()
          x = c4x + stack.shift()
          y = c4y + stack.shift()
          stack.shift()
          curve(c1x, c1y, c2x, c2y, jx, jy)
          curve(c3x, c3y, c4x, c4y, x, y)
        } else if (v === 34) {
          const c1x = x + stack.shift()
          const c1y = y
          const c2x = c1x + stack.shift()
          const c2y = c1y + stack.shift()
          const jx = c2x + stack.shift()
          const jy = c2y
          const c3x = jx + stack.shift()
          const c3y = c2y
          const c4x = c3x + stack.shift()
          const c4y = y
          x = c4x + stack.shift()
          curve(c1x, c1y, c2x, c2y, jx, jy)
          curve(c3x, c3y, c4x, c4y, x, y)
        } else if (v === 36) {
          const c1x = x + stack.shift()
          const c1y = y + stack.shift()
          const c2x = c1x + stack.shift()
          const c2y = c1y + stack.shift()
          const jx = c2x + stack.shift()
          const jy = c2y
          const c3x = jx + stack.shift()
          const c3y = c2y
          const c4x = c3x + stack.shift()
          const c4y = c3y + stack.shift()
          x = c4x + stack.shift()
          curve(c1x, c1y, c2x, c2y, jx, jy)
          curve(c3x, c3y, c4x, c4y, x, y)
        } else if (v === 37) {
          const c1x = x + stack.shift()
          const c1y = y + stack.shift()
          const c2x = c1x + stack.shift()
          const c2y = c1y + stack.shift()
          const jx = c2x + stack.shift()
          const jy = c2y + stack.shift()
          const c3x = jx + stack.shift()
          const c3y = jy + stack.shift()
          const c4x = c3x + stack.shift()
          const c4y = c3y + stack.shift()
          if (Math.abs(c4x - x) > Math.abs(c4y - y)) x = c4x + stack.shift()
          else y = c4y + stack.shift()
          curve(c1x, c1y, c2x, c2y, jx, jy)
          curve(c3x, c3y, c4x, c4y, x, y)
        } else {
          stack.length = 0
        }
      } else if (v === 14) {
        if (version > 1) continue
        if (stack.length >= 4) {
          const accent = CFF_STANDARD_ENCODING[stack.pop()]
          const base = CFF_STANDARD_ENCODING[stack.pop()]
          const ady = stack.pop()
          const adx = stack.pop()
          if (accent && base) {
            glyph.isComposite = true
            glyph.components = []
            const accentIndex = font.cffCharset.indexOf(accent)
            const baseIndex = font.cffCharset.indexOf(base)
            glyph.components.push({ glyphIndex: baseIndex, dx: 0, dy: 0 })
            glyph.components.push({ glyphIndex: accentIndex, dx: adx, dy: ady })
            path.commands.push(...font.glyphs.get(baseIndex).path.commands)
            const shifted = JSON.parse(JSON.stringify(font.glyphs.get(accentIndex).path.commands))
            for (const command of shifted) {
              if (command.type !== "Z") {
                command.x += adx
                command.y += ady
              }
              if (command.type === "Q" || command.type === "C") {
                command.x1 += adx
                command.y1 += ady
              }
              if (command.type === "C") {
                command.x2 += adx
                command.y2 += ady
              }
            }
            path.commands.push(...shifted)
          }
        } else if (stack.length > 0 && !haveWidth) {
          width = stack.shift() + nominalWidth
          haveWidth = true
        }
        if (open && !stroked) {
          path.close()
          open = false
        }
      } else if (v === 15) {
        if (version >= 2) vsindex = stack.pop()
      } else if (v === 16) {
        if (version < 2) continue
        if (!blendVector) blendVector = font.variation && coords && font.variation.blendVector(vstore, vsindex, coords)
        const n = stack.pop()
        const axisCount = blendVector ? blendVector.length : vstore.itemVariationSubtables[vsindex].regionIndexes.length
        let deltaCount = n * axisCount
        let delta = stack.length - deltaCount
        const deltaIndex = delta - n
        if (blendVector) {
          for (let k = 0; k < n; k++) {
            let sum = stack[deltaIndex + k]
            for (let j = 0; j < axisCount; j++) sum += blendVector[j] * stack[delta++]
            stack[deltaIndex + k] = sum
          }
        }
        while (deltaCount--) stack.pop()
      } else if (v === 19 || v === 20) {
        hints()
        i += stems + 7 >> 3
      } else if (v === 21) {
        if (stack.length > 2 && !haveWidth) {
          width = stack.shift() + nominalWidth
          haveWidth = true
        }
        y += stack.pop()
        x += stack.pop()
        contour(x, y)
      } else if (v === 22) {
        if (stack.length > 1 && !haveWidth) {
          width = stack.shift() + nominalWidth
          haveWidth = true
        }
        x += stack.pop()
        contour(x, y)
      } else if (v === 24) {
        while (stack.length > 2) {
          const c1x = x + stack.shift()
          const c1y = y + stack.shift()
          const c2x = c1x + stack.shift()
          const c2y = c1y + stack.shift()
          x = c2x + stack.shift()
          y = c2y + stack.shift()
          curve(c1x, c1y, c2x, c2y, x, y)
        }
        x += stack.shift()
        y += stack.shift()
        path.lineTo(x, y)
      } else if (v === 25) {
        while (stack.length > 6) {
          x += stack.shift()
          y += stack.shift()
          path.lineTo(x, y)
        }
        const c1x = x + stack.shift()
        const c1y = y + stack.shift()
        const c2x = c1x + stack.shift()
        const c2y = c1y + stack.shift()
        x = c2x + stack.shift()
        y = c2y + stack.shift()
        curve(c1x, c1y, c2x, c2y, x, y)
      } else if (v === 26 || v === 27) {
        const vertical = v === 26
        if (stack.length & 1) {
          if (vertical) x += stack.shift()
          else y += stack.shift()
        }
        while (stack.length > 0) {
          if (vertical) {
            const c1x = x
            const c1y = y + stack.shift()
            const c2x = c1x + stack.shift()
            const c2y = c1y + stack.shift()
            x = c2x
            y = c2y + stack.shift()
            curve(c1x, c1y, c2x, c2y, x, y)
          } else {
            const c1x = x + stack.shift()
            const c1y = y
            const c2x = c1x + stack.shift()
            const c2y = c1y + stack.shift()
            x = c2x + stack.shift()
            y = c2y
            curve(c1x, c1y, c2x, c2y, x, y)
          }
        }
      } else if (v === 28) {
        stack.push((bytes[i] << 24 | bytes[i + 1] << 16) >> 16)
        i += 2
      } else if (v === 30 || v === 31) {
        let vertical = v === 30
        while (stack.length > 0) {
          if (vertical) {
            const c1x = x
            const c1y = y + stack.shift()
            const c2x = c1x + stack.shift()
            const c2y = c1y + stack.shift()
            x = c2x + stack.shift()
            y = c2y + (stack.length === 1 ? stack.shift() : 0)
            curve(c1x, c1y, c2x, c2y, x, y)
          } else {
            const c1x = x + stack.shift()
            const c1y = y
            const c2x = c1x + stack.shift()
            const c2y = c1y + stack.shift()
            y = c2y + stack.shift()
            x = c2x + (stack.length === 1 ? stack.shift() : 0)
            curve(c1x, c1y, c2x, c2y, x, y)
          }
          vertical = !vertical
        }
      } else if (v >= 32 && v < 247) {
        stack.push(v - 139)
      } else if (v >= 247 && v < 251) {
        stack.push((v - 247) * 256 + bytes[i++] + 108)
      } else if (v >= 251 && v < 255) {
        stack.push(-(v - 251) * 256 - bytes[i++] - 108)
      } else if (v === 255) {
        stack.push((bytes[i] << 24 | bytes[i + 1] << 16 | bytes[i + 2] << 8 | bytes[i + 3]) / 65536)
        i += 4
      }
    }
  }
  run(code)
  if (font.variation && coords) {
    for (const command of path.commands) {
      for (const key of Object.keys(command)) {
        if (key !== "type") command[key] = Math.round(command[key])
      }
    }
  }
  if (haveWidth) glyph.advanceWidth = width
  return path
}

function readCff(font, view, start) {
  const major = view.getUint8(start)
  if (major > 2) throw new Error(`Unsupported CFF table version ${major}.${view.getUint8(start + 1)}`)
  const table = {}
  if (major === 2) font.tables.cff2 = table
  else font.tables.cff = table
  const headerSize = view.getUint8(start + 2)
  let top
  let strings = null
  if (major > 1) {
    const length = view.getUint16(start + 3)
    const globals = cffIndex(view, start + headerSize + length, major)
    font.gsubrs = globals.objects
    top = topDicts(view, 0, [bytesOf(view, start + headerSize, start + headerSize + length)], undefined, major)[0]
  } else {
    const names = cffIndex(view, start + 4)
    const tops = cffIndex(view, names.endOffset)
    const stringIndex = cffIndex(view, tops.endOffset)
    strings = stringIndex.objects.map(asText)
    font.gsubrs = cffIndex(view, stringIndex.endOffset).objects
    const all = topDicts(view, start, tops.objects, strings, major)
    if (all.length !== 1) throw new Error(`CFF table has too many fonts in 'FontSet' - count of fonts NameIndex.length = ${all.length}`)
    top = all[0]
  }
  font.gsubrsBias = subroutineBias(font.gsubrs)
  table.topDict = top
  if (major < 2 && top.ros[0] !== undefined && top.ros[1] !== undefined) font.isCIDFont = true
  if (major > 1) {
    if (!top.fdArray) throw new Error("This is a CFF2 font, but FDArray information is missing")
    top._fdArray = fontDicts(view, start, cffIndex(view, start + top.fdArray, major).objects)
    if (top.fdSelect) top._fdSelect = readFdSelect(view, start + top.fdSelect, font.numGlyphs, top._fdArray.length, major)
  } else if (font.isCIDFont) {
    if (top.fdArray === 0 || top.fdSelect === 0) throw new Error("Font is marked as a CID font, but FDArray and/or FDSelect information is missing")
    top._fdArray = topDicts(view, start, cffIndex(view, top.fdArray + start).objects, strings, major)
    top._fdSelect = readFdSelect(view, top.fdSelect + start, font.numGlyphs, top._fdArray.length, major)
  }
  if (major < 2) {
    const privateAt = start + top.private[1]
    const own = cffDict(view, privateAt, top.private[0], major)
    const subrs = dictValue(own, 19, 0)
    if (subrs !== 0) cffIndex(view, privateAt + subrs)
  }
  const charstrings = cffIndex(view, start + top.charStrings, major).objects
  if (major < 2) {
    font.cffCharset = top.charset === 0 ? CFF_ISO_ADOBE : top.charset === 1 ? CFF_EXPERT : top.charset === 2 ? CFF_EXPERT_SUBSET : readCharset(view, start + top.charset, charstrings.length, strings, font.isCIDFont)
  }
  font.glyphs = new Glyphs(charstrings.map((code, i) => {
    const glyph = new Glyph(i, () => charstringPath(font, glyph, code, major))
    return glyph
  }))
  if (top.vstore) top._vstore = readItemStore(view, start + top.vstore + 2)
}

function gposLayout(view, start) {
  const version = view.getUint16(start) + view.getUint16(start + 2) / 1 / 10
  if (version !== 1 && version !== 1.1) throw new Error(`Unsupported GPOS table version ${version}`)
  const pointer = (base, at) => {
    const offset = view.getUint16(at)
    return offset > 0 ? base + offset : null
  }
  const langSys = at => at === null ? undefined : { featureIndexes: Array.from({ length: view.getUint16(at + 4) }, (_, i) => view.getUint16(at + 6 + i * 2)) }
  const scriptsAt = pointer(start, start + 4)
  const scripts = scriptsAt === null ? [] : Array.from({ length: view.getUint16(scriptsAt) }, (_, i) => {
    const record = scriptsAt + 2 + i * 6
    const scriptAt = pointer(scriptsAt, record + 4)
    return { tag: tagAt(view, record), script: scriptAt === null ? undefined : { defaultLangSys: langSys(pointer(scriptAt, scriptAt)) } }
  })
  const featuresAt = pointer(start, start + 6)
  const features = featuresAt === null ? [] : Array.from({ length: view.getUint16(featuresAt) }, (_, i) => {
    const record = featuresAt + 2 + i * 6
    const featureAt = pointer(featuresAt, record + 4)
    return { tag: tagAt(view, record), feature: featureAt === null ? undefined : { lookupListIndexes: Array.from({ length: view.getUint16(featureAt + 2) }, (_, j) => view.getUint16(featureAt + 4 + j * 2)) } }
  })
  const lookupsAt = pointer(start, start + 8)
  const lookups = lookupsAt === null ? [] : Array.from({ length: view.getUint16(lookupsAt) }, (_, i) => {
    const lookupAt = pointer(lookupsAt, lookupsAt + 2 + i * 2)
    if (lookupAt === null) return undefined
    const lookupType = view.getUint16(lookupAt)
    if (lookupType < 1 || lookupType > 9) throw new Error(`GPOS/GSUB lookup type ${lookupType} unknown.`)
    return { lookupType, subtables: Array.from({ length: view.getUint16(lookupAt + 4) }, (_, j) => pointer(lookupAt, lookupAt + 6 + j * 2)) }
  })
  return { view, scripts, features, lookups }
}

function search(list, key, value) {
  let low = 0
  let high = list.length - 1
  while (low <= high) {
    const middle = low + high >>> 1
    const found = key ? list[middle][key] : list[middle]
    if (found === value) return middle
    if (found < value) low = middle + 1
    else high = middle - 1
  }
  return -low - 1
}

function searchRange(ranges, value) {
  let low = 0
  let high = ranges.length - 1
  while (low <= high) {
    const middle = low + high >>> 1
    const start = ranges[middle].start
    if (start === value) return ranges[middle]
    if (start < value) low = middle + 1
    else high = middle - 1
  }
  if (low > 0) return value > ranges[low - 1].end ? 0 : ranges[low - 1]
  return undefined
}

function kerningLookups(layout) {
  let script
  for (const entry of layout.scripts) {
    if (entry.tag === "DFLT") {
      script = "DFLT"
      break
    }
    if (entry.tag === "latn") script = "latn"
  }
  const position = search(layout.scripts, "tag", script || "DFLT")
  const system = position >= 0 && layout.scripts[position].script ? layout.scripts[position].script.defaultLangSys : undefined
  if (!system) return []
  const feature = system.featureIndexes.map(index => layout.features[index]).find(record => record.tag === "kern")
  if (!feature || !feature.feature) return []
  return feature.feature.lookupListIndexes.map(index => layout.lookups[index]).filter(lookup => lookup.lookupType === 2).map(lookup => ({ subtables: lookup.subtables.map(at => at === null ? undefined : pairSubtable(layout.view, at)) }))
}

function coverageAt(view, at) {
  const format = view.getUint16(at)
  const count = view.getUint16(at + 2)
  if (format === 1) return { format, glyphs: Array.from({ length: count }, (_, i) => view.getUint16(at + 4 + i * 2)) }
  if (format === 2) return { format, ranges: Array.from({ length: count }, (_, i) => ({ start: view.getUint16(at + 4 + i * 6), end: view.getUint16(at + 6 + i * 6), index: view.getUint16(at + 8 + i * 6) })) }
  throw new Error(`0x${at.toString(16)}: Coverage format must be 1 or 2.`)
}

function classAt(view, at) {
  const format = view.getUint16(at)
  if (format === 1) return { format, startGlyph: view.getUint16(at + 2), classes: Array.from({ length: view.getUint16(at + 4) }, (_, i) => view.getUint16(at + 6 + i * 2)) }
  if (format === 2) return { format, ranges: Array.from({ length: view.getUint16(at + 2) }, (_, i) => ({ start: view.getUint16(at + 4 + i * 6), end: view.getUint16(at + 6 + i * 6), classId: view.getUint16(at + 8 + i * 6) })) }
  return { format }
}

function valueSize(format) {
  let size = 0
  for (let bit = 0; bit < 8; bit++) size += format & 1 << bit ? 2 : 0
  return size
}

function advanceOf(view, at, format) {
  if (format === 0 || !(format & 4)) return undefined
  return view.getInt16(at + (format & 1 ? 2 : 0) + (format & 2 ? 2 : 0))
}

function pairSubtable(view, at) {
  const posFormat = view.getUint16(at)
  if (posFormat !== 1 && posFormat !== 2) throw new Error(`0x${at.toString(16)}: GPOS lookup type 2 format must be 1 or 2.`)
  const coverageOffset = view.getUint16(at + 2)
  const coverage = coverageOffset ? coverageAt(view, at + coverageOffset) : undefined
  const format1 = view.getUint16(at + 4)
  const format2 = view.getUint16(at + 6)
  const recordSize = valueSize(format1) + valueSize(format2)
  if (posFormat === 1) {
    const pairSets = Array.from({ length: view.getUint16(at + 8) }, (_, i) => {
      const setOffset = view.getUint16(at + 10 + i * 2)
      if (!setOffset) return undefined
      const setAt = at + setOffset
      return Array.from({ length: view.getUint16(setAt) }, (_, j) => {
        const record = setAt + 2 + j * (2 + recordSize)
        return { secondGlyph: view.getUint16(record), xAdvance: advanceOf(view, record + 2, format1) }
      })
    })
    return { posFormat, coverage, pairSets }
  }
  const class1Offset = view.getUint16(at + 8)
  const class2Offset = view.getUint16(at + 10)
  const class1Count = view.getUint16(at + 12)
  const class2Count = view.getUint16(at + 14)
  const classRecords = Array.from({ length: class1Count }, (_, i) => Array.from({ length: class2Count }, (_, j) => ({ xAdvance: advanceOf(view, at + 16 + (i * class2Count + j) * recordSize, format1) })))
  return { posFormat, coverage, classDef1: class1Offset ? classAt(view, at + class1Offset) : undefined, classDef2: class2Offset ? classAt(view, at + class2Offset) : undefined, classRecords }
}

function coverageIndex(coverage, glyph) {
  if (coverage.format === 1) {
    const index = search(coverage.glyphs, null, glyph)
    return index >= 0 ? index : -1
  }
  if (coverage.format === 2) {
    const range = searchRange(coverage.ranges, glyph)
    return range ? range.index + glyph - range.start : -1
  }
  return undefined
}

function glyphClass(classes, glyph) {
  if (classes.format === 1) return classes.startGlyph <= glyph && glyph < classes.startGlyph + classes.classes.length ? classes.classes[glyph - classes.startGlyph] : 0
  if (classes.format === 2) {
    const range = searchRange(classes.ranges, glyph)
    return range ? range.classId : 0
  }
  return undefined
}

function gposKerning(lookups, left, right) {
  for (const lookup of lookups) {
    for (const subtable of lookup.subtables) {
      const index = coverageIndex(subtable.coverage, left)
      if (index < 0) continue
      if (subtable.posFormat === 1) {
        const pair = subtable.pairSets[index].find(entry => entry.secondGlyph === right)
        if (pair) return pair.xAdvance || 0
      } else if (subtable.posFormat === 2) {
        return subtable.classRecords[glyphClass(subtable.classDef1, left)][glyphClass(subtable.classDef2, right)].xAdvance || 0
      }
    }
  }
  return 0
}

function readKern(view, start) {
  const pairs = {}
  const version = view.getUint16(start)
  let at
  let count
  if (version === 0) {
    if (view.getUint16(start + 4) !== 0) throw new Error("Unsupported kern sub-table version.")
    count = view.getUint16(start + 10)
    at = start + 18
  } else if (version === 1) {
    if ((view.getUint16(start + 12) & 255) !== 0) return pairs
    count = view.getUint16(start + 16)
    at = start + 24
  } else {
    throw new Error(`Unsupported kern table version (${version}).`)
  }
  for (let i = 0; i < count; i++) pairs[`${view.getUint16(at + i * 6)},${view.getUint16(at + i * 6 + 2)}`] = view.getInt16(at + i * 6 + 4)
  return pairs
}

class Glyphs {
  constructor(list) {
    this.list = list
    this.length = list.length
  }

  get(index) {
    return this.list[index]
  }
}

function tableEntries(view, signature) {
  if (signature === "wOFF") {
    return Array.from({ length: view.getUint16(12) }, (_, i) => {
      const at = 44 + i * 20
      const compressed = view.getUint32(at + 8)
      const length = view.getUint32(at + 12)
      return { tag: tagAt(view, at), offset: view.getUint32(at + 4), compressed: compressed < length ? compressed : 0, length }
    })
  }
  return Array.from({ length: view.getUint16(4) }, (_, i) => ({ tag: tagAt(view, 12 + i * 16), offset: view.getUint32(20 + i * 16), compressed: 0, length: view.getUint32(24 + i * 16) }))
}

function tableData(view, entry) {
  if (!entry.compressed) return { view, at: entry.offset }
  const inflated = inflateSync(bytesOf(view, entry.offset + 2, entry.offset + entry.compressed), { out: new Uint8Array(entry.length) })
  return { view: new DataView(inflated.buffer, inflated.byteOffset, entry.length), at: 0 }
}

export function readFont(buffer) {
  if (buffer.constructor !== ArrayBuffer) buffer = new Uint8Array(buffer).buffer
  const view = new DataView(buffer)
  const signature = tagAt(view, 0)
  let outlines
  if (signature === TRUETYPE || signature === "true" || signature === "typ1") outlines = "truetype"
  else if (signature === "OTTO") outlines = "cff"
  else if (signature === "wOFF") {
    const flavor = tagAt(view, 4)
    if (flavor === TRUETYPE) outlines = "truetype"
    else if (flavor === "OTTO") outlines = "cff"
    else throw new Error(`Unsupported OpenType flavor ${signature}`)
  } else if (signature === "wOF2") {
    throw new Error("WOFF2 require an external decompressor library")
  } else {
    throw new Error(`Unsupported OpenType signature ${signature}`)
  }
  const entries = new Map(tableEntries(view, signature).map(entry => [entry.tag, entry]))
  const open = tag => {
    const entry = entries.get(tag)
    if (!entry) throw new TypeError(`this font has no ${tag} table`)
    return tableData(view, entry)
  }
  const font = { outlinesFormat: outlines, tables: {}, resolving: new Set() }
  let map = null
  if (entries.has("cmap")) {
    const { view: data, at } = open("cmap")
    map = readCmap(data, at)
    font.tables.cmap = { glyphIndexMap: map }
  }
  const head = open("head")
  if (head.view.getUint32(head.at + 12) !== 1594834165) throw new Error("Font header has wrong magic number.")
  font.unitsPerEm = head.view.getUint16(head.at + 18)
  const shortLoca = head.view.getInt16(head.at + 50) === 0
  if (entries.has("hhea")) {
    const { view: data, at } = open("hhea")
    font.numberOfHMetrics = data.getUint16(at + 34)
  }
  if (entries.has("maxp")) {
    const { view: data, at } = open("maxp")
    font.numGlyphs = data.getUint16(at + 4)
  }
  if (entries.has("OS/2")) {
    const { view: data, at } = open("OS/2")
    font.tables.os2 = data.getUint16(at) >= 2 ? { sCapHeight: data.getInt16(at + 88) } : {}
  }
  const ltag = entries.has("ltag") ? readLtag(open("ltag").view, open("ltag").at) : undefined
  const names = open("name")
  font.names = readNames(names.view, names.at, ltag)
  if (entries.has("glyf") && entries.has("loca")) {
    const loca = open("loca")
    const glyf = open("glyf")
    font.glyphs = new Glyphs(readGlyphs(font, glyf.view, glyf.at, readLoca(loca.view, loca.at, font.numGlyphs, shortLoca)))
  } else if (entries.has("CFF ")) {
    const cff = open("CFF ")
    readCff(font, cff.view, cff.at)
  } else if (entries.has("CFF2")) {
    const cff = open("CFF2")
    readCff(font, cff.view, cff.at)
  } else {
    throw new Error("Font doesn't contain TrueType, CFF or CFF2 outlines.")
  }
  const hmtx = open("hmtx")
  let advance
  for (let i = 0; i < font.numGlyphs; i++) {
    if (i < font.numberOfHMetrics) advance = hmtx.view.getUint16(hmtx.at + i * 4)
    const glyph = font.glyphs.get(i)
    if (!glyph) throw new TypeError(`this font has no glyph ${i} for its horizontal metrics`)
    glyph.advanceWidth = advance
  }
  if (!map) throw new TypeError("this font has no cmap table")
  for (const code in map) {
    const glyph = font.glyphs.get(map[code])
    if (!glyph) throw new TypeError(`this font maps a character to a missing glyph ${map[code]}`)
    if (!glyph.unicodes.length) glyph.unicode = parseInt(code)
    glyph.unicodes.push(parseInt(code))
  }
  if (!font.cffCharset && !entries.has("post")) throw new TypeError("this font has no post table")
  font.kerningPairs = entries.has("kern") ? readKern(open("kern").view, open("kern").at) : {}
  if (entries.has("GPOS")) {
    const gpos = open("GPOS")
    font.kerningLookups = kerningLookups(gposLayout(gpos.view, gpos.at))
  }
  if (entries.has("fvar")) {
    const fvar = open("fvar")
    font.tables.fvar = readFvar(fvar.view, fvar.at, font.names)
  }
  if (entries.has("gvar")) {
    const gvar = open("gvar")
    font.tables.gvar = readGvar(gvar.view, gvar.at, font.tables.fvar, font.glyphs)
  }
  if (entries.has("avar")) {
    const avar = open("avar")
    font.tables.avar = readAvar(avar.view, avar.at, font.tables.fvar)
  }
  if (entries.has("HVAR")) {
    const hvar = open("HVAR")
    font.tables.hvar = readHvar(hvar.view, hvar.at)
  }
  if (font.tables.fvar && (font.tables.gvar || font.tables.cff2)) font.variation = new Variation(font)
  font.charToGlyphIndex = char => map[char.codePointAt(0)] || 0
  font.charToGlyph = char => font.glyphs.get(font.charToGlyphIndex(char)) || font.glyphs.get(0)
  font.getKerningValue = (left, right) => {
    left = left.index || left
    right = right.index || right
    return font.kerningLookups ? gposKerning(font.kerningLookups, left, right) : font.kerningPairs[`${left},${right}`] || 0
  }
  return font
}
