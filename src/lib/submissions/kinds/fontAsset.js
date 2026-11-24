import { fontFolder, fullOrder, sheetOwner } from "../../font/catalog.js"
import { parseMask } from "../../font/sheetParse.js"
import { GENERATED_EDGE_OVERLAYS, GENERATED_SETTINGS, withGenerated } from "../../texture/overlays/settings.js"
import { titleCase } from "../../core/names.js"
import { MAX_ANCHORS, paletteHexes, paletteOf } from "../../texture/overlayColours.js"
import { decodePng } from "../../core/png.js"
import { BLEND_OPTIONS, defaultBorder } from "../../settings/defaults.js"
import { overlayFits } from "../../settings/layers.js"
import { FACE_PANELS, overlayLayer } from "../../settings/textureDefaults.js"
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

function flatSize(ctx, font) {
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

export function overlayPalette(bytes) {
  let image
  try {
    image = decodePng(bytes)
  } catch (err) {
    return { problem: `This PNG can't be read: ${err.message}.` }
  }
  const { anchors, complex } = paletteOf(image.data)
  if (complex) return { problem: `This overlay has too many colours. Overlays can have up to ${MAX_ANCHORS}, so put shading, glows and fades in its transparency instead.` }
  const palette = paletteHexes(anchors)
  return { palette: palette.length === 1 && palette[0] === "#ffffff" ? null : palette }
}

export const DEFAULT_OVERLAY_LIMIT = 8
const LAYER_KINDS = { overlays: "overlay", edgeOverlays: "edge overlay" }
const BLEND_VALUES = new Set(BLEND_OPTIONS.map(item => item.value))

export function overlayChoices(list, layer = null, count = 1) {
  const used = Array.from({ length: count }, (_, index) => index)
  const fits = data => layer === null ? !data.layered : overlayFits(data, layer, used)
  return { overlays: Object.fromEntries(Object.entries(withGenerated(list?.overlays ?? {})).filter(([, data]) => fits(data))), edgeOverlays: GENERATED_EDGE_OVERLAYS }
}

export function fontLayerCount(ctx, font) {
  return ctx.memo(`layers:${font.id}`, async () => {
    const image = await decodePng(await ctx.bytes(`/${fontFolder(font)}/font.png`))
    return parseMask(image.data, image.width, image.height, fullOrder(font, ctx.fonts), defaultBorder("top", font)).layers?.length ?? 1
  })
}

function cleanLayer(layer, available) {
  if (!layer || typeof layer !== "object" || typeof layer.overlay !== "string" || !Object.hasOwn(available, layer.overlay)) return null
  if ((layer.source ?? "premade") !== "premade") return null
  const definition = available[layer.overlay]
  const clean = overlayLayer(layer.overlay, definition)
  delete clean.file
  if (layer.blend !== undefined) {
    if (!BLEND_VALUES.has(layer.blend)) return null
    clean.blend = layer.blend
  }
  if (layer.colours !== undefined && layer.colours !== null) {
    if (!Array.isArray(layer.colours) || !layer.colours.length || layer.colours.length > MAX_ANCHORS || !layer.colours.every(colour => typeof colour === "string" && HEX_COLOUR.test(colour))) return null
    clean.colours = layer.colours.map(colour => colour.toLowerCase())
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
    if (item.options ? !item.options.some(option => option.value === value) : typeof value !== "number" || !Number.isFinite(value) || value < item.min || value > item.max) return null
    clean[item.key] = value
  }
  return clean
}

function defaultLayers(details, list, problems, count) {
  if (details.overlays === undefined) return {}
  const perLayer = details.perLayer === true
  const clean = {}
  for (const [key, noun] of Object.entries(LAYER_KINDS)) {
    const given = details[key] ?? (perLayer ? Array.from({ length: count }, () => []) : [])
    if (perLayer && (!Array.isArray(given) || given.length !== count)) {
      problems.overlays = `Give the default ${noun}s for each of the font's ${count} layers.`
      continue
    }
    const lists = perLayer ? given : [given]
    if (lists.some(layers => !Array.isArray(layers) || layers.length > DEFAULT_OVERLAY_LIMIT)) {
      problems.overlays = `A texture can have up to ${DEFAULT_OVERLAY_LIMIT} default ${noun}s${perLayer ? " on each layer" : ""}.`
      continue
    }
    const cleaned = lists.map((layers, index) => layers.map(layer => cleanLayer(layer, overlayChoices(list, perLayer ? index : null, count)[key])))
    if (cleaned.some(layers => layers.includes(null))) problems.overlays = `One of the default ${noun}s isn't valid. Remove it and add it again.`
    else if (cleaned.some(layers => layers.length)) clean[key] = perLayer ? cleaned : cleaned[0]
  }
  if (!problems.overlays && !clean.overlays && !clean.edgeOverlays) problems.overlays = "Add a default overlay, or turn off default overlays."
  return clean
}

function defaultColours(details, problems, count) {
  const perLayer = details.perLayer === true
  const clean = {}
  for (const name of FACE_PANELS) {
    const given = details[name]
    if (given === undefined) continue
    const colours = perLayer ? given : [given]
    if (perLayer && (!Array.isArray(given) || given.length !== count)) problems.colours = `Give the default colours for each of the font's ${count} layers.`
    else if (colours.some(colour => !(perLayer && colour === null) && !(typeof colour === "string" && HEX_COLOUR.test(colour)))) problems.colours = "The default face colours have to be hex colours like #000000."
    else if (colours.some(colour => colour !== null)) clean[name] = perLayer ? colours.map(colour => colour?.toLowerCase() ?? null) : given.toLowerCase()
  }
  return clean
}

function textureDefaults(details, list, problems, count) {
  if (details.perLayer === true && count < 2) {
    problems.perLayer = "This font only has one layer, so its defaults can't differ by layer."
    return {}
  }
  const clean = { ...defaultLayers(details, list, problems, count), ...defaultColours(details, problems, count) }
  if (details.perLayer === true && Object.keys(clean).length) clean.perLayer = true
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
    derived: border ? ["density"] : ["density", "palette"],
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
      if (variants && font) Object.assign(clean, textureDefaults(details, list, problems, details.perLayer === true ? await fontLayerCount(ctx, font) : 1))
      if (bytes) {
        problems.file = pngProblem(bytes, noun)
        if (!problems.file && font) {
          const flat = await flatSize(ctx, font)
          problems.file = templateProblem(bytes, flat, noun)
          if (!problems.file) clean.density = textureDensity(pngSize(bytes), flat)
        }
        if (!problems.file && !border) {
          const { palette, problem } = overlayPalette(bytes)
          if (problem) problems.file = problem
          else if (palette) clean.palette = palette
        }
      }
      return { problems, target: font?.id ?? target, details: clean }
    }
  }
}

export const texture = fontAsset("texture", "Texture", { border: true, variants: true })
export const overlay = fontAsset("overlay", "Overlay", { border: false })
