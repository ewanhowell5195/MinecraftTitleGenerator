import { cleanCommon, commonProblems } from "../submissions.js"
import { font } from "./font.js"
import { overlay, texture } from "./fontAsset.js"
import { strip } from "./strip.js"
import { tileable } from "./tileable.js"

export const SUBMISSION_KINDS = { texture, overlay, strip, tileable, font }

export function submissionContext(fonts, load) {
  const cache = new Map()
  function memo(key, work) {
    if (!cache.has(key)) cache.set(key, work())
    return cache.get(key)
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
  const checked = await type.check({ target, details: details ?? {}, bytes, files: files ?? {} }, ctx)
  const problems = Object.fromEntries(Object.entries({ ...common, ...checked.problems }).filter(([, problem]) => problem))
  return { problems, clean: { kind, target: checked.target, details: checked.details, ...cleanCommon(fields) } }
}
