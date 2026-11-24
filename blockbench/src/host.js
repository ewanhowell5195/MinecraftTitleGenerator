import { computed, shallowRef } from "vue"
import { usePanelHost } from "../../src/lib/panels/host.js"
import { round } from "../../src/lib/core/maths.js"
import { joinWords } from "../../src/lib/link/titleLines.js"
import { applyType } from "../../src/lib/settings/defaults.js"
import { defaultTexture, setTexture } from "../../src/lib/settings/textureDefaults.js"
import { popular } from "../../src/lib/title/popularity.js"
import { freeRowOf, wordsOf } from "../../src/lib/title/title.js"
import { isTitle } from "./elements.js"
import { library } from "./library.js"
import { elementOf, runtimeOf, titleState } from "./titles.js"

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
  return selected.value ? [selected.value] : []
}

function updateTransform(element) {
  Canvas.updateView({ elements: [element], element_aspects: { transform: true }, selection: true })
}

function placeLine(type) {
  const { settings } = selected.value
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
  for (const word of wordsOf(object, title)) {
    word.matchWidth = id
    if (id === null) continue
    const element = elementOf(word)
    element.position[0] = 0
    element.scale[0] = 1
    if (word.matchScaleY) element.scale[1] = 1
    updateTransform(element)
  }
}

function bakeMatch(object) {
  for (const word of wordsOf(object, title)) {
    const element = elementOf(word)
    element.scale[0] = round(element.scale[0] * word.matchScale, 4)
    if (word.matchScaleY) element.scale[1] = round(element.scale[1] * word.matchScale, 4)
    element.position[0] = round(element.position[0] - word.matchOffset, 2)
    Object.assign(word, { matchWidth: null, matchBottom: true, matchScaleY: false, matchScale: 1, matchOffset: 0 })
    updateTransform(element)
  }
}

export function registerHost() {
  const current = computed(() => edited.value?.settings ?? null)
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
    currentWord: current,
    line: current,
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
