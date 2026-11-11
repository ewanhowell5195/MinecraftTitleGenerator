import { fullName } from "../../lib/font.js"
import { overlayLayer } from "../../lib/settings.js"

function fontAsset(kind) {
  return {
    file: "PNG",
    line(item, file, text) {
      if (kind === "overlay") return { text, font: item.target, textureSource: "premade", texture: "flat", overlayMode: "custom", overlays: [{ ...overlayLayer(null), source: "file", file }] }
      return { text, font: item.target, textureSource: "custom", customTexture: file, customTextureMode: "standard", customBorder: true, borderColour: item.details.border }
    },
    summary(item, fonts) {
      const font = fonts.find(entry => entry.id === item.target)
      return `${kind === "overlay" ? "An overlay" : "A texture"} for ${font ? fullName(font, fonts) : item.target}`
    },
    rows(item, fonts) {
      const font = fonts.find(entry => entry.id === item.target)
      return [
        { label: "Font", value: font ? fullName(font, fonts) : item.target },
        { label: "Size", value: item.details.density > 1 ? `${item.details.density}x the template` : "Template size" },
        ...(kind === "texture" ? [{ label: "Border", value: item.details.border, colour: item.details.border }] : [])
      ]
    }
  }
}

export const texture = fontAsset("texture")
export const overlay = fontAsset("overlay")
