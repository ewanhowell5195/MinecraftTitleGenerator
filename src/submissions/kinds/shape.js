import { customFontId } from "../../lib/customFonts.js"
import { SILHOUETTE_TEXT } from "../../lib/shapes.js"

export function silhouetteSource(file, strips = []) {
  return { kind: "silhouette", fileName: "shape.png", data: file, ...(strips.length && { strips: strips.map(item => typeof item === "string" ? item : { ...item }) }) }
}

export const shapeImage = {
  image: true,
  line(item, file) {
    const source = silhouetteSource(file, item.details.strips)
    return { text: SILHOUETTE_TEXT, font: customFontId(source), customFont: source }
  },
  summary() {
    return "A new PNG shape"
  },
  rows(item) {
    return item.details.width ? [{ label: "Size", value: `${item.details.width}x${item.details.height}` }] : []
  }
}

export const shapeModel = {
  image: false,
  line(item, model, text, texture) {
    return { shape: "custom", customModel: { model, texture } }
  },
  summary() {
    return "A new model shape"
  },
  rows(item) {
    return item.details.elements ? [{ label: "Elements", value: String(item.details.elements) }, { label: "Height", value: String(item.details.height) }] : []
  }
}
