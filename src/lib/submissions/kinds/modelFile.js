import { jsonText } from "#lib/core/jsonText.js"
import { MINECRAFT_SCALE, MODEL_BASELINE, elementCorners } from "#lib/geometry/shapes.js"

export const MODEL_LIMITS = { elements: 1000, reach: 100 }

const SIDES = ["north", "south", "east", "west", "up", "down"]
const AXES = ["x", "y", "z"]
const FACE_TURNS = [0, 90, 180, 270]

function numbers(value, length) {
  return Array.isArray(value) && value.length === length && value.every(Number.isFinite)
}

function inReach(point) {
  return point.every(value => Math.abs(value) <= MODEL_LIMITS.reach)
}

function defaultUv(side, [x1, y1, z1], [x2, y2, z2]) {
  if (side === "north") return [16 - x2, 16 - y2, 16 - x1, 16 - y1]
  if (side === "south") return [x1, 16 - y2, x2, 16 - y1]
  if (side === "east") return [16 - z2, 16 - y2, 16 - z1, 16 - y1]
  if (side === "west") return [z1, 16 - y2, z2, 16 - y1]
  if (side === "up") return [x1, z1, x2, z2]
  return [x1, 16 - z2, x2, 16 - z1]
}

function spriteOf(entry) {
  if (typeof entry === "string") return entry
  return entry && typeof entry === "object" && typeof entry.sprite === "string" ? entry.sprite : null
}

function textureOf(textures, reference) {
  let value = reference
  for (let depth = 0; depth < 16 && value.startsWith("#"); depth++) {
    const next = spriteOf(textures[value.slice(1)])
    if (next === null) return value
    value = next
  }
  return value.replace(/^minecraft:/, "")
}

function cleanRotation(rotation, index) {
  if (rotation === undefined || rotation === null) return null
  const invalid = new Error(`Element ${index + 1} has a rotation that isn't valid.`)
  if (typeof rotation !== "object" || !numbers(rotation.origin, 3) || rotation.rescale !== undefined && typeof rotation.rescale !== "boolean") throw invalid
  let angles
  if ("axis" in rotation || "angle" in rotation) {
    if (!AXES.includes(rotation.axis) || !Number.isFinite(rotation.angle)) throw invalid
    angles = AXES.map(axis => axis === rotation.axis ? rotation.angle : 0)
  } else {
    angles = AXES.map(axis => rotation[axis] ?? 0)
    if (!AXES.some(axis => axis in rotation) || !angles.every(Number.isFinite)) throw invalid
  }
  if (angles.every(angle => angle % 360 === 0)) return null
  const [x, y, z] = angles
  return { origin: rotation.origin, x, y, z, ...(rotation.rescale && { rescale: true }) }
}

function cleanFaces(element, index, textures, used) {
  const faces = element.faces
  if (!faces || typeof faces !== "object" || Array.isArray(faces)) throw new Error(`Element ${index + 1} has no faces.`)
  const kept = {}
  for (const side of SIDES) {
    const face = faces[side]
    if (face === undefined) continue
    if (!face || typeof face !== "object") throw new Error(`The ${side} face of element ${index + 1} isn't valid.`)
    if (face.uv !== undefined && !numbers(face.uv, 4)) throw new Error(`The ${side} face of element ${index + 1} has a uv that isn't valid.`)
    if (face.rotation !== undefined && !FACE_TURNS.includes(face.rotation)) throw new Error(`The ${side} face of element ${index + 1} has a rotation that isn't 0, 90, 180 or 270.`)
    if (typeof face.texture === "string") used.add(textureOf(textures, face.texture))
    kept[side] = { uv: face.uv ?? defaultUv(side, element.from, element.to), ...(face.rotation && { rotation: face.rotation }) }
  }
  return kept
}

function placedPoint([x, y, z], floor) {
  return [x * MINECRAFT_SCALE, (y - floor) * MINECRAFT_SCALE + MODEL_BASELINE, z * MINECRAFT_SCALE].map(value => Math.round(value * 1000) / 1000)
}

export function cleanModel(bytes) {
  let json
  try {
    json = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new Error("The model isn't a valid JSON file.")
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error("The model isn't a Java block model.")
  if (!Array.isArray(json.elements) || !json.elements.length) throw new Error(json.parent ? "The model has no elements of its own. Shapes can't use a parent model." : "The model has no elements in it.")
  if (json.elements.length > MODEL_LIMITS.elements) throw new Error(`A model can have up to ${MODEL_LIMITS.elements} elements.`)
  const textures = json.textures && typeof json.textures === "object" && !Array.isArray(json.textures) ? json.textures : {}
  const used = new Set()
  const elements = json.elements.flatMap((element, index) => {
    if (!numbers(element?.from, 3) || !numbers(element?.to, 3)) throw new Error(`Element ${index + 1} doesn't have a valid from and to.`)
    const tooFar = `Element ${index + 1} reaches further than ${MODEL_LIMITS.reach} from the centre.`
    if (!inReach(element.from) || !inReach(element.to)) throw new Error(tooFar)
    const faces = cleanFaces(element, index, textures, used)
    if (!Object.keys(faces).length) return []
    const rotation = cleanRotation(element.rotation, index)
    const corners = elementCorners({ from: element.from, to: element.to, rotation })
    if (!corners.every(inReach)) throw new Error(tooFar)
    return [{ element, faces, rotation, corners }]
  })
  if (!elements.length) throw new Error("None of the model's elements have any faces.")
  if (used.size > 1) throw new Error(`A shape model can only use one texture, and its faces use ${used.size}: ${Array.from(used).join(", ")}.`)
  const floor = Math.min(...elements.flatMap(({ corners }) => corners.map(point => point[1])))
  return { elements: elements.map(({ element, faces, rotation }) => ({ from: placedPoint(element.from, floor), to: placedPoint(element.to, floor), ...(rotation && { rotation: { ...rotation, origin: placedPoint(rotation.origin, floor) } }), faces })) }
}

export function cleanModelFile(bytes) {
  return new TextEncoder().encode(`${jsonText(cleanModel(bytes))}\n`)
}
