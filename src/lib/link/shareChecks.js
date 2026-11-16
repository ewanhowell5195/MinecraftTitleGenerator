import { decodeTitle } from "./linkformat.js"
import { titleFacts } from "./titleFacts.js"
import { blockedWordProblem, shortNameProblem } from "../core/wording.js"

export function sharingProblem(code, name) {
  return blockedWordProblem("title", titleFacts(decodeTitle(code).lines).all) ?? shortNameProblem(name) ?? blockedWordProblem("name", name.trim())
}
