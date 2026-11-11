import { reactive, shallowReactive } from "vue"
import { DEFAULT_FOV } from "./view.js"

export const OFFSCREEN_VIEW = { render: false, fov: DEFAULT_FOV, fixedDistance: false, previews: false, eager: true }

export function createTitle(objects, view) {
  return { objects, view, runtime: shallowReactive({}), heights: reactive({}), problems: reactive({}) }
}

export function firstError(title) {
  return title.objects.map(object => title.runtime[object.id]?.error).find(Boolean)
}
