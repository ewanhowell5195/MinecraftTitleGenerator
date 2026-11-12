import { flattenFonts, fontFolder, fullName, sheetOwner } from "../../lib/font.js"
import { jsonText } from "../../lib/jsonText.js"
import { titleCase } from "../../lib/names.js"
import { mergeStrips, stripFolder, stripUse } from "../../lib/strips.js"
import { setName, setUsers, stripTarget } from "../../lib/submissionKinds/stripFit.js"
import { assetId } from "../../lib/submissions.js"
import { texturesPath, usedIds } from "./fontAsset.js"

const FONTS = "public/font/fonts.json"
const LEADING = new Set(["id", "name", "authors", "description", "basedOn", "inherits"])

function setPath(id) {
  return `public/${stripFolder(id)}/textures.json`
}

async function readJson(read, path) {
  const text = await read(path)
  if (text === null) throw new Error(`${path} isn't on main`)
  return JSON.parse(text)
}

function ownerOf(fonts, id) {
  const font = fonts.find(entry => entry.id === id)
  if (!font || sheetOwner(font, fonts) !== font) throw new Error(`${id} isn't a published font that owns its textures`)
  return font
}

async function mergedIds(read, font) {
  const sets = await Promise.all((font.strips ?? []).map(async item => ({ ...await readJson(read, setPath(stripUse(item).id)), ...stripUse(item) })))
  return usedIds(mergeStrips(await readJson(read, texturesPath(font)), sets))
}

async function freeAsset(read, row, fonts, extra, taken) {
  const used = await Promise.all(fonts.map(font => mergedIds(read, font)))
  return assetId(row.name, new Set(used.flat().concat(extra, taken)))
}

function entryFor(row, details, asset) {
  return { type: "strip", ...(details.stretch && { stretch: true }), ...(row.name !== titleCase(asset) && { name: row.name }), authors: row.credit, border: details.border }
}

function withStrips(entry, use) {
  if (entry.strips) return { ...entry, strips: entry.strips.concat(use) }
  const keys = Object.keys(entry)
  const at = keys.findIndex(key => !LEADING.has(key))
  const before = at === -1 ? keys : keys.slice(0, at)
  return Object.fromEntries(before.map(key => [key, entry[key]]).concat([["strips", [use]]], keys.slice(before.length).map(key => [key, entry[key]])))
}

function assigned(list, id, use) {
  let found = false
  const next = list.map(entry => {
    if (entry.id === id) {
      found = true
      return withStrips(entry, use)
    }
    if (!entry.variants?.some(variant => variant.id === id)) return entry
    found = true
    return { ...entry, variants: entry.variants.map(variant => variant.id === id ? withStrips(variant, use) : variant) }
  })
  if (!found) throw new Error(`${id} isn't in ${FONTS}`)
  return next
}

async function newSetId(read, id) {
  let free = id
  for (let count = 2; await read(setPath(free)) !== null; count++) free = `${id}-${count}`
  return free
}

function checkRows(details) {
  const rows = details.baseline + details.depth + details.height
  const density = details.size.height / rows
  if (!Number.isInteger(Math.log2(density))) throw new Error(`the strip is ${details.size.height} pixels tall, which doesn't fit the ${rows} rows of its new strip type`)
}

function fontTarget(row, fonts) {
  const font = fonts.find(entry => entry.id === stripTarget(row.target).id)
  if (!font) throw new Error(`submission ${row.id} is for ${row.target}, which isn't a published font`)
  return font
}

function usersOf(fonts, id) {
  return setUsers(fonts, id).map(use => use.font)
}

export const strip = {
  async write({ row, details, read, taken }) {
    const fonts = flattenFonts(await readJson(read, FONTS))
    const target = stripTarget(row.target)
    if (target.kind === "font") {
      const font = ownerOf(fonts, target.id)
      const listPath = texturesPath(font)
      const list = await readJson(read, listPath)
      const asset = await freeAsset(read, row, [font], [], taken)
      list.textures = { ...list.textures, [asset]: entryFor(row, details, asset) }
      return { asset, files: [{ path: listPath, content: `${jsonText(list)}\n` }, { path: `public/${fontFolder(font)}/textures/${asset}.png`, sha: row.file }] }
    }
    if (target.kind === "set") {
      const listPath = setPath(target.id)
      const set = await readJson(read, listPath)
      const asset = await freeAsset(read, row, usersOf(fonts, target.id), Object.keys(set.textures).flatMap(id => [id].concat(Object.keys(set.textures[id].variants ?? {}))), taken)
      set.textures = { ...set.textures, [asset]: entryFor(row, details, asset) }
      return { asset, files: [{ path: listPath, content: `${jsonText(set)}\n` }, { path: `public/${stripFolder(target.id)}/textures/${asset}.png`, sha: row.file }] }
    }
    checkRows(details)
    const chosen = details.fonts.map(id => ownerOf(fonts, id))
    const id = await newSetId(read, details.set)
    const asset = await freeAsset(read, row, chosen, [], taken)
    const set = { depth: details.depth, baseline: details.baseline, height: details.height, textures: { [asset]: entryFor(row, details, asset) } }
    let list = await readJson(read, FONTS)
    for (const font of chosen) {
      const offset = details.offsets?.[font.id] ?? 0
      list = assigned(list, font.id, offset ? { id, offset } : id)
    }
    return { asset, files: [{ path: FONTS, content: `${jsonText(list)}\n` }, { path: setPath(id), content: `${jsonText(set)}\n` }, { path: `public/${stripFolder(id)}/textures/${asset}.png`, sha: row.file }] }
  },
  describe({ row, details, fonts }) {
    const target = stripTarget(row.target)
    if (target.kind === "font") {
      const font = fontTarget(row, fonts)
      return { where: `for ${fullName(font, fonts)}`, into: `to ${font.name}` }
    }
    if (target.kind === "set") return { where: `for the ${setName(target.id)} strip type`, into: `to the ${setName(target.id)} strip type` }
    return { where: `in a new ${setName(details.set)} strip type`, into: `in a new ${setName(details.set)} strip type` }
  },
  watches({ row, details, fonts }) {
    const target = stripTarget(row.target)
    const affected = target.kind === "font" ? [fontTarget(row, fonts)] : target.kind === "set" ? usersOf(fonts, target.id) : (details.fonts ?? []).flatMap(id => fonts.filter(font => font.id === id))
    const sets = affected.flatMap(font => (font.strips ?? []).map(item => setPath(stripUse(item).id)))
    const own = target.kind === "font" ? [] : [FONTS, setPath(target.kind === "set" ? target.id : details.set)]
    return Array.from(new Set(affected.map(texturesPath).concat(sets, own)))
  },
  scopes({ row, details, fonts }) {
    const target = stripTarget(row.target)
    if (target.kind === "font") return [`font:${target.id}`]
    const id = target.kind === "set" ? target.id : details.set
    const affected = target.kind === "set" ? usersOf(fonts, id).map(font => font.id) : details.fonts ?? []
    return [`strips:${id}`].concat(affected.map(font => `font:${font}`))
  }
}
