import { fullName } from "../../lib/font.js"
import { GENERATED_EDGE_OVERLAYS, withGenerated } from "../../lib/generated.js"
import { titleCase } from "../../lib/names.js"
import { FACE_COLOURS, FACE_PANELS, overlayLayer } from "../../lib/settings.js"
import { textureName } from "../../lib/submissionKinds/fontAsset.js"

const FACE_LABELS = { faces: "Top and bottom faces", inner: "Inner faces", sides: "Side faces" }

function withSource(layer) {
  return { ...overlayLayer(layer.overlay), ...layer, source: "premade", file: null }
}

function layerCount(details) {
  return details.perLayer ? Math.max(...["overlays", "edgeOverlays"].concat(FACE_PANELS).map(key => details[key]?.length ?? 1)) : 1
}

function layerLook(details, layer) {
  const pick = value => details.perLayer ? value?.[layer] : value
  const look = {}
  if (details.overlays !== undefined) Object.assign(look, { overlayMode: "custom", overlays: (pick(details.overlays) ?? []).map(withSource), edgeOverlayMode: "custom", edgeOverlays: (pick(details.edgeOverlays) ?? []).map(withSource) })
  for (const name of FACE_PANELS) {
    const colour = pick(details[name])
    if (colour) Object.assign(look, { [FACE_COLOURS[name].custom]: true, [FACE_COLOURS[name].colour]: colour })
  }
  return look
}

function layered(details) {
  if (!details.perLayer) return layerLook(details, 0)
  const layerSettings = Array.from({ length: layerCount(details) - 1 }, (_, index) => layerLook(details, index + 1))
  return { ...layerLook(details, 0), separateOverlays: true, separateColour: true, layerSettings }
}

function perLayerText(details, value, describe) {
  if (!details.perLayer) return describe(value)
  return value.map((item, index) => `Layer ${index + 1}: ${describe(item)}`).join(" · ")
}

function fontAsset(kind) {
  return {
    file: "PNG",
    line(item, file, text) {
      if (kind === "overlay") return { text, font: item.target, textureSource: "premade", texture: "flat", overlayMode: "custom", overlays: [{ ...overlayLayer(null), source: "file", file }] }
      return { text, font: item.target, textureSource: "custom", customTexture: file, customTextureMode: "standard", customBorder: true, borderColour: item.details.border, ...layered(item.details) }
    },
    summary(item, fonts) {
      const font = fonts.find(entry => entry.id === item.target)
      const what = kind === "overlay" ? "An overlay" : item.details.variantOf ? `A variant of the ${textureName(item.details.variantOf)} texture` : "A texture"
      return `${what} for ${font ? fullName(font, fonts) : item.target}`
    },
    rows(item, fonts) {
      const font = fonts.find(entry => entry.id === item.target)
      const { details } = item
      return [
        { label: "Font", value: font ? fullName(font, fonts) : item.target },
        ...(details.variantOf ? [{ label: "Variant of", value: textureName(details.variantOf) }] : []),
        { label: "Size", value: details.density > 1 ? `${details.density}x the template` : "Template size" },
        ...(kind === "texture" ? [{ label: "Border", value: details.border, colour: details.border }] : []),
        ...(details.primary || details.secondary ? [{ label: "Font defaults", value: ["primary", "secondary"].filter(role => details[role]).map(titleCase).join(" and ") }] : []),
        ...[["overlays", "Default overlays", withGenerated({})], ["edgeOverlays", "Default edge overlays", GENERATED_EDGE_OVERLAYS]].filter(([key]) => details[key]?.length).map(([key, label, known]) => ({ label, value: perLayerText(details, details[key], layers => layers.map(layer => known[layer.overlay]?.name ?? titleCase(layer.overlay)).join(", ") || "None") })),
        ...FACE_PANELS.filter(name => details[name] !== undefined).map(name => ({ label: FACE_LABELS[name], value: perLayerText(details, details[name], colour => colour ?? "Texture's own"), ...(!details.perLayer && { colour: details[name] }) }))
      ]
    }
  }
}

export const texture = fontAsset("texture")
export const overlay = fontAsset("overlay")
