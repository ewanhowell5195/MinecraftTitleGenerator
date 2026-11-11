import { LIMITS } from "./limits.js"
import { CUSTOM_FONT_KINDS, FILE_VERSION, LAYER, LAYERS, LINE, sameValue, snapshot, typeDefaults, upgradeLine } from "./settings.js"

export function lineWords({ words, ...line }) {
  return words ? words.map(word => ({ ...line, ...word })) : [line]
}

export function joinWords(words, text) {
  return words.map((word, index) => (index && word.spaceBefore ? " " : "") + text(word)).join("").trim()
}

function wordsOf(line) {
  return lineWords(line).filter(word => !word.shape)
}

function textOf(word, fallback) {
  return (typeof word.text === "string" ? word.text : fallback).trim()
}

export function titleFacts(lines) {
  const fallback = typeDefaults("top").text
  const texts = lines.map(line => joinWords(wordsOf(line).filter(word => !word.hidden), word => textOf(word, fallback)))
  const everything = lines.flatMap(wordsOf).map(word => textOf(word, fallback))
  return {
    text: texts.filter(Boolean).join(" "),
    all: everything.join(" "),
    words: everything.length,
    characters: everything.reduce((total, text) => total + Array.from(text).length, 0),
    shapes: lines.flatMap(lineWords).filter(word => word.shape && !word.hidden).length
  }
}

export function limitProblem(lines, facts = titleFacts(lines)) {
  if (lines.length > LIMITS.lines) return `A shared title can have up to ${LIMITS.lines} lines.`
  if (facts.words > LIMITS.words) return `A shared title can have up to ${LIMITS.words} words.`
  if (facts.characters > LIMITS.characters) return `A shared title can have up to ${LIMITS.characters} characters of text.`
  return null
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

export function trimmed(object, unused = new Set()) {
  const base = { ...typeDefaults(object.type), type: "top" }
  const values = {}
  for (const [key, value] of Object.entries(snapshot(object))) {
    if (key === "group" || unused.has(key) || sameValue(value, base[key])) continue
    values[key] = LAYERS.includes(key) ? value.map(trimLayer) : value
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

const TWIST_ANCHORS = [["twistRibbonAnchor", "twistRibbonCentre", "twistRibbonMirror"], ["twistDoorAnchor", "twistDoorCentre", "twistDoorSame"]]
const ANCHOR_CENTRES = { left: 0, centre: 50, right: 100 }

function twistCentres(values) {
  const converted = { ...values }
  for (const [anchor, centre, same] of TWIST_ANCHORS) {
    if (!(anchor in converted)) continue
    converted[centre] ??= ANCHOR_CENTRES[converted[anchor]] ?? 50
    if (converted[anchor] === "right") converted[same] = true
    delete converted[anchor]
  }
  return converted
}

function expand(values) {
  if (values.customTexture && !values.customTexture.startsWith("data:image/")) throw new Error("it has a texture image that isn't embedded in it")
  if (values.customFont && (!CUSTOM_FONT_KINDS.includes(values.customFont.kind) || !values.customFont.data?.startsWith?.("data:"))) throw new Error("it has a custom font that isn't embedded in it")
  const object = { ...typeDefaults(values.type ?? "top"), ...twistCentres(values) }
  for (const key of LAYERS) {
    if (values[key]) object[key] = values[key].map(expandLayer)
  }
  return object
}

export function titleValues(data) {
  if (data.version > FILE_VERSION) throw new Error(`it was saved by a newer version of the generator (format ${data.version})`)
  if (!Array.isArray(data.lines) || !data.lines.length) throw new Error("it has no text in it")
  const lines = data.lines.map(line => upgradeLine(line, data.version ?? 0))
  const problem = titleProblem(lines)
  if (problem) throw new Error(problem)
  return lines.map((line, index) => lineWords(line).map(values => expand(line.words ? { ...values, group: index + 1 } : values)))
}
