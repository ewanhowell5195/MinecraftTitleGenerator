import { CREEPER, OPENING_QUOTE, TERMINATOR_CLOSE, TERMINATOR_OPEN, baseChar } from "./order.js"

export const SPACE = 8

const NOT_THUMBNAILS = new Set([TERMINATOR_OPEN, TERMINATOR_CLOSE, " "])

export function normalise(text, multicase = false) {
  const quoted = text.replace(/(\s|^)'/g, `$1${OPENING_QUOTE}`).replace(/(\s|^)"/g, `$1${OPENING_QUOTE}${OPENING_QUOTE}`).replace(/"/g, "''")
  return multicase ? quoted : quoted.replace(/A/g, CREEPER).toLowerCase()
}

function filler(glyph, width) {
  const column = Math.floor(glyph.width / 2)
  const mask = new Uint8Array(width * glyph.height)
  for (let row = 0; row < glyph.height; row++) mask.fill(glyph.mask[row * glyph.width + column], row * width, (row + 1) * width)
  return { ...glyph, width, mask, fill: true }
}

function thumbnailable({ glyph }) {
  return !NOT_THUMBNAILS.has(baseChar(glyph.char))
}

export function thumbnailItem(placed) {
  return placed.find(thumbnailable)
}

export function thumbnailItems(font, placed) {
  const first = thumbnailItem(placed)
  if (!first) return []
  if (!font.forcedTerminators) return [first]
  const last = placed.findLast(thumbnailable)
  const shift = first.x + first.glyph.width - last.x - last.glyph.width
  const closing = placed.slice(placed.indexOf(last) + 1).map(item => ({ ...item, x: item.x + shift }))
  return placed.slice(0, placed.indexOf(first) + 1).concat(closing)
}

export function layout(font, text, options) {
  return lineLayout(font, [{ text, space: false }], options)
}

function creeperText(font, item) {
  if (item.creeper === undefined) return item.text
  if (font.multicase) return item.creeper && font.glyphs[CREEPER] ? item.text.replace(/A/g, CREEPER) : item.text
  return item.creeper && font.glyphs[CREEPER] ? item.text.replace(/a/gi, "A") : item.text.replace(/A/g, "a")
}

function wordText(font, item, raw) {
  if (raw) return item.text
  const text = creeperText(font, item)
  return normalise(font.glyphs[" "] ? text : text.trim(), font.multicase)
}

export function lineLayout(font, words, options) {
  const spacing = options.spacing ?? 0
  const space = font.spaceWidth ?? SPACE
  const parts = words.map((item, word) => ({ space: item.space, chars: Array.from(wordText(font, item, options.raw), char => ({ char, word })) })).filter(part => part.chars.length)
  let chars = parts.flatMap((part, index) => index && part.space ? [{ char: " ", word: parts[index - 1].chars[0].word }].concat(part.chars) : part.chars)
  if (chars.length && (options.terminators || font.forcedTerminators) && font.glyphs[TERMINATOR_OPEN] && font.glyphs[TERMINATOR_CLOSE]) {
    const opening = chars[0].word
    const closing = chars[chars.length - 1].word
    const gap = word => font.terminatorSpace ? [{ char: " ", width: font.terminatorSpaceWidth, word }] : []
    chars = [{ char: TERMINATOR_OPEN, word: opening }].concat(gap(opening), chars, gap(closing), [{ char: TERMINATOR_CLOSE, word: closing }])
  }
  const placed = []
  let pen = 0
  let last = null
  let spaces = 0
  for (const { char, word, width } of chars) {
    if (char === " " && !font.glyphs[" "]) {
      pen += (width ?? space) + spacing
      last = null
      spaces++
      continue
    }
    const glyph = font.glyphs[char]
    if (!glyph) continue
    if (last && options.kerning !== false) pen -= font.kerning[last + char] ?? 0
    if (glyph.width) {
      const x = pen + glyph.originX
      const before = placed[placed.length - 1]
      const edge = before ? before.x + before.glyph.width : x
      if (font.glyphs[" "] && x > edge) placed.push({ glyph: filler(font.glyphs[" "], Math.ceil(x - edge)), x: edge, spaces: 0, word: before.word })
      placed.push({ glyph, x, spaces, word })
      spaces = 0
    }
    pen += glyph.advance + spacing
    last = char
  }
  return placed
}
