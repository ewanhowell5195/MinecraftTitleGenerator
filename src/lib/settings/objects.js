import { reactive } from "vue"
import { buildObject } from "./settings.js"

export function createObject(values = {}, id) {
  return buildObject(values, id, reactive)
}
