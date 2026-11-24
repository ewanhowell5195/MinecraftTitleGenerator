import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "vite"

const ROOT = fileURLToPath(new URL("../../", import.meta.url))
const ENTRY = "shared-code"
const SHARED = ["src/lib/link/linkformat.js", "src/lib/title/titleData.js", "src/lib/title/items.js", "src/lib/title/match.js", "src/lib/core/platform.js", "src/render/ModelRenderer.js", "src/render/ObjectRenderer.js", "src/render/render.js", "src/render/stage.js", "src/render/titlePicture.js"].concat(fs.readdirSync(new URL("../../src/lib/panels/", import.meta.url)).map(file => `src/lib/panels/${file}`))
const SITE_ONLY = /^src\/(app|components|fontEditor|issues|prerender|server|site|styles|submissions|lib\/(issues|state|submissions))\b/
const GIVEN = new Set(["three", "vue"])

const entry = {
  name: "shared-entry",
  resolveId: id => path.basename(id) === ENTRY ? `\0${ENTRY}` : null,
  load: id => id === `\0${ENTRY}` ? SHARED.map((file, index) => `export * as part${index} from ${JSON.stringify(path.join(ROOT, file))}`).join("\n") : null
}

describe("the shared code as one script", () => {
  let files

  before(async () => {
    const built = await build({ configFile: false, root: ROOT, logLevel: "silent", publicDir: false, plugins: [entry], build: { write: false, minify: false, target: "esnext", lib: { entry: ENTRY, formats: ["iife"], name: "shared", fileName: "shared" }, rolldownOptions: { external: id => GIVEN.has(id), output: { globals: { three: "THREE", vue: "Vue" } } } } })
    files = [].concat(built).flatMap(result => result.output)
  })

  test("builds to a single file", () => {
    assert.deepEqual(files.map(file => file.type), ["chunk"])
  })

  test("holds nothing that belongs to the website", () => {
    const modules = Object.keys(files[0].modules).map(id => path.relative(ROOT, id).split(path.sep).join("/"))
    assert.ok(modules.includes("src/render/ObjectRenderer.js"))
    assert.deepEqual(modules.filter(id => SITE_ONLY.test(id)), [])
  })

  test("only needs three and Vue to be given", () => {
    assert.deepEqual(files[0].imports.filter(id => !GIVEN.has(id)), [])
    assert.ok(!files[0].code.includes("import.meta"))
  })
})
