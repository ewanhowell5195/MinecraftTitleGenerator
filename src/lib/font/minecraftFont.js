import { mostCommon } from "../core/maths.js"
import { titleCase } from "../core/names.js"
import { MULTICASE_CHARACTERS } from "./editor/characters.js"
import { fontFromShapes } from "./editor/import.js"
import { sourceChars } from "./fontOutline.js"
import { VANILLA_DEFAULT, VANILLA_SPACE } from "./minecraftVanilla.js"

const SPACE_ADVANCE = 4
const SUGGESTED_PIXELS = 40
const CAPITALS = Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
const OPTIONS = { uniform: false, jp: false }
const REFERENCES = { "minecraft:include/default": VANILLA_DEFAULT, "minecraft:include/space": [VANILLA_SPACE], "minecraft:include/unifont": [] }
const EMPTY_CELL = "\u0000"

export function isMinecraftFont(json) {
  return !!json && typeof json === "object" && Array.isArray(json.providers)
}

export function textureName(file) {
  return String(file).split(/[:/]/).pop().toLowerCase()
}

function namespaced(id) {
  return String(id).includes(":") ? String(id) : `minecraft:${id}`
}

function passes(provider) {
  return Object.entries(provider.filter ?? {}).every(([option, on]) => (OPTIONS[option] ?? false) === on)
}

function vanilla(providers, filter) {
  return providers.map(provider => ({ ...provider, vanilla: true, filter: { ...provider.filter, ...filter } }))
}

function expanded(providers, skipped) {
  return providers.flatMap(provider => {
    if (!provider || typeof provider !== "object") return []
    if (provider.type !== "reference") return [provider]
    const found = REFERENCES[namespaced(provider.id)]
    if (found) return vanilla(found, provider.filter)
    skipped.add(`reference:${provider.id}`)
    return []
  })
}

function ordered(json, fileName, skipped) {
  const own = expanded(json.providers, skipped)
  const stack = /^default\.json$/i.test(fileName) ? own.concat(vanilla([VANILLA_SPACE].concat(VANILLA_DEFAULT), { uniform: false })) : own
  return stack.filter(passes).concat(stack.filter(provider => !passes(provider)))
}

function validGrid(chars) {
  if (!Array.isArray(chars) || !chars.length || chars.some(row => typeof row !== "string")) return null
  const rows = chars.map(row => Array.from(row))
  return rows[0].length && rows.every(row => row.length === rows[0].length) ? rows : null
}

function inkOf(cell) {
  const { image, x, y, cellWidth, cellHeight } = cell
  let right = 0
  let first = cellHeight
  let last = -1
  for (let row = 0; row < cellHeight; row++) {
    for (let column = 0; column < cellWidth; column++) {
      if (!image.data[((y + row) * image.width + x + column) * 4 + 3]) continue
      right = Math.max(right, column + 1)
      first = Math.min(first, row)
      last = Math.max(last, row)
    }
  }
  return { ...cell, type: "bitmap", right, first, last }
}

function bitmapGlyphs(provider, image, rows) {
  const cellWidth = Math.floor(image.width / rows[0].length)
  const cellHeight = Math.floor(image.height / rows.length)
  const scale = (provider.height ?? 8) / cellHeight
  const glyphs = new Map()
  if (!cellWidth || !cellHeight) return glyphs
  rows.forEach((row, r) => row.forEach((char, c) => {
    if (char !== EMPTY_CELL) glyphs.set(char, inkOf({ image, x: c * cellWidth, y: r * cellHeight, cellWidth, cellHeight, scale, ascent: provider.ascent ?? 0 }))
  }))
  return glyphs
}

function spaceGlyphs(provider) {
  return new Map(Object.entries(provider.advances ?? {}).filter(([char, advance]) => Array.from(char).length === 1 && Number.isFinite(advance)).map(([char, advance]) => [char, { type: "space", advance }]))
}

function fontName(fileName) {
  const base = fileName.replace(/\.json$/i, "")
  return base.toLowerCase() === "default" ? "Minecraft Font" : titleCase(base)
}

function rowsAbove(glyph) {
  return Math.round(glyph.ascent / glyph.scale)
}

function listed(items) {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`
}

export function readMinecraftFont(json, images, { fileName = "default.json" } = {}) {
  if (!isMinecraftFont(json)) throw new Error("that JSON file isn't a Minecraft font, it has no providers list")
  const skipped = new Set()
  const missing = []
  const used = []
  const glyphs = new Map()
  for (const provider of ordered(json, fileName, skipped)) {
    let found = null
    if (provider.type === "space") found = spaceGlyphs(provider)
    else if (provider.type === "bitmap") {
      const name = textureName(provider.file)
      const image = images.get(name)
      const rows = validGrid(provider.chars)
      if (!rows) skipped.add(`grid:${name}`)
      else if (!image) {
        if (!provider.vanilla && !missing.includes(name)) missing.push(name)
      } else {
        if (!used.includes(name)) used.push(name)
        found = bitmapGlyphs(provider, image, rows)
      }
    } else skipped.add(`type:${provider.type}`)
    for (const [char, glyph] of found ?? []) if (!glyphs.has(char)) glyphs.set(char, glyph)
  }
  const drawn = Array.from(glyphs.values()).filter(glyph => glyph.right)
  if (!drawn.length) throw new Error(missing.length ? `none of the PNGs it uses were chosen. Choose ${listed(missing)} along with the JSON` : "this font has nothing drawn in it")
  const capitals = CAPITALS.map(char => glyphs.get(char)).filter(glyph => glyph?.right)
  const sample = capitals.length ? capitals : drawn
  const scale = mostCommon(sample.map(glyph => glyph.scale))
  const main = sample.filter(glyph => glyph.scale === scale)
  const lift = Math.max(0, mostCommon(main.map(glyph => rowsAbove(glyph) - 1 - glyph.last)))
  const capRows = Math.max(1, mostCommon(main.map(glyph => rowsAbove(glyph) - lift - glyph.first)))
  const characters = Array.from(glyphs).filter(([, glyph]) => glyph.right).map(([char]) => char)
  return { minecraft: true, name: fontName(fileName), glyphs, characters, scale, capRows, lift: lift * scale, used, missing, skipped: Array.from(skipped) }
}

export function minecraftNotes(source) {
  const notes = []
  if (source.missing.length) notes.push(`${listed(source.missing)} ${source.missing.length === 1 ? "wasn't" : "weren't"} chosen, so ${source.missing.length === 1 ? "its" : "their"} characters are left out.`)
  const kinds = source.skipped.map(item => item.split(":"))
  const types = kinds.filter(([kind]) => kind === "type").map(([, type]) => type)
  if (types.length) notes.push(`${listed(types)} providers can't be imported.`)
  const grids = kinds.filter(([kind]) => kind === "grid").map(([, name]) => name)
  if (grids.length) notes.push(`The chars list for ${listed(grids)} isn't a valid grid.`)
  for (const [, ...id] of kinds.filter(([kind]) => kind === "reference")) notes.push(`The reference to ${id.join(":")} can't be followed.`)
  return notes.join(" ")
}

function sizing(source, height) {
  const block = Math.max(1, Math.round(height / source.capRows))
  return { block, perUnit: block / source.scale, capHeight: source.capRows * block }
}

function filled(glyph, column, row) {
  return glyph.image.data[((glyph.y + row) * glyph.image.width + glyph.x + column) * 4 + 3] > 0
}

function shapeOf(glyph, perUnit, lift) {
  if (!glyph?.right) return null
  const size = glyph.scale * perUnit
  const above = rowsAbove(glyph)
  const drop = lift * perUnit
  const top = Math.round((above - glyph.first) * size - drop)
  const bottom = Math.round((above - glyph.last - 1) * size - drop)
  const width = Math.max(1, Math.round(glyph.right * size))
  const height = top - bottom
  if (height < 1) return null
  const mask = new Uint8Array(width * height)
  for (let row = 0; row < height; row++) {
    const sourceRow = Math.min(glyph.last, glyph.first + Math.floor((row + 0.5) / size))
    for (let column = 0; column < width; column++) {
      if (filled(glyph, Math.min(glyph.right - 1, Math.floor((column + 0.5) / size)), sourceRow)) mask[row * width + column] = 1
    }
  }
  return { left: 0, width, height, top, bottom, mask }
}

function glyphOf(source, char) {
  return sourceChars(char).map(candidate => source.glyphs.get(candidate)).find(glyph => glyph?.right) ?? null
}

function spaceWidth(source, perUnit) {
  const space = source.glyphs.get(" ")
  const advance = space?.type === "space" ? space.advance : space?.right ? Math.round(space.right * space.scale) + 1 : SPACE_ADVANCE
  return Math.max(1, Math.round(advance * perUnit))
}

export function suggestedMinecraftSize(source) {
  return { rows: source.capRows, square: Math.max(1, Math.ceil(SUGGESTED_PIXELS / source.capRows - 0.5)) }
}

export function minecraftShape(source, char, { height = SUGGESTED_PIXELS } = {}) {
  const { perUnit, capHeight } = sizing(source, height)
  const shape = shapeOf(glyphOf(source, char), perUnit, source.lift)
  return shape ? { shape, capHeight } : null
}

export function fontFromMinecraft(source, { height = SUGGESTED_PIXELS } = {}) {
  const { block, perUnit, capHeight } = sizing(source, height)
  const shapes = new Map(MULTICASE_CHARACTERS.map(char => [char, shapeOf(glyphOf(source, char), perUnit, source.lift)]))
  return fontFromShapes(shapes, { name: source.name, capHeight, grid: block, spaceWidth: spaceWidth(source, perUnit) })
}

export function minecraftBundle({ json, fileName, textures }) {
  return `data:application/json,${encodeURIComponent(JSON.stringify({ fileName, font: json, textures }))}`
}

export async function minecraftSource(text, pixelsOf) {
  let bundle
  try {
    bundle = JSON.parse(text)
  } catch (err) {
    throw new Error(`the saved Minecraft font can't be read: ${err.message}`)
  }
  const images = new Map(await Promise.all(Object.entries(bundle.textures ?? {}).map(async ([name, url]) => [name, await pixelsOf(url)])))
  return readMinecraftFont(bundle.font, images, { fileName: bundle.fileName })
}
