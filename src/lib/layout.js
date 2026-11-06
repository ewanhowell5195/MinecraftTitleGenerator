export const SPACE = 8

const NOT_THUMBNAILS = new Set(["┫", "┣", " "])

function normalise(text) {
  return text.replace(/A/g, "\u{1F633}").replace(/(\s|^)'/g, "$1\u{1F629}").replace(/(\s|^)"/g, "$1\u{1F629}\u{1F629}").replace(/"/g, "''").toLowerCase()
}

function filler(glyph, width) {
  const column = Math.floor(glyph.width / 2)
  const mask = new Uint8Array(width * glyph.height)
  for (let row = 0; row < glyph.height; row++) mask.fill(glyph.mask[row * glyph.width + column], row * width, (row + 1) * width)
  return { ...glyph, width, mask, fill: true }
}

export function thumbnailItem(placed) {
  return placed.find(({ glyph }) => !NOT_THUMBNAILS.has(glyph.char.split("\u0000")[0]))
}

export function thumbnailItems(font, placed) {
  const first = thumbnailItem(placed)
  if (!first) return []
  if (!font.forcedTerminators) return [first]
  const last = placed.findLast(({ glyph }) => !NOT_THUMBNAILS.has(glyph.char.split("\u0000")[0]))
  const shift = first.x + first.glyph.width - last.x - last.glyph.width
  const closing = placed.slice(placed.indexOf(last) + 1).map(item => ({ ...item, x: item.x + shift }))
  return placed.slice(0, placed.indexOf(first) + 1).concat(closing)
}

export function layout(font, text, options) {
  return lineLayout(font, [{ text, space: false }], options)
}

export function lineLayout(font, words, options) {
  const spacing = options.spacing ?? 0
  const space = font.spaceWidth ?? SPACE
  const parts = words.map((item, word) => ({ space: item.space, chars: Array.from(normalise(font.glyphs[" "] ? item.text : item.text.trim()), char => ({ char, word })) })).filter(part => part.chars.length)
  let chars = parts.flatMap((part, index) => index && part.space ? [{ char: " ", word: parts[index - 1].chars[0].word }].concat(part.chars) : part.chars)
  if (chars.length && (options.terminators || font.forcedTerminators) && font.glyphs["┫"] && font.glyphs["┣"]) {
    const gap = font.terminatorSpace ? [{ char: " " }] : []
    chars = [{ char: "┫", word: chars[0].word }].concat(gap, chars, gap, [{ char: "┣", word: chars[chars.length - 1].word }])
  }
  const placed = []
  let pen = 0
  let last = null
  let spaces = 0
  for (const { char, word } of chars) {
    if (char === " " && !font.glyphs[" "]) {
      pen += space + spacing
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
