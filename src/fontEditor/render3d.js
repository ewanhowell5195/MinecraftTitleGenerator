import { forgetFolder } from "../lib/assets.js"
import { forgetFont } from "../lib/font.js"
import { buildSheet, exportJson } from "../lib/fontEditor.js"
import { platform, usePlatform } from "../lib/platform.js"
import { FILE_VERSION, defaultBorder, defaultDepth, defaultSpacing } from "../lib/settings.js"
import { linesCanvas } from "../lib/titlePicture.js"
import { flatTexture } from "./store.js"

const files = new Map()
const previous = new Map()
let count = 0

function install() {
  const { fetch: fetchFile, loadImage } = platform
  usePlatform({
    fetch: (url, ...rest) => files.has(url) ? Promise.resolve(new Response(JSON.stringify(files.get(url)), { headers: { "content-type": "application/json" } })) : fetchFile(url, ...rest),
    loadImage: src => loadImage(files.get(src) ?? src)
  })
}

install()

function pngUrl({ data, width, height }) {
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, width)
  canvas.height = Math.max(1, height)
  if (width && height) canvas.getContext("2d").putImageData(new ImageData(data, width, height), 0, 0)
  return canvas.toDataURL("image/png")
}

function forget(id) {
  const folder = `font/${id}`
  forgetFont(id)
  forgetFolder(folder)
  for (const url of files.keys()) if (url.startsWith(`${folder}/`)) files.delete(url)
}

export async function renderFont(font, text, { terminators = false, width, slot = "preview", strip = null, texture = null, variant = null }) {
  const id = `editor-preview-${++count}`
  const folder = `font/${id}`
  const { editor, strips, ...entry } = { ...exportJson(font, ""), id, name: font.name || "My Font" }
  if (strip) entry.strips = [strip]
  files.set(`${folder}/font.png`, pngUrl(buildSheet(font)))
  files.set(`${folder}/textures/flat.png`, pngUrl(flatTexture(font)))
  files.set(`${folder}/textures.json`, { primary: "flat", secondary: "flat", textures: { flat: { border: "#000000" } }, overlays: {} })
  try {
    const line = { text, font: id, terminators, depth: defaultDepth(entry), border: defaultBorder("top", entry), spacing: defaultSpacing("top", entry) }
    if (texture) line.texture = texture
    if (variant) line.textureVariant = variant
    return await linesCanvas({ version: FILE_VERSION, lines: [line] }, [entry], {}, width)
  } finally {
    if (previous.has(slot)) forget(previous.get(slot))
    previous.set(slot, id)
  }
}
