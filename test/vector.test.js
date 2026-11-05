import { describe, test } from "node:test"
import assert from "node:assert/strict"
import * as THREE from "three"
import { composeVector, vectorTitle } from "../src/lib/vector.js"

const RED = [255, 0, 0]
const GREEN = [0, 255, 0]
const BLUE = [0, 0, 255]
const YELLOW = [255, 255, 0]

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
  return d.split("Z").filter(Boolean).map(part => part.slice(1).split("L").map(point => point.split(" ").map(Number)))
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
    assert.deepEqual(boundsOf(pathsFilled(markup, "#ff0000")[0].polygons), { left: 0, right: 64, top: 4, bottom: 64 })
    assert.deepEqual(boundsOf(pathsFilled(markup, "#0000ff")[0].polygons), { left: 0, right: 64, top: 0, bottom: 16 })
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
    assert.equal(gradients.length, 2)
    const upper = gradients.find(gradient => gradient.y1 === 0)
    const lower = gradients.find(gradient => gradient.y1 === 32)
    close(upper.stops.at(-1).colour[0], lower.stops[0].colour[0], 4)
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
    assert.equal(strokes[0][2], "M32 0L32 64")
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
    assert.ok(blue.some(box => box.left === 30 && box.right === 36 && box.top === 25 && box.bottom === 39), "bridge from the left face")
    assert.ok(blue.some(box => box.left === 28 && box.right === 34 && box.top === 25 && box.bottom === 39), "bridge from the right face")
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
    assert.ok(polygonBounds(markup, "#0000ff").some(box => box.left === 32 && box.right === 36 && box.top === 25 && box.bottom === 39), "the earlier stripe runs under")
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

  test("normal without padding is the title at full size", () => {
    const svg = composeVector(TITLE, { tab: "normal", padding: 0 })
    assert.deepEqual(sizeOf(svg), [1000, 500])
    assert.deepEqual(placement(svg), [0, 0, 1])
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
    assert.ok(svg.indexOf("<rect") < svg.indexOf("<g transform"))
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
