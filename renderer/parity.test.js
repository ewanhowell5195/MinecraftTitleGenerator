import { after, before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { fork } from "node:child_process"
import fs from "node:fs"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
import { Canvas, loadImage } from "skia-canvas"
import { createServer } from "vite"
import { encodeTitle } from "../src/lib/linkformat.js"
import { answerMinecraftAssets, renderTitle } from "./index.js"

const { platform } = await import("../src/lib/platform.js")

const MAX_MEAN_DIFFERENCE = 1.5
const MAX_DIFFERING_PIXELS = 0.01
const CLEARLY_DIFFERENT = 16

function line(values) {
  return { text: "Title", ...values }
}

function layer(overlay, values) {
  return { overlay, source: "premade", blend: "source-over", colour: "#ff0000", colourBlend: "multiply", opacity: 100, ...values }
}

function code(...lines) {
  return encodeTitle({ version: 1, lines }).code
}

const FILLED = { textureSource: "gradient", stops: [{ colour: "#30c060", position: 0 }, { colour: "#3060c0", position: 100 }] }

const TITLES = {
  "premade texture": [line({ texture: "cracked" })],
  "strip texture": [line({ texture: "gradient" })],
  "bold font": [line({ font: "minecraft-five-bold", text: "Five Bold" })],
  "dungeons font": [line({ font: "minecraft-dungeons", text: "Dungeons" })],
  "block font": [line({ font: "block-serif", text: "Serif" })],
  "bottom line": [line({ texture: "cracked" }), line({ type: "bottom", text: "edition", texture: "gradient" })],
  "small line": [line({ texture: "cracked" }), line({ type: "small", text: "small text" })],
  "several words": [{ words: [{ text: "Two", texture: "fired", hue: 180 }, { text: "Words", texture: "ice", customBorder: true, borderColour: "#230f00" }] }],
  "gradient fill": [line({ textureSource: "gradient", gradientAngle: 45, stops: [{ colour: "#ff0000", position: 0 }, { colour: "#0000ff", position: 100 }] })],
  "tileable fill": [line({ textureSource: "tileable", tileable: "diagonal_up", tileableVariant: "diagonal_down" })],
  "random tileable fill": [line({ textureSource: "tileable", tileable: "checkerboard", tileableRandomRotations: true, tileableRandomMirroring: true, tileableScale: 2 })],
  "premade overlay": [line({ ...FILLED, overlayMode: "custom", overlays: [layer("cracks", { opacity: 80 })] })],
  "generated overlay": [line({ ...FILLED, overlayMode: "custom", overlays: [layer("shine")] })],
  "edge overlay": [line({ ...FILLED, edgeOverlayMode: "custom", edgeOverlays: [layer("edge_outline")] })],
  "colour adjustments": [line({ texture: "cracked", hue: 120, saturation: 150, brightness: 80, contrast: 120, colour: "#40a0ff", colourOpacity: 60 })],
  "custom faces": [line({ texture: "cracked", fade: true, customEdge: true, edgeFill: "gradient", internalFaces: true, customInternal: true, internalColour: "#ff00ff", sideFaces: true })],
  "arc": [line({ texture: "cracked", arcTop: 40, arcBottom: 20, arcMove: 10 })],
  "transforms": [line({ texture: "cracked", rotationY: 25, rotationZ: 5, scaleX: 1.2, translateY: 4 })],
  "geometry": [line({ texture: "cracked", depth: 40, border: 5, clipHoles: false })]
}

const UNKNOWN = [
  ["a texture", { texture: "not_a_texture" }, /no minecraft-ten texture called not_a_texture/],
  ["a texture variant", { texture: "cracked", textureVariant: "not_a_variant" }, /cracked has no variant called not_a_variant/],
  ["a tileable", { textureSource: "tileable", tileable: "not_a_tileable" }, /no tileable called not_a_tileable/],
  ["a tileable variant", { textureSource: "tileable", tileable: "diagonal_up", tileableVariant: "not_a_variant" }, /diagonal_up has no variant called not_a_variant/],
  ["an overlay", { ...FILLED, overlayMode: "custom", overlays: [layer("not_an_overlay")] }, /overlay called not_an_overlay/],
  ["an edge overlay", { ...FILLED, edgeOverlayMode: "custom", edgeOverlays: [layer("not_an_overlay")] }, /overlay called not_an_overlay/],
  ["a setting", { texture: "cracked", someFutureOption: 5 }, /does not know: someFutureOption/],
  ["a value of the wrong type", { texture: "cracked", depth: "deep" }, /does not know: depth/]
]

function minecraftTitle(version) {
  return code(line({ textureSource: "tileable", tileableSource: "minecraft", minecraftTexture: "cobblestone", minecraftVersion: version }))
}

async function pixelsOf(png) {
  const image = await loadImage(png)
  const canvas = new Canvas(image.width, image.height)
  canvas.gpu = false
  const ctx = canvas.getContext("2d")
  ctx.drawImage(image, 0, 0)
  return { width: image.width, height: image.height, data: ctx.getImageData(0, 0, image.width, image.height).data }
}

async function assertSamePicture(actual, expected) {
  assert.ok(actual, "the node renderer drew nothing")
  assert.ok(expected, "the browser renderer drew nothing")
  const [a, b] = await Promise.all([pixelsOf(actual), pixelsOf(expected)])
  assert.deepEqual([a.width, a.height], [b.width, b.height])
  let total = 0
  let differing = 0
  for (let at = 0; at < a.data.length; at += 4) {
    let worst = 0
    for (let channel = 0; channel < 4; channel++) {
      const difference = Math.abs(a.data[at + channel] - b.data[at + channel])
      total += difference
      worst = Math.max(worst, difference)
    }
    if (worst > CLEARLY_DIFFERENT) differing++
  }
  const mean = total / a.data.length
  const share = differing / (a.width * a.height)
  assert.ok(mean <= MAX_MEAN_DIFFERENCE, `mean difference ${mean.toFixed(3)} is over ${MAX_MEAN_DIFFERENCE}`)
  assert.ok(share <= MAX_DIFFERING_PIXELS, `${(share * 100).toFixed(3)}% of pixels differ, over ${MAX_DIFFERING_PIXELS * 100}%`)
}

describe("node and browser renderers", () => {
  let server
  let browser
  let page

  before(async () => {
    server = await createServer({
      root: fileURLToPath(new URL("..", import.meta.url)),
      cacheDir: fileURLToPath(new URL("node_modules/.vite", import.meta.url)),
      logLevel: "error",
      optimizeDeps: { noDiscovery: true, include: ["vue", "three", "minecraft-asset-loader"] },
      server: { port: 0, strictPort: false, hmr: false, watch: null }
    })
    await server.listen()
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`
    browser = await chromium.launch()
    page = await browser.newPage()
    await page.route(`${origin}/blank`, route => route.fulfill({ contentType: "text/html", body: "<!doctype html><base href=\"/\">" }))
    await page.goto(`${origin}/blank`)
  })

  after(async () => {
    await browser?.close()
    await server?.close()
  })

  async function browserRender(title) {
    const url = await page.evaluate(async title => {
      const { titleCanvas } = await import("/src/lib/titlePicture.js")
      return (await titleCanvas(title))?.toDataURL("image/png") ?? null
    }, title)
    return url && Buffer.from(url.split(",")[1], "base64")
  }

  for (const [name, lines] of Object.entries(TITLES)) {
    test(`draw the same ${name}`, async () => {
      const title = code(...lines)
      await assertSamePicture(await renderTitle(title, { format: "png" }), await browserRender(title))
    })
  }

  for (const [name, values, message] of UNKNOWN) {
    test(`both refuse ${name}`, async () => {
      const title = code(line(values))
      await assert.rejects(renderTitle(title), message)
      await assert.rejects(browserRender(title), message)
    })
  }
})

describe("minecraft asset requests", () => {
  const cobblestone = fs.readFileSync(new URL("../public/tileables/minecraft/classic_cobblestone.png", import.meta.url))

  after(() => answerMinecraftAssets(null))

  test("ask for the texture and version, and draw the answer", async () => {
    const asked = []
    answerMinecraftAssets(request => {
      asked.push(request)
      return cobblestone
    })
    const answered = await renderTitle(minecraftTitle("1.21.11"), { format: "png" })
    assert.deepEqual(asked, [{ id: "cobblestone", version: "1.21.11" }])
    await assertSamePicture(answered, await renderTitle(code(line({ textureSource: "tileable", tileable: "classic_cobblestone" })), { format: "png" }))
  })

  test("ask for latest when the title has no version", async () => {
    const asked = []
    answerMinecraftAssets(request => {
      asked.push(request)
      return cobblestone
    })
    await renderTitle(minecraftTitle(null), { format: "png" })
    assert.deepEqual(asked, [{ id: "cobblestone", version: "latest" }])
  })

  test("fail when nothing answers with a texture", async () => {
    answerMinecraftAssets(() => null)
    await assert.rejects(renderTitle(minecraftTitle("1.21.11")), /Minecraft 1\.21\.11 has no block texture called cobblestone/)
  })

  test("keep working after a failed render", async () => {
    answerMinecraftAssets(() => null)
    await assert.rejects(renderTitle(minecraftTitle("1.21.11")))
    assert.ok(await renderTitle(code(line({ texture: "cracked" }))))
  })
})

describe("render process", () => {
  const cobblestone = fs.readFileSync(new URL("../public/tileables/minecraft/classic_cobblestone.png", import.meta.url))
  const asked = []
  let renderer
  let nextJob = 0

  before(() => {
    renderer = fork(fileURLToPath(new URL("index.js", import.meta.url)), { serialization: "advanced" })
    renderer.on("message", message => {
      if (!("asset" in message)) return
      asked.push({ id: message.id, version: message.version })
      renderer.send(message.id === "cobblestone" ? { asset: message.asset, bytes: cobblestone } : { asset: message.asset, error: "the parent couldn't find it" })
    })
  })

  after(() => renderer.kill())

  function requested(title, options = {}) {
    const job = nextJob++
    return new Promise(fulfil => {
      renderer.on("message", function finished(message) {
        if (message.job !== job) return
        renderer.off("message", finished)
        fulfil(message)
      })
      renderer.send({ job, code: title, options })
    })
  }

  test("draws the same picture as rendering here", async () => {
    const title = code(line({ texture: "cracked" }))
    const { picture } = await requested(title, { format: "png" })
    await assertSamePicture(Buffer.from(picture), await renderTitle(title, { format: "png" }))
  })

  test("asks its parent for Minecraft textures", async () => {
    const { picture } = await requested(minecraftTitle("1.21.11"))
    assert.ok(picture)
    assert.deepEqual(asked, [{ id: "cobblestone", version: "1.21.11" }])
  })

  test("reports the parent's failure to find a texture", async () => {
    const title = code(line({ textureSource: "tileable", tileableSource: "minecraft", minecraftTexture: "stone", minecraftVersion: "1.21.11" }))
    assert.match((await requested(title)).error, /the parent couldn't find it/)
  })

  test("only checks the title when asked", async () => {
    const title = code(line({ text: "x".repeat(200), texture: "cracked" }))
    assert.match((await requested(title, { check: true })).error, /up to \d+ characters/)
    assert.ok((await requested(title)).picture)
  })

  test("makes lossless webp by default", async () => {
    const { picture } = await requested(code(line({ texture: "cracked" })))
    assert.ok(Buffer.from(picture).includes("VP8L"))
  })

  test("renders a title the word filter would refuse", async () => {
    assert.ok((await requested(code(line({ text: "the sex update", texture: "cracked" })), { check: true })).picture)
  })

  test("refuses a broken code", async () => {
    assert.ok((await requested("garbage")).error)
  })

  test("exits when its parent goes away", async () => {
    const orphan = fork(fileURLToPath(new URL("index.js", import.meta.url)), { serialization: "advanced" })
    const exited = new Promise(fulfil => orphan.on("exit", fulfil))
    orphan.disconnect()
    await exited
  })
})

describe("image loading", () => {
  test("refuses anything outside the public folder", async () => {
    await assert.rejects(platform.loadImage("../package.json"), /outside the public folder/)
    await assert.rejects(platform.loadImage("https://example.com/image.png"), /not an image the renderer may load/)
    await assert.rejects(platform.loadImage("file:///etc/passwd"), /not an image the renderer may load/)
    await assert.rejects(platform.loadImage("data:text/html,hello"), /not an image the renderer may load/)
  })
})
