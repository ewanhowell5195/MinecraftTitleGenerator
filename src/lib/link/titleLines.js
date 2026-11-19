import { typeDefaults } from "../settings/defaults.js"
import { LAYER_KEYS } from "../settings/layers.js"
import { CUSTOM_FONT_KINDS, LINE, snapshot } from "../settings/settings.js"
import { LAYER, LAYERS } from "../settings/textureDefaults.js"
import { sameValue } from "../core/values.js"
import { FILE_VERSION, twistCentres, upgradeLine } from "../settings/upgrades.js"

export function lineWords({ words, ...line }) {
  return words ? words.map(word => ({ ...line, ...word })) : [line]
}

export function joinWords(words, text) {
  return words.map((word, index) => (index && word.spaceBefore ? " " : "") + text(word)).join("").trim()
}

function matchLoops(lines, start) {
  const seen = new Set()
  for (let index = start; index != null; index = lines[index].matchWidth) {
    if (seen.has(index)) return true
    seen.add(index)
  }
  return false
}

function wordsProblem(line) {
  if (!line.words) return null
  if (!Array.isArray(line.words) || !line.words.length) return "a line has no words in it"
  if (line.words.some(word => "matchWidth" in word)) return "a word sets matchWidth, which only a line can have"
  if (line.words.some(word => (word.shape ?? line.shape) != null)) return "a shape is used as a word in a line"
  return null
}

export function titleProblem(lines) {
  const unmatched = lines.find(line => line.matchWidth != null && !(Number.isInteger(line.matchWidth) && lines[line.matchWidth]))
  if (unmatched) return `a line matches the width of line ${unmatched.matchWidth}, which doesn't exist`
  const looped = lines.findIndex((line, index) => matchLoops(lines, index))
  if (looped >= 0) return `line ${looped} matches its own width`
  return lines.map(wordsProblem).find(Boolean) ?? null
}

function trimLayer(layer) {
  return Object.fromEntries(Object.entries(layer).filter(([key, value]) => !sameValue(value, LAYER[key])))
}

function trimLayerSettings(settings, base) {
  return settings.map(layer => Object.fromEntries(Object.entries(layer).filter(([key, value]) => !sameValue(value, base[key])).map(([key, value]) => [key, LAYERS.includes(key) ? value.map(trimLayer) : value])))
}

export function trimmed(object, unused = new Set()) {
  const base = { ...typeDefaults(object.type), type: "top" }
  const values = {}
  for (const [key, value] of Object.entries(snapshot(object))) {
    if (key === "group" || unused.has(key) || sameValue(value, base[key])) continue
    values[key] = LAYERS.includes(key) ? value.map(trimLayer) : key === "layerSettings" ? trimLayerSettings(value, base) : value
  }
  return values
}

function split(values, line) {
  return Object.fromEntries(Object.entries(values).filter(([key]) => LINE.has(key) === line))
}

function titleLine(words) {
  if (words.length === 1) return words[0]
  return { ...split(words[0], true), words: words.map(word => split(word, false)) }
}

export function titleLines(lines, values) {
  const numbers = new Map(lines.flatMap((words, index) => words.map(word => [word.id, index])))
  return lines.map(words => {
    const line = titleLine(words.map(word => values(word)))
    if (line.matchWidth != null) line.matchWidth = numbers.get(line.matchWidth) ?? null
    return line
  })
}

function expandLayer(layer) {
  if (layer.file && !layer.file.startsWith("data:image/")) throw new Error("it has an overlay image that isn't embedded in it")
  return { ...LAYER, ...layer }
}

function expand(values) {
  if (values.customTexture && !values.customTexture.startsWith("data:image/")) throw new Error("it has a texture image that isn't embedded in it")
  if (values.customFont && (!CUSTOM_FONT_KINDS.includes(values.customFont.kind) || !values.customFont.google && !values.customFont.data?.startsWith?.("data:"))) throw new Error("it has a custom font that isn't embedded in it")
  const base = typeDefaults(values.type ?? "top")
  const object = { ...base, ...twistCentres(values) }
  for (const key of LAYERS) {
    if (values[key]) object[key] = values[key].map(expandLayer)
  }
  if (Array.isArray(values.layerSettings)) object.layerSettings = values.layerSettings.map(layer => expandLayerSettings(layer, base))
  return object
}

function expandLayerSettings(layer, base) {
  if (layer.customTexture && !layer.customTexture.startsWith("data:image/")) throw new Error("it has a texture image that isn't embedded in it")
  const expanded = { ...Object.fromEntries(LAYER_KEYS.map(key => [key, base[key]])), ...layer }
  for (const key of LAYERS) {
    if (layer[key]) expanded[key] = layer[key].map(expandLayer)
  }
  return expanded
}

export function titleValues(data) {
  if (data.version > FILE_VERSION) throw new Error(`it was saved by a newer version of the generator (format ${data.version})`)
  if (!Array.isArray(data.lines) || !data.lines.length) throw new Error("it has no text in it")
  const lines = data.lines.map(line => upgradeLine(line, data.version ?? 0))
  const problem = titleProblem(lines)
  if (problem) throw new Error(problem)
  return lines.map((line, index) => lineWords(line).map(values => expand(line.words ? { ...values, group: index + 1 } : values)))
}
