import { computed, shallowRef } from "vue"
import { fileNameOf } from "../../src/lib/core/files.js"
import { usePanelHost } from "../../src/lib/panels/host.js"
import { framing, useFraming } from "../../src/render/framing.js"
import { round } from "../../src/lib/core/maths.js"
import { joinWords } from "../../src/lib/link/titleLines.js"
import { applyType } from "../../src/lib/settings/defaults.js"
import { defaultTexture, setTexture } from "../../src/lib/settings/textureDefaults.js"
import { oneWord, wholeLine } from "../../src/lib/title/broadcast.js"
import { popular } from "../../src/lib/title/popularity.js"
import { freeRowOf, wordsOf } from "../../src/lib/title/title.js"
import { isTitle } from "./elements.js"
import { titleFileName } from "./file.js"
import { library } from "./library.js"
import { viewport } from "./render/capture.js"
import { renderView } from "./render/view.js"
import { sendStats } from "./stats.js"
import { elementOf, runtimeOf, titleState } from "./titles.js"
import { familyOf, homeElement } from "./words.js"

export const selected = shallowRef(null)
const edited = shallowRef(null)
const SAVES = { png: "buffer", svg: "text", zip: "zip" }

let title = null

export function followSelection() {
  selected.value = Project ? Outliner.selected.find(isTitle) ?? null : null
  if (!selected.value) return
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
  const settings = shownSettings(selected.value)
  if (settings.type === type) return
  const { list, font } = runtimeOf(selected.value)
  const row = freeRowOf(type, current(), wordsOf(settings, current()))
  for (const word of wordsOf(settings, current())) {
    if (list && !word.textureVariant && word.texture === defaultTexture(list, word.type)) setTexture(word, { texture: defaultTexture(list, type) }, { before: list })
    word.type = type
    word.row = row
    applyType(word, type, font)
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
  const currentWord = computed(() => edited.value && shownSettings(edited.value))
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
    placeLine,
    chooseMatch,
    bakeMatch,
    popular,
    submitStats: () => sendStats(Project),
    fileName: fileNameOf,
    titleFileName,
    save,
    gameVersions: browsing => new Set(current().objects.flatMap(object => [object.shapeVersion, object.minecraftVersion]).concat(browsing).filter(Boolean))
  })
}
