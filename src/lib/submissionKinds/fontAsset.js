import { fontFolder, sheetOwner } from "../font.js"
import { titleCase } from "../names.js"
import { HEX_COLOUR, pngProblem, pngSize, textureDensity } from "../submissions.js"

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
      if (variants && details.variantOf) {
        const parents = font ? (await ctx.json(texturesList(font))).textures ?? {} : {}
        if (typeof details.variantOf === "string" && Object.hasOwn(parents, details.variantOf) && parents[details.variantOf].type !== "strip") clean.variantOf = details.variantOf
        else problems.variantOf = "Pick the texture this is a variant of."
      }
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
