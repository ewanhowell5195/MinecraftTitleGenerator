import { authorList } from "../../lib/authors.js"
import { flattenFonts, fontFolder } from "../../lib/font.js"
import { jsonText } from "../../lib/jsonText.js"
import { titleCase } from "../../lib/names.js"
import { fontParent } from "../../lib/submissionKinds/font.js"
import { holdingPath } from "../../lib/submissionKinds/fontBuild.js"
import { DEFAULT_ROLES, assetId, sourceOf } from "../../lib/submissions.js"
import { usedIds } from "./fontAsset.js"

const LIST = "public/font/fonts.json"

function parentOf(row, fonts) {
  if (!row.target) return null
  const parent = fontParent(fonts, row.target)
  if (!parent) throw new Error(`submission ${row.id} is a variant of ${row.target}, which isn't a published font`)
  return parent
}

function freeId(wanted, used) {
  let id = wanted
  for (let count = 2; used.has(id); count++) id = `${wanted}-${count}`
  return id
}

function bundle(row, details, folder) {
  const extras = details.extras ?? []
  if (!extras.length) return []
  const list = { textures: { flat: { border: "#000000" } }, overlays: {} }
  const used = new Set(usedIds(list))
  const files = []
  const roles = {}
  for (const item of extras) {
    const sha = details.files?.[item.key]
    if (!sha) throw new Error(`submission ${row.id} has no file for its ${item.kind} ${item.key}`)
    if (item.kind === "flat") {
      list.textures.flat = { authors: authorList(item.credit).length ? authorList(item.credit) : row.credit, ...(item.density > 1 && { density: item.density }), border: item.border }
      files.push({ path: `public/${folder}/textures/flat.png`, sha })
      for (const role of DEFAULT_ROLES) if (item[role]) roles[role] = "flat"
      continue
    }
    const id = assetId(item.name, used)
    used.add(id)
    if (item.kind !== "overlay") for (const role of DEFAULT_ROLES) if (item[role]) roles[role] = id
    const entry = { ...(item.kind === "strip" && { type: "strip" }), ...(item.name !== titleCase(id) && { name: item.name }), authors: authorList(item.credit).length ? authorList(item.credit) : row.credit, ...(item.density > 1 && { density: item.density }), ...(item.kind !== "overlay" && { border: item.border }) }
    const section = item.kind === "overlay" ? "overlays" : "textures"
    list[section][id] = entry
    files.push({ path: `public/${folder}/${section}/${id}.png`, sha })
  }
  Object.assign(list, roles)
  return [{ path: `public/${folder}/textures.json`, content: `${jsonText(list)}\n` }].concat(files)
}

export const font = {
  async write({ row, details, fonts, read, taken }) {
    const parent = parentOf(row, fonts)
    const list = JSON.parse(await read(LIST))
    const asset = freeId(details.id, new Set(flattenFonts(list).map(entry => entry.id).concat(taken)))
    const entry = { id: asset, ...(row.name !== titleCase(asset) && { name: row.name }), authors: row.credit, ...sourceOf(details) }
    if (parent) {
      const owner = list.find(item => item.id === parent.id)
      if (!owner) throw new Error(`${LIST} on main has no ${parent.id}`)
      owner.variants = (owner.variants ?? []).concat(entry)
    } else {
      list.push(entry)
    }
    const extras = bundle(row, details, fontFolder({ id: asset, variant: parent?.id }))
    return { asset, files: [{ path: LIST, content: `${jsonText(list)}\n` }, { path: holdingPath(asset), sha: row.file }].concat(extras) }
  },
  describe({ row, fonts }) {
    const parent = parentOf(row, fonts)
    return parent ? { where: `for ${parent.name}`, into: `to ${parent.name}` } : { where: "", into: "" }
  },
  watches() {
    return [LIST]
  },
  scopes() {
    return ["fonts"]
  }
}
