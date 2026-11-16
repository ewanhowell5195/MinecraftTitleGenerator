import { cleanCommon, cleanSource, commonProblems, sourceProblems } from "../submissions.js"
import { font } from "./font.js"
import { overlay, texture } from "./fontAsset.js"
import { strip } from "./strip.js"
import { shapeImage, shapeModel } from "./shape.js"
import { tileable } from "./tileable.js"

export const SUBMISSION_KINDS = { texture, overlay, strip, tileable, font, shapeImage, shapeModel }

export function submissionContext(fonts, load) {
  const cache = new Map()
  function memo(key, work) {
    if (cache.has(key)) return cache.get(key)
    const value = work()
    if (value instanceof Promise) value.catch(() => cache.delete(key))
    cache.set(key, value)
    return value
  }
  return {
    fonts,
    memo,
    bytes: path => memo(`bytes:${path}`, async () => new Uint8Array(await (await load(path)).arrayBuffer())),
    json: path => memo(`json:${path}`, async () => (await load(path)).json())
  }
}

export async function checkSubmission({ kind, target, details, bytes, files, ...fields }, ctx) {
  const type = SUBMISSION_KINDS[kind]
  if (!type) return { problems: { kind: "Pick what you're submitting." }, clean: null }
  const common = commonProblems(fields, type.noun)
  const sourced = type.sourced ? sourceProblems(details ?? {}) : details?.source === undefined && details?.licence === undefined ? {} : { source: `Only fonts can be based on someone else's work.` }
  const checked = await type.check({ target, details: details ?? {}, bytes, files: files ?? {} }, ctx)
  const problems = Object.fromEntries(Object.entries({ ...common, ...sourced, ...checked.problems }).filter(([, problem]) => problem))
  const cleanDetails = Object.values(sourced).some(Boolean) ? checked.details : { ...checked.details, ...cleanSource(details ?? {}) }
  return { problems, clean: { kind, target: checked.target, details: cleanDetails, ...cleanCommon(fields) } }
}
