import fs from "node:fs"
import path from "node:path"
import { authorList } from "../../lib/core/authors.js"
import { basedOnParts } from "../../lib/font/credits.js"
import { flattenFonts, fontFolder, fullName, linkText } from "../../lib/font/font.js"
import { encodeTitle } from "../../lib/link/linkformat.js"
import { titleCase } from "../../lib/core/names.js"
import { DEFAULT_FONT } from "../../lib/settings/defaults.js"
import { overlayLayer } from "../../lib/settings/settings.js"
import { FILE_VERSION } from "../../lib/settings/upgrades.js"
import { stripUse, withDefaultStrips } from "../../lib/font/strips.js"
import { escaped } from "../../lib/core/html.js"
import { pngSize } from "../imageSize.js"

const STRIPS = "strips."
const MOST_SHOWN = 5
const KINDS = { font: ["font", "fonts"], texture: ["texture", "textures"], overlay: ["overlay", "overlays"], tileable: ["tileable", "tileables"], shape: ["shape", "shapes"] }
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

function byMojang(author) {
  return authorList(author).includes("Mojang")
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

export function sourceHtml({ source, licence }) {
  return source ? `<span class="source">Adapted for the title generator from <a href="${escaped(source)}" target="_blank" rel="noopener">the original</a> (<a href="${escaped(licence)}" target="_blank" rel="noopener">licence</a>)</span>` : ""
}

function pieceHtml(piece) {
  const based = piece.based ? `<span class="based">Based on ${escaped(piece.based)}</span>` : ""
  const source = sourceHtml(piece)
  const others = piece.people.filter(person => person !== piece.person)
  const shared = others.length ? `<button type="button" class="with link-button" data-id="${escaped(piece.id)}" data-easy-tooltip="With ${escaped(listed(others))}" data-easy-tooltip-class="slow">Collaboration</button>` : ""
  const href = `/app/?title=${encodeTitle({ version: FILE_VERSION, lines: [{ text: piece.text, ...piece.line }] }).code}`
  return `<li class="piece" data-id="${escaped(piece.id)}" data-stats="${escaped(piece.stats.join(" "))}"><div class="thumb"><img src="${escaped(piece.image)}" alt=""${piece.size ? ` width="${piece.size.width}" height="${piece.size.height}"` : ""} loading="lazy"></div><a class="name" href="${escaped(href)}">${escaped(piece.name)}</a><span class="where">${escaped(piece.where)}</span>${based}${source}${shared}</li>`
}

function moreHtml(total) {
  const counts = Array.from({ length: MOST_SHOWN }, (_, index) => index + 1).filter(shown => total > shown).map(shown => `<span class="count" data-shown="${shown}">+${total - shown}</span>`)
  return counts.length ? `<li class="more"><button type="button">${counts.join("")}<span>Show all</span></button></li>` : ""
}

function peopleOf(root) {
  const folder = path.join(root, "public")
  const fonts = flattenFonts(readJson(path.join(folder, "fonts/fonts.json"))).map(data => ({ ...data, name: data.name ?? titleCase(data.id) }))
  const fontOf = id => fonts.find(font => font.id === id)
  const lists = new Map()
  for (const font of fonts) {
    const file = path.join(folder, fontFolder(font), "textures.json")
    if (!font.inherits && fs.existsSync(file)) lists.set(font.id, readJson(file))
  }
  for (const set of fs.readdirSync(path.join(folder, "strips"))) lists.set(`${STRIPS}${set}`, readJson(path.join(folder, "strips", set, "textures.json")))
  const tileables = readJson(path.join(folder, "tileables/tileables.json"))
  const pieces = []

  function add(data, piece) {
    const people = authorList(data.authors)
    if (!people.length) return
    if (!fs.existsSync(path.join(folder, piece.image))) throw new Error(`the credits page needs ${piece.image}, which does not exist`)
    const size = pngSize(path.join(folder, piece.image))
    for (const person of people) pieces.push({ ...piece, size, text: linkText(piece.name, piece.line.font, fonts), source: data.source ?? null, licence: data.licence ?? null, person, people })
  }

  function basedOnLabel(basedOn, owner) {
    if (!basedOn) return null
    const { owner: target, id } = basedOnParts(basedOn, owner)
    const sets = target.startsWith(STRIPS) ? [] : withDefaultStrips(fontOf(target)?.strips).map(item => `${STRIPS}${stripUse(item).id}`)
    const name = [target].concat(sets).filter(key => lists.has(key)).map(key => nameIn(lists.get(key), id)).find(Boolean)
    if (name) return target === owner || target.startsWith(STRIPS) ? name : `${fullName(fontOf(target), fonts)}: ${name}`
    const tileable = tileables[id] ?? Object.values(tileables).find(entry => entry.variants?.[id])?.variants[id]
    if (tileable) return tileable.name ?? titleCase(id)
    throw new Error(`${basedOn} in ${owner} is not a texture, overlay or tileable`)
  }

  for (const font of fonts) {
    const based = font.basedOn ? fullName(fontOf(font.basedOn), fonts) : null
    add(font, { kind: "font", name: fullName(font, fonts), image: `${fontFolder(font)}/thumbnails/flat.png`, where: "Font", based, stats: [font.id], id: font.id, line: { font: font.id } })
  }

  function lineFor(kind, font, list, id, entry, variant = null) {
    if (kind === "texture") return { font, textureSource: "premade", texture: id, textureVariant: variant }
    return { font, textureSource: "premade", ...(list.textures?.flat ? { texture: "flat" } : {}), overlayMode: "custom", overlays: [overlayLayer(id, entry)] }
  }

  for (const [owner, list] of lists) {
    const strips = owner.startsWith(STRIPS)
    const users = strips ? fonts.filter(font => withDefaultStrips(font.strips).some(item => stripUse(item).id === owner.slice(STRIPS.length))) : [fontOf(owner)]
    if (!users.length) throw new Error(`no font uses the ${owner} strips, so their thumbnails can't be found`)
    const thumbnails = `${fontFolder(users[0])}/thumbnails`
    for (const [group, kind] of [["textures", "texture"], ["overlays", "overlay"]]) {
      const where = strips ? `Strip ${kind}` : `${fullName(users[0], fonts)} ${kind}`
      for (const [id, entry] of Object.entries(list[group] ?? {})) {
        const stats = users.map(font => `${font.id}.${id}`)
        add(entry, { kind, name: entry.name ?? titleCase(id), image: `${thumbnails}/${id}.png`, where, based: basedOnLabel(entry.basedOn, owner), stats, id: `${owner}.${id}`, line: lineFor(kind, users[0].id, list, id, entry) })
        for (const [variantId, variant] of Object.entries(entry.variants ?? {})) add(variant, { kind, name: variant.name ?? titleCase(variantId), image: `${thumbnails}/${variantId}.png`, where, based: basedOnLabel(variant.basedOn, owner), stats: [], id: `${owner}.${variantId}`, line: lineFor(kind, users[0].id, list, id, entry, variantId) })
      }
    }
  }

  for (const [id, tileable] of Object.entries(tileables)) {
    const stats = [`tileable.${id}`]
    if (!byMojang(tileable.authors)) add(tileable, { kind: "tileable", name: tileable.name ?? titleCase(id), image: `tileables/${tileable.path ?? "minecraft"}/${id}.png`, where: "Tileable texture", stats, id: `tileable.${id}`, line: { font: DEFAULT_FONT, textureSource: "tileable", tileableSource: "premade", tileable: id } })
    for (const [variantId, variant] of Object.entries(tileable.variants ?? {})) {
      if (!byMojang(variant.authors)) add(variant, { kind: "tileable", name: variant.name ?? titleCase(variantId), image: `tileables/${variant.path ?? tileable.path ?? "minecraft"}/${variantId}.png`, where: "Tileable texture", stats: [], id: `tileable.${variantId}`, line: { font: DEFAULT_FONT, textureSource: "tileable", tileableSource: "premade", tileable: id, tileableVariant: variantId } })
    }
  }

  for (const shape of readJson(path.join(folder, "shapes/shapes.json"))) {
    const name = shape.name ?? titleCase(shape.id)
    add(shape, { kind: "shape", name, image: `shapes/${shape.id}/thumbnails/flat.png`, where: "Shape", stats: [], id: `shape.${shape.id}`, line: { shape: shape.id } })
    const list = readJson(path.join(folder, "shapes", shape.id, "textures.json"))
    for (const [kind, group] of [["texture", list.textures], ["overlay", list.overlays ?? {}]]) {
      for (const [id, entry] of Object.entries(group)) {
        for (const [piece, data] of [[id, entry]].concat(Object.entries(entry.variants ?? {}))) {
          if (byMojang(data.authors)) continue
          const line = kind === "texture" ? { shape: shape.id, texture: id, textureVariant: piece === id ? null : piece } : { shape: shape.id, overlayMode: "custom", overlays: [overlayLayer(id, entry)] }
          add(data, { kind, name: data.name ?? titleCase(piece), image: `shapes/${shape.id}/thumbnails/${piece}.png`, where: `${name} ${kind}`, stats: [], id: `shape.${shape.id}.${piece}`, line })
        }
      }
    }
  }

  const people = Map.groupBy(pieces, piece => piece.person)
  return Array.from(people).sort(([a, first], [b, second]) => second.length - first.length || a.localeCompare(b))
}

export function creditPeople(root) {
  return peopleOf(root).map(([person]) => person)
}

export function licensedFontsHtml(list, root = null) {
  const fonts = flattenFonts(list).map(data => ({ ...data, name: data.name ?? titleCase(data.id) }))
  const licensed = fonts.filter(font => font.source)
  if (!licensed.length) return `<section class="fonts wrap"><p class="note">None of the fonts are shared under their own licence right now.</p></section>`
  const pieces = licensed.map(font => {
    const name = fullName(font, fonts)
    const authors = authorList(font.authors)
    const based = font.basedOn ? fullName(fonts.find(item => item.id === font.basedOn), fonts) : null
    return pieceHtml({ id: font.id, name, text: linkText(name, font.id, fonts), line: { font: font.id }, image: `/${fontFolder(font)}/thumbnails/flat.png`, size: root ? pngSize(path.join(root, "public", fontFolder(font), "thumbnails/flat.png")) : null, where: authors.length ? `By ${listed(authors)}` : "", based, source: font.source ?? null, licence: font.licence ?? null, stats: [font.id], people: [], person: null })
  })
  return `<section class="fonts wrap"><p class="note">These fonts are adapted from someone else's work and shared under their own licence. Check a font's licence before using a title made with it.</p><ul class="pieces">${pieces.join("")}</ul></section>`
}

export function creditsHtml(root) {
  const order = Object.keys(KINDS)
  const sorted = peopleOf(root)
  const sections = sorted.map(([person, made]) => {
    const listed = made.toSorted((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.where.localeCompare(b.where) || a.name.localeCompare(b.name))
    return `<article class="person"><header><h2>${escaped(person)}</h2><p>${counted(made)}</p></header><ul class="pieces">${listed.map(piece => ({ ...piece, image: `/${piece.image}` })).map(pieceHtml).join("")}${moreHtml(listed.length)}</ul></article>`
  })
  const libraries = LIBRARIES.map(library => `<li><a href="${library.url}" target="_blank" rel="noopener">${escaped(library.name)}</a> by ${escaped(library.by)}, ${library.licence} licence</li>`)
  return {
    intro: `<h1 class="page-title">Credits</h1><p>${sorted.length} people have made the fonts, textures and shapes in the generator. Thank you to every one of them!</p>`,
    contributors: `<div class="search wrap"><input type="search" placeholder="Search people, fonts, textures and shapes" aria-label="Search the credits" spellcheck="false"><p class="empty" hidden>Nothing matches this search.</p></div><section class="people wrap">${sections.join("")}</section>`,
    fonts: licensedFontsHtml(readJson(path.join(root, "public/fonts/fonts.json")), root),
    libraries: `<section class="libraries wrap"><h2>Built with</h2><ul>${libraries.join("")}</ul></section>`
  }
}
