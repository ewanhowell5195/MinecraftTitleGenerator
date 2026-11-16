import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity"
import { LIMITS } from "./limits.js"

const rude = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers })

function hasBlockedWord(text) {
  return rude.hasMatch(text)
}

export function blockedWordProblem(label, text) {
  return hasBlockedWord(text) ? `The ${label} has a word in it that isn't allowed.` : null
}

export function shortNameProblem(name) {
  return Array.from(name.trim()).length < LIMITS.minName ? `The name needs at least ${LIMITS.minName} characters.` : null
}
