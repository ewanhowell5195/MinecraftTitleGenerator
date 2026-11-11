import { scanMask } from "../src/lib/font.js"
import { BASELINE, GRID, setPixel } from "../src/lib/sheet.js"
import { marksFor, sheetMeasures } from "../src/lib/stretchMarks.js"

export function markSheet(png, cells, capHeight, { check = false, force = false } = {}) {
  const { stroke, block } = sheetMeasures(cells)
  const scan = scanMask(png.data, png.width, png.height)
  const differences = []
  let index = 0
  let marked = 0
  for (const row of scan.rows) {
    for (const cell of row.cells) {
      const glyph = cells[index++]
      if (!glyph?.width) continue
      const rows = marksFor(glyph, { capHeight, stroke, block })
      if (check) {
        if (glyph.stretch && JSON.stringify(rows) !== JSON.stringify(glyph.stretch)) differences.push({ char: glyph.char, generated: rows, existing: glyph.stretch })
        continue
      }
      if (glyph.stretch && !force) continue
      for (let y = row.top; y <= row.bottom; y++) setPixel(png, cell.x + cell.width, y, rows.includes(row.baseline - y) ? BASELINE : GRID)
      marked++
    }
  }
  return { stroke, block, marked, differences }
}
