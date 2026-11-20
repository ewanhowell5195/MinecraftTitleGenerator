import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import { describe, test } from "node:test"
import opentype from "opentype.js"
import { parsedSheet } from "../../src/lib/font/editor/sheet.js"
import { fontFromOutlines, meshOutlines, parseFontFile } from "../../src/lib/font/fontImport.js"
import { generatedAlpha } from "../../src/lib/texture/overlays/faces.js"
import { fillSpans } from "../../src/lib/font/fontOutline.js"
import { fineMasks, glyphMeshes, holeFill, meshFaces, outlineShell } from "../../src/lib/font/meshGlyphs.js"
import { faceLimits, ringWalls } from "../../src/lib/geometry/meshFaces.js"

function area(points) {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length]
    sum += points[i][0] * next[1] - next[0] * points[i][1]
  }
  return sum / 2
}

function ring(path, points, curved) {
  path.moveTo(...points[0])
  for (let i = 1; i <= points.length; i++) {
    const to = points[i % points.length]
    if (curved) {
      const from = points[i - 1]
      path.quadraticCurveTo(from[0] + (to[0] - from[0]) / 2 + (to[1] - from[1]) * 0.3, from[1] + (to[1] - from[1]) / 2 - (to[0] - from[0]) * 0.3, ...to)
    } else path.lineTo(...to)
  }
  path.close()
}

function glyph(char, rings) {
  const path = new opentype.Path()
  for (const [points, curved] of rings) ring(path, points, curved)
  return new opentype.Glyph({ name: char, unicode: char.codePointAt(0), advanceWidth: 800, path })
}

async function testFont() {
  const notdef = new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: new opentype.Path() })
  const square = [[100, 0], [100, 700], [600, 700], [600, 0]]
  const ringed = [[[100, 0], [100, 700], [600, 700], [600, 0]], false]
  const hole = [[[250, 200], [450, 200], [450, 500], [250, 500]], false]
  const glyphs = [notdef, glyph("H", [[square, false]]), glyph("O", [ringed, hole]), glyph("C", [[[[150, 50], [150, 650], [550, 650], [550, 50]], true]]), glyph("X", [[square, false], [[[300, -50], [300, 750], [400, 750], [400, -50]], false]])]
  const built = new opentype.Font({ familyName: "Mesh", styleName: "Regular", unitsPerEm: 1000, ascender: 800, descender: -200, glyphs })
  return parseFontFile(built.toArrayBuffer())
}

function roundFont() {
  const round = new opentype.Path()
  round.moveTo(650, 350)
  round.quadraticCurveTo(650, 650, 350, 650)
  round.quadraticCurveTo(50, 650, 50, 350)
  round.quadraticCurveTo(50, 50, 350, 50)
  round.quadraticCurveTo(650, 50, 650, 350)
  round.close()
  const notdef = new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: new opentype.Path() })
  return opentype.parse(new opentype.Font({ familyName: "Round", styleName: "Regular", unitsPerEm: 1000, ascender: 800, descender: -200, glyphs: [notdef, glyph("H", [[[[100, 0], [100, 700], [600, 700], [600, 0]], false]]), new opentype.Glyph({ name: "Q", unicode: 81, advanceWidth: 800, path: round })] }).toArrayBuffer())
}

function inside(contours, x, y) {
  let winding = 0
  for (const points of contours) {
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i]
      const [x1, y1] = points[(i + 1) % points.length]
      const side = (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0)
      if (y0 <= y && y1 > y && side > 0) winding++
      else if (y0 > y && y1 <= y && side < 0) winding--
    }
  }
  return winding !== 0
}

describe("mesh glyphs", () => {
  test("outlines sit on the same pixels as the imported cubes", async () => {
    const source = await testFont()
    const outlines = meshOutlines(source, { height: 30 })
    const { list } = parsedSheet(fontFromOutlines(source, { height: 30 }), 2)
    for (const cell of list.filter(item => outlines[item.char] && item.width)) {
      for (let row = 0; row < cell.height; row++) {
        for (let column = 0; column < cell.width; column++) assert.equal(inside(outlines[cell.char], column + 0.5, cell.bottom + row + 0.5), cell.mask[row * cell.width + column] === 1, `${cell.char} ${column},${row}`)
      }
    }
  })

  test("with bigger squares, each square's centre sits inside the outline exactly when the square is filled", async () => {
    const source = await testFont()
    const outlines = meshOutlines(source, { height: 32, density: 4 })
    const font = fontFromOutlines(source, { height: 32, density: 4 })
    assert.equal(font.grid, 4)
    const { list } = parsedSheet(font, 2)
    for (const cell of list.filter(item => outlines[item.char] && item.width)) {
      for (let row = 0; row < cell.height; row += 4) {
        for (let column = 0; column < cell.width; column += 4) assert.equal(inside(outlines[cell.char], column + 2, cell.bottom + row + 2), cell.mask[(row + 2) * cell.width + column + 2] === 1, `${cell.char} ${column},${row}`)
      }
    }
  })

  test("triangles cover the outline exactly, facing the same way", async () => {
    const meshes = glyphMeshes(meshOutlines(await testFont(), { height: 30 }))
    for (const [char, mesh] of Object.entries(meshes)) {
      const outline = mesh.shapes.reduce((sum, shape) => sum - area(shape.outer) - shape.holes.reduce((total, hole) => total + area(hole), 0), 0)
      const covered = mesh.triangles.reduce((sum, triangle) => sum - area(triangle), 0)
      assert.ok(Math.abs(outline - covered) < 1e-6, char)
      assert.ok(mesh.triangles.every(triangle => area(triangle) <= 0), char)
    }
    assert.equal(meshes.o.shapes[0].holes.length, 1)
  })

  test("overlapping contours become one solid with no inner walls", async () => {
    const mesh = glyphMeshes(meshOutlines(await testFont(), { height: 30 })).x
    assert.equal(mesh.shapes.length, 1)
    assert.equal(mesh.shapes[0].holes.length, 0)
  })

  test("faces wind like the cube faces: front clockwise, back the other way, walls facing out", async () => {
    const mesh = glyphMeshes(meshOutlines(await testFont(), { height: 30 })).h
    const { faces } = meshFaces(mesh, { bottom: 0, height: 30, arc: { map: Array.from({ length: 30 }, (_, row) => row) } }, { bottom: 0, height: 30 }, 0, 6, 3)
    assert.ok(faces.filter(face => face.kind === "front").every(face => area(face.points) < 0 && face.points.every(point => point[2] === -3)))
    assert.ok(faces.filter(face => face.kind === "back").every(face => area(face.points) > 0 && face.points.every(point => point[2] === 3)))
    const kinds = new Set(faces.map(face => `${face.kind}:${face.name}`))
    assert.deepEqual(Array.from(kinds).sort(), ["back:back", "bottom:down", "front:front", "side:east", "side:west", "top:up"])
  })

  test("an arc stretches the marked rows of the mesh and nothing else", async () => {
    const mesh = glyphMeshes(meshOutlines(await testFont(), { height: 30 })).h
    const plain = Array.from({ length: 30 }, (_, row) => row)
    const map = plain.flatMap(row => row >= 10 && row < 20 ? [row, row, row] : [row])
    const front = faces => faces.filter(face => face.kind === "front")
    const before = front(meshFaces(mesh, { bottom: 0, height: 30, arc: { map: plain } }, { bottom: 0, height: 30 }, 0, 6, 3).faces)
    const after = front(meshFaces(mesh, { bottom: 0, height: map.length, arc: { map } }, { bottom: 0, height: 30 }, 0, 6, 3).faces)
    const width = Math.max(...before.flatMap(face => face.points.map(point => point[0]))) - Math.min(...before.flatMap(face => face.points.map(point => point[0])))
    const covered = faces => faces.reduce((sum, face) => sum - area(face.points), 0)
    assert.ok(Math.abs(covered(after) - covered(before) - width * 20) < 1e-6)
    assert.equal(Math.max(...after.flatMap(face => face.points.map(point => point[1]))), 50)
  })

  test("a fine mask at one sample per pixel is the cube glyph", async () => {
    const source = await testFont()
    const meshes = glyphMeshes(meshOutlines(source, { height: 30 }))
    const { list } = parsedSheet(fontFromOutlines(source, { height: 30 }), 2)
    for (const cell of list.filter(item => meshes[item.char] && item.width)) {
      assert.deepEqual(Array.from(fineMasks(meshes[cell.char], cell, cell)(1)), Array.from(cell.mask), cell.char)
    }
  })

  test("top and bottom faces follow a curve for a tenth of the cap height", async () => {
    const mesh = glyphMeshes(meshOutlines(await testFont(), { height: 30 })).c
    const { faces } = meshFaces(mesh, { bottom: 0, height: 30, arc: { map: Array.from({ length: 30 }, (_, row) => row) } }, { bottom: 0, height: 30 }, 0, 6, 3)
    const tops = faces.filter(face => face.kind === "top" && !face.internal).map(face => Math.min(...face.points.map(point => point[1])))
    const bottoms = faces.filter(face => face.kind === "bottom" && !face.internal).map(face => Math.max(...face.points.map(point => point[1])))
    assert.ok(tops.every(y => y >= 30 - 3) && tops.some(y => y < 30 - 1))
    assert.ok(bottoms.every(y => y <= 3) && bottoms.some(y => y > 1))
    assert.ok(faces.filter(face => face.kind !== "side" && face.kind !== "front" && face.kind !== "back").every(face => {
      const [p, , , q] = face.points
      return Math.abs(q[1] - p[1]) <= Math.abs(q[0] - p[0]) + 1e-9
    }))
  })

  test("walls only share a run with neighbours of the same kind", async () => {
    const mesh = glyphMeshes(meshOutlines(await testFont(), { height: 30 })).c
    const { faces } = meshFaces(mesh, { bottom: 0, height: 30, arc: { map: Array.from({ length: 30 }, (_, row) => row) } }, { bottom: 0, height: 30 }, 0, 6, 3)
    const walls = faces.filter(face => face.kind !== "front" && face.kind !== "back")
    const runs = new Set(walls.map(face => face.run))
    assert.ok(runs.size < walls.length)
    for (const run of runs) {
      const members = walls.filter(face => face.run === run)
      assert.equal(new Set(members.map(face => `${face.kind}:${face.name}:${face.internal}`)).size, 1)
    }
  })

  test("a smooth outline overlay reaches the letter's edge and fades on its inner side", async () => {
    const source = await testFont()
    const mesh = glyphMeshes(meshOutlines(source, { height: 30 })).c
    const cell = parsedSheet(fontFromOutlines(source, { height: 30 }), 2).list.find(item => item.char === "c")
    const fine = fineMasks(mesh, cell, cell)
    const alpha = generatedAlpha({ ...cell, placedX: 0, fine }, "outline", {}, 30, 4)
    const solid = fine(4)
    const near = fine.distance(4, 8)
    const columns = cell.width * 4
    const rows = cell.height * 4
    const value = (column, row) => alpha[(rows - 1 - row) * columns + column]
    assert.ok(alpha.some(level => level > 0 && level < 1))
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        if (solid[row * columns + column]) continue
        const touching = []
        for (let y = Math.max(0, row - 1); y <= Math.min(rows - 1, row + 1); y++) {
          for (let x = Math.max(0, column - 1); x <= Math.min(columns - 1, column + 1); x++) if (solid[y * columns + x]) touching.push(value(x, y))
        }
        assert.equal(value(column, row), Math.max(0, ...touching))
        if (near[row * columns + column] < 0.5) assert.equal(value(column, row), 1)
      }
    }
  })

  test("corner dots go on the outline's corners, not along its curves", async () => {
    function dots(source, char) {
      const meshes = glyphMeshes(meshOutlines(source, { height: 30 }))
      const cell = parsedSheet(fontFromOutlines(source, { height: 30 }), 2).list.find(item => item.char === char)
      const fine = fineMasks(meshes[char], cell, cell)
      return { corners: fine.corners().length, alpha: generatedAlpha({ ...cell, placedX: 0, fine }, "corners", {}, 30, 4) }
    }
    const source = await testFont()
    assert.equal(dots(source, "h").corners, 4)
    assert.equal(dots(source, "o").corners, 4)
    assert.equal(dots(source, "c").corners, 4)
    assert.ok(dots(source, "h").alpha.some(value => value > 0))
    assert.equal(dots(roundFont(), "q").corners, 0)
    assert.ok(dots(roundFont(), "q").alpha.every(value => value === 0))
  })

  test("a curve's top and bottom edge runs cover just its top and bottom faces", () => {
    const source = roundFont()
    const mesh = glyphMeshes(meshOutlines(source, { height: 30 })).q
    const cell = parsedSheet(fontFromOutlines(source, { height: 30 }), 2).list.find(item => item.char === "q")
    const fine = fineMasks(mesh, cell, cell, 3)
    const { faces } = meshFaces(mesh, cell, cell, 0, 6, 3)
    for (const [side, kind] of [["up", "top"], ["down", "bottom"]]) {
      const xs = faces.filter(face => face.kind === kind && !face.internal).flatMap(face => face.points.map(point => point[0]))
      const runs = fine.edgeRuns(side)
      assert.equal(runs.length, 1, side)
      assert.ok(Math.abs(runs[0][0] - Math.min(...xs)) < 1e-9 && Math.abs(runs[0][1] - Math.max(...xs)) < 1e-9, side)
      assert.ok(faces.some(face => face.kind === kind && face.internal), side)
    }
  })

  test("a square's top and bottom edge runs cover its whole width", async () => {
    const source = await testFont()
    const mesh = glyphMeshes(meshOutlines(source, { height: 30 })).h
    const cell = parsedSheet(fontFromOutlines(source, { height: 30 }), 2).list.find(item => item.char === "h")
    const fine = fineMasks(mesh, cell, cell, 3)
    const xs = meshFaces(mesh, cell, cell, 0, 6, 3).rings.flat().map(point => point[0])
    for (const side of ["up", "down"]) assert.deepEqual(fine.edgeRuns(side).map(run => run.map(value => Math.round(value * 100) / 100)), [[Math.min(...xs), Math.max(...xs)].map(value => Math.round(value * 100) / 100)], side)
  })

  test("with the curve fade on, a steeper wall still counts as a bottom face so the fade can run past the old limit", () => {
    const ring = [[0, 30], [20, 30], [20, 24], [0, 0]]
    const kinds = limits => ringWalls(ring, 0, 1, 30, 0, 30, limits).map(face => face.kind)
    assert.deepEqual(kinds(faceLimits()), ["top", "side", "side", "side"])
    assert.deepEqual(kinds(faceLimits({ faded: true })), ["top", "side", "bottom", "side"])
  })

  test("a steep wall above the band is a side, and with sides and the curve fade on so is one past where the fade starts", () => {
    const ring = [[0, 30], [20, 30], [20, 24], [0, 0]]
    const walls = (limits, points = ring) => ringWalls(points, 0, 1, 30, 0, 10, limits).map(face => [face.kind, face.internal])
    assert.deepEqual(walls(faceLimits({ faded: true }))[2], ["side", false])
    assert.deepEqual(walls(faceLimits({ faded: true, sides: true }))[2], ["side", false])
    const gentle = [[0, 30], [20, 30], [20, 24], [0, 24 - 20 * Math.tan(Math.PI / 6)]]
    assert.deepEqual(walls(faceLimits({ faded: true, angle: 30 }), gentle)[2], ["bottom", true])
    assert.deepEqual(walls(faceLimits({ faded: true, angle: 30, sides: true }), gentle)[2], ["side", false])
    const ledge = [[0, 30], [20, 30], [20, 0], [10, 0], [10, 20], [0, 20]]
    assert.deepEqual(ringWalls(ledge, 0, 1, 30, 0, 10, faceLimits({ faded: true, sides: true })).map(face => [face.kind, face.internal]).at(-2), ["bottom", true])
  })

  test("the face angle and height settings move where top and bottom faces stop", () => {
    const ring = [[0, 30], [20, 30], [20, 24], [0, 0]]
    const kinds = (limits, reach = 30) => ringWalls(ring, 0, 1, 30, 0, reach, limits).map(face => [face.kind, face.internal])
    assert.deepEqual(kinds(faceLimits())[2], ["side", false])
    assert.deepEqual(kinds(faceLimits({ angle: 55 }))[2], ["bottom", false])
    assert.deepEqual(kinds(faceLimits({ angle: 55 }), 20)[2], ["side", false])
    const faded = faceLimits({ faded: true, angle: 30 })
    assert.ok(Math.abs(faded.fadeFrom - Math.PI / 12) < 1e-9 && Math.abs(faded.slope - Math.PI / 4) < 1e-9)
  })

  test("a side highlight on a hole is an ellipse that thins smoothly into the sides", () => {
    const cell = { bottom: 0, height: 40, width: 40 }
    const from = Math.cos(Math.PI / 6)
    for (const [size, points, thickness, scale] of [[10, 96, 3, 8], [2.5, 36, 2, 16]]) {
      const hole = Array.from({ length: points }, (_, at) => [20 + size * Math.cos(at / points * Math.PI * 2), 20 + size * Math.sin(at / points * Math.PI * 2)])
      const fine = fineMasks({ shapes: [{ outer: [[0, 40], [40, 40], [40, 0], [0, 0]], holes: [hole] }] }, cell, cell, 3)
      const alpha = fine.toward(scale, 0, -1, from, (thickness + 2) * scale, distance => Math.min(1, Math.max(0, thickness * scale - distance + 0.5)), thickness * scale)
      for (let row = 15 * scale; row < 40 * scale; row++) {
        for (let column = 0; column < 40 * scale; column++) if (alpha[row * 40 * scale + column] > 0.5) assert.ok(Math.abs((column + 0.5) / scale - 20) < size + 0.1, `${size}: ${column}`)
      }
      function band(degrees) {
        const angle = degrees * Math.PI / 180
        let reach = 0
        for (let radius = size + 0.2; radius < size + thickness + 1; radius += 0.02) {
          if (alpha[Math.floor((20 + radius * Math.sin(angle)) * scale) * 40 * scale + Math.floor((20 + radius * Math.cos(angle)) * scale)] <= 0.5) break
          reach = radius - size
        }
        return reach
      }
      const values = Array.from({ length: 91 }, (_, at) => band(90 - at))
      for (let index = 1; index < values.length; index++) assert.ok(values[index] <= values[index - 1] + 0.25 && values[index - 1] - values[index] < 0.25, `${size}: ${values}`)
      assert.ok(values[0] > thickness - 0.1 && values.at(-1) < 0.1, `${size}: ${values}`)
    }
  })

  test("a side highlight on a short flat between steep walls narrows along the walls' lines", () => {
    const cell = { bottom: 0, height: 30, width: 40 }
    const outer = [[0, 30], [40, 30], [40, 2], [24, 2], [22, 8], [18, 8], [16, 2], [0, 2]]
    const fine = fineMasks({ shapes: [{ outer, holes: [] }] }, cell, cell, 3)
    const scale = 8
    const alpha = fine.toward(scale, 0, -1, 0.9, 5 * scale, (distance, toward) => toward > 0.9 ? Math.min(1, Math.max(0, 3 * scale - distance + 0.5)) : 0, 3 * scale)
    const at = (x, y) => alpha[Math.floor(y * scale) * 40 * scale + Math.floor(x * scale)]
    for (const y of [8.5, 9.5, 10.5]) {
      const edge = 16 + (y - 2) / 3
      assert.ok(at(edge - 0.3, y) === 0 && at(edge + 0.3, y) === 1, `${y}`)
      assert.ok(at(40 - edge + 0.3, y) === 0 && at(40 - edge - 0.3, y) === 1, `${y}`)
    }
  })

  test("a side highlight stays off a 30 degree wall next to a flat", () => {
    const cell = { bottom: 0, height: 30, width: 40 }
    const drop = 10 * Math.tan(Math.PI / 6)
    const outer = [[0, 30], [40, 30], [40, 8], [34, 8], [30, 8 - drop], [20, 8], [14, 8], [8, 2], [0, 2]]
    const fine = fineMasks({ shapes: [{ outer, holes: [] }] }, cell, cell, 3)
    const scale = 8
    const from = Math.cos(Math.PI / 6)
    const alpha = fine.toward(scale, 0, -1, from, 5 * scale, (distance, toward) => toward > from + 1e-3 ? Math.min(1, Math.max(0, 3 * scale - distance + 0.5)) : 0, 3 * scale)
    const at = (x, y) => alpha[Math.floor(y * scale) * 40 * scale + Math.floor(x * scale)]
    assert.equal(at(17, 9), 1)
    for (const x of [22, 24, 26]) assert.equal(at(x, 8 - (x - 20) * Math.tan(Math.PI / 6) + 0.5), 0, `${x}`)
  })

  test("side highlights on the shape test font match the recorded output", async () => {
    const file = fs.readFileSync(new URL("../fixtures/ShapeTest.otf", import.meta.url))
    const source = await parseFontFile(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))
    const meshes = glyphMeshes(meshOutlines(source, { height: 40 }))
    const { list } = parsedSheet(fontFromOutlines(source, { height: 40 }), 2)
    const digests = {}
    for (const cell of list.filter(item => meshes[item.char] && item.char !== item.char.toLowerCase())) {
      const fine = fineMasks(meshes[cell.char], cell, cell)
      for (const kind of ["top", "bottom", "left", "right"]) {
        for (const thickness of [1, 3, 5]) {
          const alpha = generatedAlpha({ ...cell, placedX: 0, fine }, kind, { thickness }, 40, 8)
          digests[`${cell.char} ${kind} ${thickness}`] = createHash("sha1").update(Uint8Array.from(alpha, value => Math.round(value * 255))).digest("hex").slice(0, 16)
        }
      }
    }
    const recorded = new URL("../fixtures/shape-test-highlights.json", import.meta.url)
    if (process.env.UPDATE_FIXTURES) fs.writeFileSync(recorded, JSON.stringify(digests, null, 2) + "\n")
    const expected = JSON.parse(fs.readFileSync(recorded, "utf8"))
    assert.deepEqual(Object.keys(digests).filter(key => digests[key] !== expected[key]), [])
    assert.deepEqual(Object.keys(digests), Object.keys(expected))
  })

  test("the distance band comes to a point at an inward corner instead of rounding off", () => {
    const cell = { bottom: 0, height: 20, width: 20 }
    const notched = [[0, 20], [6, 20], [10, 10], [14, 20], [20, 20], [20, 0], [0, 0]]
    const fine = fineMasks({ shapes: [{ outer: notched, holes: [] }] }, cell, cell, 3)
    const distance = fine.distance(1, 8)
    const below = distance[6 * 20 + 9]
    assert.ok(below < 0.6 * Math.hypot(0.5, 3.5), `${below}`)
    assert.ok(Math.abs(distance[6 * 20 + 1] - 1.5) < 1e-6)
  })

  test("bottom faces split by a step keep separate edge runs", () => {
    const cell = { bottom: 0, height: 30, width: 20 }
    const stepped = [[0, 30], [10, 30], [20, 30], [20, 2], [10, 2], [10, 0], [0, 0]]
    for (const start of [0, 1, 3, 5]) {
      const outer = stepped.slice(start).concat(stepped.slice(0, start))
      const fine = fineMasks({ shapes: [{ outer, holes: [] }] }, cell, cell, 3)
      assert.deepEqual(fine.edgeRuns("down"), [[0, 10], [10, 20]], `starting at ${start}`)
      assert.deepEqual(fine.edgeRuns("up"), [[0, 20]], `starting at ${start}`)
    }
  })

  test("a border grows round the letters, and the gap inside an O can be filled", async () => {
    const mesh = glyphMeshes(meshOutlines(await testFont(), { height: 30 })).o
    const { rings } = meshFaces(mesh, { bottom: 0, height: 30, arc: { map: Array.from({ length: 30 }, (_, row) => row) } }, { bottom: 0, height: 30 }, 0, 6, 3)
    const thin = outlineShell([{ rings }], [1, 1], [1, 1], 4)
    assert.equal(thin.shapes[0].holes.length, 1)
    assert.ok(holeFill([{ shapes: thin.shapes }], -4).length > 0)
    const thick = outlineShell([{ rings }], [1, 1], [8, 8], 4)
    assert.equal(thick.shapes[0].holes.length, 0)
    const xs = thin.shapes[0].outer.map(point => point[0])
    const solid = rings[0].map(point => point[0])
    assert.ok(Math.abs(Math.min(...solid) - Math.min(...xs) - 1) < 0.02)
  })

  test("a border grows round a long line of curved letters", async () => {
    const mesh = glyphMeshes(meshOutlines(await testFont(), { height: 30 })).c
    const rings = Array.from({ length: 80 }, (_, index) => meshFaces(mesh, { bottom: 0, height: 30 }, { bottom: 0, height: 30 }, index * 30, 6, 3).rings).flat()
    const shell = outlineShell([{ rings }], [1, 1], [2, 2], 4)
    assert.equal(shell.shapes.length, 80)
    assert.equal(shell.sizes.reduce((sum, size) => sum + size, 0) * 3, shell.positions.length)
  })
})

describe("fillSpans", () => {
  const square = [[1, 0, 1, 4], [1, 4, 5, 4], [5, 4, 5, 0], [5, 0, 1, 0]]

  test("fills the pixels whose centres are inside the outline", () => {
    assert.deepEqual(fillSpans(square, 0.5), [[1, 5]])
    assert.deepEqual(fillSpans(square.map(([x0, y0, x1, y1]) => [x0 + 0.4, y0, x1 + 0.4, y1]), 0.5), [[1, 5]])
    assert.deepEqual(fillSpans(square.map(([x0, y0, x1, y1]) => [x0 + 0.6, y0, x1 + 0.6, y1]), 0.5), [[2, 6]])
  })

  test("a row on the top edge is outside and one on the bottom edge is inside", () => {
    assert.deepEqual(fillSpans(square, 4), [])
    assert.deepEqual(fillSpans(square, 0), [[1, 5]])
  })

  test("spans come back in pixels of the scale asked for", () => {
    assert.deepEqual(fillSpans(square, 0.5, 4), [[4, 20]])
  })

  test("a hole wound the other way is left empty", () => {
    const hole = [[2, 1, 4, 1], [4, 1, 4, 3], [4, 3, 2, 3], [2, 3, 2, 1]]
    assert.deepEqual(fillSpans(square.concat(hole), 1.5).filter(([from, to]) => to > from), [[1, 2], [4, 5]])
  })
})
