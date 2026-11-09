import fs from "node:fs"
import path from "node:path"
import { PNG } from "pngjs"
import { flattenFonts, fullOrder, parseMask, scanMask, sheetLayout, splitCells } from "../../src/lib/font.js"
import { titleCase } from "../../src/lib/names.js"
import { defaultBorder, defaultDepth } from "../../src/lib/settings.js"
import { font as fontKind } from "../../src/lib/submissionKinds/font.js"
import { HOLDING_FOLDER, drawSheet, finalEntry, holdingPath, ownFont, parentSheet, stackSheets, submittedFont, variation } from "../../src/lib/submissionKinds/fontBuild.js"
import { submissionContext } from "../../src/lib/submissionKinds/index.js"
import { readJson, readPng, writeJson, writePng } from "../common.js"
import { flatSheet, writeStarterTextures } from "../flat.js"

function toPng({ width, height, data }) {
  const png = new PNG({ width, height })
  png.data.set(data)
  return png
}

function folderOf(publicDir, entry) {
  return path.join(publicDir, "font", ...(entry.variant ? [entry.variant, entry.id] : [entry.id]))
}

function rawEntry(list, id) {
  for (const entry of list) {
    if (entry.id === id) return { entry, holder: list }
    const variant = (entry.variants ?? []).find(item => item.id === id)
    if (variant) return { entry: variant, holder: entry.variants }
  }
  throw new Error(`fonts.json has no entry for the submitted font ${id}`)
}

async function checked(publicDir, others, skeleton, bytes) {
  const fonts = others.map(entry => ({ ...entry, name: entry.name ?? titleCase(entry.id) }))
  const ctx = submissionContext(fonts, async file => {
    const full = path.join(publicDir, file)
    if (!fs.existsSync(full)) return new Response("missing", { status: 404 })
    return new Response(fs.readFileSync(full))
  })
  const { problems } = await fontKind.check({ target: skeleton.variant ?? "", details: { id: skeleton.id, inherits: !!skeleton.inherits }, bytes }, ctx)
  const problem = Object.values(problems).find(Boolean)
  if (problem) throw new Error(`the submitted font ${skeleton.id} can't be added: ${problem}`)
}

function writeOwn(publicDir, entry, built) {
  const folder = folderOf(publicDir, entry)
  writePng(path.join(folder, "font.png"), toPng(built.sheet))
  writePng(path.join(folder, "textures", "flat.png"), flatSheet(built.published, built.capHeight, defaultDepth(entry)).sheet)
  writeStarterTextures(folder)
  checkBundle(folder, built.template)
}

function checkBundle(folder, template) {
  const list = readJson(path.join(folder, "textures.json"))
  const images = Object.entries(list.textures).filter(([id]) => id !== "flat").map(([id, data]) => ["textures", id, data]).concat(Object.entries(list.overlays ?? {}).map(([id, data]) => ["overlays", id, data]))
  for (const [section, id, data] of images) {
    const image = readPng(path.join(folder, section, `${id}.png`))
    if (data.type === "strip") {
      if (!Number.isInteger(Math.log2(image.height / template.rows))) throw new Error(`the strip ${id} is ${image.height} pixels tall, which doesn't fit the font's ${template.rows} strip rows`)
      continue
    }
    const density = data.density ?? 1
    if (image.width !== template.width * density || image.height !== template.height * density) throw new Error(`${section}/${id}.png is ${image.width}x${image.height}, and the font's template at density ${density} is ${template.width * density}x${template.height * density}`)
  }
}

function solidAt(glyph, row, column) {
  return glyph.mask[(glyph.height - 1 - row) * glyph.width + column] === 1
}

function nearest(points, [x, y]) {
  let best = points[0]
  let distance = Infinity
  for (const point of points) {
    const next = (point[0] - x) ** 2 + (point[1] - y) ** 2
    if (next < distance) {
      best = point
      distance = next
    }
  }
  return best
}

function closestGlyph(glyphs, target) {
  return Object.values(glyphs).filter(glyph => glyph.width).reduce((best, glyph) => Math.abs(glyph.width - target.width) + Math.abs(glyph.height - target.height) < Math.abs(best.width - target.width) + Math.abs(best.height - target.height) ? glyph : best)
}

function copies(target, at, source, from, depth) {
  const list = []
  for (let c = 0; c < target.width; c++) {
    for (let r = 0; r < target.height; r++) list.push([null, null, at.x + c, at.top + r])
    for (let k = 0; k < depth; k++) list.push([null, null, at.x + c, at.up + k], [null, null, at.x + c, at.down + k])
  }
  const scaled = (value, to, of) => Math.min(of - 1, Math.floor(value * of / to))
  const face = []
  for (let r = 0; r < source.height; r++) {
    for (let c = 0; c < source.width; c++) if (solidAt(source, r, c)) face.push([c, r])
  }
  for (let r = 0; r < target.height; r++) {
    for (let c = 0; c < target.width; c++) {
      if (!solidAt(target, r, c)) continue
      const wanted = [scaled(c, target.width, source.width), scaled(r, target.height, source.height)]
      const [sc, sr] = solidAt(source, wanted[1], wanted[0]) ? wanted : nearest(face, wanted)
      list.push([from.x + sc, from.top + sr, at.x + c, at.top + r])
    }
  }
  for (const [row, band] of [[0, "up"], [target.height - 1, "down"]]) {
    const sourceRow = row ? source.height - 1 : 0
    const columns = Array.from({ length: source.width }, (_, c) => c).filter(c => solidAt(source, sourceRow, c)).map(c => [c, 0])
    for (let c = 0; c < target.width; c++) {
      if (!solidAt(target, row, c)) continue
      const [sc] = nearest(columns, [scaled(c, target.width, source.width), 0])
      for (let k = 0; k < depth; k++) list.push([from.x + sc, from[band] + k, at.x + c, at[band] + k])
    }
  }
  return list
}

function extendImage(file, blocks, oldSize, newHeight) {
  const image = readPng(file)
  const density = image.width / oldSize.width
  if (!Number.isInteger(density) || image.height !== oldSize.height * density) throw new Error(`${file} is ${image.width}x${image.height}, which isn't a whole number of times the ${oldSize.width}x${oldSize.height} flat template`)
  const out = new PNG({ width: image.width, height: newHeight * density })
  out.data.fill(0)
  image.data.copy(out.data)
  for (const [sx, sy, tx, ty] of blocks) {
    for (let j = 0; j < density; j++) {
      const to = ((ty * density + j) * image.width + tx * density) * 4
      if (sx === null) out.data.fill(0, to, to + density * 4)
      else image.data.copy(out.data, to, ((sy * density + j) * image.width + sx * density) * 4, ((sy * density + j) * image.width + (sx + 1) * density) * 4)
    }
  }
  writePng(file, out)
}

function layoutImages(folder, textures) {
  const files = []
  for (const [id, data] of Object.entries(textures.textures)) {
    for (const [name, variant] of [[id, {}]].concat(Object.entries(data.variants ?? {}))) {
      const merged = { ...data, ...variant }
      if (name === "flat" || merged.type === "strip" || merged.strip) continue
      files.push(path.join(folder, "textures", `${name}.png`))
    }
  }
  for (const id of Object.keys(textures.overlays ?? {})) files.push(path.join(folder, "overlays", `${id}.png`))
  for (const file of files) if (!fs.existsSync(file)) throw new Error(`${file} is listed in textures.json but doesn't exist`)
  return files
}

function fillLastRow(shared, cells, flatWidth) {
  const { width, height } = shared.sheet
  const data = new Uint8ClampedArray(shared.sheet.data)
  const scan = scanMask(data, width, height)
  const index = scan.rows.length - 1
  const row = scan.rows[index]
  const last = row.cells.at(-1)
  const inRow = shared.cells.filter(cell => cell.row === index && cell.width)
  const rise = Math.max(shared.capHeight, ...inRow.map(cell => cell.top))
  const drop = Math.min(0, ...inRow.map(cell => cell.bottom))
  const empty = (x, y) => data[(y * width + x) * 4] > 127 && data[(y * width + x) * 4 + 1] > 127 && data[(y * width + x) * 4 + 2] > 127
  let x = last.x + last.width + 1
  let flat = inRow.reduce((total, cell) => total + cell.width, 0) + 2 * (inRow.length - 1)
  let placed = 0
  for (const cell of cells) {
    const marks = cell.stretch ?? []
    const fits = x + cell.advance < width && flat + 2 + cell.width <= flatWidth && cell.top <= rise && cell.bottom >= drop && marks.every(mark => row.baseline - mark >= row.top && row.baseline - mark <= row.bottom)
    if (!fits) break
    let clear = true
    for (let y = row.top; y <= row.bottom && clear; y++) {
      for (let column = x; column <= x + cell.advance; column++) if (!empty(column, y)) clear = false
    }
    if (!clear) break
    for (let r = 0; r < cell.height; r++) {
      for (let c = 0; c < cell.width; c++) if (cell.mask[r * cell.width + c]) data.set([0, 0, 0, 255], ((row.baseline - cell.bottom - r) * width + x + cell.originX + c) * 4)
    }
    for (let y = row.top; y <= row.bottom; y++) data.set(marks.includes(row.baseline - y) ? [0, 255, 0, 255] : [255, 0, 0, 255], (y * width + x + cell.advance) * 4)
    x += cell.advance + 1
    flat += 2 + cell.width
    placed++
  }
  return { sheet: { width, height, data }, rest: cells.slice(placed) }
}

function writeVariation(publicDir, list, parent, shared, built) {
  const folder = folderOf(publicDir, parent)
  const textures = readJson(path.join(folder, "textures.json"))
  const flatDensity = textures.textures.flat?.density ?? 1
  const flatFile = path.join(folder, "textures", "flat.png")
  const oldFlat = readPng(flatFile)
  const oldSize = { width: oldFlat.width / flatDensity, height: oldFlat.height / flatDensity }
  const { sheet: filled, rest } = fillLastRow(shared, built.cells, oldSize.width)
  const sheet = rest.length ? stackSheets(filled, drawSheet(rest, built.capHeight, { width: filled.width, maxWidth: filled.width, flatWidth: oldSize.width })) : filled
  const border = defaultBorder("top", parent)
  const depth = defaultDepth(parent)
  const { list: cells, capHeight } = parseMask(sheet.data, sheet.width, sheet.height, fullOrder(parent, list), border)
  const flat = flatSheet(cells, capHeight, depth, flatDensity).sheet
  if (flat.width !== oldFlat.width) throw new Error(`adding the variation would make ${parent.id}'s flat template ${flat.width} pixels wide instead of ${oldFlat.width}`)
  for (let at = 0; at < oldFlat.data.length; at += 4) {
    if (oldFlat.data[at + 3]) oldFlat.data.copy(flat.data, at, at, at + 4)
  }
  const layout = sheetLayout(cells, capHeight, depth)
  const { glyphs } = splitCells(parent, list, cells)
  const blocks = cells.slice(-built.cells.length).flatMap(cell => {
    const source = glyphs[cell.char]?.width ? glyphs[cell.char] : closestGlyph(glyphs, cell)
    return copies(cell, layout.get(cell), source, layout.get(source), depth)
  })
  for (const file of layoutImages(folder, textures)) extendImage(file, blocks, oldSize, flat.height / flatDensity)
  writePng(path.join(folder, "font.png"), toPng(sheet))
  writePng(flatFile, flat)
}

export async function convertFont(root, id) {
  const publicDir = path.join(root, "public")
  const listFile = path.join(publicDir, "font", "fonts.json")
  const holding = path.join(root, holdingPath(id))
  const list = readJson(listFile)
  const bytes = new Uint8Array(fs.readFileSync(holding))
  const flat = flattenFonts(list)
  const skeleton = flat.find(entry => entry.id === id)
  if (!skeleton) throw new Error(`fonts.json has no entry for the submitted font ${id}`)
  const others = flat.filter(entry => entry.id !== id)
  await checked(publicDir, others, skeleton, bytes)
  const { font } = submittedFont(bytes)
  const { entry: raw, holder } = rawEntry(list, id)
  if (skeleton.inherits) {
    const parent = others.find(entry => entry.id === skeleton.variant)
    const shared = parentSheet(parent, others, readPng(path.join(folderOf(publicDir, parent), "font.png")))
    const built = variation(font, shared)
    holder[holder.indexOf(raw)] = finalEntry(raw, built.entry)
    writeVariation(publicDir, flattenFonts(list), parent, shared, built)
  } else {
    const built = ownFont(font, skeleton.variant)
    const entry = finalEntry(raw, built.entry)
    holder[holder.indexOf(raw)] = entry
    writeOwn(publicDir, { ...entry, variant: skeleton.variant }, built)
  }
  writeJson(listFile, list)
  fs.rmSync(holding)
  const folder = path.join(root, HOLDING_FOLDER)
  if (fs.existsSync(folder) && !fs.readdirSync(folder).length) fs.rmdirSync(folder)
}
