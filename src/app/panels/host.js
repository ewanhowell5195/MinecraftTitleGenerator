import { computed } from "vue"
import { placeWords } from "#lib/title/placeLine.js"
import { downloadBlob, fileNameOf } from "#lib/core/files.js"
import { usePanelHost } from "#lib/panels/host.js"
import { active, bakeMatch, chooseMatch, current, currentWord, editorTitle, gameVersions, library, lineText, noteType, scene, selection, titleFileName, words } from "#lib/state/scene.js"
import { submitStats } from "#lib/state/stats.js"
import { popular } from "#lib/title/popularity.js"
import { view } from "#lib/state/view.js"
import { framing } from "#render/framing.js"
import { holdCentre } from "../centreDot.js"
import { previews } from "../previews.js"

function placeLine(type) {
  if (current.value.type === type) return
  placeWords(words(selection.value[0]), type, editorTitle, active.value)
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
  guide: holdCentre,
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
