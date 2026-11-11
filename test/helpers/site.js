import fs from "node:fs"
import path from "node:path"
import { submissionContext } from "../../src/lib/submissionKinds/index.js"

export function assets(url, base) {
  const file = path.join("public", decodeURIComponent(new URL(url, base).pathname))
  return fs.existsSync(file) && fs.statSync(file).isFile() ? new Response(fs.readFileSync(file)) : new Response("missing", { status: 404 })
}

export function publicContext(fonts = []) {
  return submissionContext(fonts, async file => assets(file, "https://site.test"))
}
