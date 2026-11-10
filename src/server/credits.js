import fs from "node:fs"
import path from "node:path"
import { basedOnParts } from "../lib/credits.js"
import { flattenFonts, fontFolder, fullName } from "../lib/font.js"
import { encodeTitle } from "../lib/linkformat.js"
import { titleCase } from "../lib/names.js"
import { FILE_VERSION, overlayLayer } from "../lib/settings.js"
import { stripUse } from "../lib/strips.js"
import { escaped } from "./http.js"

const STRIPS = "strips."
const PREVIEW_FONT = "minecraft-ten"
const KINDS = { font: ["font", "fonts"], texture: ["texture", "textures"], overlay: ["overlay", "overlays"], tileable: ["tileable", "tileables"] }
const LIBRARIES = [
  { name: "three.js", url: "https://github.com/mrdoob/three.js", by: "mrdoob", licence: "MIT" },
  { name: "Vue", url: "https://github.com/vuejs/core", by: "Evan You", licence: "MIT" },
  { name: "opentype.js", url: "https://github.com/opentypejs/opentype.js", by: "Frederik De Bleser", licence: "MIT" },
  { name: "Clipper2", url: "https://github.com/countertype/clipper2-ts", by: "Angus Johnson, ported by Jeremy Tribby", licence: "BSL-1.0" },
  { name: "woff2-encoder", url: "https://github.com/itskyedo/woff2-encoder", by: "Kyedo", licence: "MIT" }
]

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"))
}

function peopleIn(author) {
  return author.split(/\s*(?:,\s*&|,|&)\s*/).filter(Boolean)
}

function nameIn(list, id) {
  for (const group of [list.textures, list.overlays]) {
    for (const [key, entry] of Object.entries(group ?? {})) {
      if (key === id) return entry.name ?? titleCase(id)
      const variant = entry.variants?.[id]
      if (variant) return variant.name ?? titleCase(id)
    }
  }
  return null
}

function counted(pieces) {
  return Object.entries(KINDS).map(([kind, [one, many]]) => {
    const count = pieces.filter(piece => piece.kind === kind).length
    return count ? `${count} ${count === 1 ? one : many}` : null
  }).filter(Boolean).join(", ")
}

function listed(names) {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]
}

function pieceHtml(piece) {
  const based = piece.based ? `<span class="based">Based on ${escaped(piece.based)}</span>` : ""
  const others = piece.people.filter(person => person !== piece.person)
  const shared = others.length ? `<button type="button" class="with" data-id="${escaped(piece.id)}" data-easy-tooltip="With ${escaped(listed(others))}" data-easy-tooltip-class="slow">Collaboration</button>` : ""
  const href = `/app/?title=${encodeTitle({ version: FILE_VERSION, lines: [{ text: piece.name, ...piece.line }] }).code}`
  return `<li class="piece" data-id="${escaped(piece.id)}" data-stats="${escaped(piece.stats.join(" "))}"><div class="thumb"><img src="${escaped(piece.image)}" alt="" loading="lazy"></div><a class="name" href="${escaped(href)}">${escaped(piece.name)}</a><span class="where">${escaped(piece.where)}</span>${based}${shared}</li>`
}

export function creditsHtml(root) {
  const folder = path.join(root, "public")
  const fonts = flattenFonts(readJson(path.join(folder, "font/fonts.json"))).map(data => ({ ...data, name: data.name ?? titleCase(data.id) }))
  const fontOf = id => fonts.find(font => font.id === id)
  const lists = new Map()
  for (const font of fonts) {
    const file = path.join(folder, fontFolder(font), "textures.json")
    if (!font.inherits && fs.existsSync(file)) lists.set(font.id, readJson(file))
  }
  for (const set of fs.readdirSync(path.join(folder, "strips"))) lists.set(`${STRIPS}${set}`, readJson(path.join(folder, "strips", set, "textures.json")))
  const tileables = readJson(path.join(folder, "tileables/tileables.json"))
  const pieces = []

  function add(author, piece) {
    if (!author) return
    if (!fs.existsSync(path.join(folder, piece.image))) throw new Error(`the credits page needs ${piece.image}, which does not exist`)
    const people = peopleIn(author)
    for (const person of people) pieces.push({ ...piece, person, people })
  }

  function basedOnLabel(basedOn, owner) {
    if (!basedOn) return null
    const { owner: target, id } = basedOnParts(basedOn, owner)
    const sets = target.startsWith(STRIPS) ? [] : (fontOf(target)?.strips ?? []).map(item => `${STRIPS}${stripUse(item).id}`)
    const name = [target].concat(sets).filter(key => lists.has(key)).map(key => nameIn(lists.get(key), id)).find(Boolean)
    if (name) return target === owner || target.startsWith(STRIPS) ? name : `${fullName(fontOf(target), fonts)}: ${name}`
    const tileable = tileables[id] ?? Object.values(tileables).find(entry => entry.variants?.[id])?.variants[id]
    if (tileable) return tileable.name ?? titleCase(id)
    throw new Error(`${basedOn} in ${owner} is not a texture, overlay or tileable`)
  }

  for (const font of fonts) {
    const based = font.basedOn ? fullName(fontOf(font.basedOn), fonts) : null
    add(font.author, { kind: "font", name: fullName(font, fonts), image: `${fontFolder(font)}/thumbnails/flat.png`, where: "Font", based, stats: [font.id], id: font.id, line: { font: font.id } })
  }

  function lineFor(kind, font, list, id, entry, variant = null) {
    if (kind === "texture") return { font, textureSource: "premade", texture: id, textureVariant: variant }
    return { font, textureSource: "premade", ...(list.textures?.flat ? { texture: "flat" } : {}), overlayMode: "custom", overlays: [overlayLayer(id, entry)] }
  }

  for (const [owner, list] of lists) {
    const strips = owner.startsWith(STRIPS)
    const users = strips ? fonts.filter(font => (font.strips ?? []).some(item => stripUse(item).id === owner.slice(STRIPS.length))) : [fontOf(owner)]
    if (!users.length) throw new Error(`no font uses the ${owner} strips, so their thumbnails can't be found`)
    const thumbnails = `${fontFolder(users[0])}/thumbnails`
    for (const [group, kind] of [["textures", "texture"], ["overlays", "overlay"]]) {
      const where = strips ? `Strip ${kind}` : `${fullName(users[0], fonts)} ${kind}`
      for (const [id, entry] of Object.entries(list[group] ?? {})) {
        const stats = users.map(font => `${font.id}.${id}`)
        add(entry.author, { kind, name: entry.name ?? titleCase(id), image: `${thumbnails}/${id}.png`, where, based: basedOnLabel(entry.basedOn, owner), stats, id: `${owner}.${id}`, line: lineFor(kind, users[0].id, list, id, entry) })
        for (const [variantId, variant] of Object.entries(entry.variants ?? {})) add(variant.author, { kind, name: variant.name ?? titleCase(variantId), image: `${thumbnails}/${variantId}.png`, where, based: basedOnLabel(variant.basedOn, owner), stats: [], id: `${owner}.${variantId}`, line: lineFor(kind, users[0].id, list, id, entry, variantId) })
      }
    }
  }

  for (const [id, tileable] of Object.entries(tileables)) {
    const stats = [`tileable.${id}`]
    if (tileable.author !== "Mojang") add(tileable.author, { kind: "tileable", name: tileable.name ?? titleCase(id), image: `tileables/${tileable.path ?? "minecraft"}/${id}.png`, where: "Tileable texture", stats, id: `tileable.${id}`, line: { font: PREVIEW_FONT, textureSource: "tileable", tileableSource: "premade", tileable: id } })
    for (const [variantId, variant] of Object.entries(tileable.variants ?? {})) {
      if (variant.author !== "Mojang") add(variant.author, { kind: "tileable", name: variant.name ?? titleCase(variantId), image: `tileables/${variant.path ?? tileable.path ?? "minecraft"}/${variantId}.png`, where: "Tileable texture", stats: [], id: `tileable.${variantId}`, line: { font: PREVIEW_FONT, textureSource: "tileable", tileableSource: "premade", tileable: id, tileableVariant: variantId } })
    }
  }

  const order = Object.keys(KINDS)
  const people = Map.groupBy(pieces, piece => piece.person)
  const sorted = Array.from(people).sort(([a, first], [b, second]) => second.length - first.length || a.localeCompare(b))
  const sections = sorted.map(([person, made]) => {
    const listed = made.toSorted((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.where.localeCompare(b.where) || a.name.localeCompare(b.name))
    return `<article class="person"><header><h2>${escaped(person)}</h2><p>${counted(made)}</p></header><ul class="pieces">${listed.map(piece => ({ ...piece, image: `/${piece.image}` })).map(pieceHtml).join("")}</ul></article>`
  })
  const libraries = LIBRARIES.map(library => `<li><a href="${library.url}" target="_blank" rel="noopener">${escaped(library.name)}</a> by ${escaped(library.by)}, ${library.licence} licence</li>`)
  return `<section class="intro wrap"><h1 class="page-title">Credits</h1><p>${sorted.length} people have made the fonts and textures in the generator. Thank you to every one of them!</p><div class="search" hidden><input type="search" placeholder="Search people, fonts and textures" aria-label="Search the credits" spellcheck="false"><p class="empty" hidden>Nothing matches this search.</p></div></section><section class="people wrap">${sections.join("")}</section><section class="libraries wrap"><h2>Built with</h2><ul>${libraries.join("")}</ul></section>`
}
