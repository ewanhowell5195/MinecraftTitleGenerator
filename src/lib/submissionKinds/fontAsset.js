import { fontFolder, sheetOwner } from "../font.js"
import { GENERATED_EDGE_OVERLAYS, GENERATED_SETTINGS, withGenerated } from "../generated.js"
import { titleCase } from "../names.js"
import { BLEND_OPTIONS, overlayLayer } from "../settings.js"
import { DEFAULT_ROLES, HEX_COLOUR, pngProblem, pngSize, textureDensity } from "../submissions.js"

export function submissionFont(fonts, id) {
  const entry = fonts.find(font => font.id === id)
  return entry ? sheetOwner(entry, fonts) : null
}

export function fontOwners(fonts) {
  return fonts.filter(font => sheetOwner(font, fonts) === font)
}

export function texturesList(font) {
  return `/${fontFolder(font)}/textures.json`
}

export function textureName(id, data) {
  return data?.name ?? titleCase(id)
}

export function flatSize(ctx, font) {
  return ctx.memo(`flat:${font.id}`, async () => {
    const path = `/${fontFolder(font)}/textures/flat.png`
    const size = pngSize(await ctx.bytes(path))
    if (!size) throw new Error(`${path} isn't a PNG`)
    return size
  })
}

export function templateProblem(bytes, flat, noun) {
  const size = pngSize(bytes)
  return textureDensity(size, flat) ? null : `The ${noun} has to be the font's template size, ${flat.width}x${flat.height}, or a whole number of times bigger, and this one is ${size.width}x${size.height}.`
}

export const DEFAULT_OVERLAY_LIMIT = 8
const LAYER_KINDS = { overlays: "overlay", edgeOverlays: "edge overlay" }
const BLEND_VALUES = new Set(BLEND_OPTIONS.map(item => item.value))

export function overlayChoices(list) {
  return { overlays: Object.fromEntries(Object.entries(withGenerated(list?.overlays ?? {})).filter(([, data]) => !data.layered)), edgeOverlays: GENERATED_EDGE_OVERLAYS }
}

function cleanLayer(layer, available) {
  if (!layer || typeof layer !== "object" || typeof layer.overlay !== "string" || !Object.hasOwn(available, layer.overlay)) return null
  if ((layer.source ?? "premade") !== "premade") return null
  const definition = available[layer.overlay]
  const clean = overlayLayer(layer.overlay, definition)
  delete clean.file
  for (const key of ["blend", "colourBlend"]) {
    if (layer[key] === undefined) continue
    if (!BLEND_VALUES.has(layer[key])) return null
    clean[key] = layer[key]
  }
  if (layer.colour !== undefined) {
    if (typeof layer.colour !== "string" || !HEX_COLOUR.test(layer.colour)) return null
    clean.colour = layer.colour.toLowerCase()
  }
  if (layer.opacity !== undefined) {
    if (!Number.isInteger(layer.opacity) || layer.opacity < 0 || layer.opacity > 100) return null
    clean.opacity = layer.opacity
  }
  for (const key of ["sideWrap", "edgeWrap"]) {
    if (layer[key] === undefined) continue
    if (typeof layer[key] !== "boolean") return null
    if (layer[key]) clean[key] = true
  }
  for (const item of GENERATED_SETTINGS[definition.generated] ?? []) {
    const value = layer[item.key]
    if (value === undefined) continue
    if (typeof value !== "number" || !Number.isFinite(value) || value < item.min || value > item.max) return null
    clean[item.key] = value
  }
  return clean
}

function defaultLayers(details, list, problems) {
  if (details.overlays === undefined) return {}
  const choices = overlayChoices(list)
  const clean = {}
  for (const [key, noun] of Object.entries(LAYER_KINDS)) {
    const layers = details[key] ?? []
    if (!Array.isArray(layers) || layers.length > DEFAULT_OVERLAY_LIMIT) {
      problems.overlays = `A texture can have up to ${DEFAULT_OVERLAY_LIMIT} default ${noun}s.`
      continue
    }
    const cleaned = layers.map(layer => cleanLayer(layer, choices[key]))
    if (cleaned.includes(null)) problems.overlays = `One of the default ${noun}s isn't valid. Remove it and add it again.`
    else if (cleaned.length) clean[key] = cleaned
  }
  if (!problems.overlays && !clean.overlays && !clean.edgeOverlays) problems.overlays = "Add a default overlay, or turn off default overlays."
  return clean
}

function fontAsset(id, label, { border, variants = false }) {
  const noun = label.toLowerCase()
  return {
    id,
    label,
    noun,
    available: true,
    accept: "image/png",
    derived: ["density"],
    async check({ target, details, bytes }, ctx) {
      const problems = {}
      const clean = {}
      const font = submissionFont(ctx.fonts, target)
      if (!font) problems.target = `Pick the font the ${noun} is for.`
      if (border) {
        if (typeof details.border === "string" && HEX_COLOUR.test(details.border)) clean.border = details.border.toLowerCase()
        else problems.border = "The border colour has to be a hex colour like #000000."
      }
      const list = font && variants && (details.variantOf || details.overlays !== undefined || DEFAULT_ROLES.some(role => details[role] === true)) ? await ctx.json(texturesList(font)) : null
      if (variants && details.variantOf) {
        const parents = list?.textures ?? {}
        if (typeof details.variantOf === "string" && Object.hasOwn(parents, details.variantOf) && parents[details.variantOf].type !== "strip") clean.variantOf = details.variantOf
        else problems.variantOf = "Pick the texture this is a variant of."
      }
      if (variants && !details.variantOf) {
        for (const role of DEFAULT_ROLES.filter(role => details[role] === true)) {
          if (list?.[role]) problems[role] = `${font.name} already has a ${role} texture.`
          else clean[role] = true
        }
      }
      if (variants && font) Object.assign(clean, defaultLayers(details, list, problems))
      if (bytes) {
        problems.file = pngProblem(bytes, noun)
        if (!problems.file && font) {
          const flat = await flatSize(ctx, font)
          problems.file = templateProblem(bytes, flat, noun)
          if (!problems.file) clean.density = textureDensity(pngSize(bytes), flat)
        }
      }
      return { problems, target: font?.id ?? target, details: clean }
    }
  }
}

export const texture = fontAsset("texture", "Texture", { border: true, variants: true })
export const overlay = fontAsset("overlay", "Overlay", { border: false })
