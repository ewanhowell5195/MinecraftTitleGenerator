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

export function modelHeight(model) {
  return Math.ceil(Math.max(...model.elements.flatMap(element => [element.from[1], element.to[1]])))
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
