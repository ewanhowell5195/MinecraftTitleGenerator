import { stripRange } from "../assets.js"
import { fullName, kerningPairs, parseMask } from "../font.js"
import { authorList } from "../authors.js"
import { collisionAmount, suggestKerning } from "../kerning.js"
import { jsonText } from "../jsonText.js"
import { DEFAULT_ORDER } from "../order.js"
import { defaultBorder, defaultDepth } from "../settings.js"
import { stripUse } from "../strips.js"
import { GENERATED_EDGE_OVERLAYS, withGenerated } from "../generated.js"
import { DEFAULT_ROLES, EXTRA_FILE, HEX_COLOUR, SUBMISSION_LIMITS, assetId, creditProblem, pngProblem, pngSize, sizedProblem, textProblem, textureDensity } from "../submissions.js"
import { MULTICASE_CHARACTERS, REQUIRED_CHARACTERS, characterName, fontId, hasCase } from "../fontEditor.js"
import { FONT_LIMITS, drawnCells, ownFont, storedFont, submittedFont } from "./fontBuild.js"
import { heightList, layerDepth, reachProblems, stripFit, stripHeights, stripSet } from "./stripFit.js"

const FONT_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/
const FONT_ID_LENGTH = 40
const RESERVED = ["textures", "overlays", "thumbnails"]
const RESERVED_PREFIXES = ["custom-", "editor-preview-"]
const LATIN = Array.from("abcdefghijklmnopqrstuvwxyz")
export const EXTRA_KINDS = ["flat", "texture", "overlay", "strip"]
export const FLAT_NAME = "Flat"
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

function kerningStep(pairs, square) {
  const amounts = Object.values(pairs)
  return [square, 8, 6, 4, 2].find(step => amounts.filter(amount => amount % step === 0).length >= amounts.length * 0.9) ?? 1
}

function listed(items) {
  const shown = items.slice(0, 8).map(item => item === " " ? "space" : item)
  return items.length > shown.length ? `${shown.join(", ")} and ${items.length - shown.length} more` : shown.join(", ")
}

function kerningProblem(entry, sheet, square) {
  if (!entry.kerning) return null
  const pairs = kerningPairs(entry.kerning, "the font")
  const border = defaultBorder("top", entry)
  const { list, capHeight } = parseMask(sheet.data, sheet.width, sheet.height, entry.order ?? DEFAULT_ORDER, border)
  const glyphs = Object.fromEntries(list.map(glyph => [glyph.char, glyph]))
  const unit = kerningStep(pairs, square)
  const suggested = new Map(suggestKerning(glyphs, { capHeight, unit, border }).map(item => [item.pair, item.amount]))
  const past = []
  const loose = []
  let exact = 0
  for (const [pair, amount] of Object.entries(pairs)) {
    const got = suggested.get(pair) ?? 0
    if (got === amount) exact++
    if (got > amount + unit) loose.push(pair)
    if (!(amount <= collisionAmount(glyphs, pair, border))) past.push(pair)
  }
  if (past.length) return `Some kerned pairs push their characters into each other: ${listed(past)}. Kern them less, so they stop where they touch.`
  if (loose.length) return `Some kerned pairs are kerned a lot less than the font editor suggests: ${listed(loose)}. Use the suggested amounts from the Kerning tab.`
  const total = Object.keys(pairs).length
  if (exact / total <= 0.85) return `Most kerned pairs have to use the amounts the font editor suggests, and ${exact} of ${total} do. Reset the others to their suggestions in the Kerning tab.`
  return null
}

const LETTERS = { subject: "Its letters", goes: "go", is: "are", fix: "Change the offset in the Textures tab" }

export async function stripProblem(entry, cells, capHeight, ctx, words = LETTERS, layers = null) {
  for (const use of (entry.strips ?? []).map(stripUse)) {
    const layer = use.layer && layers ? use.layer - 1 : null
    const measure = { range: stripRange({ cells, capHeight }, layer), capHeight, depth: layerDepth(defaultDepth(entry), layers, layer) }
    let set
    try {
      set = await stripSet(ctx, use.id)
    } catch {
      return `It uses the ${use.id} strips, and there are no strips called that.`
    }
    const heights = set.height ? [] : await Promise.all(set.names.map(async name => pngSize(await ctx.bytes(`/strips/${use.id}/textures/${name}.png`)).height))
    const { problems } = stripFit(set, measure, use.offset, { stretched: set.stretched, heights })
    const what = `the ${use.id} strips`
    const reach = reachProblems(set, measure, use.offset, problems, { named: char => words === LETTERS ? `"${characterName(char, entry.letterCase)}"` : null, plain: `${words.subject} ${words.goes}`, stretched: set.stretched })
    if (reach.length) return `${reach.join(", and ")} for ${what}. ${words.fix}, or stop using ${what}.`
    if (problems.includes("height")) return `${words.subject} ${words.is} the wrong height for ${what}. ${words.fix}, or stop using ${what}.`
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

function lettersProblem(drawn, letterCase) {
  const latin = letterCase === "both" ? LATIN.map(char => char.toUpperCase()).concat(LATIN) : LATIN
  const blank = latin.filter(char => !drawn.includes(char))
  if (!blank.length) return null
  const others = drawn.filter(char => /^\p{L}$/u.test(char) && !latin.includes(char))
  if (others.length >= FONT_LIMITS.letters) return null
  return `Draw every letter from a to z, or at least ${FONT_LIMITS.letters} letters of another alphabet. These are blank: ${listed(blank.map(char => characterName(char, letterCase)))}.`
}

function caseProblem(drawn, letterCase) {
  if (letterCase !== "both") return null
  const blank = drawn.filter(hasCase).map(char => char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase()).filter(char => !drawn.includes(char))
  return blank.length ? `A font with both cases needs a capital and a lowercase version of every letter. These are blank: ${listed(blank)}.` : null
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
  const problem = sizeProblem(own.capHeight, drawn.length) ?? (parent ? lettersProblem(drawn, font.letterCase) : blankProblem(drawn, font.letterCase)) ?? caseProblem(drawn, font.letterCase)
  if (problem) return problem
  const entry = own.entry
  if (entry.basedOn && !ctx.fonts.some(item => item.id === entry.basedOn)) return `It says it's based on ${entry.basedOn}, which isn't one of the fonts here. Change Based on in the font editor's Font tab.`
  return await stripProblem(entry, own.cells, own.capHeight, ctx, LETTERS, own.layers) ?? kerningProblem(entry, own.sheet, font.grid * font.density)
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
    const file = files[item.key] ? extraFileProblem(files[item.key], item.kind, template) : { size: kept, ...(kept && template ? extraSizeProblem(kept, item.kind, template) : { density: Number.isInteger(item.density) && item.density > 1 && item.density <= 64 ? item.density : undefined }) }
    if (named) problems[key] = named
    else if (flat && clean.some(other => other.kind === "flat")) problems[key] = "A font can only have one flat texture."
    else if (RESERVED_ASSETS.has(id)) problems[key] = `${name} is the name of one of the font's built in textures or overlays. Give it another name.`
    else if (ids.has(id)) problems[key] = `${name} and ${ids.get(id)} would get the same id. Give each one its own name.`
    else if (credited) problems[key] = credited
    else if (bordered && !border) problems[key] = "The border colour has to be a hex colour like #000000."
    else if (!files[item.key] && typeof stored?.[item.key] !== "string") problems[key] = `Choose a PNG for ${name}.`
    else if (file.problem) problems[key] = files[item.key] ? file.problem : `${file.problem} Choose a new one that fits the font.`
    const roles = bordered ? DEFAULT_ROLES.filter(role => item[role] === true) : []
    const repeated = roles.find(role => clean.some(other => other[role]))
    if (repeated && !problems[key]) problems[key] = `Only one texture can be the ${repeated}.`
    if (id) ids.set(id, name)
    clean.push({ key: item.key, kind: item.kind, name, ...(credit.length && { credit }), ...(border && { border }), ...(file.density > 1 && { density: file.density }), ...(file.size && { size: file.size }), ...Object.fromEntries(roles.map(role => [role, true])) })
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
