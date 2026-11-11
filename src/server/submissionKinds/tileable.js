import { jsonText } from "../../lib/jsonText.js"
import { titleCase } from "../../lib/names.js"
import { TILEABLES_LIST, TILEABLE_FOLDER, tileableName } from "../../lib/submissionKinds/tileable.js"
import { assetId } from "../../lib/submissions.js"

const LIST = `public${TILEABLES_LIST}`

function tileableIds(list) {
  return Object.entries(list).flatMap(([id, data]) => [id].concat(Object.keys(data.variants ?? {})))
}

function where(row) {
  return row.target ? `as a variant of ${tileableName(row.target)}` : ""
}

export const tileable = {
  async write({ row, read, taken }) {
    const list = JSON.parse(await read(LIST))
    const asset = assetId(row.name, new Set(tileableIds(list).concat(taken)))
    const entry = { ...(row.name !== titleCase(asset) && { name: row.name }), author: row.credit }
    if (row.target) {
      const parent = list[row.target]
      if (!parent) throw new Error(`submission ${row.id} is a variant of ${row.target}, which isn't a published tileable`)
      list[row.target] = { ...parent, variants: { ...parent.variants, [asset]: { ...entry, ...(parent.path !== TILEABLE_FOLDER && { path: TILEABLE_FOLDER }) } } }
    } else list[asset] = { ...entry, path: TILEABLE_FOLDER }
    const image = `public/tileables/${TILEABLE_FOLDER}/${asset}.png`
    return { asset, files: [{ path: LIST, content: `${jsonText(list)}\n` }, { path: image, sha: row.file }], preview: image }
  },
  describe({ row }) {
    return { where: where(row), into: where(row) }
  },
  watches() {
    return [LIST]
  },
  scopes() {
    return ["tileables"]
  }
}
