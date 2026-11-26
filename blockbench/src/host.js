import { computed, shallowRef } from "vue"
import { fileNameOf } from "#lib/core/files.js"
import { usePanelHost } from "#lib/panels/host.js"
import { framing, useFraming } from "#render/framing.js"
import { round } from "#lib/core/maths.js"
import { joinWords } from "#lib/link/titleLines.js"
import { LINE } from "#lib/settings/settings.js"
import { alongside, oneWord, wholeLine } from "#lib/title/broadcast.js"
import { popular } from "#lib/title/popularity.js"
import { placeWords } from "#lib/title/placeLine.js"
import { versionsIn, wordsOf } from "#lib/title/title.js"
import { isTitle } from "./elements.js"
import { titleFileName } from "./file.js"
import { library } from "./library.js"
import { onlyTitlesShown, viewport } from "./render/capture.js"
import { renderView } from "./render/view.js"
import { sendStats } from "./stats.js"
import { elementOf, runtimeOf, titleState } from "./titles.js"
import { familyOf, homeElement } from "./words.js"

export const selected = shallowRef(null)
export const chosen = shallowRef([])
const edited = shallowRef(null)
const SAVES = { png: "buffer", svg: "text", zip: "zip" }

let title = null

function sameList(a, b) {
  return a.length === b.length && a.every((item, index) => item === b[index])
}

export function followSelection() {
  const titles = Project ? Outliner.selected.filter(isTitle) : []
  selected.value = titles[0] ?? null
  if (!selected.value) return
  const lines = new Set(titles.filter(element => !element.isWord))
  const list = titles.filter(element => element === selected.value || !element.isWord || !lines.has(element.line))
  if (!sameList(list, chosen.value)) chosen.value = list
  edited.value = selected.value
}

export function selectedElements() {
  return Array.from(new Set(chosen.value.flatMap(familyOf)))
}

export function allWords() {
  return chosen.value.every(element => element.isWord)
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

function reachedBy(element, key) {
  const words = wordsIn(element)
  if (element.isWord) return LINE.has(key) ? words : [element.settings]
  return words.length ? words : [element.settings]
}

function settingsFor(element) {
  const [first] = wordsIn(element)
  if (chosen.value.length > 1) {
    const own = element.isWord ? element.settings : first ?? element.settings
    return alongside(own, key => key === "text" ? [own] : Array.from(new Set(chosen.value.flatMap(each => reachedBy(each, key)))))
  }
  if (!first) return element.settings
  return element.isWord ? oneWord(element.settings, () => wordsIn(element)) : wholeLine(first, () => wordsIn(element))
}

function wordSettingsFor(element) {
  const own = shownSettings(element)
  if (chosen.value.length < 2 || !allWords()) return own
  return alongside(own, key => key === "text" ? [own] : chosen.value.map(word => word.settings))
}

function current() {
  if (Project) title = titleState().title
  return title
}

async function save(name, blob) {
  const extension = name.split(".").at(-1)
  const content = extension === "zip" ? blob : extension === "svg" ? await blob.text() : new Uint8Array(await blob.arrayBuffer())
  Blockbench.export({ resource_id: "minecraft_title_render", type: extension.toUpperCase(), extensions: [extension], name: name.slice(0, -extension.length - 1), content, savetype: SAVES[extension] })
}

function updateTransform(element) {
  Canvas.updateView({ elements: [element], element_aspects: { transform: true }, selection: true })
}

function placeLine(type) {
  for (const home of new Set(chosen.value.map(homeElement))) {
    const settings = shownSettings(home)
    if (settings.type !== type) placeWords(wordsOf(settings, current()), type, current(), runtimeOf(home))
  }
}

function chooseMatch(object, id) {
  for (const word of wordsOf(object, current())) word.matchWidth = id
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
  for (const word of wordsOf(object, current())) Object.assign(word, { matchWidth: null, matchBottom: true, matchScaleY: false, matchScale: 1, matchOffset: 0 })
  updateTransform(element)
}

export function registerHost() {
  useFraming({ view: renderView, viewport })
  const shown = computed(() => edited.value && settingsFor(edited.value))
  const currentWord = computed(() => edited.value && wordSettingsFor(edited.value))
  const line = computed(() => edited.value && (wordsIn(edited.value)[0] ?? edited.value.settings))
  const layer = shallowRef(0)
  usePanelHost({
    get title() {
      return current()
    },
    get camera() {
      return current().camera
    },
    framing,
    view: renderView,
    library,
    current: shown,
    currentWord,
    line,
    layer,
    active: computed(() => edited.value ? runtimeOf(edited.value) : {}),
    words: object => wordsOf(object, current()),
    lineText: object => joinWords(wordsOf(object, current()), word => elementOf(word)?.describe() ?? ""),
    preview: () => null,
    layered: onlyTitlesShown,
    placeLine,
    chooseMatch,
    bakeMatch,
    popular,
    submitStats: () => sendStats(Project),
    fileName: fileNameOf,
    titleFileName,
    save,
    gameVersions: browsing => versionsIn(current().objects, browsing)
  })
}
