import { CUSTOM_SHAPE } from "../../lib/shapes.js"

function silhouetteSource(file, strips = []) {
  return { kind: "silhouette", fileName: "shape.png", data: file, ...(strips.length && { strips: strips.map(item => typeof item === "string" ? item : { ...item }) }) }
}

export const shapeImage = {
  file: "PNG",
  line(item, file) {
    return { shape: CUSTOM_SHAPE, customFont: silhouetteSource(file, item.details.strips) }
  },
  summary() {
    return "A new PNG shape"
  },
  rows(item) {
    return item.details.width ? [{ label: "Size", value: `${item.details.width}x${item.details.height}` }] : []
  }
}

export const shapeModel = {
  file: "model's JSON file",
  openable() {
    return false
  },
  line(item, model, text, texture) {
    return { shape: CUSTOM_SHAPE, customModel: { model, texture } }
  },
  summary() {
    return "A new model shape"
  },
  rows(item) {
    return item.details.elements ? [{ label: "Elements", value: String(item.details.elements) }, { label: "Height", value: String(item.details.height) }] : []
  }
}
