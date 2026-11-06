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

function fetchPublic(url) {
  try {
    return Promise.resolve(new Response(fs.readFileSync(publicFile(url))))
  } catch (err) {
    if (err.code !== "ENOENT") throw err
    return Promise.resolve(new Response(null, { status: 404 }))
  }
}

function loadSafely(src) {
  if (src.startsWith("data:image/")) return loadImage(src)
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) throw new Error(`${src.slice(0, 40)} is not an image the renderer may load`)
  return loadImage(publicFile(src))
}

function softwareCanvas() {
  const canvas = new Canvas(1, 1)
  canvas.gpu = false
  return canvas
}

function pngUrl(bytes) {
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`
}

function webGLRenderer(THREE) {
  return () => {
    const gl = createContext(1, 1, { preserveDrawingBuffer: true })
    const renderer = new THREE.WebGLRenderer({ context: gl })
    const domElement = softwareCanvas()
    const ctx = domElement.getContext("2d")
    return {
      domElement,
      getContext: () => gl,
      setPixelRatio: ratio => renderer.setPixelRatio(ratio),
      setSize(width, height) {
        gl.getExtension("STACKGL_resize_drawingbuffer").resize(width, height)
        renderer.setSize(width, height, false)
        domElement.width = width
        domElement.height = height
      },
      render(scene, camera) {
        renderer.render(scene, camera)
        const { width, height } = domElement
        const pixels = new Uint8Array(width * height * 4)
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
        writeFlipped(ctx, pixels, width, height)
      }
    }
  }
}

export async function useNode() {
  const { THREE } = await getTHREE({ Canvas, Image, ImageData })
  globalThis.ImageData ??= ImageData
  globalThis.DOMMatrix ??= DOMMatrix
  usePlatform({
    storage: { getItem: () => null, setItem() {} },
    fetch: fetchPublic,
    createCanvas: softwareCanvas,
    createWebGLRenderer: webGLRenderer(THREE),
    decodePng: bytes => loadImage(Buffer.from(bytes)),
    pngUrl,
    frame: callback => setTimeout(callback),
    cancelFrame: clearTimeout,
    loadImage: async src => loadSafely(src)
  })
}
