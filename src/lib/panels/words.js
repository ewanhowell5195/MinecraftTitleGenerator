import { splitGradients } from "../texture/wordGradients.js"

export function wordsHint(add) {
  return `Each word gets its own texture. Highlight part of a word and press ${add} to split it off.`
}

export function wordPlaceholder(several) {
  return several ? "word" : "Type your title"
}

export function joinLabel(word) {
  return word.spaceBefore ? "Join words" : "Add space"
}

export function splitWord({ text, spaceBefore }, start, end) {
  const parts = [[0, start], [start, end], [end, text.length]].filter(([from, to]) => text.slice(from, to).trim())
  if (parts.length < 2 || !parts.some(([from, to]) => from === start && to === end)) return null
  return parts.map(([from, to], index) => ({ text: text.slice(from, to).trim(), spaceBefore: index ? /\s/.test(text[from - 1] + text[from]) : spaceBefore, picked: from === start }))
}

export function wordParts(font, line, word, start, end) {
  const parts = splitWord(word, start, end)
  if (!parts) return null
  const gradients = splitGradients(font, line, word, parts)
  return parts.map(({ text, spaceBefore, picked }, index) => ({ picked, values: { text, ...(index && { spaceBefore }), ...gradients[index] } }))
}
