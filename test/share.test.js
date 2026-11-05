import { beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import { registerHooks } from "node:module"

function withViteEnv(url, context, nextLoad) {
  const result = nextLoad(url, context)
  if (!url.endsWith("/src/lib/stats.js")) return result
  return { ...result, source: `import.meta.env = { DEV: false }\n${result.source}` }
}

registerHooks({ load: withViteEnv })

const posts = []

async function recordPost(url, options) {
  posts.push({ url, method: options.method, ids: JSON.parse(options.body).ids })
  return { ok: true }
}

globalThis.fetch = recordPost
globalThis.localStorage = { getItem: () => null, setItem: () => {} }
globalThis.location = { origin: "https://example.test", pathname: "/app/", search: "" }
mock.timers.enable({ apis: ["setTimeout"] })

const { createObject } = await import("../src/lib/settings.js")
const { scene, validSelection } = await import("../src/lib/scene.js")
const { shareLink } = await import("../src/lib/share.js")

function setTitle(...objects) {
  scene.objects.splice(0, scene.objects.length, ...objects)
  Object.assign(scene, validSelection(objects, null, null))
}

describe("sharing a title", () => {
  beforeEach(() => {
    posts.length = 0
  })

  test("counts towards the stats", () => {
    setTitle(createObject({ text: "stats", texture: "grass" }))
    shareLink()
    assert.equal(posts.length, 1)
    assert.equal(posts[0].method, "POST")
    assert.match(posts[0].url, /minecrafttitlegenerator\/stats$/)
    assert.deepEqual(posts[0].ids, ["minecraft-ten", "minecraft-ten.grass"])
  })

  test("sharing the same title again does not count twice", () => {
    setTitle(createObject({ text: "twice", texture: "grass" }))
    shareLink()
    shareLink()
    assert.equal(posts.length, 1)
  })

  test("sharing after a change counts again", () => {
    const object = createObject({ text: "before", texture: "grass" })
    setTitle(object)
    shareLink()
    object.text = "after"
    shareLink()
    assert.equal(posts.length, 2)
  })

  test("returns a link to this page", () => {
    setTitle(createObject({ text: "link", texture: "grass" }))
    const { link, skipped } = shareLink()
    assert.match(link, /^https:\/\/example\.test\/app\/#title=[0-9a-z][A-Za-z0-9_-]+$/)
    assert.equal(skipped, 0)
  })
})
