import { fetched } from "../../lib/api.js"
import { fontFolder } from "../../lib/font.js"
import { opaqueCells, templateScore, textureDensity } from "../../lib/submissions.js"

const templates = new Map()

async function pixels(source) {
  const bitmap = await createImageBitmap(source, { premultiplyAlpha: "none", colorSpaceConversion: "none" })
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext("2d")
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

function template(font) {
  if (!templates.has(font.id)) {
    templates.set(font.id, fetched(`/${fontFolder(font)}/textures/flat.png`, `the ${font.id} template`).then(response => response.blob()).then(pixels).then(image => ({ width: image.width, height: image.height, cells: opaqueCells(image.data, image.width, image.height, 1, 128) })))
  }
  return templates.get(font.id)
}

export async function detectFont(kind, file, size, fonts) {
  const loaded = await Promise.all(fonts.map(async font => ({ font, template: await template(font) })))
  const fitting = loaded.filter(({ template }) => textureDensity(size, template))
  if (fitting.length < 2) return fitting[0]?.font ?? null
  const image = await pixels(file)
  const scored = fitting.map(({ font, template }) => ({ font, score: templateScore(kind, opaqueCells(image.data, image.width, image.height, textureDensity(size, template), 1), template.cells) }))
  return scored.sort((a, b) => b.score - a.score)[0].font
}
