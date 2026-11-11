import { forgetImages } from "../src/lib/assets.js"
import { gameRelease } from "../src/lib/minecraftModels.js"
import { usePlatform } from "../src/lib/platform.js"
import { titleCanvas } from "../src/lib/titlePicture.js"
import { checkTitle } from "../src/server/presets.js"
import { useNode } from "./platform.js"

await useNode()

const answers = new Map()
const askedAssets = new Map()
let queue = Promise.resolve()
let nextAsset = 0

async function render(code, { width, format = "webp", quality = 1 }) {
  try {
    const canvas = await titleCanvas(code, width)
    return canvas && await canvas.toBuffer(format, { quality })
  } finally {
    forgetImages(() => false)
    answers.clear()
  }
}

export function renderTitle(code, options = {}) {
  const rendered = queue.then(() => render(code, options))
  queue = rendered.catch(() => {})
  return rendered
}

export function answerMinecraftAssets(answer) {
  usePlatform({
    minecraftAsset: answer && (request => {
      const key = `${request.version}/${request.id}`
      if (!answers.has(key)) answers.set(key, answer(request))
      return answers.get(key)
    })
  })
}

export function answerMinecraftFolders(answer) {
  usePlatform({
    minecraftModels: answer && (async version => {
      const folder = await answer(version)
      if (!folder) throw new Error(`Minecraft ${version} isn't available to draw shapes from`)
      const lib = await import("block-model-renderer")
      return { lib, assets: await lib.prepareAssets([folder], { cache: true, version: gameRelease(version) }) }
    })
  })
}

function askParent(request) {
  return new Promise((fulfil, reject) => {
    const asset = nextAsset++
    askedAssets.set(asset, { fulfil, reject })
    process.send({ asset, ...request })
  })
}

function parentAnsweredAsset({ asset, error, ...answer }) {
  const { fulfil, reject } = askedAssets.get(asset)
  askedAssets.delete(asset)
  if (error) reject(new Error(error))
  else fulfil(answer)
}

async function renderRequested(code, { check, ...options }) {
  if (check) checkTitle(code)
  const picture = await renderTitle(code, options)
  if (!picture) throw new Error("the title has nothing to draw")
  return picture
}

export function serveRenders() {
  answerMinecraftAssets(({ id, version }) => askParent({ id, version }).then(answer => answer.bytes))
  answerMinecraftFolders(version => askParent({ folder: version }).then(answer => answer.folder))
  process.on("message", async message => {
    if ("asset" in message) return parentAnsweredAsset(message)
    try {
      process.send({ job: message.job, picture: await renderRequested(message.code, message.options) })
    } catch (err) {
      process.send({ job: message.job, error: err.message })
    }
  })
  process.on("disconnect", () => process.exit())
}
