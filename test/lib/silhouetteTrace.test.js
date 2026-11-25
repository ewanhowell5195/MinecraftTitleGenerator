import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { cubesMatch, silhouetteSample } from "#lib/font/silhouette.js"
import { traceSilhouette } from "#lib/font/silhouetteTrace.js"

function imageOf(width, height, coverage) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[(y * width + x) * 4 + 3] = Math.round(coverage(x + 0.5, y + 0.5) * 255)
  }
  return { data, width, height }
}

function disc(cx, cy, radius) {
  return (x, y) => Math.max(0, Math.min(1, radius - Math.hypot(x - cx, y - cy) + 0.5))
}

function area(ring) {
  return Math.abs(ring.reduce((sum, [x, y], at) => {
    const [nx, ny] = ring[(at + 1) % ring.length]
    return sum + x * ny - nx * y
  }, 0) / 2)
}

describe("traceSilhouette", () => {
  test("traces a smooth outline of an anti-aliased circle in glyph units", () => {
    const sample = silhouetteSample(imageOf(800, 300, disc(400, 150, 140)))
    const contours = traceSilhouette(sample)
    assert.equal(contours.length, 1)
    const expected = Math.PI * (140 / sample.scale) ** 2
    assert.ok(Math.abs(area(contours[0]) - expected) / expected < 0.02, `${area(contours[0])} vs ${expected}`)
    assert.ok(contours[0].length > 20)
  })

  test("keeps a hole as its own contour", () => {
    const outer = disc(400, 150, 140)
    const inner = disc(400, 150, 60)
    const contours = traceSilhouette(silhouetteSample(imageOf(800, 300, (x, y) => outer(x, y) - inner(x, y))))
    assert.equal(contours.length, 2)
  })

  test("starts the outline at the first column of cubes", () => {
    const sample = silhouetteSample(imageOf(800, 300, disc(400, 150, 140)))
    const left = Math.min(...traceSilhouette(sample)[0].map(([x]) => x))
    assert.ok(left > -1 && left < 1, `${left}`)
  })
})

describe("cubesMatch", () => {
  test("pixel art blown up by the cube size keeps its cubes", () => {
    const sprite = (x, y) => x >= 128 && x < 256 && y >= 64 && y < 128 ? 0 : 1
    const sample = silhouetteSample(imageOf(512, 256, sprite))
    assert.equal(sample.scale, 4)
    assert.equal(cubesMatch(sample), true)
  })

  test("a smooth image loses detail as cubes", () => {
    assert.equal(cubesMatch(silhouetteSample(imageOf(800, 300, disc(400, 150, 140)))), false)
  })
})
