import "./host.js"
import * as clipboard from "#lib/panels/sectionClipboard.js"
import { currentWord, shapingWord } from "#lib/state/scene.js"
import { FORM_SECTIONS } from "#lib/state/view.js"

function place(section) {
  return { word: FORM_SECTIONS.has(section) && shapingWord.value, shape: currentWord.value?.shape ?? null }
}

export function canCopySection(section) {
  return clipboard.canCopySection(section, place(section))
}

export function copySection(section) {
  clipboard.copySection(section, place(section))
}

export function canPasteSection(section) {
  return clipboard.canPasteSection(section, place(section))
}

export function pasteSection(section) {
  return clipboard.pasteSection(section, place(section))
}
