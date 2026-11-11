import { beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { close } from "./helpers/assert.js"
import { quietStorage } from "./helpers/browser.js"

const LIMIT = 8192

function fakeElement() {
  const canvas = { width: 0, height: 0, getContext: () => ({ fillRect: () => {}, getImageData: () => ({ data: [0, 0, 0, canvas.width <= LIMIT ? 255 : 0] }) }) }
  return canvas
}

quietStorage()
globalThis.document = { createElement: fakeElement }

const { frameBounds, framePixels, frameRect, frameSplit, framing, paddingScale, renderVector, setAspect, setResolution, textureSize, textureSizes } = await import("../src/lib/framing.js")
const { outputSize } = await import("../src/lib/render.js")
const { view, viewport } = await import("../src/lib/view.js")

const TITLE = { left: 100, top: 50, width: 400, height: 100 }

function closeRect(actual, expected) {
  for (const key of ["left", "top", "width", "height"]) close(actual[key], expected[key])
}

function size() {
  return [framing.width, framing.height]
}

beforeEach(() => {
  Object.assign(framing, { tab: "normal", width: 1920, height: 1080, aspectWidth: 16, aspectHeight: 9, lastChanged: "width", linked: true, mode: "1.20", textureSize: 1024, padding: 0 })
  view.resolution = 1024
  viewport.vector = undefined
  viewport.titleRect = undefined
})

describe("paddingScale", () => {
  test("follows the render resolution outside the custom tab", () => {
    view.resolution = 2048
    assert.equal(paddingScale(), 2)
    framing.tab = "square"
    view.resolution = 512
    assert.equal(paddingScale(), 0.5)
  })

  test("follows the longest custom side on the custom tab", () => {
    framing.tab = "custom"
    assert.equal(paddingScale(), 1.875)
    framing.height = 4096
    assert.equal(paddingScale(), 4)
  })

  test("accepts a resolution stored as a string", () => {
    view.resolution = "2048"
    assert.equal(paddingScale(), 2)
  })

  test("holds the resolution to its limits", () => {
    view.resolution = 50
    assert.equal(paddingScale(), 0.125)
    view.resolution = 100000
    assert.equal(paddingScale(), 8)
  })

  test("falls back to the minimum for an unusable resolution", () => {
    for (const value of ["abc", "", 0, null]) {
      view.resolution = value
      assert.equal(paddingScale(), 0.125, `resolution ${value}`)
    }
  })
})

describe("textureSizes and textureSize", () => {
  test("every size fits the canvas limit in every mode", () => {
    for (const mode of ["1.20", "1.19", "mojang"]) {
      framing.mode = mode
      assert.deepEqual(textureSizes(), [256, 512, 1024, 2048], mode)
    }
  })

  test("keeps a listed size", () => {
    framing.textureSize = 512
    assert.equal(textureSize(), 512)
  })

  test("drops an unlisted size to the next one below", () => {
    framing.textureSize = 300
    assert.equal(textureSize(), 256)
    framing.textureSize = 4096
    assert.equal(textureSize(), 2048)
  })

  test("a size below every option falls back to the smallest", () => {
    framing.textureSize = 100
    assert.equal(textureSize(), 256)
  })
})

describe("frameRect", () => {
  test("normal without padding is the title", () => {
    closeRect(frameRect(TITLE), TITLE)
  })

  test("normal padding is measured in output pixels", () => {
    framing.padding = 12
    closeRect(frameRect(TITLE), { left: 95.2, top: 45.2, width: 409.6, height: 109.6 })
  })

  test("normal padding scales with the resolution", () => {
    framing.padding = 12
    view.resolution = 2048
    closeRect(frameRect(TITLE), { left: 95.2, top: 45.2, width: 409.6, height: 109.6 })
  })

  test("square centres on the title using the longest side", () => {
    framing.tab = "square"
    closeRect(frameRect(TITLE), { left: 100, top: -100, width: 400, height: 400 })
    framing.padding = 12
    closeRect(frameRect(TITLE), { left: 95.2, top: -104.8, width: 409.6, height: 409.6 })
  })

  test("custom takes the output shape around the title", () => {
    framing.tab = "custom"
    closeRect(frameRect(TITLE), { left: 100, top: -12.5, width: 400, height: 225 })
  })

  test("custom padding shrinks the title inside the output", () => {
    framing.tab = "custom"
    framing.padding = 64
    const width = 1920 / 4.2
    const height = 1080 / 4.2
    closeRect(frameRect(TITLE), { left: 300 - width / 2, top: 100 - height / 2, width, height })
  })

  test("custom padding is limited so the title keeps some room", () => {
    framing.tab = "custom"
    framing.width = 100
    framing.height = 100
    framing.padding = 1000
    closeRect(frameRect(TITLE), { left: 300 - 10000, top: 100 - 10000, width: 20000, height: 20000 })
  })

  test("normal padding is limited at the minimum resolution", () => {
    view.resolution = 128
    framing.padding = 1000
    closeRect(frameRect(TITLE), { left: 300 - 12800, top: 100 - 12650, width: 25600, height: 25300 })
  })

  test("minecraft 1.20 places the output around the fitted title", () => {
    framing.tab = "minecraft"
    closeRect(frameRect(TITLE), { left: 100 - 160 / 1.76, top: 50, width: 1024 / 1.76, height: 256 / 1.76 })
  })

  test("minecraft keeps the title on whole texture pixels", () => {
    framing.tab = "minecraft"
    const title = { ...TITLE, height: 45 }
    const rect = frameRect(title)
    close((title.top - rect.top) * framePixels(title, rect), 30)
  })

  test("minecraft uses the fallback texture size", () => {
    framing.tab = "minecraft"
    framing.textureSize = 300
    const scale = 256 * 176 / 1024 / 100
    close(frameRect(TITLE).width, 256 / scale)
    close(framePixels(TITLE, frameRect(TITLE)), scale)
  })

  test("minecraft mojang keeps the margin before the title", () => {
    framing.tab = "minecraft"
    framing.mode = "mojang"
    closeRect(frameRect(TITLE), { left: 100 - 8 / 5.08, top: 50 - 2 / 5.08, width: 1024 / 5.08, height: 1024 / 5.08 })
  })
})

describe("framePixels", () => {
  test("normal fits the longest frame side to the resolution", () => {
    view.resolution = 2048
    assert.equal(framePixels(TITLE, { left: 0, top: 0, width: 400, height: 100 }), 5.12)
    assert.equal(framePixels(TITLE, { left: 0, top: 0, width: 100, height: 400 }), 5.12)
  })

  test("custom is the output width over the frame width", () => {
    framing.tab = "custom"
    assert.equal(framePixels(TITLE, { left: 0, top: 0, width: 400, height: 225 }), 4.8)
  })

  test("minecraft is the fit scale", () => {
    framing.tab = "minecraft"
    close(framePixels(TITLE, frameRect(TITLE)), 1.76)
  })

  test("a frame times its pixel scale gives the size outputSize produces", () => {
    framing.padding = 12
    const image = { width: 1024, height: 256 }
    for (const tab of ["normal", "square"]) {
      framing.tab = tab
      const rect = frameRect(TITLE)
      const pixels = framePixels(TITLE, rect)
      const [width, height] = outputSize(image, framing, 12)
      close(rect.width * pixels, width)
      close(rect.height * pixels, height)
    }
    framing.tab = "custom"
    const rect = frameRect(TITLE)
    const pixels = framePixels(TITLE, rect)
    close(rect.width * pixels, 1920)
    close(rect.height * pixels, 1080)
  })

  test("minecraft maps the frame to the texture and the title to its fitted spot", () => {
    framing.tab = "minecraft"
    framing.mode = "1.19"
    const rect = frameRect(TITLE)
    const pixels = framePixels(TITLE, rect)
    close(rect.width * pixels, 1024)
    close(rect.height * pixels, 1024)
    close((TITLE.left - rect.left) * pixels, 196)
    close((TITLE.top - rect.top) * pixels, 0)
  })
})

describe("frameSplit", () => {
  test("is null outside the minecraft tab", () => {
    for (const tab of ["normal", "square", "custom"]) {
      framing.tab = tab
      framing.mode = "1.19"
      assert.equal(frameSplit(TITLE), null)
    }
  })

  test("is null for the unsplit 1.20 texture", () => {
    framing.tab = "minecraft"
    assert.equal(frameSplit(TITLE), null)
  })

  test("1.19 splits at the atlas seam in title units", () => {
    framing.tab = "minecraft"
    framing.mode = "1.19"
    const { x, shift } = frameSplit(TITLE)
    close(x, 100 - 196 / 1.76 + 620 / 1.76)
    close(shift[0], -620 / 1.76)
    close(shift[1], 180 / 1.76)
  })

  test("mojang splits a matching title through its middle", () => {
    framing.tab = "minecraft"
    framing.mode = "mojang"
    const { x, shift } = frameSplit(TITLE)
    close(x, 300)
    close(shift[0], -1024 / 5.08)
    close(shift[1], 512 / 5.08)
  })
})

describe("frameBounds", () => {
  test("is the frame when the frame contains the title", () => {
    framing.tab = "square"
    closeRect(frameBounds(TITLE), frameRect(TITLE))
  })

  test("reaches the title when it sticks out of the frame", () => {
    framing.tab = "minecraft"
    framing.mode = "mojang"
    const rect = frameRect(TITLE)
    closeRect(frameBounds(TITLE), { left: rect.left, top: rect.top, width: 500 - rect.left, height: rect.height })
  })
})

describe("setResolution", () => {
  test("linked width derives the height from the aspect", () => {
    setResolution("width", "1280")
    assert.deepEqual(size(), [1280, 720])
    assert.equal(framing.lastChanged, "width")
  })

  test("linked height derives the width from the aspect", () => {
    setResolution("height", "720")
    assert.deepEqual(size(), [1280, 720])
    assert.equal(framing.lastChanged, "height")
  })

  test("rounds the typed value", () => {
    setResolution("width", "1279.6")
    assert.deepEqual(size(), [1280, 720])
  })

  test("caps the typed value at the canvas limit", () => {
    setResolution("width", "100000")
    assert.deepEqual(size(), [8192, 4608])
  })

  test("a derived side over the limit brings both sides back inside", () => {
    framing.aspectWidth = 9
    framing.aspectHeight = 16
    setResolution("width", "100000")
    assert.deepEqual(size(), [4608, 8192])
  })

  test("a derived side never drops below one pixel", () => {
    framing.aspectWidth = 1000
    framing.aspectHeight = 1
    setResolution("width", "1")
    assert.deepEqual(size(), [1, 1])
  })

  test("unlinked sides move alone and update the aspect", () => {
    framing.linked = false
    setResolution("width", "800")
    assert.deepEqual(size(), [800, 1080])
    assert.deepEqual([framing.aspectWidth, framing.aspectHeight], [20, 27])
    setResolution("height", "600")
    assert.deepEqual(size(), [800, 600])
    assert.deepEqual([framing.aspectWidth, framing.aspectHeight], [4, 3])
  })

  test("unusable values change nothing", () => {
    for (const raw of ["abc", "", "0", "-5", "0.4"]) {
      setResolution("height", raw)
      assert.deepEqual(size(), [1920, 1080], `value ${raw}`)
      assert.equal(framing.lastChanged, "width", `value ${raw}`)
    }
  })
})

describe("setAspect", () => {
  test("resizes from the side changed last", () => {
    setAspect("aspectHeight", "16")
    assert.deepEqual(size(), [1920, 1920])
    framing.lastChanged = "height"
    framing.height = 1080
    setAspect("aspectHeight", "9")
    assert.deepEqual(size(), [1920, 1080])
  })

  test("over the limit by width pins the height", () => {
    framing.aspectHeight = 9
    setAspect("aspectWidth", "1")
    assert.deepEqual(size(), [910, 8192])
  })

  test("over the limit by height pins the width", () => {
    framing.lastChanged = "height"
    framing.aspectWidth = 16
    setAspect("aspectHeight", "1")
    assert.deepEqual(size(), [8192, 512])
  })

  test("the most extreme aspects keep both sides at one pixel or more", () => {
    framing.aspectWidth = 8192
    setAspect("aspectHeight", "1")
    assert.deepEqual(size(), [1920, 1])
    framing.width = 1920
    framing.aspectWidth = 1
    setAspect("aspectHeight", "8192")
    assert.deepEqual(size(), [1, 8192])
  })

  test("caps the aspect at the canvas limit", () => {
    setAspect("aspectWidth", "100000")
    assert.equal(framing.aspectWidth, LIMIT)
  })

  test("unusable values change nothing", () => {
    setAspect("aspectWidth", "0")
    assert.equal(framing.aspectWidth, 16)
    assert.deepEqual(size(), [1920, 1080])
  })
})

describe("renderVector", () => {
  function captured() {
    const asked = []
    function record(resolution) {
      asked.push(resolution)
      return null
    }
    viewport.vector = record
    return asked
  }

  test("asks for the render resolution outside the minecraft tab", () => {
    const asked = captured()
    view.resolution = 2048
    assert.equal(renderVector(), null)
    assert.deepEqual(asked, [2048])
  })

  test("asks for the title size fitted to the minecraft texture", () => {
    const asked = captured()
    framing.tab = "minecraft"
    viewport.titleRect = () => ({ left: 0, top: 0, width: 512, height: 64 })
    renderVector()
    assert.deepEqual(asked, [1024])
  })

  test("asks for no more than the texture holds when the fit is not exact", () => {
    const asked = captured()
    framing.tab = "minecraft"
    framing.mode = "mojang"
    viewport.titleRect = () => ({ left: 0, top: 0, width: 306, height: 20 })
    renderVector()
    assert.deepEqual(asked, [2032])
  })

  test("falls back to the render resolution before a title is measured", () => {
    const asked = captured()
    framing.tab = "minecraft"
    viewport.titleRect = () => null
    renderVector()
    assert.deepEqual(asked, [1024])
  })

  test("composes with padding converted to output pixels", () => {
    view.resolution = 2048
    framing.padding = 5
    viewport.vector = () => ({ width: 1000, height: 500, markup: "" })
    assert.match(renderVector(), /width="1000" height="510"/)
  })
})
