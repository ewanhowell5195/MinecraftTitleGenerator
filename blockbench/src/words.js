import { splitWord } from "../../src/lib/panels/words.js"
import { isModified, restore, snapshot } from "../../src/lib/settings/settings.js"
import { keepTexture } from "../../src/lib/title/objects.js"
import { splitGradients } from "../../src/lib/texture/wordGradients.js"
import { types } from "./elements.js"
import { runtimeOf, settleTitle } from "./titles.js"
import { finishEdit, quietly } from "./undo.js"

const WORD_PANELS = ["wordGeometry", "wordArc", "wordRibbon", "wordWrap", "wordFan", "wordTransform"]
const SHARED = ["color", "locked", "visibility"]
const PLACED = ["position", "rotation", "scale"]

export function homeElement(element) {
  return element.line ?? element
}

export function familyOf(element) {
  const home = homeElement(element)
  return [home].concat(home.words)
}

function makeWord(values, home, index, source = null) {
  const word = new types.word({})
  keepTexture.add(word.settings)
  quietly(() => restore(word.settings, { ...values, group: null }))
  if (source) {
    for (const key of SHARED) word[key] = source[key]
    for (const key of PLACED) word[key].replace(source[key])
  }
  word.name = word.describe() || "word"
  return word.addTo(home, index).init()
}

function open(home) {
  if (home.words.length) return home.words[0]
  const word = makeWord(snapshot(home.settings), home, 0)
  quietly(() => (home.settings.text = ""))
  home.isOpen = true
  return word
}

function insertAfter(source, values) {
  const home = source.line
  return makeWord({ ...snapshot(source.settings), ...values }, home, home.words.indexOf(source) + 1, source)
}

function select(element) {
  unselectAllElements()
  element.select()
}

function restructure(element, label, change) {
  finishEdit()
  const home = homeElement(element)
  Undo.initEdit({ outliner: true, elements: familyOf(home), selection: true })
  const chosen = change(home)
  settleTitle()
  select(chosen)
  Undo.finishEdit(label, { outliner: true, elements: familyOf(home), selection: true })
  return chosen
}

export function addWord(element) {
  return restructure(element, "Add title word", home => {
    open(home)
    return insertAfter(home.words.at(-1), { text: "word", spaceBefore: true })
  })
}

export function splitAt(element, start, end) {
  const { settings } = element
  const parts = splitWord(settings, start, end)
  if (!parts) return null
  const line = element.line ? element.line.words.map(word => word.settings) : [settings]
  const gradients = splitGradients(runtimeOf(element).font, line, settings, parts)
  return restructure(element, "Split title word", home => {
    const first = element.line ? element : open(home)
    let last = first
    let target = first
    for (const [index, { text, spaceBefore, picked }] of parts.entries()) {
      if (index) last = insertAfter(last, { text, spaceBefore, ...gradients[index] })
      else Object.assign(first.settings, { text }, gradients[0])
      if (picked) target = last
    }
    return target
  })
}

function close(home) {
  const [word] = home.words
  if (home.words.length !== 1 || WORD_PANELS.some(panel => isModified(word.settings, panel))) return word
  const values = snapshot(word.settings)
  const named = home.name === home.describe()
  word.remove()
  home.useSettings({ ...values, group: null, hidden: home.settings.hidden })
  if (named) home.name = home.describe()
  return home
}

export function removeWord(word) {
  return restructure(word, "Remove title word", home => {
    const index = home.words.indexOf(word)
    const neighbour = home.words[index - 1] ?? home.words[index + 1]
    word.remove()
    return home.words.length === 1 ? close(home) : neighbour
  })
}
