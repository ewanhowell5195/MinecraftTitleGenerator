import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import createContext from "gl"
import getTHREE from "headless-three"
import { Canvas, DOMMatrix, Image, ImageData, loadImage } from "skia-canvas"
import { usePlatform } from "../src/lib/platform.js"
import { writeFlipped } from "../src/lib/render.js"

const PUBLIC = fileURLToPath(new URL("../public/", import.meta.url))

function publicFile(url) {
  const file = path.resolve(PUBLIC, url)
  if (!file.startsWith(PUBLIC)) throw new Error(`${url} is outside the public folder`)
  return file
}

async function fetchPublic(url) {
  try {
    return new Response(await fs.promises.readFile(publicFile(url)))
  } catch (err) {
    if (err.code !== "ENOENT") throw err
    return new Response(null, { status: 404 })
  }
}

async function loadSafely(src) {
  if (src.startsWith("data:image/")) return loadImage(src)
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) throw new Error(`${src.slice(0, 40)} is not an image the renderer may load`)
  return loadImage(publicFile(src))
}

const PIXEL_WRITES = ["clearRect", "drawCanvas", "fill", "fillRect", "fillText", "putImageData", "reset", "stroke", "strokeRect", "strokeText"]
const canvasPixels = new WeakMap()

function cropped(pixels, x, y, width, height) {
  const out = new ImageData(width, height)
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * pixels.width + x) * 4
    out.data.set(pixels.data.subarray(from, from + width * 4), row * width * 4)
  }
  return out
}

function softwareCanvas() {
  const canvas = new Canvas(1, 1)
  canvas.gpu = false
  const ctx = canvas.getContext("2d")
  const read = ctx.getImageData.bind(ctx)
  const draw = ctx.drawImage.bind(ctx)
  let pixels = null
  function current() {
    pixels ??= read(0, 0, canvas.width, canvas.height)
    return pixels
  }
  for (const name of PIXEL_WRITES) {
    const write = ctx[name].bind(ctx)
    ctx[name] = (...args) => {
      pixels = null
      return write(...args)
    }
  }
  ctx.drawImage = (source, ...rest) => {
    pixels = null
    return draw(rest.length === 8 && !ctx.imageSmoothingEnabled ? canvasPixels.get(source)?.() ?? source : source, ...rest)
  }
  ctx.getImageData = (x, y, width, height, ...rest) => {
    if (x < 0 || y < 0 || x + width > canvas.width || y + height > canvas.height) return read(x, y, width, height, ...rest)
    return cropped(current(), x, y, width, height)
  }
  for (const side of ["width", "height"]) {
    const { get, set } = Object.getOwnPropertyDescriptor(Canvas.prototype, side)
    Object.defineProperty(canvas, side, {
      get: () => get.call(canvas),
      set(value) {
        pixels = null
        set.call(canvas, value)
      }
    })
  }
  canvasPixels.set(canvas, current)
  return canvas
}

function pngUrl(bytes) {
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`
}

function useLinearTable(THREE) {
  const { ImageUtils } = THREE
  const decode = ImageUtils.sRGBToLinear
  const table = Uint8ClampedArray.from({ length: 256 }, (_, value) => new THREE.Color(value / 255, 0, 0).convertSRGBToLinear().r * 255)
  ImageUtils.sRGBToLinear = image => {
    if (image.data) return decode.call(ImageUtils, image)
    const canvas = softwareCanvas()
    canvas.width = image.width
    canvas.height = image.height
    const ctx = canvas.getContext("2d")
    ctx.drawImage(image, 0, 0, image.width, image.height)
    const pixels = ctx.getImageData(0, 0, image.width, image.height)
    const { data } = pixels
    for (let at = 0; at < data.length; at++) data[at] = table[data[at]]
    ctx.putImageData(pixels, 0, 0)
    return canvas
  }
}

function webGLRenderer(THREE) {
  useLinearTable(THREE)
  return () => {
    const gl = createContext(1, 1, { preserveDrawingBuffer: true })
    const renderer = new THREE.WebGLRenderer({ context: gl })
    const domElement = softwareCanvas()
    const ctx = domElement.getContext("2d")
    const keptPrograms = new WeakSet()
    let rendered = null
    const view = {
      get drawingBufferWidth() {
        return gl.drawingBufferWidth
      },
      get drawingBufferHeight() {
        return gl.drawingBufferHeight
      },
      RGBA: gl.RGBA,
      UNSIGNED_BYTE: gl.UNSIGNED_BYTE,
      readPixels: (x, y, width, height, format, type, target) => target.set(rendered)
    }
    return {
      domElement,
      getContext: () => view,
      setPixelRatio: ratio => renderer.setPixelRatio(ratio),
      setSize(width, height) {
        gl.getExtension("STACKGL_resize_drawingbuffer").resize(width, height)
        renderer.setSize(width, height, false)
        domElement.width = width
        domElement.height = height
      },
      render(scene, camera) {
        renderer.render(scene, camera)
        for (const program of renderer.info.programs) {
          if (keptPrograms.has(program)) continue
          keptPrograms.add(program)
          program.usedTimes++
        }
        const { width, height } = domElement
        rendered = new Uint8Array(width * height * 4)
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rendered)
        writeFlipped(ctx, rendered, width, height)
      }
    }
  }
}

export async function useNode() {
  const { THREE } = await getTHREE({ Canvas, Image, ImageData })
  globalThis.ImageData ??= ImageData
  globalThis.DOMMatrix ??= DOMMatrix
  usePlatform({
    fetch: fetchPublic,
    createCanvas: softwareCanvas,
    createWebGLRenderer: webGLRenderer(THREE),
    decodePng: bytes => loadImage(Buffer.from(bytes)),
    pngUrl,
    frame: callback => setTimeout(callback),
    cancelFrame: clearTimeout,
    loadImage: loadSafely
  })
}
