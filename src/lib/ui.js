import { reactive } from "vue"
import { image, tileableUrl } from "./assets.js"
import { surface } from "./canvas.js"
import { customThumbnail } from "./customFonts.js"

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

export function readFile(event, apply) {
  const file = event.target.files[0]
  event.target.value = ""
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => apply(reader.result)
  reader.readAsDataURL(file)
}

export function fontThumbnail(fonts, id) {
  const entry = fonts.find(item => item.id === id)
  return `font/${entry?.variant ? `${entry.variant}/` : ""}${id}/thumbnails/flat.png`
}

export function thumbnail(font, id) {
  return customThumbnail(font?.id, id) ?? `${font?.folder ?? "font"}/thumbnails/${id}.png`
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

export async function saveSheet(font, kind, id) {
  const [source, flat] = await Promise.all([image(`${font.sheetFolder}/${kind}/${id}.png`), image(`${font.sheetFolder}/textures/flat.png`)])
  const height = flat.height * source.width / flat.width
  const { canvas, ctx } = surface(source.width, height)
  ctx.drawImage(source, 0, 0, source.width, height)
  download(`${id}.png`, canvas.toDataURL())
}
