import { DataSet, RegExpMatcher, englishDataset, englishRecommendedTransformers, pattern } from "obscenity"

const blocked = new DataSet().addAll(englishDataset).addPhrase(phrase => phrase.setMetadata({ originalWord: "kill yourself" }).addPattern(pattern`|kill[?][?]your[?][?]self|`))
const rude = new RegExpMatcher({ ...blocked.build(), ...englishRecommendedTransformers })

export function blockedWordProblem(label, text) {
  return rude.hasMatch(text) ? `The ${label} has a word in it that isn't allowed.` : null
}
