import { reactive, shallowReactive } from "vue"
import { fullCamera } from "../settings/camera.js"

export const OFFSCREEN_VIEW = { render: false, previews: false, eager: true }

export function createTitle(objects, view, camera = reactive(fullCamera())) {
  return { objects, view, camera, runtime: shallowReactive({}), heights: reactive({}), problems: reactive({}) }
}

export function firstError(title) {
  return title.objects.map(object => title.runtime[object.id]?.error).find(Boolean)
}
