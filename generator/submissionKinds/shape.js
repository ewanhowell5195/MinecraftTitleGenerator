import fs from "node:fs"
import path from "node:path"
import { PNG } from "pngjs"
import { rgbOf } from "../../src/lib/colour.js"
import { defaultDepth } from "../../src/lib/settings.js"
import { SHAPE_TEXTURE } from "../../src/lib/shapes.js"
import { over } from "../../src/lib/thumbnails.js"
import { EMPTY, GLYPH, GRID, setPixel } from "../../src/lib/sheet.js"
import { SHAPE_HOLDING_FOLDER, silhouetteBounds, silhouettePixels } from "../../src/lib/submissionKinds/shape.js"
import { pngOf, readJson, readPng, writeJson, writePng } from "../common.js"
import { flatSheet } from "../flat.js"
import { fontDir, publicDir, publishedShapes, readMask } from "../fonts.js"
import { angledView } from "../modelView.js"

const RING_UNITS = 2
const DEEP = 0.75
const FADED = 0.3
const BORDER = "#000000"

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
  writeJson(path.join(folder, "textures.json"), { primary: SHAPE_TEXTURE, secondary: SHAPE_TEXTURE, textures: { [SHAPE_TEXTURE]: { border: BORDER }, flat: { border: BORDER } }, overlays: {} })
  const { cells, capHeight } = readMask(entry, list, root)
  const depth = defaultDepth(entry)
  writePng(path.join(folder, "textures", "flat.png"), flatSheet(cells, capHeight, depth).sheet)
  const painted = silhouettePixels(cells, capHeight, depth, image)
  writePng(path.join(folder, "textures", `${SHAPE_TEXTURE}.png`), pngOf(painted))
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

function fillEnclosed(view, colour) {
  const outside = new Uint8Array(view.width * view.height)
  const pending = []
  function reach(x, y) {
    if (x < 0 || y < 0 || x >= view.width || y >= view.height) return
    const at = y * view.width + x
    if (outside[at] || view.data[at * 4 + 3]) return
    outside[at] = 1
    pending.push(at)
  }
  for (let x = 0; x < view.width; x++) {
    reach(x, 0)
    reach(x, view.height - 1)
  }
  for (let y = 0; y < view.height; y++) {
    reach(0, y)
    reach(view.width - 1, y)
  }
  while (pending.length) {
    const at = pending.pop()
    const [x, y] = [at % view.width, Math.floor(at / view.width)]
    reach(x - 1, y)
    reach(x + 1, y)
    reach(x, y - 1)
    reach(x, y + 1)
  }
  for (let at = 0; at < outside.length; at++) {
    if (!outside[at] && !view.data[at * 4 + 3]) view.data.set(colour.concat(255), at * 4)
  }
}

export function frontView(model, texture, colour = [0, 0, 0]) {
  const fronts = model.elements.filter(element => element.faces.north && !element.rotation)
  if (!fronts.length) throw new Error("the model has no unrotated north faces to show")
  const left = Math.min(...fronts.map(element => -Math.max(element.from[0], element.to[0])))
  const right = Math.max(...fronts.map(element => -Math.min(element.from[0], element.to[0])))
  const bottom = Math.min(...fronts.map(element => Math.min(element.from[1], element.to[1])))
  const top = Math.max(...fronts.map(element => Math.max(element.from[1], element.to[1])))
  const ring = RING_UNITS
  const view = new PNG({ width: Math.ceil(right - left) + ring * 2, height: Math.ceil(top - bottom) + ring * 2 })
  view.data.fill(0)
  const solid = new Uint8Array(view.width * view.height)
  for (const element of fronts.toSorted((a, b) => Math.min(b.from[2], b.to[2]) - Math.min(a.from[2], a.to[2]))) {
    const x0 = -Math.max(element.from[0], element.to[0]) - left + ring
    const x1 = -Math.min(element.from[0], element.to[0]) - left + ring
    const y0 = top - Math.max(element.from[1], element.to[1]) + ring
    const y1 = top - Math.min(element.from[1], element.to[1]) + ring
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
      if (near && colour) view.data.set(colour.concat(255), (y * view.width + x) * 4)
    }
  }
  if (colour) fillEnclosed(view, colour)
  return view
}

function facesFront(model) {
  const extent = [0, 1, 2].map(axis => Math.max(...model.elements.flatMap(element => [element.from[axis], element.to[axis]])) - Math.min(...model.elements.flatMap(element => [element.from[axis], element.to[axis]])))
  return extent[2] < Math.max(extent[0], extent[1]) * DEEP && model.elements.some(element => element.faces.north && !element.rotation)
}

function overlaid(base, top) {
  for (let at = 0; at < base.data.length; at++) base.data[at] = Math.round(base.data[at] * FADED)
  for (let at = 0; at < top.data.length; at += 4) over(base, at / 4 % base.width, Math.floor(at / 4 / base.width), top.data.subarray(at, at + 4))
  return base
}

export function modelThumbnails(root, id) {
  const folder = path.join(publicDir(root), "shapes", id)
  const model = readJson(path.join(folder, "model.json"))
  const list = readJson(path.join(folder, "textures.json"))
  const view = facesFront(model) ? frontView : angledView
  const textures = Object.entries(list.textures).flatMap(([name, data]) => [[name, data.border]].concat(Object.entries(data.variants ?? {}).map(([variant, own]) => [variant, own.border ?? data.border])))
  const views = new Map(textures.map(([name, border]) => [name, view(model, readPng(path.join(folder, "textures", `${name}.png`)), rgbOf(border ?? BORDER).slice(0, 3))]))
  if (!views.has("flat")) views.set("flat", views.get(list.primary ?? textures[0][0]))
  const flat = path.join(folder, "textures", "flat.png")
  for (const [name, data] of Object.entries(list.overlays ?? {})) {
    const file = path.join(folder, "overlays", `${name}.png`)
    if (data.generated || !fs.existsSync(file) || !fs.existsSync(flat)) continue
    const base = readPng(flat)
    const overlay = readPng(file)
    if (overlay.width === base.width && overlay.height === base.height) views.set(name, overlaid(view(model, base), view(model, overlay, null)))
  }
  for (const [name, image] of views) writePng(path.join(folder, "thumbnails", `${name}.png`), image)
  for (const file of fs.readdirSync(path.join(folder, "thumbnails"))) {
    if (file.endsWith(".png") && !views.has(file.slice(0, -4))) fs.rmSync(path.join(folder, "thumbnails", file))
  }
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
