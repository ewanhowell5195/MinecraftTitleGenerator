import fs from "node:fs"
import path from "node:path"
import { flatLayers } from "../src/lib/flatSheet.js"
import { pngOf, writeJson } from "./common.js"

export function flatSheet(cells, capHeight, depth, density = 1, layers = null) {
  const { data, layout, width, height } = flatLayers(cells, capHeight, depth, layers, density)
  return { sheet: pngOf({ width: width * density, height: height * density, data }), layout, width, height }
}

export function writeStarterTextures(folder) {
  const file = path.join(folder, "textures.json")
  if (!fs.existsSync(file)) writeJson(file, { textures: { flat: { border: "#000000" } }, overlays: {} })
}
