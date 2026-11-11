import { decodeTitle } from "./linkformat.js"
import { titleFacts } from "./titleFacts.js"
import { blockedWordProblem } from "./wording.js"

export function sharingProblem(code, name) {
  return blockedWordProblem("title", titleFacts(decodeTitle(code).lines).all) ?? blockedWordProblem("name", name.trim())
}
