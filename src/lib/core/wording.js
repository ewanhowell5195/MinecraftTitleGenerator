import { DataSet, RegExpMatcher, englishDataset, englishRecommendedTransformers, pattern } from "obscenity"
import { LIMITS } from "./limits.js"

const blocked = new DataSet().addAll(englishDataset).addPhrase(phrase => phrase.setMetadata({ originalWord: "kill yourself" }).addPattern(pattern`|kill[?][?]your[?][?]self|`))
const rude = new RegExpMatcher({ ...blocked.build(), ...englishRecommendedTransformers })

function hasBlockedWord(text) {
  return rude.hasMatch(text)
}

export function blockedWordProblem(label, text) {
  return hasBlockedWord(text) ? `The ${label} has a word in it that isn't allowed.` : null
}

export function shortNameProblem(name) {
  return Array.from(name.trim()).length < LIMITS.minName ? `The name needs at least ${LIMITS.minName} characters.` : null
}
