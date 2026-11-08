import fs from "node:fs"
import path from "node:path"
import { PNG } from "pngjs"
import { flatPixels } from "../src/lib/flatSheet.js"
import { writeJson } from "./common.js"

export function flatSheet(cells, capHeight, depth, density = 1) {
  const { data, layout, width, height } = flatPixels(cells, capHeight, depth, density)
  const sheet = new PNG({ width: width * density, height: height * density })
  sheet.data.set(data)
  return { sheet, layout, width, height }
}

export function writeStarterTextures(folder) {
  const file = path.join(folder, "textures.json")
  if (!fs.existsSync(file)) writeJson(file, { textures: { flat: { border: "#000000" } }, overlays: {} })
}
