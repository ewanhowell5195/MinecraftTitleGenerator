import { effect, reactive } from "vue"
import { forgetImages } from "./assets.js"
import { restore } from "./settings.js"
import { keepTexture, keptObject, scene, validSelection } from "./scene.js"

const LIMIT = 200
const SETTLE = 300
const LONG = 1024

export const history = reactive({ undo: [], redo: [] })

const strings = new Map()
const ids = new Map()
let nextString = 0
let present = take()
let timer = null
let quiet = 0
let restoring = false
let changed = false
let held = false
let retracking = false

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

function take() {
  return JSON.stringify({ objects: scene.objects, selected: scene.selected, selectedGroup: scene.selectedGroup }, intern)
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
  const { objects, selected, selectedGroup } = JSON.parse(snapshot, revive)
  restoring = true
  const list = objects.map(values => {
    const existing = scene.objects.find(object => object.id === values.id)
    if (!existing) return keptObject(values, values.id)
    if (existing.font !== values.font) keepTexture.add(existing)
    restore(existing, values)
    return existing
  })
  scene.objects.splice(0, scene.objects.length, ...list)
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

function touch(value) {
  if (value === null || typeof value !== "object") return
  for (const key in value) touch(value[key])
}

function noticeChange() {
  if (!retracking) {
    retracking = true
    queueMicrotask(() => {
      retracking = false
      tracker()
    })
  }
  if (restoring) return
  if (!quiet) changed = true
  clearTimeout(timer)
  timer = held ? null : setTimeout(commit, SETTLE)
}

const tracker = effect(() => touch(scene.objects), { scheduler: noticeChange })
