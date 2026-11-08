import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import opentype from "opentype.js"
import { PNG } from "pngjs"
import { DEFAULT_ORDER, SHEET_MAX_WIDTH, parseMask } from "../src/lib/font.js"
import { capUnits, glyphFor, gridShift, pixelGrid, rasterise } from "../src/lib/fontOutline.js"
import { defaultBorder, defaultDepth } from "../src/lib/settings.js"
import { cli, fillPng, setPixel, writePng } from "./common.js"
import { flatSheet, writeStarterTextures } from "./flat.js"
import { BASELINE, EMPTY, GLYPH, GRID, TOPLINE } from "./fonts.js"
import { markSheet } from "./marks.js"

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

function sheetRows(cells, capHeight) {
  const rows = []
  for (const cell of cells) {
    const row = rows.at(-1)
    if (!row || row.width + cell.width + 1 > SHEET_MAX_WIDTH) rows.push({ cells: [cell], width: 1 + cell.width + 1 })
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
entry.spaceWidth = space && space.index !== 0 ? Math.round(space.advanceWidth * scale) : Math.round(capHeight / 4)
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
