import { stripsOf } from "../../src/lib/font.js"
import { stripUse } from "../../src/lib/strips.js"
import { publishedFonts, publishedShapes } from "../fonts.js"

export function prepare({ root, changed, node }) {
  const sets = new Set(changed.flatMap(file => /^public\/strips\/([^/]+)\/textures\.json$/.exec(file)?.[1] ?? []))
  if (!sets.size) return
  const list = publishedFonts(root).concat(publishedShapes(root))
  for (const font of list.filter(item => stripsOf(item, list).some(use => sets.has(stripUse(use).id)))) node("generator/thumbnails.js", font.id)
}
