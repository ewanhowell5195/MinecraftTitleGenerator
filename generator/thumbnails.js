import { execFile } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { PNG } from "pngjs"
import { splitCells } from "../src/lib/font.js"
import { fontScene, fontThumbnails } from "../src/lib/fontThumbnails.js"
import { defaultDepth } from "../src/lib/settings.js"
import { cli, inParallel, readPng, writePng } from "./common.js"
import { ROOT, fontDir, fontTextureList, publicDir, publishedFonts, publishedModels, publishedShapes, readMask } from "./fonts.js"
import { modelThumbnails } from "./submissionKinds/shape.js"

function premultiply(image) {
  const png = new PNG({ width: image.width, height: image.height })
  for (let i = 0; i < image.data.length; i += 4) {
    const a = image.data[i + 3] / 255
    png.data[i] = Math.round(image.data[i] * a)
    png.data[i + 1] = Math.round(image.data[i + 1] * a)
    png.data[i + 2] = Math.round(image.data[i + 2] * a)
    png.data[i + 3] = image.data[i + 3]
  }
  return png
}

function loadGlyphs(entry, list, root) {
  if (entry.inherits) {
    const parent = loadGlyphs(list.find(item => item.id === entry.variant), list, root)
    return { ...parent, glyphs: { ...parent.glyphs, ...parent.alternates[entry.id] } }
  }
  const { folder, cells, capHeight, layers } = readMask(entry, list, root)
  return { ...splitCells(entry, list, cells), cells, capHeight, folder, depth: defaultDepth(entry), layers, bands: layers?.length ?? 1 }
}

export function thumbnailList(root = ROOT) {
  return publishedFonts(root).concat(publishedShapes(root))
}

export function thumbnailEntry(list, id) {
  const found = list.filter(item => item.id === id)
  if (!found.length) throw new Error(`no font or shape with id ${id}`)
  if (found.length > 1) throw new Error(`${found.length} fonts or shapes have the id ${id}, so thumbnails can't tell which one to draw`)
  return found[0]
}

export async function drawThumbnails(entry, list, root = ROOT) {
  const loaded = new Map()
  const glyphs = loadGlyphs(entry, list, root)
  const scene = fontScene(entry, { ...glyphs, kerning: { ...list.find(item => item.id === entry.variant)?.kerning, ...entry.kerning } })
  if (!scene) throw new Error(`${entry.id}: the preview text has no glyphs in this font`)
  function load(kind, id, folder) {
    const file = path.join(folder ? path.join(publicDir(root), folder) : glyphs.folder, kind, `${id}.png`)
    return loaded.get(file) ?? loaded.set(file, readPng(file)).get(file)
  }
  const target = path.join(fontDir(entry, root), "thumbnails")
  const kept = new Set()
  let changed = 0

  for (const [name, image] of await fontThumbnails(entry, scene, fontTextureList(entry, list, root), load)) {
    const file = path.join(target, `${name}.png`)
    const output = premultiply(image)
    kept.add(file)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    if (fs.existsSync(file)) {
      const existing = readPng(file)
      if (existing.width === output.width && existing.height === output.height && existing.data.equals(output.data)) continue
    }
    writePng(file, output)
    changed++
  }

  for (const file of fs.readdirSync(target, { recursive: true }).map(name => path.join(target, name))) {
    if (fs.statSync(file).isFile() && !kept.has(file)) fs.rmSync(file)
  }
  for (const folder of fs.readdirSync(target).map(name => path.join(target, name))) {
    if (fs.statSync(folder).isDirectory() && !fs.readdirSync(folder).length) fs.rmdirSync(folder)
  }

  return { count: kept.size, changed, frame: scene.frame }
}

function child(id) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [import.meta.filename, id], { maxBuffer: 1 << 24 }, (error, stdout, stderr) => error ? reject(new Error(`${id} failed\n${stderr}`)) : resolve(stdout))
  })
}

async function allFonts(list) {
  const outputs = []
  await inParallel(list, async (entry, index) => outputs[index] = await child(entry.id))
  process.stdout.write(outputs.join(""))
}

if (import.meta.main) {
  const { first: only } = cli("thumbnails.js [font]", { optional: true })
  const list = thumbnailList()
  const models = publishedModels()
  if (only && models.includes(only) && !list.some(item => item.id === only)) {
    modelThumbnails(ROOT, only)
    console.log(`${only.padEnd(30)} model thumbnails drawn`)
  } else if (only) {
    const { count, changed, frame } = await drawThumbnails(thumbnailEntry(list, only), list)
    console.log(`${only.padEnd(30)} ${String(count).padStart(3)} thumbnails, ${String(changed).padStart(3)} changed, ${frame.width}x${frame.height} units`)
  } else {
    await allFonts(list)
    for (const id of models) modelThumbnails(ROOT, id)
  }
}
