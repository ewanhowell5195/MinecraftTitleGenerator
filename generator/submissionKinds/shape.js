import fs from "node:fs"
import path from "node:path"
import { PNG } from "pngjs"
import { defaultDepth } from "../../src/lib/settings.js"
import { SHAPE_TEXTURE } from "../../src/lib/shapes.js"
import { SHAPE_HOLDING_FOLDER, silhouetteBounds, silhouettePixels } from "../../src/lib/submissionKinds/shape.js"
import { readJson, readPng, writeJson, writePng } from "../common.js"
import { flatSheet } from "../flat.js"
import { publishedShapes, readMask } from "../fonts.js"

const GRID = [255, 0, 0, 255]
const GLYPH = [0, 0, 0, 255]
const EMPTY = [255, 255, 255, 255]
const THUMBNAIL_HEIGHT = 96
const RING = [0, 0, 0, 255]
const BORDER = "#000000"

function sheetOf(image) {
  const bounds = silhouetteBounds(image)
  if (!bounds) throw new Error("the silhouette has no solid pixels")
  const sheet = new PNG({ width: bounds.width + 2, height: bounds.height + 2 })
  for (let y = 0; y < sheet.height; y++) {
    for (let x = 0; x < sheet.width; x++) {
      const edge = x === 0 || y === 0 || x === sheet.width - 1 || y === sheet.height - 1
      const solid = !edge && image.data[((bounds.top + y - 1) * image.width + bounds.left + x - 1) * 4 + 3] >= 128
      sheet.data.set(edge ? GRID : solid ? GLYPH : EMPTY, (y * sheet.width + x) * 4)
    }
  }
  return sheet
}

function convertSilhouette(root, id) {
  const holding = path.join(root, SHAPE_HOLDING_FOLDER, `${id}.png`)
  const list = publishedShapes()
  const entry = list.find(shape => shape.id === id)
  if (!entry) throw new Error(`${id} has a held silhouette but isn't a PNG shape in shapes.json`)
  const image = readPng(holding)
  writePng(path.join(entry.dir, "font.png"), sheetOf(image))
  writeJson(path.join(entry.dir, "textures.json"), { primary: SHAPE_TEXTURE, secondary: SHAPE_TEXTURE, textures: { [SHAPE_TEXTURE]: { border: BORDER }, flat: { border: BORDER } }, overlays: {} })
  const { cells, capHeight } = readMask(entry, list)
  const depth = defaultDepth(entry)
  writePng(path.join(entry.dir, "textures", "flat.png"), flatSheet(cells, capHeight, depth).sheet)
  const painted = silhouettePixels(cells, capHeight, depth, image)
  const own = new PNG({ width: painted.width, height: painted.height })
  own.data.set(painted.data)
  writePng(path.join(entry.dir, "textures", `${SHAPE_TEXTURE}.png`), own)
  fs.rmSync(holding)
}

function sampled(texture, face, across, down) {
  let [s, t] = [across, down]
  for (let turn = 0; turn < (face.rotation ?? 0) / 90; turn++) [s, t] = [t, 1 - s]
  const [u1, v1, u2, v2] = face.uv
  const x = Math.min(texture.width - 1, Math.floor((u1 + (u2 - u1) * s) / 16 * texture.width))
  const y = Math.min(texture.height - 1, Math.floor((v1 + (v2 - v1) * t) / 16 * texture.height))
  return texture.data.subarray((y * texture.width + x) * 4, (y * texture.width + x) * 4 + 4)
}

export function frontView(model, texture) {
  const fronts = model.elements.filter(element => element.faces.north && !element.rotation)
  if (!fronts.length) throw new Error("the model has no unrotated north faces to show")
  const left = Math.min(...fronts.map(element => -Math.max(element.from[0], element.to[0])))
  const right = Math.max(...fronts.map(element => -Math.min(element.from[0], element.to[0])))
  const bottom = Math.min(...fronts.map(element => Math.min(element.from[1], element.to[1])))
  const top = Math.max(...fronts.map(element => Math.max(element.from[1], element.to[1])))
  const scale = Math.max(1, Math.round(THUMBNAIL_HEIGHT / (top - bottom)))
  const ring = scale
  const view = new PNG({ width: Math.ceil((right - left) * scale) + ring * 2, height: Math.ceil((top - bottom) * scale) + ring * 2 })
  view.data.fill(0)
  const solid = new Uint8Array(view.width * view.height)
  for (const element of fronts.toSorted((a, b) => Math.min(b.from[2], b.to[2]) - Math.min(a.from[2], a.to[2]))) {
    const x0 = (-Math.max(element.from[0], element.to[0]) - left) * scale + ring
    const x1 = (-Math.min(element.from[0], element.to[0]) - left) * scale + ring
    const y0 = (top - Math.max(element.from[1], element.to[1])) * scale + ring
    const y1 = (top - Math.min(element.from[1], element.to[1])) * scale + ring
    for (let y = Math.round(y0); y < Math.round(y1); y++) {
      for (let x = Math.round(x0); x < Math.round(x1); x++) {
        const pixel = sampled(texture, element.faces.north, (x + 0.5 - x0) / (x1 - x0), (y + 0.5 - y0) / (y1 - y0))
        if (pixel[3] < 128) continue
        view.data.set(pixel, (y * view.width + x) * 4)
        solid[y * view.width + x] = 1
      }
    }
  }
  for (let y = 0; y < view.height; y++) {
    for (let x = 0; x < view.width; x++) {
      if (solid[y * view.width + x]) continue
      let near = false
      for (let dy = -ring; dy <= ring && !near; dy++) {
        for (let dx = -ring; dx <= ring && !near; dx++) near = solid[(y + dy) * view.width + x + dx] === 1 && x + dx >= 0 && x + dx < view.width && y + dy >= 0 && y + dy < view.height
      }
      if (near) view.data.set(RING, (y * view.width + x) * 4)
    }
  }
  return view
}

function modelThumbnails(root, id) {
  const folder = path.join(root, "public", "shapes", id)
  const view = frontView(readJson(path.join(folder, "model.json")), readPng(path.join(folder, "textures", `${SHAPE_TEXTURE}.png`)))
  for (const name of ["flat", SHAPE_TEXTURE]) writePng(path.join(folder, "thumbnails", `${name}.png`), view)
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
