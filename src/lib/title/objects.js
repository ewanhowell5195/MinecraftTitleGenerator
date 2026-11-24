import { titleValues } from "../link/titleLines.js"
import { createObject } from "../settings/objects.js"

export const keepTexture = new WeakSet()

export const loadedFont = new WeakMap()

export function keptObject(values, id) {
  const object = createObject(values, id)
  keepTexture.add(object)
  return object
}

export function titleObjects(values) {
  const list = values.map(words => words.map(value => keptObject(value)))
  const objects = list.flat()
  for (const object of objects) {
    if (object.matchWidth !== null) object.matchWidth = list[object.matchWidth][0].id
  }
  return objects
}

export function readTitleObjects(data) {
  return titleObjects(titleValues(data))
}
