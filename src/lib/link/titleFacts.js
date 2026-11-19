import { CAMERA_KEYS } from "../settings/camera.js"
import { typeDefaults } from "../settings/defaults.js"
import { LIMITS } from "../core/limits.js"
import { decodeTitle } from "./linkformat.js"
import { unknownSetting } from "./linkKeys.js"
import { joinWords, lineWords, titleProblem } from "./titleLines.js"
import { FILE_VERSION } from "../settings/upgrades.js"

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

export function shareableTitle(code) {
  if (typeof code !== "string" || !code) return { problem: "There is no title in this preset." }
  if (code.length > LIMITS.code) return { problem: "This title has too many settings to share." }
  let title
  try {
    title = decodeTitle(code)
  } catch {
    return { problem: "This title is damaged, so it can't be shared." }
  }
  if (title.version > FILE_VERSION) return { problem: "This title was made by a newer version of the generator. Reload the page and try again." }
  const unknown = unknownSetting(title.lines) ?? Object.keys(title.camera ?? {}).find(key => !CAMERA_KEYS.includes(key))
  if (unknown) return { problem: `This title has a setting that can't be shared: ${unknown}.` }
  const problem = titleProblem(title.lines)
  if (problem) return { problem: `This title can't be shared: ${problem}.` }
  const facts = titleFacts(title.lines)
  const over = limitProblem(title.lines, facts)
  if (over) return { problem: over }
  if (!facts.text && !facts.shapes) return { problem: "This title has no text or shapes in it." }
  return { facts }
}
