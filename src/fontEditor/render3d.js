import { forgetFolder } from "../lib/assets.js"
import { forgetFont } from "../lib/font.js"
import { buildSheet, exportJson, flatTexture } from "../lib/fontEditor.js"
import { FILE_VERSION, defaultBorder, defaultDepth, defaultSpacing } from "../lib/settings.js"
import { linesCanvas } from "../lib/titlePicture.js"
import { forgetFiles, pngUrl, serveFile } from "../lib/virtualFiles.js"

const previous = new Map()
let count = 0

function forget(id) {
  const folder = `font/${id}`
  forgetFont(id)
  forgetFolder(folder)
  forgetFiles(folder)
}

export async function renderFont(font, text, { terminators = false, stretch = 1, width, slot = "preview", strip = null, texture = null, variant = null }) {
  const id = `editor-preview-${++count}`
  const folder = `font/${id}`
  const { editor, strips, ...entry } = { ...exportJson(font, ""), id, name: font.name || "My Font" }
  if (strip) entry.strips = [strip]
  serveFile(`${folder}/font.png`, pngUrl(buildSheet(font)))
  serveFile(`${folder}/textures/flat.png`, pngUrl(flatTexture(font)))
  serveFile(`${folder}/textures.json`, { primary: "flat", secondary: "flat", textures: { flat: { border: "#000000" } }, overlays: {} })
  try {
    const line = { text, font: id, terminators, depth: defaultDepth(entry), border: defaultBorder("top", entry), spacing: defaultSpacing("top", entry) }
    if (stretch !== 1) Object.assign(line, { scaleY: stretch, scaleMarked: true })
    if (texture) line.texture = texture
    if (variant) line.textureVariant = variant
    return await linesCanvas({ version: FILE_VERSION, lines: [line] }, [entry], {}, width)
  } finally {
    if (previous.has(slot)) forget(previous.get(slot))
    previous.set(slot, id)
  }
}
