import { fullName } from "../../font/catalog.js"
import { parseMask } from "../../font/sheetParse.js"
import { authorList } from "../../core/authors.js"
import { collisionAmount, kerningPairs } from "../../font/kerning.js"
import { jsonText } from "../../core/jsonText.js"
import { DEFAULT_ORDER } from "../../font/order.js"
import { defaultBorder } from "../../settings/defaults.js"
import { stripUse } from "../../font/strips.js"
import { GENERATED_EDGE_OVERLAYS, withGenerated } from "../../texture/overlays/settings.js"
import { DEFAULT_ROLES, EXTRA_FILE, HEX_COLOUR, SUBMISSION_LIMITS, assetId, creditProblem, pngProblem, pngSize, sizedProblem, textProblem, textureDensity } from "../submissions.js"
import { MULTICASE_CHARACTERS, PREVIEW_LENGTH, REQUIRED_CHARACTERS, characterName, hasCase, previewText, undrawnPreview } from "../../font/editor/characters.js"
import { fontId } from "../../font/editor/export.js"
import { MAX_ANCHORS } from "../../texture/overlayColours.js"
import { overlayPalette } from "./fontAsset.js"
import { FONT_LIMITS, drawnCells, ownFont, storedFont, submittedFont } from "./fontBuild.js"
import { STRIP_LIMITS, heightList, stripHeights, stripSet } from "./stripFit.js"

const FONT_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/
const FONT_ID_LENGTH = 40
const RESERVED = ["textures", "overlays", "thumbnails"]
const RESERVED_PREFIXES = ["custom-", "editor-preview-"]
export const EXTRA_KINDS = ["flat", "texture", "overlay", "strip"]
const FLAT_NAME = "Flat"
const RESERVED_ASSETS = new Set(["flat"].concat(Object.keys(withGenerated({})), Object.keys(GENERATED_EDGE_OVERLAYS)))
const built = new WeakMap()

export function fontParents(fonts) {
  return fonts.filter(font => !font.variant)
}

export function fontParent(fonts, id) {
  return id ? fontParents(fonts).find(font => font.id === id) ?? null : null
}

function idProblem(id, fonts) {
  if (!id) return "The font has no ID."
  if (Array.from(id).length > FONT_ID_LENGTH) return `The font's ID can be up to ${FONT_ID_LENGTH} characters.`
  if (!FONT_ID.test(id)) return "The font's ID can only have lowercase letters and numbers, with single hyphens between words, like my-font."
  if (RESERVED.includes(id) || RESERVED_PREFIXES.some(prefix => id.startsWith(prefix))) return `The ID ${id} is kept for the site itself.`
  const taken = fonts.find(font => font.id === id)
  if (taken) return `${fullName(taken, fonts)} already has the ID ${id}.`
  return null
}

function fontIdProblem(id, fonts) {
  const problem = idProblem(id, fonts)
  return problem && `${problem} Change it in the font editor's Font tab.`
}

export function submittedFontId(bytes) {
  try {
    return fontId(submittedFont(bytes).fields)
  } catch {
    return null
  }
}

function listed(items) {
  const shown = items.slice(0, 8).map(item => item === " " ? "space" : item)
  return items.length > shown.length ? `${shown.join(", ")} and ${items.length - shown.length} more` : shown.join(", ")
}

function kerningProblem(entry, sheet) {
  if (!entry.kerning) return null
  const pairs = kerningPairs(entry.kerning, "the font")
  const border = defaultBorder("top", entry)
  const { list } = parseMask(sheet.data, sheet.width, sheet.height, entry.order ?? DEFAULT_ORDER, border)
  const glyphs = Object.fromEntries(list.map(glyph => [glyph.char, glyph]))
  const past = Object.entries(pairs).filter(([pair, amount]) => !(amount <= collisionAmount(glyphs, pair, border))).map(([pair]) => pair)
  return past.length ? `Some kerned pairs push their characters into each other: ${listed(past)}. Kern them less, so they stop where they touch.` : null
}

export async function stripProblem(entry, ctx) {
  for (const use of (entry.strips ?? []).map(stripUse)) {
    try {
      await stripSet(ctx, use.id)
    } catch {
      return `It uses the ${use.id} strips, and there are no strips called that.`
    }
  }
  return null
}

function sizeProblem(capHeight, count) {
  const [low, high] = FONT_LIMITS.capHeight
  if (capHeight < low || capHeight > high) return `Fonts have to be from ${low} to ${high} pixels tall, and this one is ${capHeight}.`
  if (count > FONT_LIMITS.characters) return `Fonts can have up to ${FONT_LIMITS.characters} characters, and this one has ${count}.`
  return null
}

function blankProblem(drawn, letterCase) {
  const blank = (letterCase === "both" ? MULTICASE_CHARACTERS : REQUIRED_CHARACTERS).filter(char => !drawn.includes(char))
  return blank.length ? `A new font has to have every default character drawn. These are blank: ${listed(blank.map(char => characterName(char, letterCase)))}.` : null
}

function caseProblem(drawn, letterCase) {
  if (letterCase !== "both") return null
  const blank = drawn.filter(hasCase).map(char => char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase()).filter(char => !drawn.includes(char))
  return blank.length ? `A font with both cases needs a capital and a lowercase version of every letter. These are blank: ${listed(blank)}.` : null
}

function previewProblem(text, drawn) {
  if (text && Array.from(text).length !== PREVIEW_LENGTH) return `The thumbnail text has to be ${PREVIEW_LENGTH} characters. Change it in the font editor's Font tab.`
  const missing = undrawnPreview(text, drawn)
  return missing.length ? `The thumbnail text uses characters the font doesn't draw: ${listed(missing)}. Change it in the font editor's Font tab.` : null
}

function builtFont(font, parentId) {
  if (!built.has(font)) built.set(font, new Map())
  const cache = built.get(font)
  if (!cache.has(parentId)) cache.set(parentId, ownFont(font, parentId))
  return cache.get(parentId)
}

async function ownFontProblem(font, parent, ctx) {
  if (!drawnCells(font).cells.length) return "None of the characters are drawn yet."
  const own = builtFont(font, parent?.id ?? null)
  const drawn = own.cells.map(cell => cell.char)
  const problem = sizeProblem(own.capHeight, drawn.length) ?? (parent ? null : blankProblem(drawn, font.letterCase)) ?? caseProblem(drawn, font.letterCase)
  if (problem) return problem
  const entry = own.entry
  const preview = previewProblem(previewText(font), drawn)
  if (preview) return preview
  if (entry.basedOn && !ctx.fonts.some(item => item.id === entry.basedOn)) return `It says it's based on ${entry.basedOn}, which isn't one of the fonts here. Change Based on in the font editor's Font tab.`
  return await stripProblem(entry, ctx) ?? kerningProblem(entry, own.sheet)
}

async function readFile(bytes, parent, ctx) {
  const sized = sizedProblem(bytes, "font")
  if (sized) return { problem: sized }
  let font
  try {
    font = submittedFont(bytes).font
  } catch (err) {
    return { problem: err.message }
  }
  const problem = await ownFontProblem(font, parent, ctx)
  return { problem, template: problem ? null : builtFont(font, parent?.id ?? null).template }
}

function storedTemplate(template) {
  const valid = template && ["width", "height", "rows"].every(key => Number.isInteger(template[key]) && template[key] > 0)
  return valid ? { width: template.width, height: template.height, rows: template.rows } : null
}

function extraFileProblem(bytes, kind, template) {
  const problem = pngProblem(bytes, kind === "flat" ? "flat texture" : kind)
  if (problem) return { problem }
  const size = pngSize(bytes)
  return { size, ...extraSizeProblem(size, kind, template) }
}

function keptSize(size) {
  return size && Number.isInteger(size.width) && Number.isInteger(size.height) ? { width: size.width, height: size.height } : null
}

function extraSizeProblem(size, kind, template) {
  if (!size || !template) return {}
  const noun = kind === "flat" ? "flat texture" : kind
  if (kind === "strip") {
    const heights = stripHeights(template.rows)
    return { problem: heights.includes(size.height) ? null : `Strips for this font have to be ${heightList(heights)} pixels tall, and this one is ${size.height}.` }
  }
  const density = textureDensity(size, template)
  return density ? { density } : { problem: `The ${noun} has to be the font's template size, ${template.width}x${template.height}, or a whole number of times bigger, and this one is ${size.width}x${size.height}.` }
}

function keptPalette(palette) {
  return Array.isArray(palette) && palette.length && palette.length <= MAX_ANCHORS && palette.every(colour => typeof colour === "string" && HEX_COLOUR.test(colour)) ? palette.map(colour => colour.toLowerCase()) : null
}

function extrasOf(list, files, stored, template, problems) {
  if (list === undefined) return []
  if (!Array.isArray(list) || list.some(item => !item || typeof item !== "object")) {
    problems.extras = "The textures, overlays and strips aren't valid."
    return []
  }
  if (list.length > SUBMISSION_LIMITS.extraFiles) problems.extras = `A font can include up to ${SUBMISSION_LIMITS.extraFiles} textures, overlays and strips.`
  const keys = new Set()
  const ids = new Map()
  const clean = []
  for (const item of list) {
    if (typeof item.key !== "string" || !EXTRA_FILE.test(item.key) || keys.has(item.key) || !EXTRA_KINDS.includes(item.kind)) {
      problems.extras = "The textures, overlays and strips aren't valid."
      continue
    }
    keys.add(item.key)
    const key = `extra:${item.key}`
    const flat = item.kind === "flat"
    const named = flat ? null : textProblem(item.name ?? "", "name", SUBMISSION_LIMITS.name, { required: true, noun: item.kind })
    const credit = authorList(item.credit)
    const credited = creditProblem(credit, item.kind, false)
    const name = flat ? FLAT_NAME : named ? "" : item.name.trim()
    const id = flat ? "" : name ? assetId(name, new Set()) : ""
    const bordered = item.kind !== "overlay"
    const border = bordered && typeof item.border === "string" && HEX_COLOUR.test(item.border) ? item.border.toLowerCase() : null
    const kept = keptSize(item.size)
    const snapped = item.kind === "strip" && item.snap != null
    const badSnap = snapped && !(Number.isInteger(item.snap) && item.snap >= 1 && item.snap <= STRIP_LIMITS.snap)
    const file = files[item.key] ? extraFileProblem(files[item.key], item.kind, template) : { size: kept, ...(kept && template ? extraSizeProblem(kept, item.kind, template) : { density: Number.isInteger(item.density) && item.density > 1 && item.density <= 64 ? item.density : undefined }) }
    const coloured = item.kind === "overlay" && files[item.key] && !file.problem ? overlayPalette(files[item.key]) : null
    const palette = coloured ? coloured.palette : item.kind === "overlay" && keptPalette(item.palette)
    if (named) problems[key] = named
    else if (flat && clean.some(other => other.kind === "flat")) problems[key] = "A font can only have one flat texture."
    else if (RESERVED_ASSETS.has(id)) problems[key] = `${name} is the name of one of the font's built in textures or overlays. Give it another name.`
    else if (ids.has(id)) problems[key] = `${name} and ${ids.get(id)} would get the same id. Give each one its own name.`
    else if (credited) problems[key] = credited
    else if (bordered && !border) problems[key] = "The border colour has to be a hex colour like #000000."
    else if (badSnap) problems[key] = `The snap has to be a whole number from 1 to ${STRIP_LIMITS.snap}.`
    else if (!files[item.key] && typeof stored?.[item.key] !== "string") problems[key] = `Choose a PNG for ${name}.`
    else if (file.problem) problems[key] = files[item.key] ? file.problem : `${file.problem} Choose a new one that fits the font.`
    else if (coloured?.problem) problems[key] = coloured.problem
    const roles = bordered && item.kind !== "flat" ? DEFAULT_ROLES.filter(role => item[role] === true) : []
    const repeated = roles.find(role => clean.some(other => other[role]))
    if (repeated && !problems[key]) problems[key] = `Only one texture can be the ${repeated}.`
    if (id) ids.set(id, name)
    clean.push({ key: item.key, kind: item.kind, name, ...(credit.length && { credit }), ...(border && { border }), ...(snapped && !badSnap && item.snap > 1 && { snap: item.snap }), ...(file.density > 1 && { density: file.density }), ...(file.size && { size: file.size }), ...(palette && { palette }), ...Object.fromEntries(roles.map(role => [role, true])) })
  }
  return clean
}

export const font = {
  id: "font",
  label: "Font",
  noun: "font",
  available: true,
  sourced: true,
  accept: "application/json",
  derived: ["id", "template"],
  fileKeys(details) {
    return Array.isArray(details.extras) ? details.extras.map(item => item.key) : []
  },
  cleanFile(bytes) {
    return new TextEncoder().encode(`${jsonText(storedFont(bytes))}\n`)
  },
  async check({ target, details, bytes, files = {} }, ctx) {
    const problems = {}
    const clean = {}
    const parent = fontParent(ctx.fonts, target)
    if (target && !parent) problems.target = "Pick the font this is a variant of."
    const id = bytes ? submittedFontId(bytes) : typeof details.id === "string" ? details.id : null
    if (id !== null) problems.id = fontIdProblem(id, ctx.fonts)
    if (bytes && id) clean.id = id
    let template = bytes ? null : storedTemplate(details.template)
    if (bytes && (!target || parent)) {
      const read = await readFile(bytes, parent, ctx)
      problems.file = read.problem
      if (read.template) clean.template = template = read.template
    }
    const sent = Object.keys(files).length
    if (!bytes && sent && !template) problems.extras = "Choose the font's JSON file again to add new textures, overlays or strips."
    const extras = extrasOf(details.extras, files, details.files, template, problems)
    if (extras.length) clean.extras = extras
    return { problems, target: parent?.id ?? target, details: clean }
  }
}
