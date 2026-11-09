import { titleCase } from "../names.js"
import { pngProblem, pngSize } from "../submissions.js"

export const TILEABLES_LIST = "/tileables/tileables.json"
export const TILEABLE_FOLDER = "community"
export const TILEABLE_SIDES = [8, 16, 32, 64]

export function tileableName(id, data) {
  return data?.name ?? titleCase(id)
}

export function tileableImage(list, id) {
  return `/tileables/${list[id].path ?? "minecraft"}/${id}.png`
}

export function tileableSizeProblem(size) {
  if (size.width === size.height && TILEABLE_SIDES.includes(size.width)) return null
  const sides = TILEABLE_SIDES.map(side => `${side}x${side}`)
  return `Tileables have to be square, ${sides.slice(0, -1).join(", ")} or ${sides.at(-1)}, and this one is ${size.width}x${size.height}.`
}

export function seeThrough(rgba) {
  for (let at = 3; at < rgba.length; at += 4) {
    if (rgba[at] < 255) return true
  }
  return false
}

export const tileable = {
  id: "tileable",
  label: "Tileable",
  noun: "tileable",
  available: true,
  accept: "image/png",
  derived: ["size"],
  async check({ target, bytes }, ctx) {
    const problems = {}
    const clean = {}
    const list = await ctx.json(TILEABLES_LIST)
    const parent = target && Object.hasOwn(list, target) ? target : ""
    if (target && !parent) problems.target = "Pick the tileable this is a variant of."
    if (bytes) {
      problems.file = pngProblem(bytes, "tileable")
      const size = problems.file ? null : pngSize(bytes)
      if (size) problems.file = tileableSizeProblem(size)
      if (size && !problems.file && parent) {
        const own = await ctx.memo(`tileable:${parent}`, async () => pngSize(await ctx.bytes(tileableImage(list, parent))))
        if (own.width !== size.width || own.height !== size.height) problems.file = `A variant has to be the same size as ${tileableName(parent, list[parent])}, ${own.width}x${own.height}, and this one is ${size.width}x${size.height}.`
      }
      if (!problems.file) clean.size = size.width
    }
    return { problems, target: parent || target, details: clean }
  }
}
