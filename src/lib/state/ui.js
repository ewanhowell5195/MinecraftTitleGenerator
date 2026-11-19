import { reactive } from "vue"
import { image, tileableUrl } from "../texture/assets.js"
import { surface } from "../texture/canvas.js"
import { customThumbnail } from "../font/customFonts.js"
import { fontFolder, loadImage } from "../font/font.js"
import { fileError } from "./notices.js"
import { isCustomFont } from "../settings/settings.js"

const heights = reactive({})
const KEPT_TYPES = ["image/png", "image/jpeg"]

export function download(name, url) {
  const link = document.createElement("a")
  link.download = name
  link.href = url
  link.click()
}

export function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob)
  download(name, url)
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export function takeFile(event) {
  const file = event.target.files[0]
  event.target.value = ""
  return file
}

export function readDataUrl(file, apply) {
  const reader = new FileReader()
  reader.onload = () => apply(reader.result)
  reader.readAsDataURL(file)
}

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

export const SEARCH_ABOVE = 9

export function fontThumbnail(font) {
  return `${fontFolder(font)}/thumbnails/flat.png`
}

export function thumbnail(font, id, layer = null) {
  const name = layer === null ? id : `layer-${layer}/${id}`
  if (isCustomFont(font?.id)) return customThumbnail(font.id, name)
  return `${font?.folder ?? "font"}/thumbnails/${name}.png`
}

export function thumbnailHeight(font) {
  const url = thumbnail(font, "flat")
  if (!url) return null
  if (!(url in heights)) {
    heights[url] = null
    image(url).then(loaded => heights[url] = loaded.height)
  }
  return heights[url]
}

export function tilePreview(tileables, id, variant) {
  return { backgroundImage: `url(${tileableUrl(tileables, id, variant)})` }
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
