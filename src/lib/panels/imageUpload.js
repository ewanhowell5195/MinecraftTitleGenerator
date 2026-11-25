import { readDataUrl } from "../core/files.js"
import { loadImage } from "../font/font.js"
import { surface } from "../texture/canvas.js"

const KEPT_TYPES = ["image/png", "image/jpeg"]

async function asPng(file) {
  const url = URL.createObjectURL(file)
  try {
    const loaded = await loadImage(url)
    const { canvas, ctx } = surface(loaded.width, loaded.height)
    ctx.drawImage(loaded, 0, 0)
    return await new Promise(resolve => canvas.toBlob(resolve, "image/png"))
  } catch {
    throw new Error(`Couldn't open ${file.name}: it can't be read as an image`)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function readImageFile(file, apply) {
  readDataUrl(KEPT_TYPES.includes(file.type) ? file : await asPng(file), apply)
}
