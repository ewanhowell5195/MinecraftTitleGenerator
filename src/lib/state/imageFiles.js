import { image } from "../texture/assets.js"
import { surface } from "../texture/canvas.js"
import { loadImage } from "../font/font.js"
import { download, readDataUrl, takeFile } from "../core/files.js"
import { fileError } from "./notices.js"

const KEPT_TYPES = ["image/png", "image/jpeg"]

export async function readImage(event, apply) {
  const file = takeFile(event)
  if (!file) return
  if (KEPT_TYPES.includes(file.type)) return readDataUrl(file, apply)
  const url = URL.createObjectURL(file)
  try {
    const loaded = await loadImage(url)
    const { canvas, ctx } = surface(loaded.width, loaded.height)
    ctx.drawImage(loaded, 0, 0)
    readDataUrl(await new Promise(resolve => canvas.toBlob(resolve, "image/png")), apply)
  } catch {
    fileError.value = `Couldn't open ${file.name}: this browser can't read it as an image`
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function saveImage(path, name) {
  const source = await image(path)
  const { canvas, ctx } = surface(source.width, source.height)
  ctx.drawImage(source, 0, 0)
  download(name, canvas.toDataURL())
}

export async function saveSheet(font, kind, id) {
  const [source, flat] = await Promise.all([image(`${font.sheetFolder}/${kind}/${id}.png`), image(`${font.sheetFolder}/textures/flat.png`)])
  const height = flat.height * source.width / flat.width
  const { canvas, ctx } = surface(source.width, height)
  ctx.drawImage(source, 0, 0, source.width, height)
  download(`${id}.png`, canvas.toDataURL())
}
