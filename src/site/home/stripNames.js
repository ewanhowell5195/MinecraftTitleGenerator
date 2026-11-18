import fs from "node:fs"
import path from "node:path"

const LISTS = ["/fonts/minecraft-ten", "/strips/minecraft-ten"]

function textureNames(root, folder) {
  const { textures } = JSON.parse(fs.readFileSync(path.join(root, "public", folder, "textures.json"), "utf8"))
  return Object.entries(textures).flatMap(([id, { variants }]) => [id].concat(Object.keys(variants ?? {})))
}

export function stripNames(root) {
  const all = Array.from(new Set(LISTS.flatMap(folder => textureNames(root, folder))))
  return all.map((name, index) => [(index * 2654435761) % 2 ** 32, name]).sort((a, b) => a[0] - b[0]).map(entry => entry[1])
}
