import { mostCommon } from "./maths.js"
import { CREEPER, TERMINATOR_CLOSE, TERMINATOR_OPEN } from "./order.js"

const SKIPPED = new Set([" ", TERMINATOR_OPEN, TERMINATOR_CLOSE])
const LETTER = /^[a-z]$/
const DIGIT = /^[0-9]$/
const MAIN_SYMBOL = /^[$£€()[\]{}/\\?]$/

export function pairRank(pair) {
  const kinds = Array.from(pair, char => char === CREEPER || LETTER.test(char) ? "letter" : DIGIT.test(char) ? "digit" : MAIN_SYMBOL.test(char) ? "main" : "symbol")
  if (kinds.includes("symbol")) return 4
  if (kinds.includes("main")) return 3
  if (kinds.every(kind => kind === "letter")) return 0
  if (kinds.every(kind => kind === "digit")) return 1
  return 2
}

function profile(glyph) {
  const left = new Map()
  const right = new Map()
  for (let row = 0; row < glyph.height; row++) {
    let first = -1
    let last = -1
    for (let column = 0; column < glyph.width; column++) {
      if (!glyph.mask[row * glyph.width + column]) continue
      if (first < 0) first = column
      last = column
    }
    if (first < 0) continue
    const y = glyph.bottom + row
    left.set(y, glyph.originX + first)
    right.set(y, glyph.advance - glyph.originX - last - 1)
  }
  return { advance: glyph.advance, left, right }
}

function pairGap(before, after, reach = 1) {
  let gap = Infinity
  for (const [y, space] of before.right) {
    for (let near = y - reach; near <= y + reach; near++) {
      if (after.left.has(near)) gap = Math.min(gap, space + after.left.get(near))
    }
  }
  return gap
}

function collision(before, after, border) {
  const gap = pairGap(before, after, Math.max(1, border * 2))
  return Number.isFinite(gap) ? Math.max(0, gap - border * 2) : Math.min(before.advance, after.advance)
}

export function collisionAmount(glyphs, pair, border) {
  const [first, second] = Array.from(pair)
  if (!glyphs[first]?.width || !glyphs[second]?.width) return null
  return collision(profile(glyphs[first]), profile(glyphs[second]), border)
}

function sharedRows(before, after) {
  let count = 0
  for (const y of before.right.keys()) if (after.left.has(y)) count++
  return count
}

function overlapLimit(before, after, unit) {
  const right = Math.min(...before.right.values())
  const left = Math.min(...after.left.values())
  const widths = [before.advance - Math.min(...before.left.values()) - right, after.advance - left - Math.min(...after.right.values())]
  return right + left + Math.max(unit, Math.min(...widths) / 3)
}

function slashes(pair) {
  return Array.from(pair).filter(char => char === "/" || char === "\\").length
}

export function suggestKerning(glyphs, { capHeight, unit, border }, existing = {}) {
  const shapes = Object.entries(glyphs).filter(([char, glyph]) => glyph.width && !SKIPPED.has(char)).map(([char, glyph]) => [char, profile(glyph)])
  const gaps = []
  for (const [first, before] of shapes) {
    for (const [second, after] of shapes) {
      const gap = pairGap(before, after)
      if (Number.isFinite(gap)) gaps.push({ pair: first + second, before, after, gap, full: sharedRows(before, after) >= capHeight })
    }
  }
  const usual = mostCommon(gaps.map(item => item.gap).sort((a, b) => a - b)) ?? 0
  return gaps.flatMap(({ pair, before, after, gap, full }) => {
    if (pair in existing) return []
    const room = gap - usual
    const wanted = full && slashes(pair) !== 1 ? Math.floor(room / unit) * unit : Math.min(unit * 2, Math.round(room / 2 / unit) * unit)
    const amount = Math.floor(Math.min(wanted, collision(before, after, border), overlapLimit(before, after, unit)) / unit) * unit
    return amount > 0 ? [{ pair, amount }] : []
  }).sort((a, b) => pairRank(a.pair) - pairRank(b.pair) || b.amount - a.amount || a.pair.localeCompare(b.pair))
}
