import fs from "node:fs"
import path from "node:path"
import { HOLDING_FOLDER } from "../../src/lib/submissionKinds/fontBuild.js"
import { convertFont } from "./fontConvert.js"

export async function prepare({ root, changed, node }) {
  const ids = changed.filter(file => path.posix.dirname(file) === HOLDING_FOLDER && file.endsWith(".json") && fs.existsSync(path.join(root, file))).map(file => path.posix.basename(file, ".json"))
  for (const id of ids) {
    await convertFont(root, id)
    node("generator/thumbnails.js", id)
  }
}
