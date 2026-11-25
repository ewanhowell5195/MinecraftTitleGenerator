import * as THREE from "three"
import { vectorTitle } from "#render/vector/title.js"

export const RED = [255, 0, 0]
export const GREEN = [0, 255, 0]
export const BLUE = [0, 0, 255]
export const YELLOW = [255, 255, 0]

export function textureOf(width, height, pixel) {
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

export function meshOf(faces, material, z = 0) {
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

export function whole(texture, options) {
  return meshOf([{ left: 0, right: 64, bottom: 0, top: 64 }], new THREE.MeshBasicMaterial({ map: texture, ...options }))
}

export function plain(faces, color, options, z) {
  return meshOf(faces, new THREE.MeshBasicMaterial({ color, ...options }), z)
}

export function titleOf(...meshes) {
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

export function pathsOf(markup) {
  return Array.from(markup.matchAll(/<path fill="([^"]+)" d="([^"]*)"\/>/g), ([, fill, d]) => ({ fill, polygons: polygonsOf(d) }))
}

export function boundsOf(polygons) {
  const points = polygons.flat()
  return { left: Math.min(...points.map(point => point[0])), right: Math.max(...points.map(point => point[0])), top: Math.min(...points.map(point => point[1])), bottom: Math.max(...points.map(point => point[1])) }
}

export function pathsFilled(markup, fill) {
  return pathsOf(markup).filter(path => path.fill === fill)
}

export function gradientsOf(markup) {
  return Array.from(markup.matchAll(/<linearGradient id="([^"]+)" gradientUnits="userSpaceOnUse" x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)">(.*?)<\/linearGradient>/g), ([, id, x1, y1, x2, y2, stops]) => ({
    id,
    x1: Number(x1),
    y1: Number(y1),
    x2: Number(x2),
    y2: Number(y2),
    stops: Array.from(stops.matchAll(/offset="([^"]+)" stop-color="#(..)(..)(..)"/g), ([, offset, red, green, blue]) => ({ offset: Number(offset), colour: [red, green, blue].map(value => parseInt(value, 16)) }))
  }))
}

export function colourAt({ stops }, offset) {
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

export function verticalAt(gradient, y) {
  return colourAt(gradient, (y - gradient.y1) / (gradient.y2 - gradient.y1))
}
