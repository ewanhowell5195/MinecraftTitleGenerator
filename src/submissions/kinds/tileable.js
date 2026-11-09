import { tileableName } from "../../lib/submissionKinds/tileable.js"

export const TILEABLE_PREVIEW_FONT = "minecraft-ten"

export const tileable = {
  image: true,
  line(item, file, text) {
    return { text, font: TILEABLE_PREVIEW_FONT, textureSource: "custom", customTexture: file, customTextureMode: "tileable" }
  },
  publishedLine(item, fonts, text) {
    return { text, font: TILEABLE_PREVIEW_FONT, textureSource: "tileable", tileableSource: "premade", tileable: item.target || item.asset, tileableVariant: item.target ? item.asset : null }
  },
  summary(item) {
    return item.target ? `A variant of the ${tileableName(item.target)} tileable` : "A new tileable"
  },
  rows(item) {
    const rows = item.target ? [{ label: "Variant of", value: tileableName(item.target) }] : []
    return item.details.size ? rows.concat({ label: "Size", value: `${item.details.size}x${item.details.size}` }) : rows
  }
}
