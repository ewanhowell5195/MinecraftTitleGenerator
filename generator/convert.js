import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import opentype from "opentype.js"
import decompress from "woff2-encoder/decompress"
import { authorList } from "../src/lib/authors.js"
import { parseMask } from "../src/lib/font.js"
import { englishName } from "../src/lib/fontImport.js"
import { glyphFor, gridShift, lineUnits, pixelGrid, rasterise } from "../src/lib/fontOutline.js"
import { jsonText } from "../src/lib/jsonText.js"
import { DEFAULT_ORDER } from "../src/lib/order.js"
import { defaultBorder, defaultDepth } from "../src/lib/settings.js"
import { drawSheet } from "../src/lib/sheet.js"
import { cli, pngOf, writePng } from "./common.js"
import { flatSheet, writeStarterTextures } from "./flat.js"
import { markSheet } from "./marks.js"

async function fontData(source) {
  const data = fs.readFileSync(source)
  return data.toString("latin1", 0, 4) === "wOF2" ? Buffer.from(await decompress(data)) : data
}

async function readFont(source, name) {
  const data = await fontData(source)
  if (data.toString("latin1", 0, 4) !== "ttcf") return opentype.parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.length))
  const fonts = Array.from({ length: data.readUInt32BE(8) }, (_, index) => opentype.parse(collectionFont(data, data.readUInt32BE(12 + index * 4))))
  const wanted = name?.toLowerCase()
  return fonts.find(item => [englishName(item, "fullName"), englishName(item, "fontFamily")].some(candidate => candidate.toLowerCase() === wanted)) ?? fonts[0]
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

async function fontsIn(dirs) {
  const files = dirs.filter(dir => fs.existsSync(dir)).flatMap(dir => fs.readdirSync(dir, { recursive: true }).map(item => path.join(dir, item))).filter(item => /\.(ttf|otf|woff2?)$/i.test(item))
  const found = await Promise.all(files.map(async item => {
    try {
      const parsed = await readFont(item, null)
      const family = parsed.getEnglishName("fontFamily")
      return [{ names: [parsed.getEnglishName("fullName"), parsed.getEnglishName("fontSubfamily") === "Regular" ? family : null].filter(Boolean), file: item }]
    } catch {
      return []
    }
  }))
  return found.flat()
}

function installedFonts() {
  if (process.platform === "win32") return windowsFonts()
  if (process.platform === "darwin") return fontsIn(["/System/Library/Fonts", "/Library/Fonts", path.join(os.homedir(), "Library/Fonts")])
  return fontsIn(["/usr/share/fonts", "/usr/local/share/fonts", path.join(os.homedir(), ".fonts"), path.join(os.homedir(), ".local/share/fonts")])
}

async function installedFont(name) {
  const wanted = name.toLowerCase()
  const found = (await installedFonts()).find(entry => entry.names.some(candidate => candidate.toLowerCase() === wanted))
  if (!found) throw new Error(`no font file or installed font called "${name}"`)
  return found.file
}

function sheetCell(shape, blankWidth) {
  if (!shape) return { advance: blankWidth, width: 0, height: 0, mask: new Uint8Array(0), originX: 0, top: 0, bottom: 0 }
  const mask = new Uint8Array(shape.mask.length)
  for (let row = 0; row < shape.height; row++) mask.set(shape.mask.subarray(row * shape.width, (row + 1) * shape.width), (shape.height - 1 - row) * shape.width)
  return { advance: shape.width, width: shape.width, height: shape.height, mask, originX: 0, top: shape.top, bottom: shape.bottom }
}

const { first: query, has, option } = cli("convert.js <font file or installed font name> [--height <cap height>] [--id <id>] [--out <folder>] [--chars <characters>] [--lowercase]")
const lowercase = has("--lowercase")
const order = option("--chars") ?? DEFAULT_ORDER
const file = fs.existsSync(query) ? query : await installedFont(query)
const font = await readFont(file, fs.existsSync(query) ? null : query)
const fullName = englishName(font, "fullName") || path.basename(file, path.extname(file)).trim()
const id = option("--id") ?? fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
const folder = option("--out") ?? path.resolve(id)

const characters = Array.from(order)
const glyphs = characters.map(char => glyphFor(font, char, lowercase))
const missing = characters.filter((char, index) => !glyphs[index])
const target = Number(option("--height") ?? 40)
const { top, base } = lineUnits(font)
const units = top - base
const grid = pixelGrid(glyphs.filter(Boolean), units, base)
const blockSize = grid ? Math.max(1, Math.round(target / (units / grid))) : null
const scale = grid ? blockSize / grid : target / units
const capHeight = Math.round(units * scale)
if (!Number.isFinite(scale) || capHeight < 1) throw new Error("could not work out a cap height, pass --height")

const cells = glyphs.map(glyph => sheetCell(glyph ? rasterise(glyph, scale, gridShift(glyph, grid, scale), base) : null, Math.round(capHeight / 2)))
const png = pngOf(drawSheet(cells, capHeight))

const space = font.charToGlyph(" ")
const designer = englishName(font, "designer")
const entry = { id, name: fullName }
if (designer) entry.authors = authorList(designer)
entry.spaceWidth = space && space.index !== 0 ? Math.round(space.advanceWidth * scale) : Math.round(capHeight / 4)
if (order !== DEFAULT_ORDER) entry.order = order

const parsed = parseMask(png.data, png.width, png.height, order, defaultBorder("top", entry))
const { marked } = markSheet(png, parsed.list, parsed.capHeight)
const { sheet } = flatSheet(parsed.list, parsed.capHeight, defaultDepth(entry), 1, parsed.layers)

writePng(path.join(folder, "font.png"), png)
writePng(path.join(folder, "textures", "flat.png"), sheet)
writeStarterTextures(folder)
fs.writeFileSync(path.join(folder, "font.json"), `${jsonText(entry)}\n`)
console.log(`${fullName} from ${file}`)
console.log(`${grid ? `pixel font, ${units / grid} font pixels tall at ${blockSize} pixels each` : "vector font"}, cap height ${capHeight}, ${characters.length - missing.length} of ${characters.length} characters${missing.length ? `, missing ${missing.join(" ")}` : ""}, ${marked} marked`)
console.log(`wrote font.png, textures/flat.png, textures.json and font.json to ${folder}`)
