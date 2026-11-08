import assert from "node:assert/strict"
import { describe, test } from "node:test"
import opentype from "opentype.js"
import { parsedSheet } from "../src/lib/fontEditor.js"
import { fontFromOutlines, meshOutlines, parseFontFile } from "../src/lib/fontImport.js"
import { glyphMeshes, holeFill, meshFaces, outlineShell } from "../src/lib/meshGlyphs.js"

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
    const { faces } = meshFaces(mesh, { bottom: 0, height: 30, arc: { map: Array.from({ length: 30 }, (_, row) => row) } }, { bottom: 0, height: 30 }, 0, 6)
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
    const before = front(meshFaces(mesh, { bottom: 0, height: 30, arc: { map: plain } }, { bottom: 0, height: 30 }, 0, 6).faces)
    const after = front(meshFaces(mesh, { bottom: 0, height: map.length, arc: { map } }, { bottom: 0, height: 30 }, 0, 6).faces)
    const width = Math.max(...before.flatMap(face => face.points.map(point => point[0]))) - Math.min(...before.flatMap(face => face.points.map(point => point[0])))
    const covered = faces => faces.reduce((sum, face) => sum - area(face.points), 0)
    assert.ok(Math.abs(covered(after) - covered(before) - width * 20) < 1e-6)
    assert.equal(Math.max(...after.flatMap(face => face.points.map(point => point[1]))), 50)
  })

  test("a border grows round the letters, and the gap inside an O can be filled", async () => {
    const mesh = glyphMeshes(meshOutlines(await testFont(), { height: 30 })).o
    const { rings } = meshFaces(mesh, { bottom: 0, height: 30, arc: { map: Array.from({ length: 30 }, (_, row) => row) } }, { bottom: 0, height: 30 }, 0, 6)
    const thin = outlineShell([{ rings }], [1, 1], [1, 1], 4)
    assert.equal(thin.shapes[0].holes.length, 1)
    assert.ok(holeFill([{ shapes: thin.shapes }], -4).length > 0)
    const thick = outlineShell([{ rings }], [1, 1], [8, 8], 4)
    assert.equal(thick.shapes[0].holes.length, 0)
    const xs = thin.shapes[0].outer.map(point => point[0])
    const solid = rings[0].map(point => point[0])
    assert.ok(Math.abs(Math.min(...solid) - Math.min(...xs) - 1) < 0.02)
  })
})
