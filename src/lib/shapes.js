import { round } from "./maths.js"
import { titleCase } from "./names.js"
import { platform } from "./platform.js"

const FOLDER = "shapes"
export const SHAPE_TEXTURE = "default"
export const CUSTOM_SHAPE = "custom"
export const FALLBACK_SHAPE = "minecraft-ten-blank"
export const SILHOUETTE_TEXT = "x"
export const MINECRAFT_SCALE = 2.5
export const MODEL_BASELINE = 2
const MINECRAFT = "minecraft."

function multiplied(a, b) {
  return a.map(row => [0, 1, 2].map(column => row.reduce((sum, value, index) => sum + value * b[index][column], 0)))
}

function rotationMatrix({ x = 0, y = 0, z = 0, rescale = false }) {
  const [cx, sx, cy, sy, cz, sz] = [x, y, z].flatMap(angle => [Math.cos(angle * Math.PI / 180), Math.sin(angle * Math.PI / 180)])
  const matrix = multiplied([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]], multiplied([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], [[1, 0, 0], [0, cx, -sx], [0, sx, cx]]))
  if (!rescale) return matrix
  const scale = [0, 1, 2].map(column => 1 / Math.max(...matrix.map(row => Math.abs(row[column]))))
  return matrix.map(row => row.map((value, column) => value * scale[column]))
}

export function rotated(point, rotation) {
  if (!rotation) return point
  const matrix = rotationMatrix(rotation)
  const offset = point.map((value, axis) => value - rotation.origin[axis])
  return matrix.map((row, axis) => row.reduce((sum, value, index) => sum + value * offset[index], 0) + rotation.origin[axis])
}

export function elementCorners({ from, to, rotation }) {
  return Array.from({ length: 8 }, (_, corner) => rotated([0, 1, 2].map(axis => corner >> axis & 1 ? to[axis] : from[axis]), rotation))
}

export function modelHeight(model) {
  return Math.ceil(round(Math.max(...model.elements.flatMap(element => elementCorners(element).map(point => point[1]))), 3)) + MODEL_BASELINE
}

export async function loadShapeList() {
  const response = await platform.fetch(`${FOLDER}/shapes.json`)
  if (!response.ok) throw new Error(`failed to load ${FOLDER}/shapes.json`)
  return (await response.json()).map(entry => ({ ...entry, name: entry.name ?? titleCase(entry.id), folder: `${FOLDER}/${entry.id}` }))
}

export function shapeOf(shapes, id) {
  const shape = shapes.find(entry => entry.id === id)
  if (!shape) throw new Error(`there is no shape called ${id}`)
  return shape
}

export function loadKey(object) {
  if (object.shape == null) return object.font
  if (object.shape === CUSTOM_SHAPE) return [CUSTOM_SHAPE, object.customFont?.data, JSON.stringify(object.customFont?.strips)].join()
  return [object.shape, object.shapeVersion, JSON.stringify(object.blockState), JSON.stringify(object.itemComponents)].join()
}

export function isMinecraftShape(id) {
  return typeof id === "string" && id.startsWith(MINECRAFT)
}

export function minecraftShape(kind, id) {
  return `${MINECRAFT}${kind}.${id}`
}

export function minecraftShapeParts(shape) {
  const [kind, id] = shape.slice(MINECRAFT.length).split(".")
  if (kind !== "block" && kind !== "item" || !id) throw new Error(`${shape} is not a Minecraft block or item`)
  return { kind, id }
}

export function shapeName(shapes, id) {
  if (id === CUSTOM_SHAPE) return "Custom Shape"
  if (isMinecraftShape(id)) return titleCase(minecraftShapeParts(id).id)
  return shapes.find(entry => entry.id === id)?.name ?? id
}

export function isModelShape(shapes, id) {
  return isMinecraftShape(id) || id !== null && shapes.find(entry => entry.id === id)?.kind === "model"
}
