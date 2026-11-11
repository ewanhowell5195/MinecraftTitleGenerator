import { titleCase } from "./names.js"
import { platform } from "./platform.js"

const FOLDER = "shapes"

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

export function isModelShape(shapes, id) {
  return id !== null && shapes.find(entry => entry.id === id)?.kind === "model"
}
