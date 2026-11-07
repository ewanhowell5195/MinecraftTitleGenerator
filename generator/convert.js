import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import opentype from "opentype.js"
import { PNG } from "pngjs"
import { DEFAULT_ORDER, parseMask } from "../src/lib/font.js"
import { defaultBorder, defaultDepth } from "../src/lib/settings.js"
import { cli, fillPng, setPixel, writePng } from "./common.js"
import { flatSheet, writeStarterTextures } from "./flat.js"
import { BASELINE, EMPTY, GLYPH, GRID, TOPLINE } from "./fonts.js"
import { markSheet } from "./marks.js"

const MAX_WIDTH = 560
const CURVE_STEPS = 16

function readFont(source, name) {
  const data = fs.readFileSync(source)
  if (data.toString("latin1", 0, 4) !== "ttcf") return opentype.parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.length))
  const fonts = Array.from({ length: data.readUInt32BE(8) }, (_, index) => opentype.parse(collectionFont(data, data.readUInt32BE(12 + index * 4))))
  const wanted = name?.toLowerCase()
  return fonts.find(item => [item.getEnglishName("fullName"), item.getEnglishName("fontFamily")].some(candidate => candidate?.trim().toLowerCase() === wanted)) ?? fonts[0]
}

function collectionFont(data, offset) {
  const count = data.readUInt16BE(offset + 4)
  const tables = Array.from({ length: count }, (_, index) => {
    const record = offset + 12 + index * 16
    return { record, start: data.readUInt32BE(record + 8), length: data.readUInt32BE(record + 12) }
  })
  let size = 12 + count * 16
  for (const table of tables) {
    table.at = size
    size += Math.ceil(table.length / 4) * 4
  }
  const out = Buffer.alloc(size)
  data.copy(out, 0, offset, offset + 12)
  for (const [index, table] of tables.entries()) {
    data.copy(out, 12 + index * 16, table.record, table.record + 8)
    out.writeUInt32BE(table.at, 12 + index * 16 + 8)
    out.writeUInt32BE(table.length, 12 + index * 16 + 12)
    data.copy(out, table.at, table.start, table.start + table.length)
  }
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.length)
}

function windowsFonts() {
  const fontsDir = path.join(process.env.WINDIR ?? "C:/Windows", "Fonts")
  return ["HKLM", "HKCU"].flatMap(hive => {
    let output
    try {
      output = execFileSync("reg", ["query", `${hive}\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts`], { encoding: "utf8" })
    } catch {
      return []
    }
    return output.split(/\r?\n/).flatMap(line => {
      const match = line.match(/^\s+(.+?)\s+REG_SZ\s+(.+)$/)
      if (!match) return []
      const names = match[1].replace(/\s*\((TrueType|OpenType)\)$/, "").split(" & ")
      return [{ names: names.concat(names.map(item => item.replace(/ Regular$/, ""))), file: path.isAbsolute(match[2]) ? match[2] : path.join(fontsDir, match[2]) }]
    })
  })
}

function fontsIn(dirs) {
  return dirs.filter(dir => fs.existsSync(dir)).flatMap(dir => fs.readdirSync(dir, { recursive: true }).map(item => path.join(dir, item))).filter(item => /\.(ttf|otf|woff)$/i.test(item)).flatMap(item => {
    try {
      const parsed = readFont(item, null)
      const family = parsed.getEnglishName("fontFamily")
      return [{ names: [parsed.getEnglishName("fullName"), parsed.getEnglishName("fontSubfamily") === "Regular" ? family : null].filter(Boolean), file: item }]
    } catch {
      return []
    }
  })
}

function installedFonts() {
  if (process.platform === "win32") return windowsFonts()
  if (process.platform === "darwin") return fontsIn(["/System/Library/Fonts", "/Library/Fonts", path.join(os.homedir(), "Library/Fonts")])
  return fontsIn(["/usr/share/fonts", "/usr/local/share/fonts", path.join(os.homedir(), ".fonts"), path.join(os.homedir(), ".local/share/fonts")])
}

function installedFont(name) {
  const wanted = name.toLowerCase()
  const found = installedFonts().find(entry => entry.names.some(candidate => candidate.toLowerCase() === wanted))
  if (!found) throw new Error(`no font file or installed font called "${name}"`)
  return found.file
}

function sourceChars(char, lowercase) {
  if (char === "\u{1F629}") return ["\u2018", "'"]
  const letter = char === "\u{1F633}" ? "a" : char
  if (/^[a-z]$/.test(letter)) return lowercase ? [letter, letter.toUpperCase()] : [letter.toUpperCase(), letter]
  return [char]
}

function glyphFor(font, char, lowercase) {
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

function pixelGrid(glyphs, cap) {
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

function gridShift(glyph, unit) {
  const points = glyph.path.commands.filter(command => command.x !== undefined)
  if (!unit || !points.length) return 0
  const left = Math.min(...points.map(command => command.x))
  return Math.round(left / unit) * unit - left
}

function capUnits(font) {
  const height = font.tables.os2?.sCapHeight
  if (height > 0) return height
  const glyph = font.charToGlyph("H")
  if (glyph && glyph.index !== 0) return glyph.getBoundingBox().y2
  return font.unitsPerEm * 0.7
}

function rasterise(glyph, scale, shift) {
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

function sheetRows(cells, capHeight) {
  const rows = []
  for (const cell of cells) {
    const row = rows[rows.length - 1]
    if (!row || row.width + cell.width + 1 > MAX_WIDTH) rows.push({ cells: [cell], width: 1 + cell.width + 1 })
    else {
      row.cells.push(cell)
      row.width += cell.width + 1
    }
  }
  for (const row of rows) {
    row.top = Math.max(capHeight, ...row.cells.map(cell => cell.shape?.top ?? 0))
    row.bottom = Math.min(0, ...row.cells.map(cell => cell.shape?.bottom ?? 0))
  }
  return rows
}

function drawSheet(cells, capHeight) {
  const rows = sheetRows(cells, capHeight)
  const width = Math.max(...rows.map(row => row.width))
  const height = rows.reduce((sum, row) => sum + row.top - row.bottom + 1, 1)
  const png = new PNG({ width, height })
  fillPng(png, EMPTY)
  let y = 0
  for (const row of rows) {
    for (let x = 0; x < width; x++) setPixel(png, x, y, GRID)
    const top = y + 1
    const bottom = top + row.top - row.bottom - 1
    const baseline = top + row.top - 1
    const topline = baseline - capHeight + 1
    for (let line = top; line <= bottom; line++) setPixel(png, 0, line, line === baseline && line !== bottom ? BASELINE : line === topline && line !== top ? TOPLINE : GRID)
    let x = 1
    for (const { shape, width: cellWidth } of row.cells) {
      if (shape) {
        for (let gy = 0; gy < shape.height; gy++) {
          for (let gx = 0; gx < shape.width; gx++) if (shape.mask[gy * shape.width + gx]) setPixel(png, x + gx, baseline - (shape.top - 1) + gy, GLYPH)
        }
      }
      x += cellWidth
      for (let line = top; line <= bottom; line++) setPixel(png, x, line, GRID)
      x++
    }
    y = bottom + 1
  }
  for (let x = 0; x < width; x++) setPixel(png, x, height - 1, GRID)
  return png
}

const { first: query, has, option } = cli("convert.js <font file or installed font name> [--height <cap height>] [--id <id>] [--out <folder>] [--chars <characters>] [--lowercase]")
const lowercase = has("--lowercase")
const order = option("--chars") ?? DEFAULT_ORDER
const file = fs.existsSync(query) ? query : installedFont(query)
const font = readFont(file, fs.existsSync(query) ? null : query)
const fullName = (font.getEnglishName("fullName") ?? path.basename(file, path.extname(file))).trim()
const id = option("--id") ?? fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
const folder = option("--out") ?? path.resolve(id)

const characters = Array.from(order)
const glyphs = characters.map(char => glyphFor(font, char, lowercase))
const missing = characters.filter((char, index) => !glyphs[index])
const target = Number(option("--height") ?? 40)
const units = capUnits(font)
const grid = pixelGrid(glyphs.filter(Boolean), units)
const blockSize = grid ? Math.max(1, Math.round(target / (units / grid))) : null
const scale = grid ? blockSize / grid : target / units
const capHeight = Math.round(units * scale)
if (!Number.isFinite(scale) || capHeight < 1) throw new Error("could not work out a cap height, pass --height")

const cells = glyphs.map(glyph => {
  const shape = glyph ? rasterise(glyph, scale, gridShift(glyph, grid)) : null
  return { shape, width: shape?.width ?? Math.round(capHeight / 2) }
})
const png = drawSheet(cells, capHeight)

const space = font.charToGlyph(" ")
const entry = { id, name: fullName }
if (font.getEnglishName("designer")) entry.author = font.getEnglishName("designer")
Object.assign(entry, {
  height: capHeight + defaultBorder("top", entry) * 2,
  spaceWidth: space && space.index !== 0 ? Math.round(space.advanceWidth * scale) : Math.round(capHeight / 4)
})
if (order !== DEFAULT_ORDER) entry.order = order

const parsed = parseMask(png.data, png.width, png.height, order, defaultBorder("top", entry))
const { marked } = markSheet(png, parsed.list, parsed.capHeight)
const { sheet } = flatSheet(parsed.list, parsed.capHeight, defaultDepth(entry))

writePng(path.join(folder, "font.png"), png)
writePng(path.join(folder, "textures", "flat.png"), sheet)
writeStarterTextures(folder)
fs.writeFileSync(path.join(folder, "font.json"), JSON.stringify(entry, null, 2) + "\n")
console.log(`${fullName} from ${file}`)
console.log(`${grid ? `pixel font, ${units / grid} font pixels tall at ${blockSize} pixels each` : "vector font"}, cap height ${capHeight}, ${characters.length - missing.length} of ${characters.length} characters${missing.length ? `, missing ${missing.join(" ")}` : ""}, ${marked} marked`)
console.log(`wrote font.png, textures/flat.png, textures.json and font.json to ${folder}`)
