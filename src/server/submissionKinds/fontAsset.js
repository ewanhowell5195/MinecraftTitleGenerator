import { fontFolder, fullName } from "../../lib/font.js"
import { GENERATED_EDGE_OVERLAYS, withGenerated } from "../../lib/generated.js"
import { jsonText } from "../../lib/jsonText.js"
import { titleCase } from "../../lib/names.js"
import { textureName } from "../../lib/submissionKinds/fontAsset.js"
import { assetId } from "../../lib/submissions.js"

const SECTIONS = { texture: "textures", overlay: "overlays" }

export function usedIds(list) {
  const textures = Object.entries(list.textures ?? {}).flatMap(([id, data]) => [id].concat(Object.keys(data.variants ?? {})))
  return textures.concat(Object.keys(withGenerated(list.overlays ?? {})), Object.keys(GENERATED_EDGE_OVERLAYS))
}

export function texturesPath(font) {
  return `public/${fontFolder(font)}/textures.json`
}

function fontOf(row, fonts) {
  const font = fonts.find(entry => entry.id === row.target)
  if (!font) throw new Error(`submission ${row.id} is for ${row.target}, which isn't a published font`)
  return font
}

function variantWhere(details) {
  return details.variantOf ? ` as a variant of ${textureName(details.variantOf)}` : ""
}

function fontAsset(kind) {
  const section = SECTIONS[kind]
  return {
    async write({ row, details, fonts, read, taken }) {
      const font = fontOf(row, fonts)
      const listPath = texturesPath(font)
      const list = JSON.parse(await read(listPath))
      const asset = assetId(row.name, new Set(usedIds(list).concat(taken)))
      const parent = details.variantOf ? list.textures?.[details.variantOf] : null
      if (details.variantOf && (!parent || parent.type === "strip")) throw new Error(`submission ${row.id} is a variant of ${details.variantOf}, which isn't a published texture of ${font.id}`)
      const density = details.density ?? 1
      const entry = {
        ...(row.name !== titleCase(asset) && { name: row.name }),
        authors: row.credit,
        ...((density > 1 || (parent?.density ?? 1) > 1) && { density }),
        ...(kind === "texture" && { border: details.border })
      }
      if (parent) list.textures = { ...list.textures, [details.variantOf]: { ...parent, variants: { ...parent.variants, [asset]: entry } } }
      else list[section] = { ...list[section], [asset]: entry }
      const image = `public/${fontFolder(font)}/${section}/${asset}.png`
      return { asset, files: [{ path: listPath, content: `${jsonText(list)}\n` }, { path: image, sha: row.file }], preview: image }
    },
    describe({ row, details, fonts }) {
      const font = fontOf(row, fonts)
      return { where: `for ${fullName(font, fonts)}${variantWhere(details)}`, into: `to ${font.name}${variantWhere(details)}` }
    },
    watches({ row, fonts }) {
      return [texturesPath(fontOf(row, fonts))]
    },
    scopes({ row }) {
      return [`font:${row.target}`]
    }
  }
}

export const texture = fontAsset("texture")
export const overlay = fontAsset("overlay")
