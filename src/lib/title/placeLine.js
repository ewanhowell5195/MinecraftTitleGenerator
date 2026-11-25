import { applyType } from "../settings/defaults.js"
import { defaultTexture, setTexture } from "../settings/textureDefaults.js"
import { freeRowOf } from "./title.js"

export function placeWords(words, type, title, { list, font }) {
  const row = freeRowOf(type, title, words)
  for (const word of words) {
    if (list && !word.textureVariant && word.texture === defaultTexture(list, word.type)) setTexture(word, { texture: defaultTexture(list, type) }, { before: list })
    word.type = type
    word.row = row
    applyType(word, type, font)
  }
}
