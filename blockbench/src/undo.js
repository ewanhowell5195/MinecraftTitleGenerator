import { watch } from "vue"
import { setCamera } from "#lib/settings/camera.js"
import { titleState } from "./titles.js"

export const CAMERA = { minecraft_title_camera: true }

const late = new Map()

let editing = null
let quiet = 0
let lateLabel = null

function aspectsOf(target) {
  return target === CAMERA ? CAMERA : { elements: target }
}

export function beginEdit(target, key) {
  if (editing?.key === key) return
  finishEdit()
  lateLabel = null
  editing = { key, target }
  Undo.initEdit(aspectsOf(target))
}

export function finishEdit(label = "Change title") {
  if (!editing) return
  const { target } = editing
  editing = null
  Undo.finishEdit(label, aspectsOf(target))
}

function settingsOf(target) {
  return JSON.stringify(target === CAMERA ? titleState().title.camera : target.map(element => element.getUndoCopy()))
}

export function edit(target, label, change) {
  finishEdit()
  lateLabel = null
  const before = settingsOf(target)
  Undo.initEdit(aspectsOf(target))
  change()
  if (settingsOf(target) !== before) return Undo.finishEdit(label, aspectsOf(target))
  Undo.cancelEdit()
  lateLabel = label
}

export function keepTitle({ save, aspects }) {
  if (aspects.minecraft_title_camera) save.minecraft_title_camera = { ...titleState().title.camera }
  for (const { words } of aspects.elements ?? []) {
    for (const word of words ?? []) save.elements[word.uuid] ??= word.getUndoCopy()
  }
}

export function loadCamera({ save }) {
  if (save.minecraft_title_camera) setCamera(titleState().title.camera, save.minecraft_title_camera)
}

export function quietly(change) {
  quiet++
  try {
    change()
  } finally {
    quiet--
  }
}

export function amendLastEdit(elements) {
  if (editing || Undo.current_save) return
  const last = Undo.history[Undo.index - 1]
  if (!last?.post?.elements || Undo.index !== Undo.history.length) return
  for (const element of elements) {
    if (element.uuid in last.post.elements) last.post.elements[element.uuid] = element.getUndoCopy()
  }
}

function recordLate() {
  const changes = Array.from(late)
  late.clear()
  const label = lateLabel ?? "Change title"
  lateLabel = null
  const elements = changes.map(([element]) => element).filter(element => Outliner.elements.includes(element))
  if (!elements.length || editing || Undo.current_save) return
  Undo.initEdit({ elements })
  for (const [element, before] of changes) {
    if (elements.includes(element)) Undo.current_save.elements[element.uuid] = before
  }
  Undo.finishEdit(label, { elements })
}

export function watchChanges(element) {
  watch(() => [element.savedSettings(), element.describe()], ([settings, description], [earlier, wasDescribed]) => {
    if (quiet || element.words.length) return
    const before = { ...element.getUndoCopy(), ...earlier }
    if (element.name === wasDescribed) element.name = description
    if (editing || Undo.current_save || late.has(element) || JSON.stringify(settings) === JSON.stringify(earlier)) return
    if (!late.size) queueMicrotask(recordLate)
    late.set(element, before)
  }, { flush: "sync" })
}
