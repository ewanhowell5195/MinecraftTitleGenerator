import { tileableName } from "../../lib/submissionKinds/tileable.js"

export const TILEABLE_PREVIEW_FONT = "minecraft-ten"

export const tileable = {
  file: "PNG",
  line(item, file, text) {
    return { text, font: TILEABLE_PREVIEW_FONT, textureSource: "custom", customTexture: file, customTextureMode: "tileable" }
  },
  summary(item) {
    return item.target ? `A variant of the ${tileableName(item.target)} tileable` : "A new tileable"
  },
  rows(item) {
    const rows = item.target ? [{ label: "Variant of", value: tileableName(item.target) }] : []
    return item.details.size ? rows.concat({ label: "Size", value: `${item.details.size}x${item.details.size}` }) : rows
  }
}
