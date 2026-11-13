import { customFontId } from "../../lib/customFonts.js"
import { overlayLayer } from "../../lib/settings.js"

const IMPORT_HEIGHT = 40
const KIND_NAMES = { texture: "Textures", overlay: "Overlays", strip: "Strips" }

function parentName(item, fonts) {
  return fonts.find(entry => entry.id === item.target)?.name ?? item.target
}

function fontSource(item, file) {
  return { kind: "json", fileName: `${item.details.id || "font"}.json`, data: file, height: IMPORT_HEIGHT }
}

export const font = {
  file: "font's JSON file",
  openable(item) {
    return (item.details.extras ?? []).length < 2
  },
  extra(item) {
    return item.details.extras?.[0] ?? null
  },
  line(item, file, text) {
    const source = fontSource(item, file)
    return { text, font: customFontId(source), customFont: source }
  },
  dressed(line, extra, image) {
    if (extra.kind === "overlay") return { ...line, overlayMode: "custom", overlays: [{ ...overlayLayer(null), source: "file", file: image }] }
    return { ...line, textureSource: "custom", customTexture: image, customTextureMode: extra.kind === "strip" ? "strip" : "standard", customBorder: true, borderColour: extra.border ?? "#000000" }
  },
  summary(item, fonts) {
    if (!item.target) return "A new font"
    return `A font listed under ${parentName(item, fonts)}`
  },
  rows(item, fonts) {
    const kind = item.target ? `Variant of ${parentName(item, fonts)}` : "New font"
    const extras = item.details.extras ?? []
    const bundled = Object.entries(KIND_NAMES).map(([kind, label]) => ({ label, value: extras.filter(extra => extra.kind === kind).map(extra => extra.name).join(", ") })).filter(row => row.value)
    return [{ label: "ID", value: item.details.id }, { label: "Added as", value: kind }].concat(bundled)
  }
}
