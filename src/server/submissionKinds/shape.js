import { jsonText } from "../../lib/jsonText.js"
import { titleCase } from "../../lib/names.js"
import { SHAPE_TEXTURE } from "../../lib/shapes.js"
import { SHAPES_LIST, shapeHoldingPath } from "../../lib/submissionKinds/shape.js"
import { assetId } from "../../lib/submissions.js"

const LIST = `public${SHAPES_LIST}`
const BORDER = "#000000"

async function listed(row, read, taken) {
  const list = JSON.parse(await read(LIST))
  const asset = assetId(row.name, new Set(list.map(entry => entry.id).concat(taken)))
  return { list, asset, entry: { id: asset, ...(row.name !== titleCase(asset) && { name: row.name }), authors: row.credit } }
}

function listFile(list) {
  return { path: LIST, content: `${jsonText(list)}\n` }
}

const shared = {
  describe() {
    return { where: "", into: "" }
  },
  watches() {
    return [LIST]
  },
  scopes() {
    return ["shapes"]
  }
}

export const shapeImage = {
  ...shared,
  async write({ row, details, read, taken }) {
    const { list, asset, entry } = await listed(row, read, taken)
    const holding = shapeHoldingPath(asset)
    return { asset, files: [listFile(list.concat({ ...entry, kind: "png", order: "x", ...(details.strips?.length && { strips: details.strips }) })), { path: holding, sha: row.file }], preview: holding }
  }
}

export const shapeModel = {
  ...shared,
  async write({ row, details, read, taken }) {
    const texture = details.files?.texture
    if (!texture) throw new Error(`submission ${row.id} has no texture`)
    const { list, asset, entry } = await listed(row, read, taken)
    const folder = `public/shapes/${asset}`
    const textures = { textures: { [SHAPE_TEXTURE]: { authors: row.credit, border: BORDER } }, overlays: {}, primary: SHAPE_TEXTURE, secondary: SHAPE_TEXTURE }
    const image = `${folder}/textures/${SHAPE_TEXTURE}.png`
    return {
      asset,
      files: [listFile(list.concat({ ...entry, kind: "model", height: details.height })), { path: `${folder}/model.json`, sha: row.file }, { path: image, sha: texture }, { path: `${folder}/textures.json`, content: `${jsonText(textures)}\n` }],
      preview: image
    }
  }
}
