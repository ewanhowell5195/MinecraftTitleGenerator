import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity"

const rude = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers })

function hasBlockedWord(text) {
  return rude.hasMatch(text)
}

export function blockedWordProblem(label, text) {
  return hasBlockedWord(text) ? `The ${label} has a word in it that isn't allowed.` : null
}
