import { sheetLayout } from "../font.js"
import { jsonText } from "../jsonText.js"
import { MINECRAFT_SCALE, MODEL_BASELINE, elementCorners, modelHeight } from "../shapes.js"
import { pngProblem, sizedProblem } from "../submissions.js"
import { stripProblem } from "./font.js"
import { decodePng } from "./png.js"

export const SHAPES_LIST = "/shapes/shapes.json"
export const SHAPE_HOLDING_FOLDER = "submissions/shapes"
export const SHAPE_STRIP_LIMITS = { sets: 8, offset: 64 }
export const SILHOUETTE_LIMITS = { width: 128, height: 64, minHeight: 8 }
export const MODEL_LIMITS = { elements: 1000, reach: 100 }
const CUSTOM_SHAPE_UNITS = { width: 256, height: 64 }

const SIDES = ["north", "south", "east", "west", "up", "down"]
const AXES = ["x", "y", "z"]
const FACE_TURNS = [0, 90, 180, 270]
const ALIAS_DEPTH = 16
const STRIP_SET = /^[a-z0-9_-]{1,40}$/
const SHAPE_WORDS = { subject: "The shape", goes: "goes", reaches: "reaches", is: "is", fix: "Change its offset" }

export function shapeHoldingPath(id) {
  return `${SHAPE_HOLDING_FOLDER}/${id}.png`
}

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
  for (let depth = 0; depth < ALIAS_DEPTH && value.startsWith("#"); depth++) {
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

export function silhouetteBounds({ width, height, data }) {
  let left = width
  let right = -1
  let top = height
  let bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < 128) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  return right < 0 ? null : { left, top, width: right - left + 1, height: bottom - top + 1 }
}

function solidBounds(image) {
  const bounds = silhouetteBounds(image)
  if (!bounds) throw new Error("the PNG has no solid pixels to make the shape from")
  return bounds
}

function scaleFor(bounds) {
  return Math.max(1, Math.ceil(bounds.width / CUSTOM_SHAPE_UNITS.width), Math.ceil(bounds.height / CUSTOM_SHAPE_UNITS.height))
}

export function silhouetteScale(image) {
  return scaleFor(solidBounds(image))
}

function sampled(image, scale, bounds = solidBounds(image)) {
  const width = Math.ceil(bounds.width / scale)
  const height = Math.ceil(bounds.height / scale)
  const lift = height * scale - bounds.height
  const source = (x, y) => ((bounds.top + y) * image.width + bounds.left + x) * 4
  const solid = (x, y) => image.data[source(x, y) + 3] >= 128
  const shape = { image, scale, bounds, width, height, lift, source, solid }
  return { ...shape, mask: unitMask(shape) }
}

export function silhouetteSample(image) {
  const bounds = solidBounds(image)
  return sampled(image, scaleFor(bounds), bounds)
}

function blockPixels(row, column, scale, lift) {
  const pixels = []
  for (let y = row * scale - lift; y < (row + 1) * scale - lift; y++) {
    for (let x = column * scale; x < (column + 1) * scale; x++) pixels.push([x, y])
  }
  return pixels
}

function unitMask({ scale, bounds, width, height, lift, solid }) {
  const mask = new Uint8Array(width * height)
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const inside = blockPixels(row, column, scale, lift).filter(([x, y]) => x < bounds.width && y >= 0 && y < bounds.height)
      const filled = inside.filter(([x, y]) => solid(x, y)).length
      mask[row * width + column] = inside.length && filled * 2 >= inside.length ? 1 : 0
    }
  }
  return mask
}

export function sampleGlyph({ width, height, mask }) {
  return { width, height, top: height, bottom: 0, mask }
}

export function silhouetteGlyph(image, scale = 1) {
  return sampleGlyph(sampled(image, scale))
}

export function silhouettePixels(cells, capHeight, depth, image, scale = 1) {
  return samplePixels(cells, capHeight, depth, sampled(image, scale))
}

export function samplePixels(cells, capHeight, depth, shape) {
  const { image, scale, bounds, lift, source, solid, mask } = shape
  const layout = sheetLayout(cells, capHeight, depth)
  let units = 0
  let rows = 0
  for (const [glyph, at] of layout) {
    units = Math.max(units, at.x + glyph.width)
    rows = Math.max(rows, at.down + depth)
  }
  const width = units * scale
  const height = rows * scale
  const data = new Uint8ClampedArray(width * height * 4)
  const copy = (x, y, toX, toY) => data.set(image.data.subarray(source(x, y), source(x, y) + 4), (toY * width + toX) * 4)
  for (const [, at] of layout) {
    for (let x = 0; x < bounds.width; x++) {
      const filled = Array.from({ length: bounds.height }, (row, y) => y).filter(y => solid(x, y))
      if (!filled.length) continue
      for (const y of filled) copy(x, y, at.x * scale + x, at.top * scale + lift + y)
      for (let row = 0; row < depth * scale; row++) {
        copy(x, filled[0], at.x * scale + x, at.up * scale + row)
        copy(x, filled.at(-1), at.x * scale + x, at.down * scale + row)
      }
    }
    for (let row = 0; row < shape.height; row++) {
      for (let column = 0; column < shape.width; column++) {
        if (!mask[row * shape.width + column]) continue
        const block = blockPixels(row, column, scale, lift)
        const within = ([x, y]) => x < bounds.width && y >= 0 && y < bounds.height && solid(x, y)
        const opaque = block.filter(within)
        if (opaque.length === block.length) continue
        for (const [x, y] of block) {
          if (within([x, y])) continue
          const [nx, ny] = opaque.reduce((best, pixel) => (pixel[0] - x) ** 2 + (pixel[1] - y) ** 2 < (best[0] - x) ** 2 + (best[1] - y) ** 2 ? pixel : best)
          const at4 = ((at.top * scale + lift + y) * width + at.x * scale + x) * 4
          data.set(image.data.subarray(source(nx, ny), source(nx, ny) + 3), at4)
          data[at4 + 3] = 255
        }
      }
    }
  }
  return { data, width, height }
}

function silhouetteProblem(bytes) {
  const problem = pngProblem(bytes, "shape")
  if (problem) return { problem }
  let image
  try {
    image = decodePng(bytes)
  } catch (err) {
    return { problem: `This PNG can't be read: ${err.message}.` }
  }
  const bounds = silhouetteBounds(image)
  if (!bounds) return { problem: "The PNG has no solid pixels to make the shape from." }
  const { width, height, minHeight } = SILHOUETTE_LIMITS
  if (bounds.width > width || bounds.height > height) return { problem: `The shape can be up to ${width} pixels wide and ${height} tall, and this one is ${bounds.width}x${bounds.height}.` }
  if (bounds.height < minHeight) return { problem: `The shape has to be at least ${minHeight} pixels tall, and this one is ${bounds.height}.` }
  return { bounds }
}

function cleanStrips(value) {
  if (value === undefined) return []
  const invalid = new Error("The strips aren't valid.")
  if (!Array.isArray(value) || value.length > SHAPE_STRIP_LIMITS.sets) throw invalid
  const uses = value.map(item => typeof item === "string" ? { id: item, offset: 0 } : item)
  if (uses.some(use => !use || !STRIP_SET.test(use.id) || !Number.isInteger(use.offset ?? 0) || Math.abs(use.offset ?? 0) > SHAPE_STRIP_LIMITS.offset)) throw invalid
  if (new Set(uses.map(use => use.id)).size !== uses.length) throw invalid
  return uses.map(({ id, offset = 0 }) => offset ? { id, offset } : id)
}

export const shapeImage = {
  id: "shapeImage",
  label: "PNG shape",
  noun: "shape",
  available: true,
  accept: "image/png",
  derived: ["width", "height"],
  async check({ details, bytes }, ctx) {
    const problems = {}
    const clean = {}
    if (bytes) {
      const read = silhouetteProblem(bytes)
      problems.file = read.problem
      if (read.bounds) Object.assign(clean, { width: read.bounds.width, height: read.bounds.height })
    }
    try {
      const strips = cleanStrips(details.strips)
      if (strips.length) clean.strips = strips
      const height = clean.height ?? details.height
      if (strips.length && Number.isInteger(height)) problems.strips = await stripProblem({ strips }, [{ top: height, bottom: 0 }], height, ctx, SHAPE_WORDS)
    } catch (err) {
      problems.strips = err.message
    }
    return { problems, target: "", details: clean }
  }
}

export const shapeModel = {
  id: "shapeModel",
  label: "Model shape",
  noun: "shape",
  available: true,
  accept: "application/json",
  derived: ["height", "elements"],
  fileKeys() {
    return ["texture"]
  },
  cleanFile: cleanModelFile,
  async check({ details, bytes, files = {} }) {
    const problems = {}
    const clean = {}
    if (bytes) {
      const problem = sizedProblem(bytes, "model")
      if (problem) problems.file = problem
      else {
        try {
          const model = cleanModel(bytes)
          Object.assign(clean, { height: modelHeight(model), elements: model.elements.length })
        } catch (err) {
          problems.file = err.message
        }
      }
    }
    if (files.texture) problems.texture = pngProblem(files.texture, "texture")
    else if (typeof details.files?.texture !== "string") problems.texture = "Choose the model's texture PNG."
    return { problems, target: "", details: clean }
  }
}
