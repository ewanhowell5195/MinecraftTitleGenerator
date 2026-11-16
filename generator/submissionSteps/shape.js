import fs from "node:fs"
import path from "node:path"
import { PNG } from "pngjs"
import { defaultDepth } from "../../src/lib/settings.js"
import { SHAPE_TEXTURE } from "../../src/lib/shapes.js"
import { EMPTY, GLYPH, GRID, setPixel } from "../../src/lib/sheet.js"
import { SHAPE_HOLDING_FOLDER, silhouetteBounds, silhouettePixels } from "../../src/lib/submissionKinds/shape.js"
import { pngOf, readPng, writeJson, writePng } from "../common.js"
import { flatSheet } from "../flat.js"
import { fontDir, publishedShapes, readMask } from "../fonts.js"
import { modelThumbnails } from "../modelView.js"

function sheetOf(image) {
  const bounds = silhouetteBounds(image)
  if (!bounds) throw new Error("the silhouette has no solid pixels")
  const sheet = new PNG({ width: bounds.width + 2, height: bounds.height + 2 })
  for (let y = 0; y < sheet.height; y++) {
    for (let x = 0; x < sheet.width; x++) {
      const edge = x === 0 || y === 0 || x === sheet.width - 1 || y === sheet.height - 1
      const solid = !edge && image.data[((bounds.top + y - 1) * image.width + bounds.left + x - 1) * 4 + 3] >= 128
      setPixel(sheet, x, y, edge ? GRID : solid ? GLYPH : EMPTY)
    }
  }
  return sheet
}

function convertSilhouette(root, id) {
  const holding = path.join(root, SHAPE_HOLDING_FOLDER, `${id}.png`)
  const list = publishedShapes(root)
  const entry = list.find(shape => shape.id === id)
  if (!entry) throw new Error(`${id} has a held silhouette but isn't a PNG shape in shapes.json`)
  const folder = fontDir(entry, root)
  const image = readPng(holding)
  writePng(path.join(folder, "font.png"), sheetOf(image))
  writeJson(path.join(folder, "textures.json"), { primary: SHAPE_TEXTURE, secondary: SHAPE_TEXTURE, textures: { [SHAPE_TEXTURE]: {}, flat: {} }, overlays: {} })
  const { cells, capHeight } = readMask(entry, list, root)
  const depth = defaultDepth(entry)
  writePng(path.join(folder, "textures", "flat.png"), flatSheet(cells, capHeight, depth).sheet)
  const painted = silhouettePixels(cells, capHeight, depth, image)
  writePng(path.join(folder, "textures", `${SHAPE_TEXTURE}.png`), pngOf(painted))
  fs.rmSync(holding)
}

export async function prepare({ root, changed, node }) {
  for (const file of changed) {
    if (path.posix.dirname(file) === SHAPE_HOLDING_FOLDER && file.endsWith(".png") && fs.existsSync(path.join(root, file))) {
      const id = path.posix.basename(file, ".png")
      convertSilhouette(root, id)
      node("generator/thumbnails.js", id)
    }
    const model = /^public\/shapes\/([^/]+)\/model\.json$/.exec(file)
    if (model && fs.existsSync(path.join(root, file))) modelThumbnails(root, model[1])
  }
}
