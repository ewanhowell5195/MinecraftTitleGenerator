import { DEFAULT_FONT } from "#lib/settings/defaults.js"
import { tileableName } from "#lib/submissions/kinds/tileable.js"

export const tileable = {
  file: "PNG",
  line(item, file, text) {
    return { text, font: DEFAULT_FONT, textureSource: "custom", customTexture: file, customTextureMode: "tileable" }
  },
  summary(item) {
    return item.target ? `A variant of the ${tileableName(item.target)} tileable` : "A new tileable"
  },
  rows(item) {
    const rows = item.target ? [{ label: "Variant of", value: tileableName(item.target) }] : []
    return item.details.size ? rows.concat({ label: "Size", value: `${item.details.size}x${item.details.size}` }) : rows
  }
}
