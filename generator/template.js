import fs from "node:fs"
import path from "node:path"
import { defaultDepth } from "../src/lib/settings.js"
import { cli, readPng, writePng } from "./common.js"
import { flatSheet, writeStarterTextures } from "./flat.js"
import { publishedFonts, readMask } from "./fonts.js"

const { first: id, has, option } = cli("template.js <font> [--density <n>] [--out <file>] [--force] [--check]")
const density = has("--density") ? Number(option("--density")) : 1
const check = has("--check")
const force = has("--force")
if (!Number.isInteger(density) || density < 1) throw new Error("--density must be a whole number of at least 1")

const list = publishedFonts()
const entry = list.find(font => font.id === id)
if (!entry) throw new Error(`no font with id ${id}`)
if (entry.inherits) throw new Error(`${id} keeps its characters in ${entry.variant}'s sheet, make the template for ${entry.variant} instead`)
const { folder, cells, capHeight } = readMask(entry, list)
const depth = defaultDepth(entry)
const { sheet, layout, width, height } = flatSheet(cells, capHeight, depth, density)

const target = has("--out") ? path.resolve(option("--out")) : path.join(folder, "textures", "flat.png")

if (check) {
  const flat = readPng(path.join(folder, "textures", "flat.png"))
  const scale = flat.width / width
  const owner = new Map()
  for (const [glyph, at] of layout) {
    for (let y = at.up; y < at.down + depth; y++) for (let x = at.x; x < at.x + glyph.width; x++) owner.set(y * width + x, glyph.char)
  }
  const tally = new Map()
  let wrong = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const generated = (y * density * sheet.width + x * density) * 4
      const existing = (y * scale * flat.width + x * scale) * 4
      const a = sheet.data[generated + 3] > 127 ? sheet.data.subarray(generated, generated + 3).join() : "clear"
      const b = flat.data[existing + 3] > 127 ? flat.data.subarray(existing, existing + 3).join() : "clear"
      if (a === b) continue
      wrong++
      const char = owner.get(y * width + x) ?? "outside"
      tally.set(char, (tally.get(char) ?? 0) + 1)
    }
  }
  console.log(`${id}: template ${width}x${height}, flat.png ${flat.width / scale}x${flat.height / scale}, ${wrong} pixels differ`)
  if (wrong) console.log(`  ${Array.from(tally).sort((a, b) => b[1] - a[1]).map(([char, count]) => `${char} ${count}`).join(", ")}`)
} else {
  if (fs.existsSync(target) && !force) throw new Error(`${target} already exists, pass --force to replace it or --out to write somewhere else`)
  writePng(target, sheet)
  writeStarterTextures(folder)
  console.log(`${id}: wrote ${target} (${sheet.width}x${sheet.height})`)
}
