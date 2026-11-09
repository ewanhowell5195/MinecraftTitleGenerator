import path from "node:path"
import { sheetOwner } from "../../src/lib/font.js"
import { fontDir, publishedFonts } from "../fonts.js"

export function prepare({ root, changed, node }) {
  const folders = new Set(changed.filter(file => /^public\/font\/.+\/textures\.json$/.test(file)).map(file => path.join(root, path.dirname(file))))
  if (!folders.size) return
  const list = publishedFonts()
  const owners = list.filter(font => sheetOwner(font, list) === font && folders.has(fontDir(font)))
  for (const font of list.filter(item => owners.includes(sheetOwner(item, list)))) node("generator/thumbnails.js", font.id)
}
