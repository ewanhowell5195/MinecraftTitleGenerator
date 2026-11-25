import { CREEPER, OPENING_QUOTE, TERMINATOR_CLOSE, TERMINATOR_OPEN, baseChar } from "../font/order.js"

export const SPACE = 8

const NOT_THUMBNAILS = new Set([TERMINATOR_OPEN, TERMINATOR_CLOSE, " "])

export function normalise(text, multicase = false) {
  const quoted = text.replace(/(\s|^)'/g, `$1${OPENING_QUOTE}`).replace(/(\s|^)"/g, `$1${OPENING_QUOTE}${OPENING_QUOTE}`).replace(/"/g, "''")
  return multicase ? quoted : quoted.replace(/A/g, CREEPER).toLowerCase()
}

function filler(glyph, width) {
  const column = Math.floor(glyph.width / 2)
  const mask = new Uint8Array(width * glyph.height)
  const depths = glyph.depths && new Uint8Array(mask.length)
  for (let row = 0; row < glyph.height; row++) {
    mask.fill(glyph.mask[row * glyph.width + column], row * width, (row + 1) * width)
    depths?.fill(glyph.depths[row * glyph.width + column], row * width, (row + 1) * width)
  }
  return { ...glyph, width, mask, ...(depths ? { depths } : {}), fill: true }
}

function cropped(glyph, crop, width) {
  function cut(pixels) {
    const out = new Uint8Array(width * glyph.height)
    for (let row = 0; row < glyph.height; row++) out.set(pixels.subarray(row * glyph.width + crop, row * glyph.width + crop + width), row * width)
    return out
  }
  return { ...glyph, width, mask: cut(glyph.mask), ...(glyph.depths && { depths: cut(glyph.depths) }), crop }
}

function sizedSpace(glyph, extra) {
  const width = glyph.width + extra
  const kept = Math.min(glyph.width, Math.ceil(width))
  if (kept <= 0) return []
  const left = Math.ceil(kept / 2)
  const right = kept - left
  const pieces = [{ glyph: cropped(glyph, 0, left), x: 0 }]
  if (extra > 0) pieces.push({ glyph: filler(glyph, Math.ceil(extra)), x: left })
  if (right) pieces.push({ glyph: cropped(glyph, glyph.width - right, right), x: width - right })
  return pieces
}

function piecesOf(glyph, extra) {
  if (!glyph.width) return []
  return extra ? sizedSpace(glyph, extra) : [{ glyph, x: 0 }]
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

export function fontSpace(font) {
  return font?.glyphs?.[" "]?.advance ?? font?.spaceWidth ?? SPACE
}

export function hasTerminators(font) {
  return !!font?.glyphs[TERMINATOR_OPEN] && !!font.glyphs[TERMINATOR_CLOSE]
}

export function fontTerminatorSpace(font) {
  if (!font?.terminatorSpace) return 0
  return font.glyphs?.[" "] ? fontSpace(font) : font.terminatorSpaceWidth ?? fontSpace(font)
}

function terminatorGap(font, { terminatorSpace = null }, word) {
  if (terminatorSpace === null ? !font.terminatorSpace : terminatorSpace <= 0) return []
  const width = terminatorSpace ?? fontTerminatorSpace(font)
  return [{ char: " ", width, word, extra: width - fontSpace(font) }]
}

export function lineLayout(font, words, options) {
  const spacing = options.spacing ?? 0
  const space = options.spaceWidth ?? fontSpace(font)
  const parts = words.map((item, word) => ({ space: item.space, chars: Array.from(wordText(font, item, options.raw), char => ({ char, word })) })).filter(part => part.chars.length)
  let chars = parts.flatMap((part, index) => index && part.space ? [{ char: " ", word: parts[index - 1].chars[0].word }].concat(part.chars) : part.chars)
  if (chars.length && (options.terminators || font.forcedTerminators) && hasTerminators(font)) {
    const opening = chars[0].word
    const closing = chars[chars.length - 1].word
    chars = [{ char: TERMINATOR_OPEN, word: opening }].concat(terminatorGap(font, options, opening), chars, terminatorGap(font, options, closing), [{ char: TERMINATOR_CLOSE, word: closing }])
  }
  const placed = []
  let pen = 0
  let last = null
  let spaces = 0
  for (const { char, word, width = space, extra = space - fontSpace(font) } of chars) {
    if (char === " " && !font.glyphs[" "]) {
      pen += width
      last = null
      spaces++
      continue
    }
    const glyph = font.glyphs[char]
    if (!glyph) continue
    const added = char === " " ? extra : 0
    const pieces = piecesOf(glyph, added)
    if (last && options.kerning !== false) pen -= font.kerning[last + char] ?? 0
    if (pieces.length) {
      const x = pen + glyph.originX
      const before = placed[placed.length - 1]
      const edge = before ? before.x + before.glyph.width : x
      if (font.glyphs[" "]?.width && x > edge) placed.push({ glyph: filler(font.glyphs[" "], Math.ceil(x - edge)), x: edge, spaces: 0, word: before.word })
      for (const piece of pieces) placed.push({ glyph: piece.glyph, x: x + piece.x, spaces, word })
      spaces = 0
    }
    pen += glyph.advance + added + spacing
    last = char
  }
  return placed
}
