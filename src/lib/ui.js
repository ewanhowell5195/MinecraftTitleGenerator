import { reactive } from "vue"
import { image, tileableUrl } from "./assets.js"
import { surface } from "./canvas.js"

const units = reactive({})

export function download(name, url) {
  const link = document.createElement("a")
  link.download = name
  link.href = url
  link.click()
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
  return `${font?.folder ?? "font"}/thumbnails/${id}.png`
}

export function thumbnailHeight(font) {
  const url = thumbnail(font, "flat")
  if (!(url in units)) {
    units[url] = null
    image(url).then(loaded => units[url] = loaded.height)
  }
  return units[url]
}

export function tilePreview(tileables, id, variant) {
  return { backgroundImage: `url(${tileableUrl(tileables, id, variant)})` }
}

export async function saveSheet(font, kind, id) {
  const [source, flat] = await Promise.all([image(`${font.sheetFolder}/${kind}/${id}.png`), image(`${font.sheetFolder}/textures/flat.png`)])
  const scale = source.width / flat.width
  const { canvas, ctx } = surface(flat.width * scale, flat.height * scale)
  ctx.drawImage(source, 0, 0, flat.width * scale, flat.height * scale)
  download(`${id}.png`, canvas.toDataURL())
}
