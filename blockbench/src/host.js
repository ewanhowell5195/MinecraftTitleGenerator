import { computed, shallowRef } from "vue"
import { usePanelHost } from "../../src/lib/panels/host.js"
import { round } from "../../src/lib/core/maths.js"
import { joinWords } from "../../src/lib/link/titleLines.js"
import { applyType } from "../../src/lib/settings/defaults.js"
import { defaultTexture, setTexture } from "../../src/lib/settings/textureDefaults.js"
import { oneWord, wholeLine } from "../../src/lib/title/broadcast.js"
import { popular } from "../../src/lib/title/popularity.js"
import { freeRowOf, wordsOf } from "../../src/lib/title/title.js"
import { isTitle } from "./elements.js"
import { library } from "./library.js"
import { elementOf, runtimeOf, titleState } from "./titles.js"
import { familyOf, homeElement } from "./words.js"

export const selected = shallowRef(null)
const edited = shallowRef(null)
let title = null

export function followSelection() {
  selected.value = Project ? Outliner.selected.find(isTitle) ?? null : null
  if (!selected.value) return
  title = titleState().title
  edited.value = selected.value
}

export function selectedElements() {
  return selected.value ? familyOf(selected.value) : []
}

export function kindOf(element) {
  if (element.isWord) return "word"
  return titleState().list.value && element.words.length ? "line" : "text"
}

function wordsIn(element) {
  const { uuid } = homeElement(element)
  return titleState().list.value.filter(object => object.group === uuid)
}

export function shownSettings(element) {
  return element.isWord ? element.settings : wordsIn(element)[0] ?? element.settings
}

function settingsFor(element) {
  const [first] = wordsIn(element)
  if (!first) return element.settings
  return element.isWord ? oneWord(element.settings, () => wordsIn(element)) : wholeLine(first, () => wordsIn(element))
}

function updateTransform(element) {
  Canvas.updateView({ elements: [element], element_aspects: { transform: true }, selection: true })
}

function placeLine(type) {
  const settings = shownSettings(selected.value)
  if (settings.type === type) return
  const { list, font } = runtimeOf(selected.value)
  const row = freeRowOf(type, title, wordsOf(settings, title))
  for (const word of wordsOf(settings, title)) {
    if (list && !word.textureVariant && word.texture === defaultTexture(list, word.type)) setTexture(word, { texture: defaultTexture(list, type) }, { before: list })
    word.type = type
    word.row = row
    applyType(word, type, font)
  }
}

function chooseMatch(object, id) {
  for (const word of wordsOf(object, title)) word.matchWidth = id
  if (id === null) return
  const element = homeElement(elementOf(object))
  element.position[0] = 0
  element.scaleTo(0, 1)
  if (object.matchScaleY) element.scaleTo(1, 1)
  updateTransform(element)
}

function bakeMatch(object) {
  const element = homeElement(elementOf(object))
  const { matchOffset, matchScale, matchScaleY } = object
  element.scaleTo(0, round(element.scale[0] * matchScale, 4))
  if (matchScaleY) element.scaleTo(1, round(element.scale[1] * matchScale, 4))
  element.position[0] = round(element.position[0] - matchOffset, 2)
  for (const word of wordsOf(object, title)) Object.assign(word, { matchWidth: null, matchBottom: true, matchScaleY: false, matchScale: 1, matchOffset: 0 })
  updateTransform(element)
}

export function registerHost() {
  const current = computed(() => edited.value && settingsFor(edited.value))
  const currentWord = computed(() => edited.value && shownSettings(edited.value))
  const line = computed(() => edited.value && (wordsIn(edited.value)[0] ?? edited.value.settings))
  const layer = shallowRef(0)
  usePanelHost({
    get title() {
      return title
    },
    get camera() {
      return title.camera
    },
    library,
    current,
    currentWord,
    line,
    layer,
    active: computed(() => edited.value ? runtimeOf(edited.value) : {}),
    words: object => wordsOf(object, title),
    lineText: object => joinWords(wordsOf(object, title), word => elementOf(word)?.describe() ?? ""),
    preview: () => null,
    placeLine,
    chooseMatch,
    bakeMatch,
    popular,
    gameVersions: browsing => new Set(title.objects.flatMap(object => [object.shapeVersion, object.minecraftVersion]).concat(browsing).filter(Boolean))
  })
}
