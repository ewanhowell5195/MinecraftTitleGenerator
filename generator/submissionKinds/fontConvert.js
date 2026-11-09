import fs from "node:fs"
import path from "node:path"
import { PNG } from "pngjs"
import { flattenFonts } from "../../src/lib/font.js"
import { titleCase } from "../../src/lib/names.js"
import { defaultDepth } from "../../src/lib/settings.js"
import { font as fontKind } from "../../src/lib/submissionKinds/font.js"
import { HOLDING_FOLDER, finalEntry, holdingPath, ownFont, submittedFont } from "../../src/lib/submissionKinds/fontBuild.js"
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
  const { problems } = await fontKind.check({ target: skeleton.variant ?? "", details: {}, bytes }, ctx)
  const problem = Object.entries(problems).find(([key, value]) => key !== "id" && value)?.[1]
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
  const built = ownFont(font, skeleton.variant)
  const entry = finalEntry(raw, built.entry)
  holder[holder.indexOf(raw)] = entry
  writeOwn(publicDir, { ...entry, variant: skeleton.variant }, built)
  writeJson(listFile, list)
  fs.rmSync(holding)
  const folder = path.join(root, HOLDING_FOLDER)
  if (fs.existsSync(folder) && !fs.readdirSync(folder).length) fs.rmdirSync(folder)
}
