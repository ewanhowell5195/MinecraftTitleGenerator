import { decodeTitle } from "./linkformat.js"
import { typeDefaults } from "./settings.js"
import { blockedWordProblem } from "./wording.js"

function allWordsOf(line) {
  return line.words ? line.words.map(word => ({ ...line, ...word })) : [line]
}

function wordsOf(line) {
  return allWordsOf(line).filter(word => !word.shape)
}

function textOf(word, fallback) {
  return (typeof word.text === "string" ? word.text : fallback).trim()
}

export function titleFacts(lines) {
  const fallback = typeDefaults("top").text
  const texts = lines.map(line => wordsOf(line).filter(word => !word.hidden).map((word, index) => (index && word.spaceBefore ? " " : "") + textOf(word, fallback)).join("").trim())
  const everything = lines.flatMap(wordsOf).map(word => textOf(word, fallback))
  return {
    text: texts.filter(Boolean).join(" "),
    all: everything.join(" "),
    words: everything.length,
    characters: everything.reduce((total, text) => total + Array.from(text).length, 0),
    shapes: lines.flatMap(allWordsOf).filter(word => word.shape && !word.hidden).length
  }
}

export function sharingProblem(code, name) {
  return blockedWordProblem("title", titleFacts(decodeTitle(code).lines).all) ?? blockedWordProblem("name", name.trim())
}
