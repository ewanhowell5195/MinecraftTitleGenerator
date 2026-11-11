import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { quietStorage } from "./helpers/browser.js"

quietStorage()

const { bodyOf, faceOutline, footprint, minecraftPlaced, modelQuads, packing, placed, solidRuns } = await import("../src/lib/modelShape.js")

const SIZE = 16
const SIDES = ["north", "south", "east", "west", "up", "down"]

function texture(solid = () => true) {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) data[(y * SIZE + x) * 4 + 3] = solid(x, y) ? 255 : 0
  }
  return { width: SIZE, height: SIZE, getContext: () => ({ getImageData: () => ({ data }) }) }
}

function cube(sides = SIDES) {
  return { elements: [{ from: [0, 2, 0], to: [16, 18, 16], faces: Object.fromEntries(sides.map(side => [side, { uv: [0, 0, 16, 16] }])) }] }
}

function dot(a, b) {
  return a.reduce((sum, value, axis) => sum + value * b[axis], 0)
}

describe("modelQuads", () => {
  test("makes one quad per face, front to the camera and standing on the baseline", () => {
    const { faces, depth } = placed(modelQuads(cube(), texture()))
    assert.equal(faces.length, 6)
    assert.equal(depth, 16)
    const points = faces.flatMap(face => face.points)
    assert.deepEqual([0, 1, 2].map(axis => [Math.min(...points.map(point => point[axis])), Math.max(...points.map(point => point[axis]))]), [[-8, 8], [0, 16], [-8, 8]])
    assert.ok(faces[0].points.every(point => point[2] === 8))
  })

  test("uvs are texels of the whole image, turned by the face rotation", () => {
    const model = { elements: [{ from: [0, 2, 0], to: [16, 18, 16], faces: { north: { uv: [0, 0, 8, 4], rotation: 90 } } }] }
    const [quad] = modelQuads(model, { width: 32, height: 32 })
    assert.deepEqual(quad.texels, [[0, 8], [0, 0], [16, 0], [16, 8]])
  })
})

describe("minecraftPlaced", () => {
  test("scales the model up, stands it on the baseline and turns blocks to face the camera", () => {
    const quad = { points: [[0, 1, 0], [1, 1, 0], [1, 2, 0], [0, 2, 0]], texels: [], source: "a", tint: null }
    assert.deepEqual(minecraftPlaced([quad], 0)[0].points, [[0, 2, 0], [2.5, 2, 0], [2.5, 4.5, 0], [0, 4.5, 0]])
    assert.deepEqual(minecraftPlaced([quad], 180)[0].points.map(point => point.map(value => value + 0)), [[0, 2, 0], [-2.5, 2, 0], [-2.5, 4.5, 0], [0, 4.5, 0]])
  })
})

describe("faceOutline", () => {
  test("tags every box with the way its face points, out of the model", () => {
    const { faces } = placed(modelQuads(cube(), texture()))
    const outline = faceOutline(solidRuns(faces, { base: texture() }), [1, 1, 1], [1, 1, 1], [0, 0])
    assert.equal(outline.facing.length, 6 * SIZE)
    assert.equal(outline.triangles, 6 * SIZE * 12)
    for (const { normal, point } of outline.facing) assert.ok(dot(normal, [point[0], point[1] - 8, point[2]]) > 0)
  })

  test("a single face is outlined from the side it can be seen from", () => {
    const { faces } = placed(modelQuads(cube(["north"]), texture()))
    const outline = faceOutline(solidRuns(faces, { base: texture() }), [1, 1, 1], [1, 1, 1], [0, 0])
    assert.ok(outline.facing.every(({ normal }) => normal[2] > 0.99))
  })

  test("grows by its own amount along each axis", () => {
    const { faces } = placed(modelQuads(cube(["north"]), texture()))
    const outline = faceOutline(solidRuns(faces, { base: texture() }), [1, 1, 1], [1, 2, 3], [0, 0])
    const reach = [0, 1, 2].map(axis => Array.from(outline.positions).filter((value, index) => index % 3 === axis))
    assert.deepEqual(reach.map(values => [Math.min(...values), Math.max(...values)]), [[-9, 9], [-2, 18], [-3, 3]])
  })

  test("the solid texels are read once and kept for every outline", () => {
    let reads = 0
    const counted = { ...texture(), getContext: () => ({ getImageData: () => (reads++, texture().getContext().getImageData()) }) }
    const { faces } = placed(modelQuads(cube(), counted))
    const runs = solidRuns(faces, { base: counted })
    for (const radius of [1, 2, 3]) faceOutline(runs, [1, 1, 1], [radius, radius, radius], [0, 0])
    footprint(runs)
    assert.equal(reads, 1)
  })

  test("only solid texels get boxes", () => {
    const half = texture(x => x < 8)
    const { faces } = placed(modelQuads(cube(["north"]), half))
    const outline = faceOutline(solidRuns(faces, { base: half }), [1, 1, 1], [1, 1, 1], [0, 0])
    assert.equal(outline.facing.length, SIZE)
    const xs = Array.from(outline.positions).filter((value, index) => index % 3 === 0)
    assert.deepEqual([Math.min(...xs), Math.max(...xs)].map(Math.abs).sort((a, b) => a - b), [1, 9])
  })
})

describe("footprint and body", () => {
  test("the footprint is the solid area seen from the front", () => {
    const { faces } = placed(modelQuads(cube(), texture()))
    const rects = footprint(solidRuns(faces, { base: texture() }))
    assert.equal(rects.length, 2 * SIZE)
    assert.deepEqual([Math.min(...rects.map(rect => rect.from[0])), Math.max(...rects.map(rect => rect.to[0])), Math.min(...rects.map(rect => rect.from[1])), Math.max(...rects.map(rect => rect.to[1]))], [-8, 8, 0, 16])
  })

  test("the body has two triangles per face", () => {
    const { faces } = placed(modelQuads(cube(), texture()))
    const cells = faces.map((face, index) => ({ face, at: index * SIZE, x: 0, y: 0 }))
    assert.equal(bodyOf(cells, SIZE, SIZE * 6).triangles, 12)
  })

  test("faces are packed one under another with a row left for the border colour", () => {
    const { faces } = placed(modelQuads(cube(), texture()))
    const { cells, width, height, swatchY } = packing(faces)
    assert.deepEqual(cells.map(cell => cell.at), [0, 16, 32, 48, 64, 80])
    assert.deepEqual([width, height, swatchY], [SIZE, 6 * SIZE + 1, 6 * SIZE])
  })
})
