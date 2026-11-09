import fs from "node:fs"
import path from "node:path"
import { sheetOwner, stripsOf } from "../../src/lib/font.js"
import { stripUse } from "../../src/lib/strips.js"
import { fontDir, publishedFonts } from "../fonts.js"

function stripIds(text) {
  return Object.entries(JSON.parse(text).textures ?? {}).filter(([, entry]) => entry.type === "strip" && !entry.strip).map(([id]) => id)
}

function gainedStrips({ root, base, git }, file) {
  if (!fs.existsSync(path.join(root, file))) return false
  const before = git("ls-tree", "--name-only", base, file).length ? stripIds(git("show", `${base}:${file}`).join("\n")) : []
  return stripIds(fs.readFileSync(path.join(root, file), "utf8")).some(id => !before.includes(id))
}

export function prepare({ root, base, changed, git, node }) {
  const sets = new Set(changed.flatMap(file => /^public\/strips\/([^/]+)\/textures\.json$/.exec(file)?.[1] ?? []))
  const folders = new Set(changed.filter(file => /^public\/font\/.+\/textures\.json$/.test(file) && gainedStrips({ root, base, git }, file)).map(file => path.join(root, path.dirname(file))))
  if (!sets.size && !folders.size) return
  const list = publishedFonts()
  const affected = list.filter(font => folders.has(fontDir(sheetOwner(font, list))) || stripsOf(font, list).some(item => sets.has(stripUse(item).id)))
  for (const font of affected) node("generator/thumbnails.js", font.id)
}
