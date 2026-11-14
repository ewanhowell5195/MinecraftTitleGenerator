import { fullName } from "../font.js"
import { HEX_COLOUR, SUBMISSION_LIMITS, pngProblem, pngSize, textProblem } from "../submissions.js"
import { submissionFont, texturesList } from "./fontAsset.js"
import { STRIP_LIMITS, fitOffset, fitProblems, fontMeasure, heightList, setIdOf, setIds, setName, setUsers, sharedHeights, stripOwners, stripSet, stripTarget, targetRows } from "./stripFit.js"

function storedSize(size) {
  return size && Number.isInteger(size.width) && Number.isInteger(size.height) ? { width: size.width, height: size.height } : null
}

function wholeProblem(value, label, low, high) {
  return Number.isInteger(value) && value >= low && value <= high ? null : `The ${label} has to be a whole number from ${low} to ${high}.`
}

function sentence(font, fonts, problems) {
  return `${fullName(font, fonts)} won't fit: ${problems.join(", and ")}.`
}

function forFont(id, ctx) {
  const font = submissionFont(ctx.fonts, id)
  if (!font) return { problems: { target: "Pick the font the strip is for." }, target: `font:${id}` }
  return { problems: {}, target: `font:${font.id}`, what: fullName(font, ctx.fonts) }
}

async function forSet(id, details, ctx) {
  if (!setIds(ctx.fonts).includes(id)) return { problems: { target: "Pick the strip type the strip is for." }, target: `set:${id}` }
  const set = await stripSet(ctx, id)
  const users = setUsers(ctx.fonts, id)
  const problems = {}
  const clean = {}
  if (details.stretch === true) {
    if (set.height) clean.stretch = true
    else problems.stretch = `The ${setName(id)} strip type has no height, so its strips can't stretch.`
  }
  if (set.stretched && !clean.stretch) {
    for (const { font, offset, layer } of users) {
      const found = fitProblems(set, await fontMeasure(ctx, font, layer), offset, false)
      if (found.length) problems.stretch ??= `Every strip in the ${setName(id)} strip type stretches, and ${fullName(font, ctx.fonts)} only fits them stretched, so this one has to stretch too.`
    }
  }
  return { problems, clean, target: `set:${id}`, what: `the ${setName(id)} strip type` }
}

async function forNew(details, ctx) {
  const problems = {}
  const clean = {}
  const named = textProblem(details.set ?? "", "name", SUBMISSION_LIMITS.name, { required: true, noun: "new strip type" })
  const id = setIdOf(details.set)
  if (named) problems.set = named
  else if (!id) problems.set = "The strip type's name needs some letters or numbers in it."
  else if (setIds(ctx.fonts).includes(id)) problems.set = `There's already a strip type called ${setName(id)}. Pick it instead, or give this one another name.`
  else clean.set = id
  problems.depth = wholeProblem(details.depth, "depth", 1, STRIP_LIMITS.depth)
  problems.height = wholeProblem(details.height, "height", 1, STRIP_LIMITS.height)
  problems.baseline = problems.depth ? null : wholeProblem(details.baseline, "baseline", details.depth, details.depth + STRIP_LIMITS.below)
  if (details.stretch === true) clean.stretch = true
  const shaped = !problems.depth && !problems.height && !problems.baseline
  if (shaped) Object.assign(clean, { depth: details.depth, baseline: details.baseline, height: details.height })
  const chosen = Array.isArray(details.fonts) ? Array.from(new Set(details.fonts.map(item => stripOwners(ctx.fonts).find(font => font.id === item)))) : []
  if (!chosen.length || chosen.includes(undefined)) problems.fonts = "Pick the fonts that use the new strip type."
  else if (shaped) {
    const set = { id: clean.set ?? "new", depth: clean.depth, baseline: clean.baseline, height: clean.height }
    const offsets = {}
    const wrong = []
    for (const font of chosen) {
      const measure = await fontMeasure(ctx, font)
      const offset = fitOffset(set, measure, !!clean.stretch)
      if (offset === null) wrong.push(sentence(font, ctx.fonts, fitProblems(set, measure, 0, !!clean.stretch)))
      else if (offset) offsets[font.id] = offset
    }
    if (wrong.length) problems.fonts = wrong.join(" ")
    clean.fonts = chosen.map(font => font.id)
    if (Object.keys(offsets).length) clean.offsets = offsets
  }
  return { problems, clean, target: "new", what: "this strip type" }
}

export async function stripParents(ctx, target) {
  const { kind, id } = stripTarget(target)
  if (kind === "set") return (await ctx.json(`/strips/${id}/textures.json`)).textures ?? {}
  const font = kind === "font" ? submissionFont(ctx.fonts, id) : null
  if (!font) return {}
  return Object.fromEntries(Object.entries((await ctx.json(texturesList(font))).textures ?? {}).filter(([, data]) => data.type === "strip"))
}

export const strip = {
  id: "strip",
  label: "Strip",
  noun: "strip",
  available: true,
  accept: "image/png",
  derived: ["size"],
  async check({ target, details, bytes }, ctx) {
    const clean = {}
    const problems = {}
    if (typeof details.border === "string" && HEX_COLOUR.test(details.border)) clean.border = details.border.toLowerCase()
    else problems.border = "The border colour has to be a hex colour like #000000."
    if (bytes) problems.file = pngProblem(bytes, "strip")
    const size = bytes ? problems.file ? null : pngSize(bytes) : storedSize(details.size)
    if (bytes && size) clean.size = size
    const chosen = stripTarget(target)
    const result = chosen.kind === "new" ? await forNew(details, ctx) : chosen.kind === "set" ? await forSet(chosen.id, details, ctx) : await forFont(chosen.id, ctx)
    Object.assign(problems, result.problems)
    Object.assign(clean, result.clean)
    if (details.variantOf && chosen.kind !== "new" && !result.problems.target) {
      if (typeof details.variantOf === "string" && Object.hasOwn(await stripParents(ctx, result.target), details.variantOf)) clean.variantOf = details.variantOf
      else problems.variantOf = "Pick the strip this is a variant of."
    }
    const rows = size && await targetRows(ctx, result.target, result.clean ?? {})
    if (rows) {
      const heights = sharedHeights(rows)
      if (!heights.includes(size.height)) problems.file = heights.length ? `Strips for ${result.what} have to be ${heightList(heights)} pixels tall, and this one is ${size.height}.` : `The fonts using ${result.what} don't agree on a strip height, so it can't take new strips.`
    }
    return { problems, target: result.target, details: clean }
  }
}
