import { reactive, shallowReactive } from "vue"

export function createTitle(objects, view) {
  return { objects, view, runtime: shallowReactive({}), heights: reactive({}), problems: reactive({}) }
}
