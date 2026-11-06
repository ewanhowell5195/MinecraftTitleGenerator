import { describe, test } from "node:test"
import assert from "node:assert/strict"
import * as THREE from "three"
import { composeVector, vectorTitle } from "../src/lib/vector.js"
import { mergedByFill, unionOf } from "../src/lib/vectorPaths.js"

const RED = [255, 0, 0]
const GREEN = [0, 255, 0]
const BLUE = [0, 0, 255]
const YELLOW = [255, 255, 0]

function clampUnit(value) {
  return Math.min(1, Math.max(0, value))
}

function close(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`)
}

function textureOf(width, height, pixel) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [red, green, blue, alpha = 255] = pixel(x, y)
      data.set([red, green, blue, alpha], (y * width + x) * 4)
    }
  }
  const image = { width, height, getContext: () => ({ getImageData: () => ({ data }) }) }
  return new THREE.CanvasTexture(image)
}

function meshOf(faces, material, z = 0) {
  const positions = []
  const uvs = []
  for (const { left, right, bottom, top, uv = [0, 0, 1, 1] } of faces) {
    const corners = [[left, bottom], [right, bottom], [right, top], [left, top]]
    const coords = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]]
    for (const index of [0, 1, 2, 0, 2, 3]) {
      positions.push(corners[index][0], corners[index][1], z)
      uvs.push(coords[index][0], coords[index][1])
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2))
  return new THREE.Mesh(geometry, material)
}

function whole(texture, options) {
  return meshOf([{ left: 0, right: 64, bottom: 0, top: 64 }], new THREE.MeshBasicMaterial({ map: texture, ...options }))
}

function plain(faces, color, options, z) {
  return meshOf(faces, new THREE.MeshBasicMaterial({ color, ...options }), z)
}

function titleOf(...meshes) {
  const scene = new THREE.Scene()
  for (const mesh of meshes) scene.add(mesh)
  scene.updateMatrixWorld(true)
  const camera = new THREE.OrthographicCamera(0, 64, 64, 0, 0.1, 100)
  camera.position.z = 10
  return vectorTitle(scene, camera, new THREE.Vector2(64, 64), 64)
}

function polygonsOf(d) {
  const polygons = []
  let x = 0
  let y = 0
  for (const [, command, values] of d.matchAll(/([MmLlHhVvZz])([^MmLlHhVvZz]*)/g)) {
    if (command === "z" || command === "Z") {
      x = polygons.at(-1)[0][0]
      y = polygons.at(-1)[0][1]
      continue
    }
    const numbers = Array.from(values.matchAll(/-?(?:\d+\.?\d*|\.\d+)/g), match => Number(match[0]))
    if (command === "h" || command === "v") {
      for (const value of numbers) {
        if (command === "h") x = Math.round((x + value) * 100) / 100
        else y = Math.round((y + value) * 100) / 100
        polygons.at(-1).push([x, y])
      }
      continue
    }
    for (let index = 0; index < numbers.length; index += 2) {
      const relative = command === command.toLowerCase()
      x = Math.round(((relative ? x : 0) + numbers[index]) * 100) / 100
      y = Math.round(((relative ? y : 0) + numbers[index + 1]) * 100) / 100
      if ((command === "M" || command === "m") && index === 0) polygons.push([])
      polygons.at(-1).push([x, y])
    }
  }
  return polygons
}

function pathsOf(markup) {
  return Array.from(markup.matchAll(/<path fill="([^"]+)" d="([^"]*)"\/>/g), ([, fill, d]) => ({ fill, polygons: polygonsOf(d) }))
}

function boundsOf(polygons) {
  const points = polygons.flat()
  return { left: Math.min(...points.map(point => point[0])), right: Math.max(...points.map(point => point[0])), top: Math.min(...points.map(point => point[1])), bottom: Math.max(...points.map(point => point[1])) }
}

function pathsFilled(markup, fill) {
  return pathsOf(markup).filter(path => path.fill === fill)
}

function polygonBounds(markup, fill) {
  return pathsFilled(markup, fill).flatMap(path => path.polygons).map(polygon => boundsOf([polygon]))
}

function gradientsOf(markup) {
  return Array.from(markup.matchAll(/<linearGradient id="([^"]+)" gradientUnits="userSpaceOnUse" x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)">(.*?)<\/linearGradient>/g), ([, id, x1, y1, x2, y2, stops]) => ({
    id,
    x1: Number(x1),
    y1: Number(y1),
    x2: Number(x2),
    y2: Number(y2),
    stops: Array.from(stops.matchAll(/offset="([^"]+)" stop-color="#(..)(..)(..)"/g), ([, offset, red, green, blue]) => ({ offset: Number(offset), colour: [red, green, blue].map(value => parseInt(value, 16)) }))
  }))
}

function colourAt({ stops }, offset) {
  if (offset <= stops[0].offset) return stops[0].colour
  for (let index = 1; index < stops.length; index++) {
    const from = stops[index - 1]
    const to = stops[index]
    if (offset <= to.offset) {
      const amount = to.offset > from.offset ? (offset - from.offset) / (to.offset - from.offset) : 1
      return from.colour.map((value, channel) => value + (to.colour[channel] - value) * amount)
    }
  }
  return stops.at(-1).colour
}

function verticalAt(gradient, y) {
  return colourAt(gradient, (y - gradient.y1) / (gradient.y2 - gradient.y1))
}

function signedArea(polygon) {
  return polygon.reduce((sum, [x, y], index) => {
    const [nextX, nextY] = polygon[(index + 1) % polygon.length]
    return sum + x * nextY - nextX * y
  }, 0) / 2
}

function bandsDown(height, bandRows, value) {
  return textureOf(8, height, (x, y) => [value(Math.floor(y / bandRows)), 0, 0])
}

describe("vectorTitle output", () => {
  test("is null for an empty scene", () => {
    assert.equal(titleOf(), null)
  })

  test("is null when the only texture is fully transparent", () => {
    assert.equal(titleOf(whole(textureOf(4, 4, () => [255, 0, 0, 0]))), null)
  })

  test("a flat texture is one solid quad", () => {
    const { width, height, markup } = titleOf(whole(textureOf(4, 4, () => [18, 52, 86])))
    assert.deepEqual([width, height], [64, 64])
    assert.ok(!markup.includes("linearGradient"))
    const paths = pathsOf(markup)
    assert.equal(paths.length, 1)
    assert.equal(paths[0].fill, "#123456")
    assert.deepEqual(boundsOf(paths[0].polygons), { left: 0, right: 64, top: 0, bottom: 64 })
  })

  test("an untextured mesh uses its material colour", () => {
    const paths = pathsOf(titleOf(plain([{ left: 0, right: 64, bottom: 0, top: 64 }], "#ff8000")).markup)
    assert.equal(paths[0].fill, "#ff8000")
  })

  test("the longest side of the title matches the resolution", () => {
    const scene = new THREE.Scene()
    scene.add(plain([{ left: -1, right: 1, bottom: -0.5, top: 0.5 }], "#ff0000"))
    scene.updateMatrixWorld(true)
    const camera = new THREE.OrthographicCamera(-1, 1, 0.5, -0.5, 0.1, 100)
    camera.position.z = 10
    const { width, height } = vectorTitle(scene, camera, new THREE.Vector2(200, 100), 64)
    assert.deepEqual([width, height], [64, 32])
  })

  test("uses the camera view size over the given size when a view is set", () => {
    const scene = new THREE.Scene()
    scene.add(plain([{ left: -1, right: 1, bottom: -1, top: 1 }], "#ff0000"))
    scene.updateMatrixWorld(true)
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
    camera.position.z = 10
    camera.setViewOffset(100, 50, 0, 0, 100, 50)
    const { width, height } = vectorTitle(scene, camera, new THREE.Vector2(1, 1), 64)
    assert.deepEqual([width, height], [64, 32])
  })
})

describe("vectorTitle faces", () => {
  const FLIPPED = [{ left: 64, right: 0, bottom: 0, top: 64 }]

  test("a face pointing away is culled", () => {
    assert.equal(titleOf(plain(FLIPPED, "#ff0000")), null)
  })

  test("a back side material shows a face pointing away and hides one facing", () => {
    assert.equal(pathsOf(titleOf(plain(FLIPPED, "#ff0000", { side: THREE.BackSide })).markup).length, 1)
    assert.equal(titleOf(plain([{ left: 0, right: 64, bottom: 0, top: 64 }], "#ff0000", { side: THREE.BackSide })), null)
  })

  test("a mirrored mesh keeps its facing", () => {
    const mesh = plain([{ left: -64, right: 0, bottom: 0, top: 64 }], "#ff0000")
    mesh.scale.x = -1
    assert.deepEqual(boundsOf(pathsOf(titleOf(mesh).markup)[0].polygons), { left: 0, right: 64, top: 0, bottom: 64 })
  })

  test("paints in render order", () => {
    const first = plain([{ left: 0, right: 64, bottom: 0, top: 64 }], "#ff0000", { depthWrite: false })
    const second = plain([{ left: 0, right: 64, bottom: 0, top: 64 }], "#0000ff", { depthWrite: false })
    first.renderOrder = 2
    second.renderOrder = 1
    assert.deepEqual(pathsOf(titleOf(first, second).markup).map(path => path.fill), ["#0000ff", "#ff0000"])
  })

  test("an earlier mesh hides what it covers on a later one", () => {
    const front = plain([{ left: 0, right: 32, bottom: 0, top: 64 }], "#ff0000", {}, 1)
    const rear = plain([{ left: 0, right: 64, bottom: 0, top: 64 }], "#0000ff", {}, 0)
    rear.renderOrder = 1
    const { markup } = titleOf(front, rear)
    assert.deepEqual(boundsOf(pathsFilled(markup, "#0000ff")[0].polygons), { left: 32, right: 64, top: 0, bottom: 64 })
    assert.deepEqual(boundsOf(pathsFilled(markup, "#ff0000")[0].polygons), { left: 0, right: 32, top: 0, bottom: 64 })
  })

  test("a fully covered mesh is left out", () => {
    const front = plain([{ left: 0, right: 64, bottom: 0, top: 64 }], "#ff0000", {}, 1)
    const rear = plain([{ left: 8, right: 32, bottom: 8, top: 32 }], "#0000ff", {}, 0)
    rear.renderOrder = 1
    assert.equal(pathsFilled(titleOf(front, rear).markup, "#0000ff").length, 0)
  })

  test("a mesh that does not write depth hides nothing", () => {
    const front = plain([{ left: 0, right: 32, bottom: 0, top: 64 }], "#ff0000", { depthWrite: false }, 1)
    const rear = plain([{ left: 0, right: 64, bottom: 0, top: 64 }], "#0000ff", {}, 0)
    rear.renderOrder = 1
    assert.deepEqual(boundsOf(pathsFilled(titleOf(front, rear).markup, "#0000ff")[0].polygons), { left: 0, right: 64, top: 0, bottom: 64 })
  })

  test("a colour masked mesh clips what is behind it without being painted", () => {
    const clip = plain([{ left: 0, right: 32, bottom: 0, top: 64 }], "#ff0000", { colorWrite: false }, 1)
    const rear = plain([{ left: 0, right: 64, bottom: 0, top: 64 }], "#0000ff", {}, 0)
    rear.renderOrder = 1
    const { width, height, markup } = titleOf(clip, rear)
    assert.equal(pathsFilled(markup, "#ff0000").length, 0)
    assert.deepEqual([width, height], [32, 64])
    assert.deepEqual(boundsOf(pathsFilled(markup, "#0000ff")[0].polygons), { left: 0, right: 32, top: 0, bottom: 64 })
  })

  test("holes in a texture are cut with opposite winding", () => {
    const texture = textureOf(4, 4, (x, y) => x > 0 && x < 3 && y > 0 && y < 3 ? [0, 0, 0, 0] : RED)
    const paths = pathsOf(titleOf(whole(texture)).markup)
    assert.equal(paths.length, 1)
    const [first, second] = paths[0].polygons
    assert.equal(paths[0].polygons.length, 2)
    assert.equal(Math.sign(signedArea(first)), -Math.sign(signedArea(second)))
    const areas = [Math.abs(signedArea(first)), Math.abs(signedArea(second))].sort((a, b) => a - b)
    assert.deepEqual(areas, [1024, 4096])
  })
})

describe("vectorTitle colours", () => {
  test("a vertical ramp is one vertical gradient that matches the texture", () => {
    const { markup } = titleOf(whole(textureOf(8, 64, (x, y) => [y * 4, 0, 0])))
    const gradients = gradientsOf(markup)
    assert.equal(gradients.length, 1)
    const [gradient] = gradients
    assert.equal(gradient.x1, gradient.x2)
    assert.deepEqual([gradient.y1, gradient.y2], [0, 64])
    for (let y = 0; y < 64; y++) close(verticalAt(gradient, y + 0.5)[0], y * 4, 2.5)
  })

  test("a horizontal ramp is one horizontal gradient", () => {
    const { markup } = titleOf(whole(textureOf(64, 8, x => [0, x * 4, 0])))
    const [gradient] = gradientsOf(markup)
    assert.equal(gradient.y1, gradient.y2)
    assert.deepEqual([gradient.x1, gradient.x2], [0, 64])
    assert.deepEqual(gradient.stops[0].colour, [0, 0, 0])
    assert.deepEqual(gradient.stops.at(-1).colour, [0, 252, 0])
  })

  test("two hard colours become a base and a layer", () => {
    const { markup } = titleOf(whole(textureOf(16, 16, (x, y) => y < 12 ? RED : BLUE)))
    assert.ok(!markup.includes("linearGradient"))
    const paths = pathsOf(markup)
    assert.deepEqual(paths.map(path => path.fill), ["#ff0000", "#0000ff"])
    assert.deepEqual(boundsOf(paths[1].polygons), { left: 0, right: 64, top: 48, bottom: 64 })
  })

  test("the base stops short of an outer edge a layer runs along", () => {
    const { markup } = titleOf(whole(textureOf(16, 16, (x, y) => y < 4 ? BLUE : RED)))
    assert.deepEqual(boundsOf(pathsFilled(markup, "#ff0000")[0].polygons), { left: 0, right: 64, top: 12, bottom: 64 })
    assert.deepEqual(boundsOf(pathsFilled(markup, "#0000ff")[0].polygons), { left: 0, right: 64, top: 0, bottom: 16 })
  })

  test("a base with gaps stops one texel under the shape around it", () => {
    const { markup } = titleOf(whole(textureOf(32, 32, (x, y) => {
      if (x < 2 || y < 2 || x >= 30 || y >= 30) return [0, 0, 0, 0]
      return x < 6 || y < 6 || x >= 26 || y >= 26 ? [0, 200, 0] : RED
    })))
    assert.deepEqual(boundsOf(pathsFilled(markup, "#ff0000")[0].polygons), { left: 6, right: 50, top: 6, bottom: 50 })
  })

  test("the part of an edge a later shape covers is simplified", () => {
    const stairs = [[8, 20, 60], [20, 32, 48], [32, 44, 60], [44, 56, 48]].map(([left, right, top]) => ({ left, right, bottom: 0, top }))
    const { markup } = titleOf(plain(stairs, 0x000000), plain([{ left: 0, right: 64, bottom: 24, top: 64 }], 0xff0000))
    const [black] = pathsFilled(markup, "#000000")[0].polygons
    assert.ok(black.length <= 6, `${black.length} points`)
    const { left, right, bottom } = boundsOf([black])
    assert.deepEqual({ left, right, bottom }, { left: 8, right: 56, bottom: 64 })
  })

  test("a base joins the same colour on another face when nothing lands between them", () => {
    const uv = (left, right) => [left / 64, 0, right / 64, 1]
    const texture = textureOf(64, 64, (x, y) => {
      if (x < 24) return x >= 8 && x < 16 && y >= 8 && y < 24 ? YELLOW : BLUE
      return x >= 40 && (x < 48 || y < 32) ? BLUE : RED
    })
    const faces = [{ left: 0, right: 24, bottom: 0, top: 64, uv: uv(0, 24) }, { left: 40, right: 64, bottom: 0, top: 64, uv: uv(40, 64) }]
    const { markup } = titleOf(meshOf(faces, new THREE.MeshBasicMaterial({ map: texture })))
    assert.equal(pathsFilled(markup, "#0000ff").length, 1)
  })

  test("a touching outline stops a colour extending along a side, not at a corner", () => {
    const { markup } = titleOf(whole(textureOf(16, 16, (x, y) => {
      if (x >= 8 && y >= 8) return [0, 200, 0]
      if (x < 8 && y >= 8) return [0, 170, 0]
      if (x < 8) return [0, 140, 0]
      return RED
    })))
    const [first] = pathsFilled(markup, "#00c800")[0].polygons
    assert.ok(first.length <= 6, `${first.length} points`)
  })

  test("faces of the colour of the mesh below join it", () => {
    const { markup } = titleOf(plain([{ left: 0, right: 64, bottom: 0, top: 64 }], 0x0000ff), plain([{ left: 8, right: 24, bottom: 8, top: 24 }], 0x0000ff), plain([{ left: 32, right: 48, bottom: 32, top: 48 }], 0xff0000))
    assert.equal(pathsFilled(markup, "#0000ff").length, 1)
  })

  test("a loop inside its own colour is left out", () => {
    const { markup } = titleOf(plain([{ left: 0, right: 64, bottom: 0, top: 64 }, { left: 16, right: 48, bottom: 16, top: 48 }], 0x0000ff))
    const polygons = pathsFilled(markup, "#0000ff").flatMap(path => path.polygons)
    assert.equal(polygons.length, 1)
    assert.equal(polygons[0].length, 4)
  })

  test("two overlapping loops of a colour keep everything they fill", () => {
    const { markup } = titleOf(plain([{ left: 0, right: 40, bottom: 0, top: 64 }, { left: 24, right: 64, bottom: 0, top: 64 }], 0x0000ff))
    assert.deepEqual(boundsOf(pathsFilled(markup, "#0000ff").flatMap(path => path.polygons)), { left: 0, right: 64, top: 0, bottom: 64 })
  })

  test("identical gradients on separate faces share one definition", () => {
    const uv = (left, right) => [left / 64, 0, right / 64, 1]
    const faces = [{ left: 0, right: 24, bottom: 0, top: 64, uv: uv(0, 24) }, { left: 40, right: 64, bottom: 0, top: 64, uv: uv(40, 64) }]
    const { markup } = titleOf(meshOf(faces, new THREE.MeshBasicMaterial({ map: textureOf(64, 64, (x, y) => [y * 4, 0, 0]) })))
    assert.equal(gradientsOf(markup).length, 1)
    assert.equal(pathsOf(markup).length, 1)
  })

  test("a block extends under a neighbour that only touches an earlier colour close to it", () => {
    const { markup } = titleOf(whole(textureOf(16, 16, (x, y) => {
      if (x < 6 && y >= 4 && y < 12) return [0, 180, 0]
      if (x >= 6 && x < 12 && y >= 4 && y < 12) return [0, 100, 0]
      return y < 4 && x < 12 ? [0, 190, 0] : [0, 60, 200]
    })))
    const [first] = pathsFilled(markup, "#00b400")[0].polygons
    assert.ok(first.length <= 6, `${first.length} points`)
  })

  test("a shape a later one covers completely is left out", () => {
    const { markup } = titleOf(plain([{ left: 16, right: 48, bottom: 16, top: 48 }], 0x0000ff), plain([{ left: 0, right: 64, bottom: 0, top: 64 }], 0xff0000))
    assert.equal(pathsFilled(markup, "#0000ff").length, 0)
  })

  test("a shape stays where a later one only partly covers it", () => {
    const { markup } = titleOf(plain([{ left: 16, right: 48, bottom: 16, top: 48 }], 0x0000ff), plain([{ left: 0, right: 32, bottom: 0, top: 64 }], 0xff0000))
    assert.equal(boundsOf(pathsFilled(markup, "#0000ff")[0].polygons).right, 48)
  })

  test("a dithered ramp inside a hard edged block is one gradient, not a shape per colour", () => {
    const { markup } = titleOf(whole(textureOf(32, 64, (x, y) => x >= 8 && x < 16 && y >= 16 && y < 48 ? [20, 40 + (y - 16) * 2 + x % 2, 80] : RED)))
    assert.equal(gradientsOf(markup).length, 1)
    assert.equal(pathsOf(markup).length, 2)
  })

  test("flat colours a level apart join the more common one", () => {
    const { markup } = titleOf(whole(textureOf(32, 32, (x, y) => {
      if (x >= 8 && x < 12 && y >= 8 && y < 16) return [20, 101, 80]
      return x >= 12 && x < 24 && y >= 8 && y < 16 ? [20, 100, 80] : RED
    })))
    assert.ok(!markup.includes("linearGradient"))
    assert.equal(pathsFilled(markup, "#146450").length, 1)
    assert.equal(pathsFilled(markup, "#146550").length, 0)
  })

  test("flat colours further apart than the merge stay apart", () => {
    const { markup } = titleOf(whole(textureOf(32, 32, (x, y) => {
      if (x >= 8 && x < 12 && y >= 8 && y < 16) return [20, 110, 80]
      return x >= 12 && x < 24 && y >= 8 && y < 16 ? [20, 100, 80] : RED
    })))
    assert.equal(pathsFilled(markup, "#146450").length, 1)
    assert.equal(pathsFilled(markup, "#146e50").length, 1)
  })

  test("a colour only runs under a diagonal neighbour to fill a corner", () => {
    const { markup } = titleOf(whole(textureOf(16, 16, (x, y) => {
      if (x >= 2 && x < 6 && y >= 6 && y < 14) return [0, 200, 0]
      if (x >= 6 && x < 10 && y >= 2 && y < 10) return [0, 170, 0]
      return RED
    })))
    const [first] = pathsFilled(markup, "#00aa00")[0].polygons
    assert.deepEqual(first.filter(([x]) => x < 24).map(([, y]) => y).sort((a, b) => a - b), [24, 40])
  })

  test("a lone texel beside a flat colour keeps its own colour", () => {
    const { markup } = titleOf(whole(textureOf(32, 32, (x, y) => {
      if (x === 12 && y === 12) return [24, 104, 84]
      return x >= 8 && x < 16 && y >= 8 && y < 16 ? [20, 100, 80] : RED
    })))
    assert.equal(pathsFilled(markup, "#186854").length, 1)
  })

  test("stepped pixels that do not ramp one way stay pixels", () => {
    const steps = [0, 2, 0, 2, 0, 2, 0, 2]
    const { markup } = titleOf(whole(textureOf(64, 64, (x, y) => x >= 16 && x < 32 && y >= 16 && y < 48 ? [20, 100 + steps[y >> 2 & 7], 80] : RED)))
    assert.ok(!markup.includes("linearGradient"))
  })

  test("a block of one colour is flat even when it fits along an axis", () => {
    const { markup } = titleOf(whole(textureOf(32, 32, (x, y) => x >= 8 && x < 24 && y >= 8 && y < 24 ? BLUE : RED)))
    assert.ok(!markup.includes("linearGradient"))
  })
})

describe("vectorTitle gradient smoothing", () => {
  test("vertical stepped bands become a smooth gradient", () => {
    const { markup } = titleOf(whole(bandsDown(64, 4, band => band * 8)))
    const gradients = gradientsOf(markup)
    assert.equal(gradients.length, 1)
    const { stops } = gradients[0]
    assert.ok(stops.length < 16, `${stops.length} stops`)
    for (let index = 1; index < stops.length; index++) {
      assert.ok(stops[index].offset > stops[index - 1].offset, "hard step in the gradient")
      assert.ok(stops[index].colour[0] >= stops[index - 1].colour[0], "gradient went backwards")
    }
    assert.equal(stops[0].colour[0], 0)
    assert.equal(stops.at(-1).colour[0], 120)
    for (let y = 0; y < 64; y++) close(verticalAt(gradients[0], y + 0.5)[0], Math.floor(y / 4) * 8, 8)
  })

  test("horizontal stepped bands keep their steps", () => {
    const { markup } = titleOf(whole(textureOf(64, 8, x => [Math.floor(x / 4) * 8, 0, 0])))
    assert.ok(!markup.includes("linearGradient"))
    assert.equal(new Set(pathsOf(markup).map(path => path.fill)).size, 16)
  })

  test("a smooth ramp is not treated as bands", () => {
    const { markup } = titleOf(whole(textureOf(8, 64, (x, y) => [y * 2, 0, 0])))
    const [gradient] = gradientsOf(markup)
    for (let y = 0; y < 64; y++) close(verticalAt(gradient, y + 0.5)[0], y * 2, 2.5)
  })

  test("a big jump stays a hard edge between two smoothed runs", () => {
    const value = band => band < 8 ? band * 8 : 180 + (band - 8) * 8
    const gradients = gradientsOf(titleOf(whole(bandsDown(64, 4, value))).markup)
    assert.equal(gradients.length, 2)
    const upper = gradients.find(gradient => gradient.stops[0].colour[0] < 100)
    const lower = gradients.find(gradient => gradient.stops[0].colour[0] > 100)
    assert.deepEqual([upper.y1, upper.y2], [0, 32])
    assert.deepEqual([lower.y1, lower.y2], [32, 64])
    assert.equal(upper.stops[0].colour[0], 0)
    assert.equal(upper.stops.at(-1).colour[0], 56)
    assert.equal(lower.stops[0].colour[0], 180)
    assert.equal(lower.stops.at(-1).colour[0], 236)
  })

  test("the peak of bands that turn around is not averaged away", () => {
    const value = band => band < 8 ? band * 8 : Math.max(0, (14 - band) * 8)
    const [gradient] = gradientsOf(titleOf(whole(bandsDown(64, 4, value))).markup)
    let peak = 0
    for (let y = 0; y < 64; y++) peak = Math.max(peak, verticalAt(gradient, y + 0.5)[0])
    assert.ok(peak >= 54, `peak ${peak}`)
  })

  test("stacked faces smooth across their seam", () => {
    const texture = bandsDown(64, 4, band => band * 8)
    const mesh = meshOf([{ left: 0, right: 64, bottom: 32, top: 64, uv: [0, 0.5, 1, 1] }, { left: 0, right: 64, bottom: 0, top: 32, uv: [0, 0, 1, 0.5] }], new THREE.MeshBasicMaterial({ map: texture }))
    const gradients = gradientsOf(titleOf(mesh).markup)
    assert.equal(gradients.length, 1)
    assert.deepEqual([gradients[0].y1, gradients[0].y2], [0, 64])
  })

  test("gradients of different colours on one axis stay apart", () => {
    const uv = (left, right) => [left / 64, 0, right / 64, 1]
    const texture = textureOf(64, 64, (x, y) => x < 24 ? [y * 4, 0, 0] : [0, y * 4, 0])
    const faces = [{ left: 0, right: 24, bottom: 0, top: 64, uv: uv(0, 24) }, { left: 40, right: 64, bottom: 0, top: 64, uv: uv(40, 64) }]
    assert.equal(gradientsOf(titleOf(meshOf(faces, new THREE.MeshBasicMaterial({ map: texture }))).markup).length, 2)
  })
})

describe("vectorTitle gradients it was told about", () => {
  const FACE = { left: 0, top: 0, right: 64, bottom: 64, from: [0, 0], to: [40, 20] }
  const LENGTH = Math.hypot(40, 20)
  const STOPS = [{ position: 0, colour: 0x000080 }, { position: 0.5, colour: 0x000080 }, { position: 0.5, colour: 0x00ff00 }, { position: 1, colour: 0x00ff00 }]

  function tAt(x, y) {
    return ((x + 0.5) * 40 + (y + 0.5) * 20) / LENGTH / LENGTH
  }

  function bands(x, y) {
    return tAt(x, y) < 0.5 ? [128, 0, 0] : [0, 255, 0]
  }

  function told(pixel, labels) {
    const texture = textureOf(64, 64, pixel)
    texture.userData.gradient = { faces: [{ ...FACE, stops: STOPS }] }
    if (labels) texture.userData.labels = labels
    return titleOf(whole(texture)).markup
  }

  function hardEdges(gradient) {
    return gradient.stops.filter((stop, index) => index && stop.offset === gradient.stops[index - 1].offset).length
  }

  function edgeOffsets(polygons) {
    const offsets = []
    for (const polygon of polygons) {
      for (const [x, y] of polygon) {
        if (x > 0 && x < 64 && y > 0 && y < 64) offsets.push((x * 40 + y * 20) / LENGTH / LENGTH)
      }
    }
    return offsets
  }

  test("cuts hard bands into two solid shapes along the known line", () => {
    const markup = told(bands)
    assert.equal(gradientsOf(markup).length, 0)
    const paths = pathsOf(markup)
    assert.equal(paths.length, 2)
    assert.deepEqual(paths.map(path => path.fill).sort(), ["#00ff00", "#800000"].sort())
    const inner = paths.flatMap(path => edgeOffsets(path.polygons))
    for (const offset of inner) close(offset, 0.5, 1e-3)
  })

  test("keeps details the gradient does not explain", () => {
    const dot = (x, y) => x >= 20 && x < 24 && y >= 4 && y < 8
    const markup = told((x, y) => dot(x, y) ? YELLOW : bands(x, y))
    assert.equal(gradientsOf(markup).length, 0)
    assert.equal(pathsFilled(markup, "#ffff00").length, 1)
  })

  test("cuts an overlay on the known band edges too", () => {
    const pixel = (x, y) => y < 8 ? tAt(x, y) < 0.5 ? YELLOW : RED : bands(x, y)
    const data = new Uint8Array(64 * 64 * 4)
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 64; x++) data[(y * 64 + x) * 4] = 1
    }
    const markup = told(pixel, () => data)
    assert.equal(gradientsOf(markup).length, 0)
    assert.equal(pathsFilled(markup, "#ffff00").length, 1)
    assert.equal(pathsFilled(markup, "#ff0000").length, 1)
  })

  test("two overlays with the same band colours paint as one shape per colour", () => {
    const overlay = (x, y) => y < 8 ? 1 : y >= 56 ? 2 : 0
    const data = new Uint8Array(64 * 64 * 4)
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) data[(y * 64 + x) * 4] = overlay(x, y)
    }
    const markup = told((x, y) => overlay(x, y) ? tAt(x, y) < 0.5 ? YELLOW : RED : bands(x, y), () => data)
    assert.equal(pathsFilled(markup, "#ffff00").length, 1)
    assert.equal(pathsFilled(markup, "#ff0000").length, 1)
  })

  test("overlays that disagree on a band colour stay apart", () => {
    const overlay = (x, y) => y < 8 ? 1 : y >= 56 ? 2 : 0
    const data = new Uint8Array(64 * 64 * 4)
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) data[(y * 64 + x) * 4] = overlay(x, y)
    }
    const markup = told((x, y) => overlay(x, y) === 1 ? tAt(x, y) < 0.5 ? YELLOW : RED : overlay(x, y) === 2 ? tAt(x, y) < 0.5 ? RED : YELLOW : bands(x, y), () => data)
    assert.ok(boundsOf(pathsFilled(markup, "#ff0000").flatMap(path => path.polygons)).bottom <= 16)
    assert.ok(boundsOf(pathsFilled(markup, "#ffff00").flatMap(path => path.polygons)).bottom > 56)
  })

  test("a known fade gets exact end colours despite dither, one gradient per colour", () => {
    const border = 0x101010
    const fadeAt = y => Math.min(1, (63.5 - y) / 48)
    const texture = textureOf(64, 64, (x, y) => {
      const colour = x < 32 ? [200, 100, 40] : [40, 180, 90]
      return colour.map(value => Math.round(value + (16 - value) * fadeAt(y)) + (x + y) % 2)
    })
    texture.userData.fades = [{ left: 0, top: 0, right: 64, bottom: 64, near: [0, 64], far: [0, 0], amount: 0.25, colour: border }]
    const gradients = gradientsOf(titleOf(whole(texture)).markup)
    assert.equal(gradients.length, 2)
    const firsts = gradients.map(gradient => gradient.stops[0].colour).sort((a, b) => b[0] - a[0])
    for (const [channel, value] of [200, 100, 40].entries()) close(firsts[0][channel], value, 2)
    for (const [channel, value] of [40, 180, 90].entries()) close(firsts[1][channel], value, 2)
    for (const gradient of gradients) assert.deepEqual(gradient.stops.at(-1).colour, [16, 16, 16])
  })

  test("a face only writes the part of a known gradient it reaches", () => {
    const stops = Array.from({ length: 33 }, (unused, index) => ({ position: index / 32, colour: index * 7 % 256 << 8 }))
    const colourAt = t => stops[Math.round(t * 32)].colour
    const texture = textureOf(64, 64, (x, y) => [0, colourAt((y + 0.5 + 256) / 640) >> 8, 0])
    texture.userData.gradient = { faces: [{ left: 0, top: 0, right: 64, bottom: 64, from: [0, -256], to: [0, 384], stops }] }
    const [gradient] = gradientsOf(titleOf(whole(texture)).markup)
    assert.ok(gradient.stops.length <= 8, `${gradient.stops.length} stops`)
  })

  test("a very large face with a known gradient exports", () => {
    const texture = textureOf(512, 512, (x, y) => [0, 0, y >> 1])
    texture.userData.gradient = { faces: [{ left: 0, top: 0, right: 512, bottom: 512, from: [0, 0], to: [0, 512], stops: [{ position: 0, colour: 0 }, { position: 1, colour: 0xff0000 }] }] }
    assert.equal(gradientsOf(titleOf(whole(texture)).markup).length, 1)
  })

  test("a gradient face can carry its own stops", () => {
    const texture = textureOf(64, 64, (x, y) => [0, 0, y * 4])
    texture.userData.gradient = { faces: [{ left: 0, top: 0, right: 64, bottom: 64, from: [0, 0], to: [0, 64], stops: [{ position: 0, colour: 0 }, { position: 1, colour: 0xff0000 }] }] }
    const [gradient] = gradientsOf(titleOf(whole(texture)).markup)
    assert.deepEqual(gradient.stops[0].colour, [0, 0, 0])
    assert.deepEqual(gradient.stops.at(-1).colour, [0, 0, 255])
  })

  test("a known gradient too faint to see is one flat colour", () => {
    const texture = textureOf(64, 64, (x, y) => [128 + Math.round(tAt(x, y)), 0, 0])
    texture.userData.gradient = { faces: [{ ...FACE, stops: [{ position: 0, colour: 0x000080 }, { position: 1, colour: 0x000081 }] }] }
    const { markup } = titleOf(whole(texture))
    assert.ok(!markup.includes("linearGradient"))
    assert.equal(pathsOf(markup).length, 1)
  })

  test("a known gradient on a line too short to see is one flat colour", () => {
    const texture = textureOf(64, 64, (x, y) => y < 16 ? [0, y * 17, 0] : RED)
    texture.userData.gradient = { faces: [{ left: 0, top: 0, right: 64, bottom: 16, from: [0, 0], to: [0, 16], stops: [{ position: 0, colour: 0 }, { position: 1, colour: 0x00ff00 }] }] }
    const mesh = meshOf([{ left: 0, right: 64, bottom: 63.9, top: 64, uv: [0, 48 / 64, 1, 1] }, { left: 0, right: 64, bottom: 0, top: 60, uv: [0, 0, 1, 48 / 64] }], new THREE.MeshBasicMaterial({ map: texture }))
    const { markup } = titleOf(mesh)
    assert.ok(!markup.includes("linearGradient"))
    assert.equal(pathsOf(markup).length, 2)
  })

  test("a shape on a partly hidden face is cut to what shows, with no clip path", () => {
    const texture = textureOf(64, 64, (x, y) => x >= 8 && x < 40 && y >= 8 && y < 56 ? BLUE : RED)
    const front = plain([{ left: 24, right: 64, bottom: 0, top: 64 }], "#00ff00", {}, 1)
    const rear = whole(texture)
    rear.renderOrder = 1
    const { markup } = titleOf(front, rear)
    assert.ok(!markup.includes("clipPath"))
    assert.deepEqual(boundsOf(pathsFilled(markup, "#0000ff")[0].polygons), { left: 8, right: 24, top: 8, bottom: 56 })
  })

  test("known gradients with the same stops share one list of them", () => {
    const faces = [{ left: 0, top: 0, right: 32, bottom: 64, from: [0, 0], to: [32, 16] }, { left: 32, top: 0, right: 64, bottom: 64, from: [32, 0], to: [64, 16] }]
    const stops = [{ position: 0, colour: 0 }, { position: 1, colour: 0x00ff00 }]
    const texture = textureOf(64, 64, (x, y) => {
      const { from, to } = faces[x < 32 ? 0 : 1]
      const dx = to[0] - from[0]
      const dy = to[1] - from[1]
      return [0, Math.round(clampUnit(((x + 0.5 - from[0]) * dx + (y + 0.5 - from[1]) * dy) / (dx * dx + dy * dy)) * 255), 0]
    })
    texture.userData.gradient = { faces: faces.map(face => ({ ...face, stops })) }
    const mesh = meshOf([{ left: 0, right: 32, bottom: 0, top: 64, uv: [0, 0, 0.5, 1] }, { left: 32, right: 64, bottom: 0, top: 64, uv: [0.5, 0, 1, 1] }], new THREE.MeshBasicMaterial({ map: texture }))
    const { markup } = titleOf(mesh)
    assert.equal(gradientsOf(markup).length, 1)
    assert.equal(markup.match(/xlink:href="#g\d+"/g).length, 1)
  })

  test("a smooth known gradient stays a gradient", () => {
    const texture = textureOf(64, 64, (x, y) => [0, Math.round(tAt(x, y) * 255), 0])
    texture.userData.gradient = { faces: [{ ...FACE, stops: [{ position: 0, colour: 0 }, { position: 1, colour: 0x00ff00 }] }] }
    const gradients = gradientsOf(titleOf(whole(texture)).markup)
    assert.equal(gradients.length, 1)
    assert.equal(hardEdges(gradients[0]), 0)
    close(Math.atan2(gradients[0].y2 - gradients[0].y1, gradients[0].x2 - gradients[0].x1), Math.atan2(20, 40), 0.01)
  })

  function layered(pixel, labelled) {
    const data = new Uint8Array(64 * 64 * 4)
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) data[(y * 64 + x) * 4] = labelled(x, y)
    }
    const texture = textureOf(64, 64, pixel)
    texture.userData.labels = () => data
    return pathsOf(titleOf(whole(texture)).markup).map(path => path.fill)
  }

  test("merges overlay pieces of one colour when nothing lands between them", () => {
    const left = x => x >= 4 && x < 10
    const right = x => x >= 40 && x < 46
    const dot = x => x >= 20 && x < 26
    const fills = layered((x, y) => y >= 10 && y < 20 && (left(x) || right(x)) ? RED : y >= 10 && y < 20 && dot(x) ? YELLOW : BLUE, (x, y) => y >= 10 && y < 20 && (left(x) || right(x)) ? 1 : y >= 10 && y < 20 && dot(x) ? 2 : 0)
    assert.equal(fills.filter(fill => fill === "#ff0000").length, 1)
  })

  test("keeps what is on top when a shape sits inside another colour", () => {
    const inner = (x, y) => x >= 20 && x < 30 && y >= 20 && y < 30
    const outer = (x, y) => x >= 10 && x < 40 && y >= 10 && y < 40
    const fills = layered((x, y) => inner(x, y) ? RED : outer(x, y) ? YELLOW : BLUE, (x, y) => inner(x, y) ? 2 : outer(x, y) ? 1 : 0)
    assert.ok(fills.indexOf("#ffff00") < fills.indexOf("#ff0000"))
  })

  test("falls back to tracing when the pixels are not that gradient", () => {
    const markup = told(() => BLUE)
    assert.equal(gradientsOf(markup).length, 0)
    assert.equal(pathsFilled(markup, "#0000ff").length, 1)
  })

  test("ignores a gradient for a different part of the texture", () => {
    const texture = textureOf(64, 64, bands)
    texture.userData.gradient = { faces: [{ ...FACE, left: 100, right: 164, stops: STOPS }] }
    const gradients = gradientsOf(titleOf(whole(texture)).markup)
    assert.ok(gradients.every(gradient => hardEdges(gradient) === 0))
  })
})

describe("vectorTitle letter fronts", () => {
  const FRONT = { left: 0, top: 0, right: 64, bottom: 64 }
  const uvOf = (left, right, bottom, top) => [left / 64, bottom / 64, right / 64, top / 64]
  const SPLIT = [{ left: 0, right: 32, bottom: 0, top: 64, uv: uvOf(0, 32, 0, 64) }, { left: 32, right: 64, bottom: 0, top: 64, uv: uvOf(32, 64, 0, 64) }]

  function split(pixel, panels) {
    const texture = textureOf(64, 64, pixel)
    if (panels) texture.userData.panels = panels
    return titleOf(meshOf(SPLIT, new THREE.MeshBasicMaterial({ map: texture }))).markup
  }

  const across = (x, y) => y >= 20 && y < 30 && x >= 20 && x < 44 ? RED : BLUE

  test("two rectangles of one front paint a colour crossing them as one island", () => {
    const red = pathsFilled(split(across, [FRONT]), "#ff0000")
    assert.equal(red.length, 1)
    assert.equal(red[0].polygons.length, 1)
    assert.equal(red[0].polygons[0].length, 4)
  })

  test("a front needs no extra pieces at the join", () => {
    const fronted = pathsOf(split(across, [FRONT])).flatMap(path => path.polygons).length
    const separate = pathsOf(split(across, null)).flatMap(path => path.polygons).length
    assert.ok(fronted < separate, `${fronted} polygons against ${separate}`)
  })

  test("a gap in the front stays a gap", () => {
    const pixel = (x, y) => x >= 28 && x < 36 && y >= 28 && y < 36 ? [0, 0, 0, 0] : BLUE
    const [blue] = pathsFilled(split(pixel, [FRONT]), "#0000ff")
    assert.equal(blue.polygons.length, 2)
  })

  test("a panel only paints the rectangles it is made of", () => {
    const uv = (left, right) => uvOf(left, right, 0, 64)
    const texture = textureOf(64, 64, (x, y) => x >= 24 && x < 40 ? RED : BLUE)
    texture.userData.panels = [FRONT]
    const faces = [{ left: 0, right: 24, bottom: 0, top: 64, uv: uv(0, 24) }, { left: 40, right: 64, bottom: 0, top: 64, uv: uv(40, 64) }]
    const { markup } = titleOf(meshOf(faces, new THREE.MeshBasicMaterial({ map: texture })))
    assert.equal(pathsFilled(markup, "#ff0000").length, 0)
    assert.equal(pathsFilled(markup, "#0000ff")[0].polygons.length, 2)
  })

  test("rectangles of a panel on different planes stay separate", () => {
    const texture = textureOf(64, 64, () => BLUE)
    texture.userData.panels = [FRONT]
    const mesh = meshOf([SPLIT[0], { ...SPLIT[1], left: 40, right: 72 }], new THREE.MeshBasicMaterial({ map: texture }))
    for (let vertex = 6; vertex < 12; vertex++) mesh.geometry.attributes.position.setZ(vertex, 1)
    const { markup, width } = titleOf(mesh)
    assert.equal(boundsOf(pathsFilled(markup, "#0000ff").flatMap(path => path.polygons)).right, width)
  })

  test("faces outside any front are left alone", () => {
    const red = pathsFilled(split(across, [{ left: 100, top: 100, right: 164, bottom: 164 }]), "#ff0000")
    assert.ok(red.flatMap(path => path.polygons).length >= 2)
  })
})

describe("unionOf", () => {
  const box = (left, top, right, bottom) => [[left, top], [right, top], [right, bottom], [left, bottom]]
  const signed = polygon => polygon.reduce((sum, [x, y], index) => sum + x * polygon[(index + 1) % polygon.length][1] - polygon[(index + 1) % polygon.length][0] * y, 0) / 2

  test("traces two overlapping boxes as one outline with their crossing as a corner", () => {
    const [loop, ...rest] = unionOf([box(0, 0, 100, 100), box(50, 50, 150, 150)])
    assert.equal(rest.length, 0)
    assert.equal(loop.length, 8)
    assert.equal(signed(loop), 17500)
    assert.ok(loop.some(([x, y]) => x === 100 && y === 50))
    assert.ok(loop.some(([x, y]) => x === 50 && y === 100))
  })

  test("removes a fold where a single loop crosses itself", () => {
    const fold = [[0, 0], [100, 0], [100, 60], [40, 60], [40, 20], [70, 20], [70, 100], [0, 100]]
    const loops = unionOf([fold])
    assert.equal(loops.length, 1)
    assert.ok(loops[0].every(([x, y]) => !(x === 40 && y === 20)))
    assert.ok(loops[0].every(([x, y]) => !(x === 40 && y === 60)))
  })

  test("drops a box inside another", () => {
    assert.deepEqual(unionOf([box(0, 0, 100, 100), box(20, 20, 40, 40)]).map(loop => loop.length), [4])
  })

  test("keeps a hole", () => {
    const loops = unionOf([box(0, 0, 100, 100), box(20, 20, 40, 40).toReversed()])
    assert.deepEqual(loops.map(signed).sort((a, b) => a - b), [-400, 10000])
  })

  test("joins boxes that share a side", () => {
    assert.deepEqual(unionOf([box(0, 0, 50, 100), box(50, 0, 100, 100)]).map(loop => loop.length), [4])
  })

  test("leaves separate boxes alone", () => {
    assert.equal(unionOf([box(0, 0, 100, 100), box(500, 500, 600, 600)]).length, 2)
  })
})

describe("mergedByFill", () => {
  const box = (left, top, right, bottom) => [[left, top], [right, top], [right, bottom], [left, bottom]]

  test("joins a colour across shapes it does not overlap", () => {
    const merged = mergedByFill([["red", [box(0, 0, 10, 10)]], ["blue", [box(20, 0, 30, 10)]], ["red", [box(40, 0, 50, 10)]]])
    assert.deepEqual(merged.map(([fill, polygons]) => [fill, polygons.length]).sort(), [["blue", 1], ["red", 2]])
  })

  test("keeps a shape above one it overlaps by a strip with its sides lined up", () => {
    const entries = [["red", [box(0, 0, 10, 12)]], ["blue", [box(0, 10, 10, 20)]], ["red", [box(0, 18, 10, 30)]]]
    assert.deepEqual(mergedByFill(entries).map(([fill]) => fill), ["red", "blue", "red"])
  })

  test("keeps a shape above one that exactly matches it", () => {
    const entries = [["red", [box(0, 0, 10, 10)]], ["blue", [box(0, 0, 10, 10)]], ["red", [box(0, 0, 10, 10)]]]
    assert.deepEqual(mergedByFill(entries).map(([fill]) => fill), ["red", "blue", "red"])
  })

  test("stacks new colours by how common they are, so a later overlap still joins", () => {
    const totals = new Map([["red", 100], ["blue", 50]])
    const entries = [["blue", [box(0, 0, 10, 10)]], ["red", [box(20, 0, 30, 10)]], ["red", [box(40, 0, 50, 10)]], ["blue", [box(40, 0, 50, 10)]]]
    assert.deepEqual(mergedByFill(entries, totals).map(([fill]) => fill), ["red", "blue"])
  })

  test("moves a colour up to join its later shape when that one has to stay on top", () => {
    const entries = [["red", [box(0, 0, 10, 10)]], ["blue", [box(20, 0, 30, 10)]], ["red", [box(20, 0, 30, 10)]]]
    assert.deepEqual(mergedByFill(entries).map(([fill, polygons]) => [fill, polygons.length]), [["blue", 1], ["red", 2]])
  })

  test("lets shapes that only touch join", () => {
    const merged = mergedByFill([["red", [box(0, 0, 10, 10)]], ["blue", [box(10, 0, 20, 10)]], ["red", [box(20, 0, 30, 10)]]])
    assert.deepEqual(merged.map(([fill]) => fill).sort(), ["blue", "red"])
  })
})

describe("vectorTitle joins", () => {
  const LEFT = { left: 0, right: 32, bottom: 0, top: 64, uv: [0, 0, 0.5, 1] }
  const RIGHT = { left: 32, right: 64, bottom: 0, top: 64, uv: [0.5, 0, 1, 1] }

  function titleOfTwo(pixel) {
    return titleOf(meshOf([LEFT, RIGHT], new THREE.MeshBasicMaterial({ map: textureOf(16, 16, pixel) })))
  }

  function stripe(left, right) {
    return (x, y) => y >= 6 && y < 10 ? x < 8 ? left : right : RED
  }

  test("a bleed stroke runs under the seam between two colours", () => {
    const { markup } = titleOfTwo(x => x < 8 ? RED : GREEN)
    assert.match(markup, /<clipPath id="c0">/)
    assert.match(markup, /<g clip-path="url\(#c0\)" stroke-width="0.13">/)
    const strokes = Array.from(markup.matchAll(/<path fill="none" stroke="([^"]+)" d="([^"]*)"\/>/g))
    assert.equal(strokes.length, 1)
    assert.equal(strokes[0][2], "M32 0l0 64")
  })

  test("faces of the same colour need no bleed stroke", () => {
    assert.ok(!titleOfTwo(() => RED).markup.includes("stroke"))
  })

  test("faces with a gap between them need no bleed stroke", () => {
    const mesh = meshOf([{ ...LEFT, right: 30 }, { ...RIGHT, left: 34 }], new THREE.MeshBasicMaterial({ map: textureOf(16, 16, x => x < 8 ? RED : GREEN) }))
    assert.ok(!titleOf(mesh).markup.includes("stroke"))
  })

  test("a stripe running across a seam is bridged from both sides", () => {
    const blue = polygonBounds(titleOfTwo(stripe(BLUE, BLUE)).markup, "#0000ff")
    for (const x of [28.5, 32, 35.5]) assert.ok(blue.some(box => box.left <= x && box.right >= x && box.top <= 25 && box.bottom >= 39), `nothing covers the seam at ${x}`)
  })

  test("touching shapes of one colour join into one island", () => {
    const mesh = plain([{ left: 0, right: 10, bottom: 0, top: 10 }, { left: 10, right: 20, bottom: 2, top: 8 }, { left: 40, right: 50, bottom: 0, top: 10 }], 0xff0000)
    const [{ polygons }] = pathsOf(titleOf(mesh).markup)
    assert.deepEqual(polygons.map(polygon => polygon.length).sort(), [4, 8])
  })

  test("a stripe ending at a plain neighbour is covered back by that neighbour", () => {
    const { markup } = titleOfTwo((x, y) => x < 8 ? y >= 6 && y < 10 ? BLUE : RED : GREEN)
    const paths = pathsOf(markup)
    const reach = paths.findIndex(path => path.fill === "#0000ff" && path.polygons.some(polygon => {
      const box = boundsOf([polygon])
      return box.left === 30 && box.right === 34
    }))
    const cover = paths.findLastIndex(path => path.fill === "#00ff00" && path.polygons.some(polygon => {
      const box = boundsOf([polygon])
      return box.left === 32 && box.right === 36 && box.top === 25 && box.bottom === 39
    }))
    assert.ok(reach >= 0, "the stripe reaches over the seam")
    assert.ok(cover > reach, "the neighbour paints back over it")
  })

  test("stripes of different colours overlap under the later face", () => {
    const { markup } = titleOfTwo(stripe(BLUE, YELLOW))
    const paths = pathsOf(markup)
    assert.ok(polygonBounds(markup, "#0000ff").some(box => box.left === 0 && box.right === 36 && box.top === 24 && box.bottom === 40), "the earlier stripe runs under")
    for (const box of polygonBounds(markup, "#ffff00")) assert.ok(box.left >= 32, `yellow reaches ${box.left}`)
    const lastBlue = paths.findLastIndex(path => path.fill === "#0000ff")
    const firstYellow = paths.findIndex(path => path.fill === "#ffff00")
    assert.ok(firstYellow > lastBlue, "the later stripe paints on top")
  })
})

describe("composeVector", () => {
  const TITLE = { width: 1000, height: 500, markup: "<path/>" }

  function placement(svg) {
    const [, x, y, scale] = svg.match(/<g transform="translate\((\S+) (\S+)\) scale\((\S+)\)">/)
    return [x, y, scale].map(Number)
  }

  function sizeOf(svg) {
    const [, width, height, viewWidth, viewHeight] = svg.match(/<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)">/)
    assert.deepEqual([width, height], [viewWidth, viewHeight])
    return [Number(width), Number(height)]
  }

  test("declares the xlink namespace only when the title uses it", () => {
    assert.ok(!composeVector(TITLE, { tab: "normal", padding: 0 }).includes("xmlns:xlink"))
    assert.ok(composeVector({ ...TITLE, markup: '<linearGradient id="g1" xlink:href="#g0"/>' }, { tab: "normal", padding: 0 }).includes('xmlns:xlink="http://www.w3.org/1999/xlink"'))
  })

  test("normal without padding is the title at full size", () => {
    const svg = composeVector(TITLE, { tab: "normal", padding: 0 })
    assert.deepEqual(sizeOf(svg), [1000, 500])
    assert.ok(!svg.includes("<g transform"))
    assert.ok(svg.includes("<path/>"))
    assert.ok(!svg.includes("<rect"))
  })

  test("normal padding keeps the longest side", () => {
    const svg = composeVector(TITLE, { tab: "normal", padding: 10 })
    assert.deepEqual(sizeOf(svg), [1000, 510])
    assert.deepEqual(placement(svg), [10, 10, 0.98])
  })

  test("normal padding is limited to what the title can spare", () => {
    const svg = composeVector({ width: 100, height: 100, markup: "" }, { tab: "normal", padding: 1000 })
    assert.deepEqual(sizeOf(svg), [100, 100])
    assert.deepEqual(placement(svg), [49, 49, 0.02])
  })

  test("square centres the title", () => {
    const svg = composeVector(TITLE, { tab: "square", padding: 0 })
    assert.deepEqual(sizeOf(svg), [1000, 1000])
    assert.deepEqual(placement(svg), [0, 250, 1])
  })

  test("custom fits the title inside the size", () => {
    const svg = composeVector(TITLE, { tab: "custom", width: 800, height: 800, padding: 0 })
    assert.deepEqual(sizeOf(svg), [800, 800])
    assert.deepEqual(placement(svg), [0, 200, 0.8])
  })

  test("custom padding insets the title", () => {
    assert.deepEqual(placement(composeVector(TITLE, { tab: "custom", width: 800, height: 800, padding: 50 })), [50, 225, 0.7])
  })

  test("custom padding is limited by the shortest side", () => {
    assert.deepEqual(placement(composeVector(TITLE, { tab: "custom", width: 100, height: 50, padding: 1000 })), [48, 24, 0.004])
  })

  test("a background fills the output behind the title", () => {
    const svg = composeVector(TITLE, { tab: "normal", padding: 0, backgroundEnabled: true, backgroundAngle: 0, backgroundStops: [{ colour: "#78b8ff", position: 0 }], backgroundSmooth: true })
    assert.match(svg, /<rect width="1000" height="500" fill="url\(#background\)"\/>/)
    assert.match(svg, /<linearGradient id="background" gradientUnits="userSpaceOnUse" x1="500" y1="0" x2="500" y2="500"><stop offset="0" stop-color="#78b8ff"\/><\/linearGradient>/)
    assert.ok(svg.indexOf("<rect") < svg.indexOf("<path/>"))
  })

  test("the background angle turns the gradient line", () => {
    const svg = composeVector(TITLE, { tab: "normal", padding: 0, backgroundEnabled: true, backgroundAngle: 90, backgroundStops: [{ colour: "#78b8ff", position: 0 }], backgroundSmooth: true })
    assert.match(svg, /x1="1000" y1="250" x2="0" y2="250"/)
  })

  test("unsmoothed background stops stay hard", () => {
    const svg = composeVector(TITLE, { tab: "normal", padding: 0, backgroundEnabled: true, backgroundAngle: 0, backgroundStops: [{ colour: "#ff0000", position: 0 }, { colour: "#0000ff", position: 50 }], backgroundSmooth: false })
    const stops = Array.from(svg.matchAll(/<stop offset="([^"]+)" stop-color="([^"]+)"\/>/g), ([, offset, colour]) => [offset, colour])
    assert.deepEqual(stops, [["0", "#ff0000"], ["0.5", "#ff0000"], ["0.5", "#0000ff"], ["1", "#0000ff"]])
  })
})
