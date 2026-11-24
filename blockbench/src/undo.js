import { watch } from "vue"

const late = new Map()

let editing = null
let quiet = 0
let lateLabel = null

export function beginEdit(elements, key) {
  if (editing?.key === key) return
  finishEdit()
  lateLabel = null
  editing = { key, elements }
  Undo.initEdit({ elements })
}

export function finishEdit(label = "Change title") {
  if (!editing) return
  const { elements } = editing
  editing = null
  Undo.finishEdit(label, { elements })
}

function settingsOf(elements) {
  return JSON.stringify(elements.map(element => element.getUndoCopy()))
}

export function edit(elements, label, change) {
  finishEdit()
  lateLabel = null
  const before = settingsOf(elements)
  Undo.initEdit({ elements })
  change()
  if (settingsOf(elements) !== before) return Undo.finishEdit(label, { elements })
  Undo.cancelEdit()
  lateLabel = label
}

export function keepWords({ save, aspects }) {
  for (const { words } of aspects.elements ?? []) {
    for (const word of words ?? []) save.elements[word.uuid] ??= word.getUndoCopy()
  }
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
