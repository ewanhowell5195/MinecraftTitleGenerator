import { computed } from "vue"
import { applyType } from "../../lib/settings/defaults.js"
import { defaultTexture, setTexture } from "../../lib/settings/textureDefaults.js"
import { downloadBlob } from "../../lib/core/files.js"
import { usePanelHost } from "../../lib/panels/host.js"
import { active, bakeMatch, chooseMatch, current, currentWord, editorTitle, fileNameOf, freeRow, gameVersions, library, lineText, noteType, scene, selection, titleFileName, words } from "../../lib/state/scene.js"
import { popular, submitStats } from "../../lib/state/stats.js"
import { view } from "../../lib/state/view.js"
import { framing } from "../../render/framing.js"
import { previews } from "../previews.js"

function placeLine(type) {
  if (current.value.type === type) return
  const { list, font } = active.value
  const row = freeRow(type, selection.value[0])
  for (const word of words(selection.value[0])) {
    if (list && !word.textureVariant && word.texture === defaultTexture(list, word.type)) setTexture(word, { texture: defaultTexture(list, type) }, { before: list })
    word.type = type
    word.row = row
    applyType(word, type, font)
  }
  noteType(selection.value[0])
}

const layer = computed({
  get: () => view.layer,
  set: value => (view.layer = value)
})

usePanelHost({
  title: editorTitle,
  library,
  camera: scene.camera,
  framing,
  view,
  active,
  current,
  currentWord,
  line: computed(() => selection.value[0]),
  layer,
  words,
  lineText,
  preview: object => previews[object.id],
  placeLine,
  chooseMatch,
  bakeMatch,
  popular,
  submitStats,
  gameVersions,
  fileName: fileNameOf,
  titleFileName,
  save: downloadBlob
})
