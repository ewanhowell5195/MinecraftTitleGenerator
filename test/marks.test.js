import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { pixelHash } from "../generator/common.js"
import { publishedFonts, readMask } from "../generator/fonts.js"
import { markSheet } from "../generator/marks.js"
import { parseMask } from "../src/lib/font.js"

const WHITE = [255, 255, 255]
const BLACK = [0, 0, 0]
const RED = [255, 0, 0]
const GREEN = [0, 255, 0]
const BLUE = [0, 0, 255]

function stack(...runs) {
  return runs.flatMap(([row, count]) => new Array(count).fill(row))
}

function cellWidth(glyph) {
  return glyph.width ?? glyph.rows[0].length
}

function sheet(rows, capHeight, below = 0) {
  const band = capHeight + below
  const width = Math.max(...rows.map(row => row.reduce((total, glyph) => total + cellWidth(glyph) + 1, 1)))
  const height = rows.length * (band + 1) + 1
  const data = new Uint8Array(width * height * 4).fill(255)
  function paint(x, y, colour) {
    data.set(colour, (y * width + x) * 4)
  }
  for (let x = 0; x < width; x++) {
    for (let index = 0; index <= rows.length; index++) paint(x, index * (band + 1), RED)
  }
  for (const [rowIndex, row] of rows.entries()) {
    const top = rowIndex * (band + 1) + 1
    const baseline = top + capHeight - 1
    for (let y = top; y < top + band; y++) paint(0, y, RED)
    paint(0, top, BLUE)
    paint(0, baseline, GREEN)
    let x = 1
    for (const glyph of row) {
      const size = cellWidth(glyph)
      for (const [index, line] of glyph.rows.entries()) {
        for (const [column, char] of Array.from(line).entries()) paint(x + column, baseline + below - index, char === "#" ? BLACK : WHITE)
      }
      for (let y = top; y < top + band; y++) paint(x + size, y, (glyph.marks ?? []).includes(baseline - y) ? GREEN : RED)
      x += size + 1
    }
  }
  const png = { data, width, height }
  const order = rows.flat().map(glyph => glyph.char).join("")
  return { png, order, cells: parseMask(data, width, height, order, 0).list }
}

function mark(rows, capHeight, { below = 0, ...options } = {}) {
  const built = sheet(rows, capHeight, below)
  const result = markSheet(built.png, built.cells, capHeight, options)
  const { glyphs } = parseMask(built.png.data, built.png.width, built.png.height, built.order, 0)
  return { ...result, glyphs, png: built.png }
}

function marksFor(char, rows, capHeight, options) {
  return mark([[{ char, rows }]], capHeight, options).glyphs[char].stretch
}

const STEM = stack(["##", 6])
const H = stack(["##..##", 4], ["######", 2], ["##..##", 4])
const WAIST = stack(["####..", 4], ["######", 2], ["####..", 4])

describe("marking a stem", () => {
  test("marks a plain stem up to its top block", () => {
    const { glyphs, stroke, block, marked } = mark([[{ char: "l", rows: STEM }]], 6)
    assert.deepEqual(glyphs.l.stretch, [0, 1, 2, 3])
    assert.equal(stroke, 2)
    assert.equal(block, 2)
    assert.equal(marked, 1)
  })

  test("uses the baseline when the row has room below it", () => {
    assert.deepEqual(marksFor("l", stack(["..", 2], ["##", 6]), 6, { below: 2 }), [0, 1, 2, 3])
  })

  test("leaves a stem running through the baseline unmarked", () => {
    assert.equal(marksFor("j", stack(["##", 8]), 6, { below: 2 }), null)
  })

  test("marks only the stem of a dotted letter", () => {
    assert.deepEqual(marksFor("i", stack(["##", 4], ["..", 2], ["##", 2]), 8), [0, 1])
  })

  test("treats a lowercase height stem as a normal glyph", () => {
    assert.deepEqual(marksFor("x", stack(["##", 8], ["..", 2]), 10), [0, 1, 2, 3, 4, 5])
  })
})

describe("marking around a crossbar", () => {
  test("marks the legs below it", () => {
    assert.deepEqual(marksFor("h", H, 10), [0, 1, 2, 3])
  })

  test("marks one zone in a letter with a joint", () => {
    assert.deepEqual(marksFor("b", WAIST, 10), [0, 1, 2, 3])
  })

  test("marks the mirrored zone in symmetric punctuation", () => {
    assert.deepEqual(marksFor("$", WAIST, 10), [0, 1, 2, 3, 6, 7])
  })

  test("marks a stroke one block wider than the rest between the bars below a middle bar", () => {
    const two = stack(["#####", 4], ["###..", 2], ["#####", 2], ["...##", 2], ["#####", 4])
    const stems = [{ char: "l", rows: STEM }, { char: "i", rows: STEM }]
    assert.deepEqual(mark([[{ char: "2", rows: two }].concat(stems)], 14).glyphs["2"].stretch, [4, 5])
  })

  test("leaves a tip sticking out of the end bar for the stroke inside", () => {
    const dollar = stack(["..#..", 2], ["#####", 2], ["...##", 2], ["#####", 2], ["##...", 2], ["#####", 2], ["..#..", 2])
    const stems = [{ char: "l", rows: STEM }, { char: "i", rows: STEM }]
    assert.deepEqual(mark([[{ char: "$", rows: dollar }].concat(stems)], 14).glyphs.$.stretch, [4, 5])
  })
})

describe("marking diagonals", () => {
  test("treats a rising stroke as one zone", () => {
    assert.deepEqual(marksFor("/", stack(["##....", 2], ["..##..", 2], ["....##", 2]), 6), [0, 1, 2, 3])
  })

  test("treats a falling stroke as one zone", () => {
    assert.deepEqual(marksFor("\\", stack(["....##", 2], ["..##..", 2], ["##....", 2]), 6), [0, 1, 2, 3])
  })

  test("marks only the longest part of a slope of one block", () => {
    assert.deepEqual(marksFor("z", stack(["##..", 3], ["..##", 3]), 6), [0, 1, 2])
  })
})

describe("marking partial glyphs", () => {
  test("marks the rows around a floating glyph", () => {
    assert.deepEqual(marksFor("-", stack(["....", 4], ["####", 2], ["....", 4]), 10), [0, 1, 2, 3, 6, 7, 8, 9])
  })

  test("marks the rows below a glyph hanging from the cap", () => {
    assert.deepEqual(marksFor("'", stack(["..", 6], ["##", 4]), 10), [0, 1, 2, 3, 4, 5])
  })

  test("marks the rows above a glyph sitting low", () => {
    assert.deepEqual(marksFor(",", stack(["##", 4], ["..", 8]), 10, { below: 2 }), [2, 3, 4, 5, 6, 7, 8, 9])
  })
})

describe("marking glyphs with no stem", () => {
  const stem = { char: "l", rows: STEM }

  test("falls back to the bar that is not full width", () => {
    const { glyphs } = mark([[stem, { char: "q", rows: stack(["####..", 3], ["######", 3]) }]], 6)
    assert.deepEqual(glyphs.q.stretch, [0, 1, 2])
  })

  test("leaves a solid block unmarked", () => {
    const { glyphs, marked } = mark([[stem, { char: "o", rows: stack(["######", 6]) }]], 6)
    assert.equal(glyphs.o.stretch, null)
    assert.equal(marked, 2)
  })
})

describe("working across the sheet", () => {
  test("skips empty cells without losing its place", () => {
    const { glyphs, marked } = mark([[{ char: " ", width: 2, rows: [] }, { char: "l", rows: STEM }]], 6)
    assert.equal(glyphs[" "].width, 0)
    assert.deepEqual(glyphs.l.stretch, [0, 1, 2, 3])
    assert.equal(marked, 1)
  })

  test("keeps the marks of neighbouring glyphs apart", () => {
    const { glyphs } = mark([[{ char: "a", rows: STEM }, { char: "-", rows: stack(["..", 2], ["##", 2], ["..", 2]) }]], 6)
    assert.deepEqual(glyphs.a.stretch, [0, 1, 2, 3])
    assert.deepEqual(glyphs["-"].stretch, [0, 1, 4, 5])
  })

  test("carries on through later rows", () => {
    const { glyphs, marked } = mark([[{ char: "a", rows: STEM }], [{ char: "b", rows: STEM }]], 6)
    assert.deepEqual(glyphs.a.stretch, [0, 1, 2, 3])
    assert.deepEqual(glyphs.b.stretch, [0, 1, 2, 3])
    assert.equal(marked, 2)
  })
})

describe("stroke and block", () => {
  function measure(rows) {
    return mark([[{ char: "l", rows }]], rows.length)
  }

  test("takes the block from the stroke", () => {
    const { stroke, block } = measure(stack(["###", 6]))
    assert.equal(stroke, 3)
    assert.equal(block, 3)
  })

  test("tolerates a few odd runs", () => {
    const { stroke, block } = measure(stack(["###.", 1], ["####", 39]))
    assert.equal(stroke, 4)
    assert.equal(block, 4)
  })

  test("falls back to a block of one when too many runs disagree", () => {
    const { stroke, block } = measure(stack(["###.", 3], ["####", 37]))
    assert.equal(stroke, 4)
    assert.equal(block, 1)
  })

  test("settles on a factor of the stroke that fits nearly every run", () => {
    const { stroke, block } = measure(stack(["######", 2], ["####..", 8]))
    assert.equal(stroke, 4)
    assert.equal(block, 2)
  })
})

describe("existing marks", () => {
  const marked = { char: "l", rows: STEM, marks: [5] }

  test("are kept by default", () => {
    const { glyphs, marked: count } = mark([[marked]], 6)
    assert.deepEqual(glyphs.l.stretch, [5])
    assert.equal(count, 0)
  })

  test("are replaced with force", () => {
    const { glyphs, marked: count } = mark([[marked]], 6, { force: true })
    assert.deepEqual(glyphs.l.stretch, [0, 1, 2, 3])
    assert.equal(count, 1)
  })

  test("do not stop other glyphs being marked", () => {
    const { glyphs, marked: count } = mark([[marked, { char: "a", rows: STEM }]], 6)
    assert.deepEqual(glyphs.l.stretch, [5])
    assert.deepEqual(glyphs.a.stretch, [0, 1, 2, 3])
    assert.equal(count, 1)
  })
})

describe("check mode", () => {
  test("reports marks that differ from what it would generate", () => {
    const { differences, marked } = mark([[{ char: "l", rows: STEM, marks: [5] }]], 6, { check: true })
    assert.deepEqual(differences, [{ char: "l", generated: [0, 1, 2, 3], existing: [5] }])
    assert.equal(marked, 0)
  })

  test("reports nothing when the marks agree", () => {
    assert.deepEqual(mark([[{ char: "l", rows: STEM, marks: [0, 1, 2, 3] }]], 6, { check: true }).differences, [])
  })

  test("ignores unmarked glyphs and leaves them unmarked", () => {
    const { differences, glyphs } = mark([[{ char: "l", rows: STEM }]], 6, { check: true })
    assert.deepEqual(differences, [])
    assert.equal(glyphs.l.stretch, null)
  })

  test("never changes a published sheet", () => {
    const list = publishedFonts()
    const { png, cells, capHeight } = readMask(list.find(font => font.id === "minecraft-ten"), list)
    const before = pixelHash(png)
    const { differences, stroke, block } = markSheet(png, cells, capHeight, { check: true })
    assert.equal(pixelHash(png), before)
    assert.ok(block >= 1 && stroke % block === 0)
    for (const difference of differences) assert.ok(cells.find(glyph => glyph.char === difference.char).stretch)
  })
})
