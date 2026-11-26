import { LIMITS } from "./limits.js"

export function shortNameProblem(name) {
  return Array.from(name.trim()).length < LIMITS.minName ? `The name needs at least ${LIMITS.minName} characters.` : null
}
