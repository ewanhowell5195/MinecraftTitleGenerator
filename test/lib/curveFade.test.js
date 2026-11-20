import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { curveWeights, fadeCurves, keepStrips } from "../../src/lib/texture/atlas/curveFade.js"
import { planAtlas } from "../../src/lib/texture/atlas/plan.js"

const RECT = { minX: 0, maxX: 10, minY: 0, maxY: 10 }

function wall(kind, [px, py], [qx, qy], uvs) {
  return { kind, mesh: true, internal: false, glyph: 0, points: [[px, py, -2], [px, py, 2], [qx, qy, 2], [qx, qy, -2]], uvs }
}

function painted(width, height) {
  const data = new Uint8ClampedArray(width * height * 4)
  return {
    data,
    canvas: { width, height },
    fill(x0, y0, x1, y1, colour) {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.set(colour, (y * width + x) * 4)
    },
    pixel: (x, y) => Array.from(data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)),
    getImageData(x0, y0, w, h) {
      const out = new Uint8ClampedArray(w * h * 4)
      for (let y = 0; y < h; y++) out.set(data.subarray(((y0 + y) * width + x0) * 4, ((y0 + y) * width + x0 + w) * 4), y * w * 4)
      return { data: out, width: w, height: h }
    },
    putImageData(image, x0, y0, left = 0, top = 0, w = image.width, h = image.height) {
      for (let y = top; y < top + h; y++) data.set(image.data.subarray((y * image.width + left) * 4, (y * image.width + left + w) * 4), ((y0 + y) * width + x0 + left) * 4)
    }
  }
}

describe("curve fade", () => {
  test("steep top faces get their own run laid out along the curve, so each gets its share of the texture", () => {
    const faces = [wall("top", [0, 2], [0.2, 5]), wall("top", [0.2, 5], [1, 8]), wall("top", [1, 8], [4, 9]), wall("top", [4, 9], [8, 9])]
    const plan = planAtlas(faces, { depth: 4, rects: [RECT], chars: ["a"], spaces: [0] })
    assert.equal(plan.runs.length, 1)
    const [run] = plan.runs
    assert.deepEqual(run.faces, faces.slice(0, 2))
    const first = Math.hypot(0.2, 3)
    assert.ok(Math.abs(run.length - first - Math.hypot(0.8, 3)) < 1e-9 && run.width === 1)
    assert.deepEqual(faces[1].along, [first, run.length])
    assert.ok(!faces[2].extra && !faces[3].extra)
  })

  test("flat faces keep their colour and the fade carries on past the old 45 degree limit", () => {
    assert.deepEqual(curveWeights(wall("bottom", [0, 0], [5, 0]), RECT, 4), [1, 1])
    assert.deepEqual(curveWeights(wall("bottom", [0, 0], [1, 2]), RECT, 4), [0, 0])
    const [steep] = curveWeights(wall("bottom", [0, 0], [3, 3]), RECT, 4)
    assert.ok(steep > 0 && steep < 1)
  })

  test("a face fades out as it climbs to the top of the band", () => {
    const [low, high] = curveWeights(wall("bottom", [0, 1], [5, 3.5]), { ...RECT, minY: 0 }, 4)
    assert.ok(low > high)
    assert.deepEqual(curveWeights(wall("top", [0, 10], [5, 10]), RECT, 4), [1, 1])
    assert.deepEqual(curveWeights(wall("top", [0, 4], [5, 4]), RECT, 4), [0, 0])
    const [past] = curveWeights(wall("top", [0, 6], [5, 6]), RECT, 4)
    assert.ok(past > 0 && past < 1)
  })

  test("a face on the baseline above a descender fades by its height over the baseline, not over the bottom of the letter", () => {
    const rect = { ...RECT, minY: -20, bottoms: [-20, 0] }
    assert.deepEqual(curveWeights(wall("bottom", [0, -0.5], [5, -0.5]), rect, 4), [1, 1])
    assert.deepEqual(curveWeights(wall("bottom", [0, 6], [5, 6]), rect, 4), [0, 0])
    assert.deepEqual(curveWeights(wall("bottom", [0, -19], [5, -19]), rect, 4), [1, 1])
  })

  test("a face laid out in a run of its own, like a bowl over a descender, still fades", () => {
    const ctx = painted(30, 8)
    ctx.fill(0, 0, 8, 4, [255, 0, 0, 255])
    ctx.fill(20, 0, 24, 6, [0, 0, 255, 255])
    const faces = [{ ...wall("bottom", [0, 0], [5, 0], [[0, 0], [0, 4], [5, 4], [5, 0]]), extra: true }, { ...wall("bottom", [5, 0], [6, 3], [[5, 0], [5, 4], [8, 4], [8, 0]]), extra: true }, wall("side", [6, 3], [6, 9], [[20, 0], [24, 0], [24, 6], [20, 6]])]
    fadeCurves(ctx, faces, [RECT], new Set([0]), 4)
    assert.deepEqual(ctx.pixel(2, 2), [255, 0, 0, 255])
    assert.deepEqual(ctx.pixel(6, 2), [0, 0, 255, 255])
  })

  test("a tiny flat step where a curve meets the wall doesn't stop the fade reaching it", () => {
    const ctx = painted(30, 8)
    ctx.fill(0, 0, 8, 4, [255, 0, 0, 255])
    ctx.fill(20, 0, 24, 6, [0, 0, 255, 255])
    const faces = [wall("bottom", [0, 0], [5, 0], [[0, 0], [0, 4], [5, 4], [5, 0]]), wall("bottom", [5, 0], [6, 3], [[5, 0], [5, 4], [8, 4], [8, 0]]), wall("bottom", [6, 3], [6.5, 3], [[8, 0], [8, 4], [8, 4], [8, 0]]), wall("side", [6.5, 3], [6.5, 9], [[20, 0], [24, 0], [24, 6], [20, 6]])]
    fadeCurves(ctx, faces, [RECT], new Set([0]), 4)
    assert.deepEqual(ctx.pixel(6, 2), [0, 0, 255, 255])
  })

  test("a face at the limit takes on the colour of the wall past it, the flat part keeps its own", () => {
    const ctx = painted(30, 8)
    ctx.fill(0, 0, 8, 4, [255, 0, 0, 255])
    ctx.fill(20, 0, 24, 6, [0, 0, 255, 255])
    const faces = [wall("bottom", [0, 0], [5, 0], [[0, 0], [0, 4], [5, 4], [5, 0]]), wall("bottom", [5, 0], [6, 3], [[5, 0], [5, 4], [8, 4], [8, 0]]), { ...wall("side", [6, 3], [6, 9], [[20, 0], [24, 0], [24, 6], [20, 6]]) }]
    fadeCurves(ctx, faces, [RECT], new Set([0]), 4)
    assert.deepEqual(ctx.pixel(2, 2), [255, 0, 0, 255])
    assert.deepEqual(ctx.pixel(6, 2), [0, 0, 255, 255])
  })

  test("a steep face only fades toward a wall it climbs into, not past an edge where it turns flatter again", () => {
    const ctx = painted(30, 8)
    ctx.fill(0, 0, 12, 4, [255, 0, 0, 255])
    ctx.fill(20, 0, 24, 6, [0, 0, 255, 255])
    const faces = [wall("bottom", [0, 0], [5, 0], [[0, 0], [0, 4], [5, 4], [5, 0]]), wall("bottom", [5, 0], [6, 3], [[5, 0], [5, 4], [8, 4], [8, 0]]), wall("bottom", [6, 3], [11, 3], [[8, 0], [8, 4], [12, 4], [12, 0]]), wall("side", [11, 3], [11, 9], [[20, 0], [24, 0], [24, 6], [20, 6]])]
    fadeCurves(ctx, faces, [RECT], new Set([0]), 4)
    assert.deepEqual(ctx.pixel(6, 2), [255, 0, 0, 255])
  })

  test("a pixel where two faces meet is faded once, not by both", () => {
    const ctx = painted(30, 8)
    ctx.fill(0, 0, 12, 4, [255, 0, 0, 255])
    ctx.fill(20, 0, 24, 6, [0, 0, 255, 255])
    const faces = [wall("bottom", [0, 0], [4, 2.8], [[0, 0], [0, 4], [4.5, 4], [4.5, 0]]), wall("bottom", [4, 2.8], [7, 5.8], [[4.5, 0], [4.5, 4], [7.5, 4], [7.5, 0]]), wall("bottom", [7, 5.8], [8, 7.2], [[7.5, 0], [7.5, 4], [9, 4], [9, 0]]), wall("side", [8, 7.2], [8, 9], [[20, 0], [24, 0], [24, 6], [20, 6]])]
    fadeCurves(ctx, faces, [RECT], new Set([0]), 100)
    const reds = [1, 2, 3, 4, 5, 6, 7, 8].map(x => ctx.pixel(x, 2)[0])
    for (let index = 1; index < reds.length; index++) assert.ok(reds[index] <= reds[index - 1], `${reds}`)
  })

  test("the fade reaches the last row and column a face touches, even when they are only partly inside it", () => {
    const ctx = painted(30, 8)
    ctx.fill(0, 0, 12, 6, [255, 0, 0, 255])
    ctx.fill(20, 0, 24, 6, [0, 0, 255, 255])
    const faces = [wall("bottom", [0, 0], [5, 0], [[0, 0.4], [0, 3.4], [5, 3.4], [5, 0.4]]), wall("bottom", [5, 0], [6, 3], [[5, 0.4], [5, 3.4], [8.4, 3.4], [8.4, 0.4]]), wall("side", [6, 3], [6, 9], [[20, 0], [24, 0], [24, 6], [20, 6]])]
    fadeCurves(ctx, faces, [RECT], new Set([0]), 4)
    assert.deepEqual(ctx.pixel(6, 3), [0, 0, 255, 255])
    assert.deepEqual(ctx.pixel(8, 2), [0, 0, 255, 255])
    assert.deepEqual(ctx.pixel(9, 2), [255, 0, 0, 255])
  })

  test("finishing the same canvas again starts from the unfaded strip, so the fade never stacks up", () => {
    const ctx = painted(30, 8)
    ctx.fill(0, 0, 12, 4, [255, 0, 0, 255])
    ctx.fill(20, 0, 24, 6, [0, 0, 255, 255])
    const faces = [wall("bottom", [0, 0], [4, 2.8], [[0, 0], [0, 4], [4.5, 4], [4.5, 0]]), wall("bottom", [4, 2.8], [7, 5.8], [[4.5, 0], [4.5, 4], [7.5, 4], [7.5, 0]]), wall("side", [7, 5.8], [7, 9], [[20, 0], [24, 0], [24, 6], [20, 6]])]
    const strip = [{ x: 0, y: 0, width: 12, height: 4 }]
    keepStrips(ctx, strip, true)
    fadeCurves(ctx, faces, [RECT], new Set([0]), 100)
    const once = Array.from(ctx.data)
    keepStrips(ctx, strip, true)
    fadeCurves(ctx, faces, [RECT], new Set([0]), 100)
    assert.deepEqual(Array.from(ctx.data), once)
    keepStrips(ctx, strip, false)
    assert.deepEqual(ctx.pixel(6, 2), [255, 0, 0, 255])
  })

  test("a flat face that ends at a sharp corner keeps its colour", () => {
    const ctx = painted(30, 8)
    ctx.fill(0, 0, 8, 4, [255, 0, 0, 255])
    ctx.fill(20, 0, 24, 6, [0, 0, 255, 255])
    fadeCurves(ctx, [wall("bottom", [0, 0], [8, 0], [[0, 0], [0, 4], [8, 4], [8, 0]]), wall("side", [8, 0], [8, 9], [[20, 0], [24, 0], [24, 6], [20, 6]])], [RECT], new Set([0]), 4)
    assert.deepEqual(ctx.pixel(7, 2), [255, 0, 0, 255])
  })

  test("the fade follows the curve smoothly, with no step where two faces meet", () => {
    const ctx = painted(30, 8)
    ctx.fill(0, 0, 12, 4, [255, 0, 0, 255])
    ctx.fill(20, 0, 24, 6, [0, 0, 255, 255])
    const faces = [wall("bottom", [0, 0], [4, 1], [[0, 0], [0, 4], [4, 4], [4, 0]]), wall("bottom", [4, 1], [7, 2.5], [[4, 0], [4, 4], [7, 4], [7, 0]]), wall("bottom", [7, 2.5], [9, 4], [[7, 0], [7, 4], [9, 4], [9, 0]]), wall("side", [9, 4], [9, 9], [[20, 0], [24, 0], [24, 6], [20, 6]])]
    fadeCurves(ctx, faces, [RECT], new Set([0]), 100)
    const reds = [2, 3, 4, 5, 6, 7, 8].map(x => ctx.pixel(x, 2)[0])
    for (let index = 1; index < reds.length; index++) assert.ok(reds[index] <= reds[index - 1] && reds[index - 1] - reds[index] < 90, `${reds}`)
  })
})
