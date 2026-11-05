import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { boxFaces, boxesFor } from "../src/lib/boxes.js"

function maskOf(rows) {
  return Uint8Array.from(rows.toReversed().join(""), char => Number(char))
}

function boxesOf(rows, originX, originY) {
  return boxesFor(maskOf(rows), rows[0].length, rows.length, originX, originY)
}

function sorted(boxes) {
  return boxes.toSorted((a, b) => a.from[1] - b.from[1] || a.from[0] - b.from[0])
}

function solidAt(rows) {
  const height = rows.length
  const width = rows[0].length
  const mask = maskOf(rows)
  return (x, y) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1
}

function perimeter(rows) {
  const at = solidAt(rows)
  let total = 0
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[0].length; x++) {
      if (!at(x, y)) continue
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (!at(x + dx, y + dy)) total++
    }
  }
  return total
}

function seededMask(seed, width, height) {
  let state = seed
  const rows = []
  for (let y = 0; y < height; y++) {
    let row = ""
    for (let x = 0; x < width; x++) {
      state = state * 1103515245 + 12345 & 0x7fffffff
      row += state >> 16 & 1 ? "1" : "0"
    }
    rows.push(row)
  }
  return rows
}

function normal(points) {
  const [a, b, c] = points
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]]
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
}

function extents(points) {
  return [0, 1, 2].map(axis => [Math.min(...points.map(point => point[axis])), Math.max(...points.map(point => point[axis]))])
}

const SHAPES = [["1"], ["111", "111"], ["11", "10"], ["111", "101", "111"], ["010", "111", "010"], ["101", "010", "101"], ["1111111", "1110111", "1100011", "1000001"], ["10001", "11011", "11111", "11011", "10001"], ["0"]].concat(Array.from({ length: 40 }, (_, seed) => seededMask(seed + 1, 3 + seed % 9, 2 + seed % 7)))

const ALL_FACES = { front: true, back: true, west: true, east: true, down: true, up: true }

describe("boxesFor", () => {
  test("returns nothing for an empty mask", () => {
    assert.deepEqual(boxesOf(["000", "000"]), [])
  })

  test("a single pixel is one fully exposed box", () => {
    assert.deepEqual(boxesOf(["1"]), [{ from: [0, 0], to: [1, 1], faces: ALL_FACES, internal: { up: false, down: false } }])
  })

  test("a solid block merges into one box", () => {
    const boxes = boxesOf(["1111", "1111", "1111"])
    assert.equal(boxes.length, 1)
    assert.deepEqual(boxes[0].from, [0, 0])
    assert.deepEqual(boxes[0].to, [4, 3])
    assert.deepEqual(boxes[0].faces, ALL_FACES)
  })

  test("the origin offsets coordinates without changing culling", () => {
    const [box] = boxesOf(["11", "11"], 5, -3)
    assert.deepEqual(box.from, [5, -3])
    assert.deepEqual(box.to, [7, -1])
    assert.deepEqual(box.faces, ALL_FACES)
  })

  test("row zero of the mask is the bottom of the shape", () => {
    const [box] = boxesOf(["0", "1"])
    assert.deepEqual(box.from, [0, 0])
    assert.deepEqual(box.to, [1, 1])
    assert.deepEqual(box.internal, { up: true, down: false })
  })

  test("an L shape splits where a face changes exposure", () => {
    const boxes = sorted(boxesOf(["10", "11"]))
    assert.deepEqual(boxes.map(box => [box.from, box.to]), [[[0, 0], [1, 1]], [[1, 0], [2, 1]], [[0, 1], [1, 2]]])
    assert.deepEqual(boxes[0].faces, { front: true, back: true, west: true, east: false, down: true, up: false })
    assert.deepEqual(boxes[1].faces, { front: true, back: true, west: false, east: true, down: true, up: true })
    assert.deepEqual(boxes[2].faces, { front: true, back: true, west: true, east: true, down: false, up: true })
  })

  test("the middle of a plus has only front and back faces", () => {
    const boxes = boxesOf(["010", "111", "010"])
    const middle = boxes.find(box => box.from[0] === 1 && box.from[1] === 1)
    assert.equal(boxes.length, 5)
    assert.deepEqual(middle.to, [2, 2])
    assert.deepEqual(middle.faces, { front: true, back: true, west: false, east: false, down: false, up: false })
  })

  test("faces around a hole stay exposed", () => {
    const boxes = boxesOf(["111", "101", "111"])
    const below = boxes.find(box => box.from[0] === 1 && box.from[1] === 0)
    const above = boxes.find(box => box.from[0] === 1 && box.from[1] === 2)
    const left = boxes.find(box => box.from[0] === 0 && box.from[1] === 1)
    const right = boxes.find(box => box.from[0] === 2 && box.from[1] === 1)
    assert.equal(below.faces.up, true)
    assert.equal(above.faces.down, true)
    assert.equal(left.faces.east, true)
    assert.equal(right.faces.west, true)
  })

  test("internal flags mark faces away from the mask's outer rows", () => {
    const boxes = sorted(boxesOf(["10", "11"]))
    assert.deepEqual(boxes[0].internal, { up: true, down: false })
    assert.deepEqual(boxes[1].internal, { up: true, down: false })
    assert.deepEqual(boxes[2].internal, { up: false, down: true })
  })

  test("boxes cover each solid pixel exactly once", () => {
    for (const rows of SHAPES) {
      const count = new Map()
      for (const box of boxesOf(rows)) {
        for (let y = box.from[1]; y < box.to[1]; y++) {
          for (let x = box.from[0]; x < box.to[0]; x++) count.set(`${x},${y}`, (count.get(`${x},${y}`) ?? 0) + 1)
        }
      }
      const at = solidAt(rows)
      for (let y = 0; y < rows.length; y++) {
        for (let x = 0; x < rows[0].length; x++) assert.equal(count.get(`${x},${y}`) ?? 0, at(x, y) ? 1 : 0, `${rows.join("/")} at ${x},${y}`)
      }
    }
  })

  test("each side face is wholly exposed or wholly hidden", () => {
    for (const rows of SHAPES) {
      const at = solidAt(rows)
      for (const { from: [x0, y0], to: [x1, y1], faces } of boxesOf(rows)) {
        for (let y = y0; y < y1; y++) {
          assert.equal(!at(x0 - 1, y), faces.west, rows.join("/"))
          assert.equal(!at(x1, y), faces.east, rows.join("/"))
        }
        for (let x = x0; x < x1; x++) {
          assert.equal(!at(x, y0 - 1), faces.down, rows.join("/"))
          assert.equal(!at(x, y1), faces.up, rows.join("/"))
        }
      }
    }
  })

  test("exposed side lengths add up to the shape's perimeter", () => {
    for (const rows of SHAPES) {
      let total = 0
      for (const { from, to, faces } of boxesOf(rows)) {
        const across = to[0] - from[0]
        const tall = to[1] - from[1]
        total += (faces.west ? tall : 0) + (faces.east ? tall : 0) + (faces.down ? across : 0) + (faces.up ? across : 0)
      }
      assert.equal(total, perimeter(rows), rows.join("/"))
    }
  })
})

describe("boxFaces", () => {
  const whole = { from: [0, 0], to: [2, 3], faces: ALL_FACES, internal: { up: false, down: false } }

  test("emits one face per visible side with its kind", () => {
    const faces = boxFaces([whole], -1, 1)
    assert.deepEqual(faces.map(face => [face.name, face.kind]), [["front", "front"], ["back", "back"], ["west", "side"], ["east", "side"], ["down", "bottom"], ["up", "top"]])
  })

  test("skips culled faces", () => {
    const faces = boxFaces([{ ...whole, faces: { front: true, back: true, west: false, east: true, down: false, up: false } }], -1, 1)
    assert.deepEqual(faces.map(face => face.name), ["front", "back", "east"])
  })

  test("each quad spans its whole side on the right plane", () => {
    const expected = {
      front: [[0, 2], [0, 3], [-1, -1]],
      back: [[0, 2], [0, 3], [1, 1]],
      west: [[0, 0], [0, 3], [-1, 1]],
      east: [[2, 2], [0, 3], [-1, 1]],
      down: [[0, 2], [0, 0], [-1, 1]],
      up: [[0, 2], [3, 3], [-1, 1]]
    }
    for (const face of boxFaces([whole], -1, 1)) {
      assert.deepEqual(extents(face.points), expected[face.name], face.name)
      assert.equal(new Set(face.points.map(point => point.join())).size, 4, face.name)
    }
  })

  test("winding points every face outward", () => {
    const outward = { front: [0, 0, -1], back: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0], down: [0, -1, 0], up: [0, 1, 0] }
    for (const face of boxFaces([whole], -1, 1)) {
      const [x, y, z] = normal(face.points)
      const direction = outward[face.name]
      assert.ok(x * direction[0] + y * direction[1] + z * direction[2] > 0, face.name)
    }
  })

  test("only up and down can be internal", () => {
    const faces = boxFaces([{ ...whole, internal: { up: true, down: true } }], -1, 1)
    assert.deepEqual(faces.filter(face => face.internal).map(face => face.name), ["down", "up"])
  })

  test("faces own their points so one can be shifted alone", () => {
    const [first, second] = boxFaces([whole], -1, 1)
    first.points[0][0] += 10
    assert.equal(first.points[1][0], 0)
    assert.equal(second.points[0][0], 0)
  })

  test("a plus produces front and back plus its perimeter of sides", () => {
    const faces = boxFaces(boxesOf(["010", "111", "010"]), -1, 1)
    assert.equal(faces.filter(face => face.name === "front").length, 5)
    assert.equal(faces.filter(face => face.name === "back").length, 5)
    assert.equal(faces.filter(face => face.kind === "side" || face.kind === "top" || face.kind === "bottom").length, 12)
  })

  test("returns nothing for no boxes", () => {
    assert.deepEqual(boxFaces([], -1, 1), [])
  })
})
