import { reactive, toRaw, watch } from "vue"
import { forgetImages } from "../texture/assets.js"
import { setCamera } from "../settings/camera.js"
import { restore } from "../settings/settings.js"
import { keepTexture, keptObject, leaveSharedLink, scene, validSelection } from "./scene.js"
import { loadKey } from "../geometry/shapes.js"
import { trackEach } from "./tracking.js"

const LIMIT = 200
const SETTLE = 300
const LONG = 1024
const EMPTY_OBJECTS = `{"objects":[]`

export const history = reactive({ undo: [], redo: [] })

const parts = new WeakMap()
const strings = new Map()
const ids = new Map()
let nextString = 0
let present = take()
let timer = null
let quiet = 0
let restoring = false
let changed = false
let held = false

function intern(key, value) {
  if (typeof value !== "string" || value.length < LONG) return value
  if (!ids.has(value)) {
    ids.set(value, nextString)
    strings.set(nextString++, value)
  }
  return { interned: ids.get(value) }
}

function revive(key, value) {
  return value !== null && typeof value === "object" && typeof value.interned === "number" && Object.keys(value).length === 1 ? strings.get(value.interned) : value
}

function prune() {
  const used = new Set()
  for (const snapshot of [present].concat(history.undo, history.redo)) {
    for (const match of snapshot.matchAll(/"interned":(\d+)/g)) used.add(Number(match[1]))
  }
  for (const [id, value] of strings) {
    if (used.has(id)) continue
    strings.delete(id)
    ids.delete(value)
  }
  forgetImages(url => url.length < LONG || ids.has(url))
}

function objectJson(object) {
  const raw = toRaw(object)
  if (!parts.has(raw)) parts.set(raw, JSON.stringify(object, intern))
  return parts.get(raw)
}

function take() {
  const rest = JSON.stringify({ objects: [], camera: scene.camera, selected: scene.selected, selectedGroup: scene.selectedGroup }, intern)
  return `{"objects":[${scene.objects.map(objectJson).join(",")}]${rest.slice(EMPTY_OBJECTS.length)}`
}

function commit() {
  clearTimeout(timer)
  timer = null
  const snapshot = take()
  if (snapshot === present) {
    changed = false
    return
  }
  if (changed) {
    history.undo.push(present)
    if (history.undo.length > LIMIT) history.undo.shift()
    history.redo = []
  }
  present = snapshot
  changed = false
  if (strings.size) prune()
}

function apply(snapshot) {
  const { objects, camera, selected, selectedGroup } = JSON.parse(snapshot, revive)
  restoring = true
  const list = objects.map(values => {
    const existing = scene.objects.find(object => object.id === values.id)
    if (!existing) return keptObject(values, values.id)
    if (loadKey(existing) !== loadKey(values)) keepTexture.add(existing)
    restore(existing, values)
    return existing
  })
  scene.objects.splice(0, scene.objects.length, ...list)
  setCamera(scene.camera, camera)
  Object.assign(scene, validSelection(list, selected, selectedGroup))
  restoring = false
}

export function quietly(change) {
  quiet++
  try {
    change()
  } finally {
    quiet--
  }
}

export function holdHistory(on) {
  held = on
  clearTimeout(timer)
  timer = !on && changed ? setTimeout(commit, SETTLE) : null
}

function step(from, to) {
  if (timer) commit()
  if (!history[from].length) return
  leaveSharedLink()
  history[to].push(present)
  present = history[from].pop()
  apply(present)
}

export function undo() {
  step("undo", "redo")
}

export function redo() {
  step("redo", "undo")
}

function noticeChange() {
  if (restoring) return
  if (!quiet) {
    changed = true
    leaveSharedLink()
  }
  clearTimeout(timer)
  timer = held ? null : setTimeout(commit, SETTLE)
}

trackEach(() => scene.objects, raw => {
  if (raw) parts.delete(raw)
  noticeChange()
})
trackEach(() => [scene.camera], noticeChange)

watch(() => [scene.selected, scene.selectedGroup], () => {
  if (!restoring && !changed && !timer) present = take()
}, { flush: "sync" })
