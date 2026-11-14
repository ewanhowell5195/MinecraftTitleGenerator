import { fullName } from "../../lib/font.js"
import { GENERATED_EDGE_OVERLAYS, withGenerated } from "../../lib/generated.js"
import { titleCase } from "../../lib/names.js"
import { overlayLayer } from "../../lib/settings.js"
import { textureName } from "../../lib/submissionKinds/fontAsset.js"

function withSource(layer) {
  return { ...overlayLayer(layer.overlay), ...layer, source: "premade", file: null }
}

function fontAsset(kind) {
  return {
    file: "PNG",
    line(item, file, text) {
      if (kind === "overlay") return { text, font: item.target, textureSource: "premade", texture: "flat", overlayMode: "custom", overlays: [{ ...overlayLayer(null), source: "file", file }] }
      const layered = item.details.overlays !== undefined ? { overlayMode: "custom", overlays: (item.details.overlays ?? []).map(withSource), edgeOverlayMode: "custom", edgeOverlays: (item.details.edgeOverlays ?? []).map(withSource) } : {}
      return { text, font: item.target, textureSource: "custom", customTexture: file, customTextureMode: "standard", customBorder: true, borderColour: item.details.border, ...layered }
    },
    summary(item, fonts) {
      const font = fonts.find(entry => entry.id === item.target)
      const what = kind === "overlay" ? "An overlay" : item.details.variantOf ? `A variant of the ${textureName(item.details.variantOf)} texture` : "A texture"
      return `${what} for ${font ? fullName(font, fonts) : item.target}`
    },
    rows(item, fonts) {
      const font = fonts.find(entry => entry.id === item.target)
      return [
        { label: "Font", value: font ? fullName(font, fonts) : item.target },
        ...(item.details.variantOf ? [{ label: "Variant of", value: textureName(item.details.variantOf) }] : []),
        { label: "Size", value: item.details.density > 1 ? `${item.details.density}x the template` : "Template size" },
        ...(kind === "texture" ? [{ label: "Border", value: item.details.border, colour: item.details.border }] : []),
        ...(item.details.primary || item.details.secondary ? [{ label: "Font defaults", value: ["primary", "secondary"].filter(role => item.details[role]).map(titleCase).join(" and ") }] : []),
        ...[["overlays", "Default overlays", withGenerated({})], ["edgeOverlays", "Default edge overlays", GENERATED_EDGE_OVERLAYS]].filter(([key]) => item.details[key]?.length).map(([key, label, known]) => ({ label, value: item.details[key].map(layer => known[layer.overlay]?.name ?? titleCase(layer.overlay)).join(", ") }))
      ]
    }
  }
}

export const texture = fontAsset("texture")
export const overlay = fontAsset("overlay")
