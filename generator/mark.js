import { cli, writePng } from "./common.js"
import { publishedFonts, readMask } from "./fonts.js"
import { markSheet } from "./marks.js"

const { first: id, has } = cli("mark.js <font> [--check] [--force]")
const check = has("--check")

const list = publishedFonts()
const entry = list.find(font => font.id === id)
if (!entry) throw new Error(`no font with id ${id}`)
if (entry.inherits) throw new Error(`${id} keeps its characters in ${entry.variant}'s font.png, mark ${entry.variant} instead`)
const { file, png, cells, capHeight } = readMask(entry, list)
const { stroke, block, marked, differences } = markSheet(png, cells, capHeight, { check, force: has("--force") })

function ranges(rows) {
  const list = []
  for (const y of rows) {
    const last = list[list.length - 1]
    if (last && last[1] === y - 1) last[1] = y
    else list.push([y, y])
  }
  return list.map(([from, to]) => from === to ? from : `${from}-${to}`).join(",") || "none"
}

if (check) {
  console.log(`${id}: stroke ${stroke}, block ${block}, cap height ${capHeight}, ${differences.length} of ${cells.filter(glyph => glyph.stretch).length} marked characters differ`)
  for (const { char, generated, existing } of differences) console.log(`  ${char}  generated ${ranges(generated)}  marked ${ranges(existing)}`)
} else {
  writePng(file, png)
  console.log(`${id}: marked ${marked} characters`)
}
