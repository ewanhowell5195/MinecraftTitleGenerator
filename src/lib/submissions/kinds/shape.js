import { silhouetteBounds } from "../../font/silhouette.js"
import { modelHeight } from "../../geometry/shapes.js"
import { pngProblem, sizedProblem } from "../submissions.js"
import { stripProblem } from "./font.js"
import { cleanModel, cleanModelFile } from "./modelFile.js"
import { decodePng } from "../../core/png.js"

export const SHAPES_LIST = "/shapes/shapes.json"
export const SHAPE_HOLDING_FOLDER = "submissions/shapes"
export const SHAPE_STRIP_LIMITS = { sets: 8 }
export const SILHOUETTE_LIMITS = { width: 128, height: 64, minHeight: 8 }

const STRIP_SET = /^[a-z0-9_-]{1,40}$/

export function shapeHoldingPath(id) {
  return `${SHAPE_HOLDING_FOLDER}/${id}.png`
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
  const ids = value.map(item => typeof item === "string" ? item : item?.id)
  if (ids.some(id => typeof id !== "string" || !STRIP_SET.test(id))) throw invalid
  if (new Set(ids).size !== ids.length) throw invalid
  return ids
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
      if (strips.length) problems.strips = await stripProblem({ strips }, ctx)
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
