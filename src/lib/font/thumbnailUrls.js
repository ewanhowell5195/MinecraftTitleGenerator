import { reactive } from "vue"
import { image } from "../texture/assets.js"
import { customThumbnail } from "./customFonts.js"
import { fontFolder } from "./catalog.js"
import { isCustomFont } from "../settings/settings.js"

const heights = reactive({})

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
