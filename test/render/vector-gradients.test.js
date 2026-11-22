import { describe, test } from "node:test"
import assert from "node:assert/strict"
import * as THREE from "three"
import { close } from "../helpers/assert.js"
import { BLUE, GREEN, RED, YELLOW, boundsOf, colourAt, gradientsOf, meshOf, pathsFilled, pathsOf, plain, textureOf, titleOf, verticalAt, whole } from "../helpers/vector.js"

function insidePolygon(points, x, y) {
  let inside = false
  for (let index = 0, last = points.length - 1; index < points.length; last = index++) {
    const [ax, ay] = points[index]
    const [bx, by] = points[last]
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside
  }
  return inside
}

function clampUnit(value) {
  return Math.min(1, Math.max(0, value))
}

function bandsDown(height, bandRows, value) {
  return textureOf(8, height, (x, y) => [value(Math.floor(y / bandRows)), 0, 0])
}

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

  test("side by side faces whose gradients differ by a few shades share one gradient", () => {
    const texture = textureOf(64, 64, (x, y) => [y * 3 + (x >= 32 ? 5 : 0), 40, 80])
    const mesh = meshOf([{ left: 0, right: 32, bottom: 0, top: 64, uv: [0, 0, 0.5, 1] }, { left: 32, right: 64, bottom: 0, top: 64, uv: [0.5, 0, 1, 1] }], new THREE.MeshBasicMaterial({ map: texture }))
    assert.equal(gradientsOf(titleOf(mesh).markup).length, 1)
  })

  test("an overlay's stepped bands become a gradient too", () => {
    const ring = (x, y) => x >= 4 && x < 60 && y >= 4 && y < 60 && !(x >= 6 && x < 58 && y >= 6 && y < 58)
    const data = new Uint8Array(64 * 64 * 4)
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) if (ring(x, y)) data[(y * 64 + x) * 4] = 1
    }
    const texture = textureOf(64, 64, (x, y) => ring(x, y) ? [255, 160 + Math.floor(y / 4) * 5, 0] : [0, 0, y * 4])
    texture.userData.labels = () => data
    const markup = titleOf(whole(texture)).markup
    assert.equal(pathsOf(markup).filter(path => !path.fill.startsWith("url")).length, 0)
    assert.equal(gradientsOf(markup).length, 2)
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
    assert.deepEqual(paths.map(path => path.fill), ["#800000", "#00ff00"])
    const inner = edgeOffsets(paths[1].polygons)
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

  test("a known fade at half opacity ends halfway to the outline colour", () => {
    const border = 0x101010
    const fadeAt = y => Math.min(1, (63.5 - y) / 48) / 2
    const texture = textureOf(64, 64, (x, y) => [200, 100, 40].map(value => Math.round(value + (16 - value) * fadeAt(y)) + (x + y) % 2))
    texture.userData.fades = [{ left: 0, top: 0, right: 64, bottom: 64, near: [0, 64], far: [0, 0], amount: 0.25, opacity: 0.5, colour: border }]
    const [gradient] = gradientsOf(titleOf(whole(texture)).markup)
    for (const [channel, value] of [200, 100, 40].entries()) close(gradient.stops[0].colour[channel], value, 2)
    for (const [channel, value] of [108, 58, 28].entries()) close(gradient.stops.at(-1).colour[channel], value, 2)
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

  test("a crack is drawn from its exact triangle, not traced from its pixels", () => {
    const corners = [[10, 10], [50, 10], [30, 50]]
    const inside = (x, y) => {
      const side = (p, q) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0])
      const sides = [side(corners[0], corners[1]), side(corners[1], corners[2]), side(corners[2], corners[0])]
      return sides.every(value => value >= 0) || sides.every(value => value <= 0)
    }
    const data = new Uint8Array(64 * 64 * 4)
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) if (inside(x + 0.5, y + 0.5)) data[(y * 64 + x) * 4 + 2] = 1
    }
    const texture = textureOf(64, 64, (x, y) => inside(x + 0.5, y + 0.5) ? RED : BLUE)
    texture.userData.labels = () => data
    texture.userData.crackShapes = () => new Map([[16, { shape: [corners], tones: [] }]])
    const red = pathsOf(titleOf(whole(texture)).markup).filter(path => path.fill === "#ff0000")
    assert.equal(red.length, 1)
    assert.deepEqual(red[0].polygons.map(polygon => polygon.length), [3])
  })

  test("an exact shape covering most of a face is still drawn exactly, and its blended edge is not traced", () => {
    const corners = [[0, 0], [64, 0], [64, 40], [32, 48], [0, 40]]
    const edge = x => 40 + 8 * (1 - Math.abs(x - 32) / 32)
    const data = new Uint8Array(64 * 64 * 4)
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) if (y + 0.5 < edge(x + 0.5)) data[(y * 64 + x) * 4 + 2] = 1
    }
    const texture = textureOf(64, 64, (x, y) => y + 0.5 < edge(x + 0.5) ? RED : y + 0.5 < edge(x + 0.5) + 2 ? [128, 0, 128] : BLUE)
    texture.userData.labels = () => data
    texture.userData.crackShapes = () => new Map([[16, { shape: [corners], tones: [] }]])
    const paths = pathsOf(titleOf(whole(texture)).markup)
    assert.deepEqual(Array.from(new Set(paths.map(path => path.fill))).sort(), ["#0000ff", "#ff0000"])
    assert.deepEqual(paths.filter(path => path.fill === "#ff0000").flatMap(path => path.polygons).map(polygon => polygon.length), [5])
  })

  test("an exact shape leaves a hole for another exact shape inside it", () => {
    const top = (x, y) => y < 40
    const stripe = (x, y) => x >= 20 && x < 30
    const data = new Uint8Array(64 * 64 * 4)
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) data[(y * 64 + x) * 4 + 2] = (top(x, y) ? 1 : 0) | (stripe(x, y) ? 2 : 0)
    }
    const texture = textureOf(64, 64, (x, y) => stripe(x, y) ? GREEN : top(x, y) ? RED : BLUE)
    texture.userData.labels = () => data
    texture.userData.crackShapes = () => new Map([[16, { shape: [[[0, 0], [64, 0], [64, 40], [0, 40]]], tones: [] }], [17, { shape: [[[20, 0], [30, 0], [30, 64], [20, 64]]], tones: [] }]])
    const paths = pathsOf(titleOf(whole(texture)).markup)
    const red = paths.filter(path => path.fill === "#ff0000").flatMap(path => path.polygons)
    assert.ok(red.length)
    assert.ok(!red.some(polygon => insidePolygon(polygon, 25, 20)))
  })

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
