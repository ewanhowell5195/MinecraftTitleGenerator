import { stripRange } from "../../lib/assets.js"
import { pixelsOf } from "../../lib/canvas.js"
import { fullName, loadFont, loadFontList, loadImage, sheetOwner, stripsOf } from "../../lib/font.js"
import { platform } from "../../lib/platform.js"
import { defaultBorder, defaultDepth, defaultSpacing } from "../../lib/settings.js"
import { stripFolder, stripUse } from "../../lib/strips.js"
import { stripFonts } from "../../lib/submissionKinds/published.js"
import { remapStrip, setEntry, setName, stripTarget } from "../../lib/submissionKinds/stripFit.js"
import { pngUrl } from "../../lib/virtualFiles.js"

const sets = new Map()

function loadSet(id) {
  if (!sets.has(id)) {
    sets.set(id, platform.fetch(`${stripFolder(id)}/textures.json`).then(response => {
      if (!response.ok) throw new Error(`the ${setName(id)} strip type could not be loaded (${response.status})`)
      return response.json()
    }).then(list => ({ id, depth: list.depth, baseline: list.baseline ?? list.depth, height: list.height ?? null })).catch(err => {
      sets.delete(id)
      throw err
    }))
  }
  return sets.get(id)
}

function named(fonts, id) {
  const font = fonts.find(entry => entry.id === id)
  return font ? fullName(font, fonts) : id
}

export const previewFonts = stripFonts

async function placedSet(item, font, fonts) {
  const target = stripTarget(item.target)
  const owner = sheetOwner(font, fonts)
  if (target.kind === "set") {
    const use = stripsOf(font, fonts).map(stripUse).find(entry => entry.id === target.id)
    return { set: await loadSet(target.id), offset: use?.offset ?? 0 }
  }
  const { depth, baseline, height } = item.details
  if (![depth, baseline, height].every(Number.isInteger) || depth < 1 || height < 1 || baseline < depth) throw new Error("Fill in the new strip type's shape to preview it")
  return { set: { id: "new", depth, baseline, height }, offset: item.details.offsets?.[owner.id] ?? 0 }
}

async function stripFile(item, file, font, fonts) {
  if (stripTarget(item.target).kind === "font") return file
  const [{ set, offset }, loaded, image] = await Promise.all([placedSet(item, font, fonts), loadFont(font, fonts), loadImage(file)])
  const measure = { range: stripRange(loaded), capHeight: loaded.capHeight, depth: defaultDepth(loaded) }
  const pixels = { data: pixelsOf(image), width: image.width, height: image.height }
  return pngUrl(remapStrip(pixels, setEntry(set, offset, item.details.stretch), measure))
}

export async function stripLine(item, file, text, fontId, fonts) {
  const font = fonts.find(entry => entry.id === fontId)
  if (!font) throw new Error(`there is no font called ${fontId}`)
  return { text, font: font.id, textureSource: "custom", customTexture: await stripFile(item, file, font, fonts), customTextureMode: "strip", customBorder: true, borderColour: item.details.border ?? "#000000", depth: defaultDepth(font), border: defaultBorder("top", font), spacing: defaultSpacing("top", font) }
}

function targetName(item, fonts) {
  const target = stripTarget(item.target)
  if (target.kind === "font") return named(fonts, target.id)
  if (target.kind === "set") return `the ${setName(target.id)} strip type`
  return `a new ${setName(item.details.set ?? "")} strip type`
}

export const strip = {
  image: true,
  async line(item, file, text) {
    const fonts = await loadFontList()
    const font = previewFonts(item, fonts)[0]
    if (!font) throw new Error("none of the fonts this strip is for are published")
    return stripLine(item, file, text, font.id, fonts)
  },
  summary(item, fonts) {
    return `A strip for ${targetName(item, fonts)}`
  },
  rows(item, fonts) {
    const target = stripTarget(item.target)
    const { size, border, stretch } = item.details
    const shape = target.kind === "new" ? [
      { label: "Strip type", value: `${setName(item.details.set ?? "")} (new)` },
      { label: "Depth", value: String(item.details.depth) },
      { label: "Baseline", value: String(item.details.baseline) },
      { label: "Height", value: String(item.details.height) },
      { label: "Fonts", value: (item.details.fonts ?? []).map(id => named(fonts, id)).join(", ") }
    ] : [{ label: target.kind === "font" ? "Font" : "Strip type", value: target.kind === "font" ? named(fonts, target.id) : setName(target.id) }]
    return shape.concat(size ? [{ label: "Size", value: `${size.width}x${size.height}` }] : [], target.kind === "font" ? [] : [{ label: "Stretches", value: stretch ? "Yes" : "No" }], [{ label: "Border", value: border, colour: border }])
  }
}
