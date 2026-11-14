import { reactive } from "vue"
import { image, tileableUrl } from "./assets.js"
import { surface } from "./canvas.js"
import { customThumbnail } from "./customFonts.js"
import { loadImage } from "./font.js"

const heights = reactive({})

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
  if (file.type === "image/png") return readDataUrl(file, apply)
  const url = URL.createObjectURL(file)
  try {
    const loaded = await loadImage(url)
    const { canvas, ctx } = surface(loaded.width, loaded.height)
    ctx.drawImage(loaded, 0, 0)
    apply(canvas.toDataURL("image/png"))
  } catch {
    const { fileError } = await import("./file.js")
    fileError.value = `Couldn't open ${file.name}: this browser can't read it as an image`
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function fontThumbnail(fonts, id) {
  const entry = fonts.find(item => item.id === id)
  return `font/${entry?.variant ? `${entry.variant}/` : ""}${id}/thumbnails/flat.png`
}

export function thumbnail(font, id, layer = null) {
  const name = layer === null ? id : `layer-${layer + 1}/${id}`
  return customThumbnail(font?.id, name) ?? `${font?.folder ?? "font"}/thumbnails/${name}.png`
}

export function thumbnailHeight(font) {
  const url = thumbnail(font, "flat")
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
