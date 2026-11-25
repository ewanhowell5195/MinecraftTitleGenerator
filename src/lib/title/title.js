import { reactive, shallowRef } from "vue"
import { keyed } from "../core/keyed.js"
import { fullCamera } from "../settings/camera.js"

export const OFFSCREEN_VIEW = { render: false, previews: false, eager: true }

export function createTitle(objects, view, camera = reactive(fullCamera())) {
  return { objects, view, camera, runtime: keyed(), heights: keyed(), problems: keyed(), finalShadows: shallowRef(false), framing: null, quietly: change => change(), busy: () => false }
}

export function firstError(title) {
  return title.objects.map(object => title.runtime[object.id]?.error).find(Boolean)
}

export function wordsOf(object, title) {
  return object.group === null ? [object] : title.objects.filter(other => other.group === object.group)
}

export function linesOf(objects) {
  const list = []
  for (const object of objects) {
    const last = list[list.length - 1]
    if (object.group !== null && last?.[0].group === object.group) last.push(object)
    else list.push([object])
  }
  return list
}

export function freeRowOf(type, title, own = []) {
  const used = new Set(title.objects.filter(object => object.type === type && !own.includes(object)).map(object => object.row))
  const step = type === "top" ? -1 : 1
  let row = 0
  while (used.has(row)) row += step
  return row
}

export function versionsIn(objects, browsing = null) {
  return new Set(objects.flatMap(object => [object.shapeVersion, object.minecraftVersion]).concat(browsing).filter(Boolean))
}
