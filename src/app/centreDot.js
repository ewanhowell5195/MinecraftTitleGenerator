import { current, currentWord } from "../lib/state/scene.js"
import { centreAt, heldCentre } from "../render/centreGuide.js"

export { heldCentre, holdCentre } from "../render/centreGuide.js"

export function centrePoint(entries) {
  const held = heldCentre.value
  if (!held) return null
  const object = held.word ? currentWord.value : current.value
  const entry = object && entries.get(object.id)
  return entry ? centreAt(held, object, entry.built, entry.group.matrixWorld, entry.base) : null
}
